-- Raye2 Wave 2: profile identity depth and a connection-list block fix.
--
-- Plan 2.1 requires profile identity to cover avatar, cover, display name, handle, bio, links,
-- interests and privacy. The profile editor only handled display name, bio and one website, the
-- cover was decorative only, and links/interests did not exist at all. This migration adds them and
-- exposes them through the profile overview read RPC.
--
-- It also fixes a real defect in raye2_get_member_connections: the block-exclusion clause compared
-- the profile owner against itself, so a member the viewer had blocked could still appear in a
-- connection list. It now excludes members blocked by, or blocking, the viewer.

-- 1. Identity columns.
alter table public.member_profiles add column if not exists cover_url text;
alter table public.member_profiles add column if not exists links jsonb not null default '[]'::jsonb;
alter table public.member_profiles add column if not exists interests text[] not null default '{}';
do $$ begin
  alter table public.member_profiles add constraint member_profiles_cover_url_check
    check (cover_url is null or cover_url ~ '^https?://');
exception when duplicate_object then null; end $$;
do $$ begin
  alter table public.member_profiles add constraint member_profiles_links_check
    check (jsonb_typeof(links) = 'array' and jsonb_array_length(links) <= 6);
exception when duplicate_object then null; end $$;

-- 2. Self-service profile update. Owner-only by construction; validates every field server-side.
create or replace function public.raye2_update_my_profile(
  p_display_name text default null,
  p_bio text default null,
  p_website_url text default null,
  p_cover_url text default null,
  p_links jsonb default null,
  p_interests text[] default null,
  p_visibility text default null
)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_display text; v_bio text; v_web text; v_cover text; v_links jsonb; v_interests text[]; v_vis text;
  v_clean_links jsonb; v_clean_interests text[];
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not exists (select 1 from public.member_profiles where user_id = v_uid) then
    raise exception 'profile not found' using errcode='P0002';
  end if;

  if p_display_name is not null then
    v_display := btrim(p_display_name);
    if char_length(v_display) < 1 or char_length(v_display) > 40 then
      raise exception 'display name must be 1-40 characters' using errcode='22023';
    end if;
  end if;
  if p_bio is not null then
    v_bio := btrim(p_bio);
    if char_length(v_bio) > 240 then raise exception 'bio is too long' using errcode='22023'; end if;
  end if;
  if p_website_url is not null and btrim(p_website_url) <> '' then
    v_web := btrim(p_website_url);
    if v_web !~ '^https?://' then raise exception 'website must be an http(s) URL' using errcode='22023'; end if;
  elsif p_website_url is not null then
    v_web := '';
  end if;
  if p_cover_url is not null and btrim(p_cover_url) <> '' then
    v_cover := btrim(p_cover_url);
    if v_cover !~ '^https?://' then raise exception 'cover must be an http(s) URL' using errcode='22023'; end if;
  elsif p_cover_url is not null then
    v_cover := '';
  end if;
  if p_visibility is not null then
    if p_visibility not in ('public','private') then raise exception 'invalid visibility' using errcode='22023'; end if;
    v_vis := p_visibility;
  end if;

  if p_links is not null then
    if jsonb_typeof(p_links) <> 'array' then raise exception 'links must be an array' using errcode='22023'; end if;
    if jsonb_array_length(p_links) > 6 then raise exception 'at most 6 links are allowed' using errcode='22023'; end if;
    select coalesce(jsonb_agg(jsonb_build_object('label', l.label, 'url', l.url)), '[]'::jsonb)
    into v_clean_links
    from (
      select btrim(coalesce(elem->>'label','')) as label, btrim(coalesce(elem->>'url','')) as url
      from jsonb_array_elements(p_links) elem
    ) l
    where l.url <> ''
      and char_length(l.label) <= 40
      and l.url ~ '^https?://';
    if v_clean_links is null then v_clean_links := '[]'::jsonb; end if;
  end if;

  if p_interests is not null then
    if array_length(p_interests, 1) > 8 then raise exception 'at most 8 interests are allowed' using errcode='22023'; end if;
    select coalesce(array_agg(distinct btrim(i)), '{}')
    into v_clean_interests
    from unnest(p_interests) i
    where btrim(i) <> '' and char_length(btrim(i)) <= 30;
    if v_clean_interests is null then v_clean_interests := '{}'; end if;
  end if;

  update public.member_profiles p set
    display_name = coalesce(v_display, p.display_name),
    bio = coalesce(v_bio, p.bio),
    website_url = case when p_website_url is null then p.website_url else nullif(v_web,'') end,
    cover_url = case when p_cover_url is null then p.cover_url else nullif(v_cover,'') end,
    links = coalesce(v_clean_links, p.links),
    interests = coalesce(v_clean_interests, p.interests),
    visibility = coalesce(v_vis, p.visibility),
    updated_at = now()
  where p.user_id = v_uid;

  return jsonb_build_object('handle', (select handle from public.member_profiles where user_id = v_uid));
end;
$$;
revoke all on function public.raye2_update_my_profile(text,text,text,text,jsonb,text[],text) from public,anon;
grant execute on function public.raye2_update_my_profile(text,text,text,text,jsonb,text[],text) to authenticated;

-- 3. Prefill for the editor (the viewer's own row, including private fields).
create or replace function public.raye2_get_my_profile_editor()
returns table (handle text, display_name text, bio text, website_url text, cover_url text,
               links jsonb, interests text[], visibility text)
language sql stable security definer set search_path=''
as $$
  select p.handle, p.display_name, p.bio, p.website_url, p.cover_url, p.links, p.interests, p.visibility
  from public.member_profiles p where p.user_id = (select auth.uid());
$$;
revoke all on function public.raye2_get_my_profile_editor() from public,anon;
grant execute on function public.raye2_get_my_profile_editor() to authenticated;

-- 4. Fix the block-exclusion defect and keep the list limited to public, unblocked members.
create or replace function public.raye2_get_member_connections(
  p_user_id uuid,
  p_kind text,
  p_limit integer default 60
)
returns table (user_id uuid, handle text, display_name text, avatar_url text)
language plpgsql security definer set search_path=''
as $fn$
#variable_conflict use_column
declare
  v_me uuid := (select auth.uid());
  v_limit integer := least(greatest(coalesce(p_limit, 60), 1), 100);
begin
  if p_kind not in ('followers', 'following') then
    raise exception 'invalid connection kind' using errcode = '22023';
  end if;
  if p_user_id is null or not exists (select 1 from public.member_profiles where user_id = p_user_id) then
    raise exception 'member not found' using errcode = '22023';
  end if;
  return query
    select p.user_id, p.handle, p.display_name, p.avatar_url
    from (
      select case when p_kind = 'followers' then f.follower_id else f.followed_id end as uid, f.created_at
      from public.member_follows f
      where (p_kind = 'followers' and f.followed_id = p_user_id)
         or (p_kind = 'following' and f.follower_id = p_user_id)
    ) rel
    join public.member_profiles p on p.user_id = rel.uid
    where p.visibility = 'public'
      and not exists (
        select 1 from public.member_blocks b
        where (b.blocker_id = v_me and b.blocked_id = p.user_id)
           or (b.blocker_id = p.user_id and b.blocked_id = v_me)
      )
    order by rel.created_at desc
    limit v_limit;
end;
$fn$;
revoke all on function public.raye2_get_member_connections(uuid,text,integer) from public, anon;
grant execute on function public.raye2_get_member_connections(uuid,text,integer) to authenticated;

-- 5. Extend the profile overview with the new identity fields (same visibility gate as before).
drop function if exists public.raye2_get_profile_overview(text);
create or replace function public.raye2_get_profile_overview(
  p_handle text
)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
  cover_url text,
  links jsonb,
  interests text[],
  bio text,
  website_url text,
  visibility text,
  joined_at timestamptz,
  is_creator boolean,
  published_videos bigint,
  total_views bigint,
  total_reactions bigint,
  follower_count bigint,
  following_count bigint,
  post_count bigint,
  short_count bigint,
  recent_posts bigint
)
language sql stable security definer set search_path = ''
as $fn$
  with target as (
    select mp.user_id, mp.handle, mp.display_name, mp.avatar_url, mp.cover_url, mp.links,
           mp.interests, mp.bio, mp.website_url, mp.visibility, mp.created_at
    from public.member_profiles mp
    where mp.handle = lower(btrim(coalesce(p_handle, '')))
      and (
        (mp.visibility = 'public' and not public.is_member_blocked(mp.user_id))
        or mp.user_id = (select auth.uid())
        or exists(select 1 from public.member_blocks b
                  where b.blocker_id = (select auth.uid()) and b.blocked_id = mp.user_id)
      )
  ),
  published as (
    select mi.owner_id, mi.id as media_id
    from public.media_items mi
    join public.video_catalog vc on vc.media_id = mi.id
    where mi.is_published = true
      and mi.media_type in ('video', 'youtube')
      and vc.published_at is not null
      and mi.owner_id is not null
  ),
  video_counts as (select owner_id, count(*) as published_videos from published group by owner_id),
  view_counts as (
    select p.owner_id, count(vv.id) as total_views
    from published p left join public.video_views vv on vv.media_id = p.media_id group by p.owner_id
  ),
  reaction_counts as (
    select p.owner_id, count(vr.user_id) as total_reactions
    from published p left join public.video_reactions vr on vr.media_id = p.media_id group by p.owner_id
  ),
  follower_counts as (select followed_id as user_id, count(*) as follower_count from public.member_follows group by followed_id),
  following_counts as (select follower_id as user_id, count(*) as following_count from public.member_follows group by follower_id),
  post_counts as (select author_id as user_id, count(*) as post_count from public.community_posts where status = 'published' group by author_id),
  recent_counts as (
    select author_id as user_id, count(*) as recent_posts
    from public.community_posts
    where status = 'published' and created_at > now() - interval '30 days'
    group by author_id
  ),
  short_counts as (select author_id as user_id, count(*) as short_count from public.community_short_videos where status = 'published' group by author_id)
  select t.user_id, t.handle, t.display_name, t.avatar_url, t.cover_url, t.links, t.interests,
         t.bio, t.website_url, t.visibility, t.created_at,
         coalesce(vc.published_videos, 0) > 0 as is_creator,
         coalesce(vc.published_videos, 0),
         coalesce(vw.total_views, 0),
         coalesce(rc.total_reactions, 0),
         coalesce(fc.follower_count, 0),
         coalesce(fg.following_count, 0),
         coalesce(pc.post_count, 0),
         coalesce(sc.short_count, 0),
         coalesce(rp.recent_posts, 0)
  from target t
  left join video_counts vc on vc.owner_id = t.user_id
  left join view_counts vw on vw.owner_id = t.user_id
  left join reaction_counts rc on rc.owner_id = t.user_id
  left join follower_counts fc on fc.user_id = t.user_id
  left join following_counts fg on fg.user_id = t.user_id
  left join post_counts pc on pc.user_id = t.user_id
  left join short_counts sc on sc.user_id = t.user_id
  left join recent_counts rp on rp.user_id = t.user_id;
$fn$;
revoke all on function public.raye2_get_profile_overview(text) from public;
grant execute on function public.raye2_get_profile_overview(text) to anon, authenticated;

notify pgrst, 'reload schema';

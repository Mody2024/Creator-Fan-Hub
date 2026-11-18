-- Raye2 Wave 3/9: close the last public video reads that ignored exclusivity and expiry.
--
-- A sweep for functions that read video_catalog without the access check found three more public
-- surfaces that still leaked exclusive or expired videos: series discovery (list and detail), the video
-- comment thread/replies readers, and the saved-collection contents. Each is recreated with the same
-- viewer-scoped raye2_can_view_video gate. Signatures and return types are unchanged.

-- 1. Series list: count and cover only viewable videos.
create or replace function public.raye2_list_series(
  p_limit integer default 40
)
returns table (
  slug text,
  title text,
  description text,
  "position" integer,
  video_count bigint,
  total_duration_seconds bigint,
  cover_path text,
  owner_handle text,
  owner_display_name text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 40), 1), 100) as lim
  ),
  playable as (
    select vpi.playlist_id,
           vpi.position,
           vpi.media_id,
           vc.slug as video_slug,
           vc.duration_seconds,
           vc.thumbnail_media_id,
           mi.owner_id
    from public.video_playlist_items vpi
    join public.video_catalog vc on vc.media_id = vpi.media_id
    join public.media_items mi on mi.id = vpi.media_id
    where mi.is_published = true
      and mi.media_type in ('video', 'youtube')
      and vc.published_at is not null
      and public.raye2_can_view_video(vc.media_id)
  ),
  aggregated as (
    select p.playlist_id,
           count(*) as video_count,
           coalesce(sum(p.duration_seconds), 0) as total_duration_seconds,
           (array_agg(p.thumbnail_media_id order by p.position))[1] as cover_media_id,
           (array_agg(p.owner_id order by p.position))[1] as owner_id
    from playable p
    group by p.playlist_id
  )
  select pl.slug,
         pl.title,
         pl.description,
         pl.position,
         coalesce(a.video_count, 0) as video_count,
         coalesce(a.total_duration_seconds, 0) as total_duration_seconds,
         cover.storage_path as cover_path,
         mp.handle as owner_handle,
         mp.display_name as owner_display_name
  from public.video_playlists pl
  cross join bounded b
  left join aggregated a on a.playlist_id = pl.id
  left join public.media_items cover
    on cover.id = a.cover_media_id
   and cover.is_published = true
   and cover.media_type = 'image'
   and cover.storage_path like 'creator-media-public/%'
  left join public.member_profiles mp on mp.user_id = a.owner_id
  where pl.is_published = true
    and coalesce(a.video_count, 0) > 0
  order by pl.position asc, pl.created_at asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_series(integer) from public;
grant execute on function public.raye2_list_series(integer) to anon, authenticated;

-- 2. Series detail: only viewable episodes.
create or replace function public.raye2_get_series(
  p_slug text,
  p_limit integer default 100
)
returns table (
  playlist_slug text,
  playlist_title text,
  playlist_description text,
  video_slug text,
  title text,
  category text,
  description text,
  media_type text,
  duration_seconds integer,
  "position" integer
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 100), 1), 200) as lim
  ),
  target as (
    select pl.id, pl.slug, pl.title, pl.description
    from public.video_playlists pl
    where pl.slug = lower(btrim(coalesce(p_slug, '')))
      and pl.is_published = true
  )
  select t.slug,
         t.title,
         t.description,
         vc.slug,
         mi.title,
         vc.category,
         vc.description,
         mi.media_type,
         vc.duration_seconds,
         vpi.position
  from target t
  join public.video_playlist_items vpi on vpi.playlist_id = t.id
  join public.video_catalog vc on vc.media_id = vpi.media_id
  join public.media_items mi on mi.id = vpi.media_id
  cross join bounded b
  where mi.is_published = true
    and mi.media_type in ('video', 'youtube')
    and vc.published_at is not null
    and public.raye2_can_view_video(vc.media_id)
  order by vpi.position asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_series(text,integer) from public;
grant execute on function public.raye2_get_series(text,integer) to anon, authenticated;

-- 3. Video comment thread: a comment on a video the caller may not watch is not readable.
create or replace function public.raye2_get_video_comment_thread(p_media_id uuid, p_limit integer default 50)
returns table (
  comment_id uuid,
  author_id uuid,
  author_handle text,
  author_display_name text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  reply_count integer,
  reaction_count integer,
  my_reaction text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    c.id,
    c.author_id,
    mp.handle,
    mp.display_name,
    mp.avatar_url,
    c.body,
    c.created_at,
    (select count(*) from public.video_comments r
      where r.parent_comment_id = c.id and r.status = 'published')::int as reply_count,
    (select count(*) from public.video_comment_reactions x where x.comment_id = c.id)::int as reaction_count,
    (select x.reaction from public.video_comment_reactions x
      where x.comment_id = c.id and x.user_id = (select auth.uid())) as my_reaction
  from public.video_comments c
  left join public.member_profiles mp on mp.user_id = c.author_id
  where c.media_id = p_media_id
    and c.parent_comment_id is null
    and c.status = 'published'
    and not public.is_member_blocked(c.author_id)
    and public.raye2_can_view_video(c.media_id)
  order by c.created_at desc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$fn$;
revoke all on function public.raye2_get_video_comment_thread(uuid,integer) from public;
grant execute on function public.raye2_get_video_comment_thread(uuid,integer) to anon, authenticated;

-- 4. Video comment replies: the parent's video must be viewable too.
create or replace function public.raye2_get_video_comment_replies(p_parent_id uuid, p_limit integer default 50)
returns table (
  comment_id uuid,
  author_id uuid,
  author_handle text,
  author_display_name text,
  author_avatar_url text,
  body text,
  created_at timestamptz,
  reaction_count integer,
  my_reaction text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  select
    c.id,
    c.author_id,
    mp.handle,
    mp.display_name,
    mp.avatar_url,
    c.body,
    c.created_at,
    (select count(*) from public.video_comment_reactions x where x.comment_id = c.id)::int as reaction_count,
    (select x.reaction from public.video_comment_reactions x
      where x.comment_id = c.id and x.user_id = (select auth.uid())) as my_reaction
  from public.video_comments c
  left join public.member_profiles mp on mp.user_id = c.author_id
  where c.parent_comment_id = p_parent_id
    and c.status = 'published'
    and not public.is_member_blocked(c.author_id)
    and exists (
      select 1 from public.video_comments p
      where p.id = c.parent_comment_id and p.status = 'published'
    )
    and public.raye2_can_view_video(c.media_id)
  order by c.created_at asc
  limit greatest(1, least(coalesce(p_limit, 50), 100));
$fn$;
revoke all on function public.raye2_get_video_comment_replies(uuid,integer) from public;
grant execute on function public.raye2_get_video_comment_replies(uuid,integer) to anon, authenticated;

-- 5. Collection contents: a saved video the caller may no longer watch is not shown.
create or replace function public.raye2_get_collection(
  p_collection_id uuid,
  p_limit integer default 100
)
returns table (
  collection_id uuid,
  name text,
  description text,
  item_count integer,
  created_at timestamptz,
  item_kind text,
  item_id uuid,
  title text,
  body text,
  author_handle text,
  author_display_name text,
  video_slug text,
  added_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_collection public.raye2_collections;
  v_limit integer := least(greatest(coalesce(p_limit, 100), 1), 200);
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  select * into v_collection from public.raye2_collections
  where id = p_collection_id and owner_id = v_me;
  if v_collection.id is null then
    return;
  end if;
  return query
    with items as (
      select i.item_kind, i.item_id, i.added_at
      from public.raye2_collection_items i
      where i.collection_id = v_collection.id
      order by i.added_at desc
      limit v_limit
    )
    select v_collection.id,
           v_collection.name,
           v_collection.description,
           (select count(*)::integer from public.raye2_collection_items x where x.collection_id = v_collection.id),
           v_collection.created_at,
           it.item_kind,
           it.item_id,
           case
             when it.item_kind = 'post' then left(cp.body, 240)
             when it.item_kind = 'video' then mi.title
             else null
           end as title,
           case when it.item_kind = 'post' then cp.body else coalesce(mi.alt_text, '') end as body,
           case when it.item_kind = 'post' then mp.handle else null end as author_handle,
           case when it.item_kind = 'post' then mp.display_name else null end as author_display_name,
           case when it.item_kind = 'video' then vc.slug else null end as video_slug,
           it.added_at
    from items it
    left join public.community_posts cp
      on it.item_kind = 'post' and cp.id = it.item_id and cp.status = 'published'
    left join public.member_profiles mp on mp.user_id = cp.author_id
    left join public.video_catalog vc
      on it.item_kind = 'video' and vc.media_id = it.item_id and vc.published_at is not null
      and public.raye2_can_view_video(vc.media_id)
    left join public.media_items mi
      on it.item_kind = 'video' and mi.id = it.item_id and mi.is_published = true
    where (it.item_kind = 'post' and cp.id is not null)
       or (it.item_kind = 'video' and vc.media_id is not null and mi.id is not null)
    order by it.added_at desc;
end;
$fn$;
revoke all on function public.raye2_get_collection(uuid,integer) from public, anon;
grant execute on function public.raye2_get_collection(uuid,integer) to authenticated;

notify pgrst, 'reload schema';

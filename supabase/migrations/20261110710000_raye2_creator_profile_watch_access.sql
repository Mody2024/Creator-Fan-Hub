-- Raye2 Wave 3/9: extend the video access check to creator, profile and watch-together reads.
--
-- The same exclusivity/expiry rule that the catalog policy and the discovery RPCs now apply was still
-- missing from three more SECURITY DEFINER reads: the creator directory and the profile overview counted
-- exclusive or expired videos (inflating a creator's published/views totals), and Watch Together accepted
-- an exclusive or expired video as a session source. This recreates those functions with the same
-- viewer-scoped raye2_can_view_video gate. Signatures and return types are unchanged.

-- 1. Creator directory counts only videos the caller may watch.
create or replace function public.raye2_list_creators(
  p_limit integer default 24,
  p_sort text default 'published'
)
returns table (
  handle text,
  display_name text,
  avatar_url text,
  bio text,
  published_videos bigint,
  follower_count bigint,
  total_views bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 24), 1), 60) as lim,
           case when p_sort = 'followers' then 'followers'
                when p_sort = 'views' then 'views'
                else 'published' end as sort_key
  ),
  video_counts as (
    select mi.owner_id, count(*) as published_videos
    from public.media_items mi
    join public.video_catalog vc on vc.media_id = mi.id
    where mi.is_published = true
      and mi.media_type in ('video', 'youtube')
      and vc.published_at is not null
      and mi.owner_id is not null
      and public.raye2_can_view_video(vc.media_id)
    group by mi.owner_id
  ),
  view_counts as (
    select mi.owner_id, count(vv.id) as total_views
    from public.media_items mi
    join public.video_catalog vc on vc.media_id = mi.id
    join public.video_views vv on vv.media_id = mi.id
    where mi.is_published = true
      and mi.media_type in ('video', 'youtube')
      and vc.published_at is not null
      and mi.owner_id is not null
      and public.raye2_can_view_video(vc.media_id)
    group by mi.owner_id
  ),
  follower_counts as (
    select followed_id as user_id, count(*) as follower_count
    from public.member_follows
    group by followed_id
  )
  select mp.handle,
         mp.display_name,
         mp.avatar_url,
         mp.bio,
         coalesce(vc.published_videos, 0) as published_videos,
         coalesce(fc.follower_count, 0) as follower_count,
         coalesce(vw.total_views, 0) as total_views
  from public.member_profiles mp
  left join video_counts vc on vc.owner_id = mp.user_id
  left join view_counts vw on vw.owner_id = mp.user_id
  left join follower_counts fc on fc.user_id = mp.user_id
  cross join bounded b
  where mp.visibility = 'public'
    and coalesce(vc.published_videos, 0) > 0
  order by
    case when b.sort_key = 'published' then coalesce(vc.published_videos, 0) end desc nulls last,
    case when b.sort_key = 'followers' then coalesce(fc.follower_count, 0) end desc nulls last,
    case when b.sort_key = 'views' then coalesce(vw.total_views, 0) end desc nulls last,
    coalesce(fc.follower_count, 0) desc,
    mp.display_name asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_creators(integer,text) from public;
grant execute on function public.raye2_list_creators(integer,text) to anon, authenticated;

-- 2. Profile overview counts only videos the caller may watch.
create or replace function public.raye2_get_profile_overview(
  p_handle text
)
returns table (
  user_id uuid,
  handle text,
  display_name text,
  avatar_url text,
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
language sql
stable
security definer
set search_path = ''
as $fn$
  with target as (
    select mp.user_id, mp.handle, mp.display_name, mp.avatar_url, mp.bio,
           mp.website_url, mp.visibility, mp.created_at
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
      and public.raye2_can_view_video(vc.media_id)
  ),
  video_counts as (
    select owner_id, count(*) as published_videos from published group by owner_id
  ),
  view_counts as (
    select p.owner_id, count(vv.id) as total_views
    from published p
    left join public.video_views vv on vv.media_id = p.media_id
    group by p.owner_id
  ),
  reaction_counts as (
    select p.owner_id, count(vr.user_id) as total_reactions
    from published p
    left join public.video_reactions vr on vr.media_id = p.media_id
    group by p.owner_id
  ),
  follower_counts as (
    select followed_id as user_id, count(*) as follower_count
    from public.member_follows group by followed_id
  ),
  following_counts as (
    select follower_id as user_id, count(*) as following_count
    from public.member_follows group by follower_id
  ),
  post_counts as (
    select author_id as user_id, count(*) as post_count
    from public.community_posts where status = 'published' group by author_id
  ),
  recent_counts as (
    select author_id as user_id, count(*) as recent_posts
    from public.community_posts
    where status = 'published' and created_at > now() - interval '30 days'
    group by author_id
  ),
  short_counts as (
    select author_id as user_id, count(*) as short_count
    from public.community_short_videos where status = 'published' group by author_id
  )
  select t.user_id,
         t.handle,
         t.display_name,
         t.avatar_url,
         t.bio,
         t.website_url,
         t.visibility,
         t.created_at,
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

-- 3. Watch Together may only use a video the caller may watch.
create or replace function public.raye2_validate_watch_source(
  p_source_kind text,p_source_media_id uuid,p_external_url text
)
returns boolean language plpgsql stable security definer set search_path=''
as $$
begin
  if p_source_kind='native' then
    return p_source_media_id is not null and p_external_url is null and exists(
      select 1 from public.video_catalog v
      join public.media_items m on m.id=v.media_id
      where v.media_id=p_source_media_id and v.published_at is not null
        and m.is_published=true and m.media_type in ('video','youtube')
        and m.processing_status='ready'
        and public.raye2_can_view_video(v.media_id)
    );
  elsif p_source_kind='external' then
    return p_source_media_id is null and p_external_url ~* '^https://(www\.)?(youtube[.]com/watch\?v=[A-Za-z0-9_-]{6,}|youtu[.]be/[A-Za-z0-9_-]{6,}|vimeo[.]com/[0-9]{5,})([?&][^ ]*)?$';
  end if;
  return false;
end;
$$;
revoke all on function public.raye2_validate_watch_source(text,uuid,text) from public,anon;
grant execute on function public.raye2_validate_watch_source(text,uuid,text) to authenticated;

notify pgrst, 'reload schema';

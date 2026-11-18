-- Raye2 Wave 3 discovery: public creator directory.
--
-- Discovery could find creators only by typing a name into search; there was no way to
-- browse who is publishing on Raye2. This adds one pinned SECURITY DEFINER read RPC that
-- lists public creators ranked by their published output and audience, and a matching
-- surface at /creators. Granted to anon + authenticated because discovery is public.

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

notify pgrst, 'reload schema';

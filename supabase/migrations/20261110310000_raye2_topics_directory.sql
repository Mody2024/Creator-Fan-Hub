-- Raye2 Wave 6 topic directory: a browsable index of tags.
--
-- raye2_list_topics already aggregated tags for the watch rails, but there was no page that
-- listed them, so the topic detail page's "All topics" link fell back to search. This
-- replaces raye2_list_topics (same integer, integer signature) to also carry total views
-- and a recent-video count for the directory cards, and adds a public /topics index page.
--
-- The RPC stays SECURITY DEFINER, STABLE, pinned to an empty search_path, granted to
-- anon + authenticated, and only ever aggregates published videos.

-- The return type grows (two new columns), so the old signature must be dropped first.
drop function if exists public.raye2_list_topics(integer, integer);

create or replace function public.raye2_list_topics(
  p_limit integer default 40,
  p_min_count integer default 1
)
returns table (tag text, video_count bigint, total_views bigint, recent_video_count bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 40), 1), 200) as lim,
           greatest(coalesce(p_min_count, 1), 1) as min_count
  ),
  view_counts as (
    select vv.media_id, count(*) as views
    from public.video_views vv
    group by vv.media_id
  )
  select lower(tag) as tag, count(*) as video_count,
         coalesce(sum(vwc.views), 0) as total_views,
         count(*) filter (where vc.published_at > now() - interval '90 days') as recent_video_count
  from public.video_catalog vc
  join public.media_items mi on mi.id = vc.media_id and mi.is_published = true and mi.media_type in ('video','youtube')
  cross join lateral unnest(vc.tags) as tag
  left join view_counts vwc on vwc.media_id = vc.media_id
  where vc.published_at is not null and length(btrim(tag)) between 1 and 40
  group by lower(tag)
  having count(*) >= (select min_count from bounded)
  order by count(*) desc, lower(tag) asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_topics(integer,integer) from public;
grant execute on function public.raye2_list_topics(integer,integer) to anon, authenticated;

notify pgrst, 'reload schema';

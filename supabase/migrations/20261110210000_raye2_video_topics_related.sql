-- Raye2 Wave 3 discovery depth: video topics and related videos.
--
-- The watch page showed tags as plain, unclickable text and offered no "more like this",
-- so once a viewer finished a video there was nowhere to go. These read-only RPCs add a
-- topic index, per-topic video lists and tag/category-based related videos.
--
-- All three are SECURITY DEFINER, STABLE, pinned to an empty search_path, granted to
-- anon + authenticated, and only ever expose published videos.

-- Related videos: rank other published videos by shared tags (weighted) and matching
-- category, so the watch page can offer a genuine "more like this" rail.
create or replace function public.raye2_get_related_videos(
  p_media_id uuid,
  p_limit integer default 8
)
returns table (
  slug text,
  title text,
  category text,
  description text,
  shared_tags bigint,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 8), 1), 24) as lim
  ),
  source as (
    select vc.media_id, vc.category, vc.tags
    from public.video_catalog vc
    join public.media_items smi on smi.id = vc.media_id and smi.is_published = true and smi.media_type in ('video','youtube')
    where vc.media_id = p_media_id and vc.published_at is not null
  ),
  candidates as (
    select vc.media_id,
           vc.slug,
           vc.description,
           vc.category,
           vc.published_at,
           (
             select count(*) from unnest(vc.tags) tag
             where lower(tag) = any (select lower(s.tags[g]) from source s, generate_subscripts(s.tags, 1) g)
           ) as shared_tags
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id and mi.is_published = true and mi.media_type in ('video','youtube')
    cross join source s
    where vc.published_at is not null
      and vc.media_id <> s.media_id
  )
  select c.slug,
         mi.title,
         c.category,
         c.description,
         c.shared_tags,
         c.published_at
  from candidates c
  join public.media_items mi on mi.id = c.media_id
  where c.shared_tags > 0 or c.category = (select category from source)
  order by c.shared_tags desc, c.published_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_related_videos(uuid,integer) from public;
grant execute on function public.raye2_get_related_videos(uuid,integer) to anon, authenticated;

-- Topic index: every tag used by published videos, with a count, most used first.
create or replace function public.raye2_list_topics(
  p_limit integer default 40,
  p_min_count integer default 1
)
returns table (tag text, video_count bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 40), 1), 200) as lim,
           greatest(coalesce(p_min_count, 1), 1) as min_count
  )
  select lower(tag) as tag, count(*) as video_count
  from public.video_catalog vc
  join public.media_items mi on mi.id = vc.media_id and mi.is_published = true and mi.media_type in ('video','youtube')
  cross join lateral unnest(vc.tags) as tag
  where vc.published_at is not null and length(btrim(tag)) between 1 and 40
  group by lower(tag)
  having count(*) >= (select min_count from bounded)
  order by count(*) desc, lower(tag) asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_topics(integer,integer) from public;
grant execute on function public.raye2_list_topics(integer,integer) to anon, authenticated;

-- Videos carrying a given tag, newest first, for the per-topic browse page.
create or replace function public.raye2_get_topic_videos(
  p_tag text,
  p_limit integer default 24
)
returns table (
  slug text,
  title text,
  category text,
  description text,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 24), 1), 60) as lim,
           lower(btrim(coalesce(p_tag, ''))) as wanted
  )
  select vc.slug,
         mi.title,
         vc.category,
         vc.description,
         vc.published_at
  from public.video_catalog vc
  join public.media_items mi on mi.id = vc.media_id and mi.is_published = true and mi.media_type in ('video','youtube')
  cross join bounded b
  where vc.published_at is not null
    and b.wanted <> ''
    and exists (select 1 from unnest(vc.tags) tag where lower(tag) = b.wanted)
  order by vc.published_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_topic_videos(text,integer) from public;
grant execute on function public.raye2_get_topic_videos(text,integer) to anon, authenticated;

notify pgrst, 'reload schema';

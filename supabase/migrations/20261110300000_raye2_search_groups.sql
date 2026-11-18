-- Raye2 Wave 6 search depth: public groups and block-aware results.
--
-- The unified search covered videos, people, posts and tags, but it never returned public
-- groups, so spaces were invisible from discovery, and results were not filtered against the
-- signed-in member's block list, so blocked accounts could still surface in people and posts.
--
-- This replaces raye2_search with the same signature (text, integer) so callers are
-- unchanged. It stays SECURITY DEFINER, STABLE, pinned to an empty search_path, granted to
-- anon + authenticated, and only exposes published content, public members and public groups.

create or replace function public.raye2_search(
  p_query text,
  p_limit integer default 30
)
returns table (
  kind text,
  ref text,
  title text,
  subtitle text,
  snippet text,
  rank integer
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with q as (
    select btrim(coalesce(p_query, '')) as raw,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  ),
  bounded as (
    select least(greatest(coalesce(p_limit, 30), 1), 60) as lim
  ),
  blocked as (
    select case
             when b.blocker_id = (select auth.uid()) then b.blocked_id
             else b.blocker_id
           end as uid
    from public.member_blocks b
    where (select auth.uid()) is not null
      and (b.blocker_id = (select auth.uid()) or b.blocked_id = (select auth.uid()))
  ),
  videos as (
    select 'video'::text as kind,
           vc.slug as ref,
           mi.title as title,
           vc.category as subtitle,
           vc.description as snippet,
           case
             when lower(mi.title) = lower(q.raw) then 0
             when mi.title ilike q.raw || '%' then 1
             else 2
           end as rank
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id
    cross join q
    where q.raw <> ''
      and mi.is_published = true
      and mi.media_type in ('video', 'youtube')
      and vc.published_at is not null
      and (mi.title ilike q.pat escape '\' or vc.description ilike q.pat escape '\')
  ),
  people as (
    select 'person'::text as kind,
           mp.handle as ref,
           mp.display_name as title,
           '@' || mp.handle as subtitle,
           mp.bio as snippet,
           case
             when lower(mp.handle) = lower(q.raw) or lower(mp.display_name) = lower(q.raw) then 0
             when mp.handle ilike q.raw || '%' or mp.display_name ilike q.raw || '%' then 1
             else 2
           end as rank
    from public.member_profiles mp
    cross join q
    where q.raw <> ''
      and mp.visibility = 'public'
      and not exists (select 1 from blocked bl where bl.uid = mp.user_id)
      and (mp.handle ilike q.pat escape '\' or mp.display_name ilike q.pat escape '\' or mp.bio ilike q.pat escape '\')
  ),
  posts as (
    select 'post'::text as kind,
           cp.id::text as ref,
           coalesce(mp.display_name, 'Raye2 member') as title,
           '@' || coalesce(mp.handle, 'member') as subtitle,
           cp.body as snippet,
           2 as rank
    from public.community_posts cp
    left join public.member_profiles mp on mp.user_id = cp.author_id
    cross join q
    where q.raw <> ''
      and cp.status = 'published'
      and not exists (select 1 from blocked bl where bl.uid = cp.author_id)
      and cp.body ilike q.pat escape '\'
  ),
  tags as (
    select distinct 'tag'::text as kind,
           lower(btrim(tag)) as ref,
           '#' || lower(btrim(tag)) as title,
           'Topic'::text as subtitle,
           ''::text as snippet,
           case when lower(btrim(tag)) = lower(q.raw) then 0 else 1 end as rank
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id
    cross join q
    cross join lateral unnest(vc.tags) as tag
    where q.raw <> ''
      and mi.is_published = true
      and mi.media_type in ('video', 'youtube')
      and vc.published_at is not null
      and length(btrim(tag)) between 1 and 40
      and tag ilike q.pat escape '\'
  ),
  groups as (
    select 'group'::text as kind,
           g.slug as ref,
           g.name as title,
           g.visibility as subtitle,
           g.description as snippet,
           case
             when lower(g.name) = lower(q.raw) then 0
             when g.name ilike q.raw || '%' then 1
             else 2
           end as rank
    from public.raye2_groups g
    cross join q
    where q.raw <> ''
      and g.visibility = 'public'
      and g.status in ('active', 'read_only')
      and (g.expires_at is null or g.expires_at > now())
      and (g.name ilike q.pat escape '\' or g.description ilike q.pat escape '\')
  ),
  combined as (
    select * from videos
    union all select * from people
    union all select * from posts
    union all select * from tags
    union all select * from groups
  )
  select c.kind, c.ref, c.title, c.subtitle, c.snippet, c.rank
  from combined c
  order by c.rank asc, c.title asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_search(text,integer) from public;
grant execute on function public.raye2_search(text,integer) to anon, authenticated;

notify pgrst, 'reload schema';

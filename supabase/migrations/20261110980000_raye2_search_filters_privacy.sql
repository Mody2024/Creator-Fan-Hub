-- Raye2 Wave 3: search filters, privacy, and the dead "Spaces" result kind.
--
-- Plan 3.2 requires search over public creators, users, videos, Mini's, public Moments, public communities
-- and events, with filters for content type, category, recency, and strict respect for privacy, blocks,
-- moderation state, visibility and expiry. The existing raye2_search only covered videos, people, posts and
-- tags, had no filters, and never returned a 'group' row even though the search page rendered a Spaces tab.
--
-- This migration replaces raye2_search with a filtered, block-aware version that also returns Mini's
-- (community_short_videos) and public spaces (raye2_groups), and adds a facet RPC for category chips.

-- The two-argument version is replaced by the filtered five-argument version; drop it so PostgREST has a
-- single, unambiguous signature.
drop function if exists public.raye2_search(text, integer);

create or replace function public.raye2_search(
  p_query text,
  p_limit integer default 30,
  p_kind text default null,
  p_category text default null,
  p_recency text default null
)
returns table (
  kind text,
  ref text,
  title text,
  subtitle text,
  snippet text,
  rank integer
)
language plpgsql
stable
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_lim integer := least(greatest(coalesce(p_limit, 30), 1), 60);
  v_raw text := btrim(coalesce(p_query, ''));
  v_pat text := '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%';
  v_kind text := lower(btrim(coalesce(p_kind, '')));
  v_cat text := nullif(btrim(coalesce(p_category, '')), '');
  v_since timestamptz;
begin
  if v_kind <> '' and v_kind not in ('video','person','post','tag','group','short') then
    raise exception 'invalid search kind' using errcode='22023';
  end if;
  if p_recency is not null and lower(btrim(p_recency)) not in ('day','week','month','year') then
    raise exception 'invalid recency filter' using errcode='22023';
  end if;
  v_since := case lower(btrim(coalesce(p_recency, '')))
    when 'day' then now() - interval '1 day'
    when 'week' then now() - interval '7 days'
    when 'month' then now() - interval '30 days'
    when 'year' then now() - interval '365 days'
    else null end;

  if v_raw = '' then return; end if;

  return query
  with q as (select v_raw as raw, v_pat as pat),
  videos as (
    select 'video'::text as kind, vc.slug as ref, mi.title as title, vc.category as subtitle,
           vc.description as snippet,
           case when lower(mi.title) = lower(q.raw) then 0 when mi.title ilike q.raw || '%' then 1 else 2 end as rank,
           vc.published_at as at
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id
    cross join q
    where mi.is_published = true and mi.media_type in ('video','youtube') and vc.published_at is not null
      and (mi.owner_id is null or not public.is_member_blocked(mi.owner_id))
      and (mi.title ilike q.pat escape '\' or vc.description ilike q.pat escape '\')
  ),
  people as (
    select 'person'::text as kind, mp.handle as ref, mp.display_name as title, '@' || mp.handle as subtitle,
           mp.bio as snippet,
           case when lower(mp.handle) = lower(q.raw) or lower(mp.display_name) = lower(q.raw) then 0
                when mp.handle ilike q.raw || '%' or mp.display_name ilike q.raw || '%' then 1 else 2 end as rank,
           mp.updated_at as at
    from public.member_profiles mp
    cross join q
    where mp.visibility = 'public' and not public.is_member_blocked(mp.user_id)
      and (mp.handle ilike q.pat escape '\' or mp.display_name ilike q.pat escape '\' or mp.bio ilike q.pat escape '\')
  ),
  posts as (
    select 'post'::text as kind, cp.id::text as ref, coalesce(mp.display_name, 'Raye2 member') as title,
           '@' || coalesce(mp.handle, 'member') as subtitle, cp.body as snippet, 2 as rank, cp.created_at as at
    from public.community_posts cp
    left join public.member_profiles mp on mp.user_id = cp.author_id
    cross join q
    where cp.status = 'published'
      and not public.is_member_blocked(cp.author_id)
      and cp.body ilike q.pat escape '\'
  ),
  shorts as (
    select 'short'::text as kind, sv.id::text as ref, sv.title as title, 'Mini'::text as subtitle,
           sv.caption as snippet,
           case when lower(sv.title) = lower(q.raw) then 0 else 2 end as rank, sv.created_at as at
    from public.community_short_videos sv
    cross join q
    where sv.status = 'published'
      and not public.is_member_blocked(sv.author_id)
      and (sv.title ilike q.pat escape '\' or sv.caption ilike q.pat escape '\')
  ),
  tags as (
    select distinct 'tag'::text as kind, lower(btrim(tag)) as ref, '#' || lower(btrim(tag)) as title,
           'Topic'::text as subtitle, ''::text as snippet,
           case when lower(btrim(tag)) = lower(q.raw) then 0 else 1 end as rank, now() as at
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id
    cross join q
    cross join lateral unnest(vc.tags) as tag
    where mi.is_published = true and mi.media_type in ('video','youtube') and vc.published_at is not null
      and (mi.owner_id is null or not public.is_member_blocked(mi.owner_id))
      and length(btrim(tag)) between 1 and 40
      and tag ilike q.pat escape '\'
  ),
  spaces as (
    select 'group'::text as kind, g.slug as ref, g.name as title, 'Space'::text as subtitle,
           g.description as snippet,
           case when lower(g.name) = lower(q.raw) then 0 when g.name ilike q.raw || '%' then 1 else 2 end as rank,
           g.last_activity_at as at
    from public.raye2_groups g
    cross join q
    where g.visibility = 'public' and g.status in ('active','read_only')
      and (g.expires_at is null or g.expires_at > now())
      and (g.name ilike q.pat escape '\' or g.description ilike q.pat escape '\' or g.slug ilike q.pat escape '\')
  ),
  combined as (
    select * from videos union all select * from people union all select * from posts
    union all select * from shorts union all select * from tags union all select * from spaces
  )
  select c.kind, c.ref, c.title, c.subtitle, c.snippet, c.rank
  from combined c
  where (v_kind = '' or c.kind = v_kind)
    and (v_cat is null or (c.kind = 'video' and c.subtitle = v_cat))
    and (v_since is null or c.at >= v_since)
  order by c.rank asc, c.title asc
  limit v_lim;
end;
$fn$;
revoke all on function public.raye2_search(text,integer,text,text,text) from public;
grant execute on function public.raye2_search(text,integer,text,text,text) to anon, authenticated;

-- Category facets for the search filter chips: the categories present among matching, visible videos.
create or replace function public.raye2_get_search_facets(p_query text)
returns table (category text, total bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  with q as (
    select btrim(coalesce(p_query, '')) as raw,
           '%' || replace(replace(replace(btrim(coalesce(p_query, '')), '\', '\\'), '%', '\%'), '_', '\_') || '%' as pat
  )
  select vc.category, count(*)::bigint as total
  from public.video_catalog vc
  join public.media_items mi on mi.id = vc.media_id
  cross join q
  where q.raw <> ''
    and mi.is_published = true and mi.media_type in ('video','youtube') and vc.published_at is not null
    and (mi.owner_id is null or not public.is_member_blocked(mi.owner_id))
    and (mi.title ilike q.pat escape '\' or vc.description ilike q.pat escape '\')
    and vc.category is not null and btrim(vc.category) <> ''
  group by vc.category
  order by count(*) desc, vc.category asc
  limit 12;
$fn$;
revoke all on function public.raye2_get_search_facets(text) from public;
grant execute on function public.raye2_get_search_facets(text) to anon, authenticated;

notify pgrst, 'reload schema';

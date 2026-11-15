-- Raye2 Wave 3/9: apply video exclusivity and availability expiry to every discovery RPC.
--
-- The catalog SELECT policy was tightened (migration 20261110610000) so an exclusive or expired video is
-- not readable, but discovery RPCs are SECURITY DEFINER and therefore bypass RLS. Recommendations already
-- applied the access rule inline; related videos, topic hubs, trending, search, watch context and
-- continue-watching did not, so an exclusive or expired video could still be surfaced through them. This
-- recreates those functions with the same viewer-scoped check (raye2_can_view_video, which honours the
-- caller via auth.uid()). Signatures and return types are unchanged.

-- 1. Related videos: the source and every candidate must be viewable.
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
      and public.raye2_can_view_video(vc.media_id)
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
      and public.raye2_can_view_video(vc.media_id)
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

-- 2. Per-topic video list.
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
    and public.raye2_can_view_video(vc.media_id)
    and exists (select 1 from unnest(vc.tags) tag where lower(tag) = b.wanted)
  order by vc.published_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_topic_videos(text,integer) from public;
grant execute on function public.raye2_get_topic_videos(text,integer) to anon, authenticated;

-- 3. Topic directory counts only viewable videos, so an exclusive video does not inflate a tag.
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
    and public.raye2_can_view_video(vc.media_id)
  group by lower(tag)
  having count(*) >= (select min_count from bounded)
  order by count(*) desc, lower(tag) asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_topics(integer,integer) from public;
grant execute on function public.raye2_list_topics(integer,integer) to anon, authenticated;

-- 4. Trending videos.
create or replace function public.raye2_get_trending_videos(
  p_limit integer default 10,
  p_window_days integer default 30
)
returns table (
  slug text,
  title text,
  category text,
  description text,
  view_count bigint,
  reaction_count bigint,
  comment_count bigint,
  published_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 10), 1), 50) as lim,
           least(greatest(coalesce(p_window_days, 30), 1), 3650) as win_days
  ),
  scored as (
    select vc.media_id,
           vc.slug,
           vc.description,
           vc.category,
           vc.published_at,
           coalesce(vw.view_count, 0) as view_count,
           coalesce(vr.reaction_count, 0) as reaction_count,
           coalesce(vcm.comment_count, 0) as comment_count,
           (coalesce(vw.view_count, 0) + 3 * coalesce(vr.reaction_count, 0) + 2 * coalesce(vcm.comment_count, 0) + 1)
             / power(extract(epoch from (now() - coalesce(vc.published_at, vc.updated_at))) / 86400.0 + 2, 1.5) as score
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id and mi.is_published = true and mi.media_type in ('video','youtube')
    cross join bounded b
    left join lateral (
      select count(*) as view_count from public.video_views vv where vv.media_id = vc.media_id
    ) vw on true
    left join lateral (
      select count(*) as reaction_count from public.video_reactions vr2 where vr2.media_id = vc.media_id
    ) vr on true
    left join lateral (
      select count(*) as comment_count from public.video_comments vc2
      where vc2.media_id = vc.media_id and vc2.status = 'published'
    ) vcm on true
    where vc.published_at is not null
      and vc.published_at > now() - make_interval(days => b.win_days)
      and public.raye2_can_view_video(vc.media_id)
  )
  select s.slug,
         mi.title,
         s.category,
         s.description,
         s.view_count,
         s.reaction_count,
         s.comment_count,
         s.published_at
  from scored s
  join public.media_items mi on mi.id = s.media_id
  order by s.score desc, s.published_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_trending_videos(integer,integer) from public;
grant execute on function public.raye2_get_trending_videos(integer,integer) to anon, authenticated;

-- 5. Trending tags.
create or replace function public.raye2_get_trending_tags(
  p_limit integer default 12,
  p_window_days integer default 90
)
returns table (tag text, video_count bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 12), 1), 50) as lim,
           least(greatest(coalesce(p_window_days, 90), 1), 3650) as win_days
  )
  select lower(tag) as tag, count(*) as video_count
  from public.video_catalog vc
  cross join bounded b
  join public.media_items mi on mi.id = vc.media_id and mi.is_published = true and mi.media_type in ('video','youtube')
  cross join lateral unnest(vc.tags) as tag
  where vc.published_at is not null
    and vc.published_at > now() - make_interval(days => b.win_days)
    and length(btrim(tag)) between 1 and 40
    and public.raye2_can_view_video(vc.media_id)
  group by lower(tag)
  order by count(*) desc, lower(tag) asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_trending_tags(integer,integer) from public;
grant execute on function public.raye2_get_trending_tags(integer,integer) to anon, authenticated;

-- 6. Unified search: the video and tag branches must respect access.
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
      and public.raye2_can_view_video(vc.media_id)
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
      and public.raye2_can_view_video(vc.media_id)
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

-- 7. Watch context: an exclusive or expired video has no public watch surface.
create or replace function public.raye2_get_watch_context(
  p_slug text
)
returns table (
  creator_user_id uuid,
  creator_handle text,
  creator_display_name text,
  creator_avatar_url text,
  follower_count bigint,
  is_following boolean,
  series_slug text,
  series_title text,
  series_position integer,
  series_episode_count bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with target as (
    select vc.media_id, mi.owner_id
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id
    where vc.slug = lower(btrim(coalesce(p_slug, '')))
      and mi.is_published = true
      and mi.media_type in ('video', 'youtube')
      and vc.published_at is not null
      and public.raye2_can_view_video(vc.media_id)
  ),
  visible as (
    select t.media_id, t.owner_id
    from target t
    where t.owner_id is not null
      and not public.is_member_blocked(t.owner_id)
  ),
  series_pick as (
    select pl.id, pl.slug, pl.title, vpi.position
    from visible v
    join public.video_playlist_items vpi on vpi.media_id = v.media_id
    join public.video_playlists pl on pl.id = vpi.playlist_id and pl.is_published = true
    order by pl.position asc, vpi.position asc, pl.created_at asc
    limit 1
  ),
  series_episodes as (
    select sp.id,
           (select count(*)
              from public.video_playlist_items i
              join public.video_catalog v on v.media_id = i.media_id
              join public.media_items m on m.id = v.media_id
             where i.playlist_id = sp.id
               and m.is_published = true
               and m.media_type in ('video', 'youtube')
               and v.published_at is not null) as episode_count
    from series_pick sp
  )
  select v.owner_id as creator_user_id,
         mp.handle as creator_handle,
         mp.display_name as creator_display_name,
         mp.avatar_url as creator_avatar_url,
         (select count(*) from public.member_follows f where f.followed_id = v.owner_id) as follower_count,
         exists(select 1 from public.member_follows f2
                 where f2.follower_id = (select auth.uid()) and f2.followed_id = v.owner_id) as is_following,
         sp.slug as series_slug,
         sp.title as series_title,
         sp.position as series_position,
         se.episode_count as series_episode_count
  from visible v
  left join public.member_profiles mp on mp.user_id = v.owner_id
  left join series_pick sp on true
  left join series_episodes se on se.id = sp.id;
$fn$;
revoke all on function public.raye2_get_watch_context(text) from public;
grant execute on function public.raye2_get_watch_context(text) to anon, authenticated;

-- 8. Continue-watching must not resurface a video that is now exclusive or expired.
create or replace function public.raye2_get_continue_watching(
  p_limit integer default 10
)
returns table (
  slug text,
  title text,
  category text,
  description text,
  position_seconds integer,
  duration_seconds integer,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 10), 1), 24) as lim
  )
  select vc.slug,
         mi.title,
         vc.category,
         vc.description,
         wp.position_seconds,
         wp.duration_seconds,
         wp.updated_at
  from public.watch_progress wp
  join public.video_catalog vc on vc.media_id = wp.media_id
  join public.media_items mi on mi.id = vc.media_id
  where wp.user_id = auth.uid()
    and mi.is_published = true
    and mi.media_type in ('video','youtube')
    and vc.published_at is not null
    and public.raye2_can_view_video(vc.media_id)
    and wp.position_seconds > 0
    and (
      wp.duration_seconds = 0
      or wp.position_seconds < least(wp.duration_seconds - 30, floor(wp.duration_seconds * 0.95))
    )
  order by wp.updated_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_continue_watching(integer) from public;
grant execute on function public.raye2_get_continue_watching(integer) to authenticated;

notify pgrst, 'reload schema';

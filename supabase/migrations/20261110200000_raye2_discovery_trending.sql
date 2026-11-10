-- Raye2 Wave 5 discovery: public trending feeds.
--
-- The Discover surface could only search when a term was typed; with no term it showed an
-- empty state. These read-only RPCs give it real, ranked "trending now" content: community
-- posts, videos and tags ordered by a gravity-style engagement score that decays with age.
--
-- All three are SECURITY DEFINER, STABLE, pinned to an empty search_path, and granted to
-- anon + authenticated because discovery is public. They only ever expose published content.

-- Trending community posts: engagement (reactions weighted 3, comments weighted 2) decayed
-- by age so recent conversations surface without burying older high-engagement threads.
create or replace function public.raye2_get_trending_posts(
  p_limit integer default 10,
  p_window_hours integer default 168
)
returns table (
  post_id uuid,
  author_handle text,
  author_display_name text,
  author_avatar_url text,
  post_type text,
  excerpt text,
  reaction_count bigint,
  comment_count bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 10), 1), 50) as lim,
           least(greatest(coalesce(p_window_hours, 168), 1), 8760) as win_hours
  ),
  scored as (
    select p.id,
           p.author_id,
           p.post_type,
           p.body,
           p.created_at,
           coalesce(r.reaction_count, 0) as reaction_count,
           coalesce(c.comment_count, 0) as comment_count,
           (3 * coalesce(r.reaction_count, 0) + 2 * coalesce(c.comment_count, 0) + 1)
             / power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2, 1.5) as score
    from public.community_posts p
    cross join bounded b
    left join lateral (
      select count(*) as reaction_count from public.community_reactions cr where cr.post_id = p.id
    ) r on true
    left join lateral (
      select count(*) as comment_count from public.community_comments cc
      where cc.post_id = p.id and cc.status = 'published'
    ) c on true
    where p.status = 'published'
      and p.created_at > now() - make_interval(hours => b.win_hours)
  )
  select s.id,
         mp.handle,
         mp.display_name,
         mp.avatar_url,
         s.post_type,
         left(s.body, 200),
         s.reaction_count,
         s.comment_count,
         s.created_at
  from scored s
  cross join bounded b
  left join public.member_profiles mp on mp.user_id = s.author_id
  order by s.score desc, s.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_trending_posts(integer,integer) from public;
grant execute on function public.raye2_get_trending_posts(integer,integer) to anon, authenticated;

-- Trending videos: views weighted 1, reactions 3, comments 2, decayed by age in days.
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

-- Trending tags: the most common tags across recently published videos.
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
  group by lower(tag)
  order by count(*) desc, lower(tag) asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_trending_tags(integer,integer) from public;
grant execute on function public.raye2_get_trending_tags(integer,integer) to anon, authenticated;

notify pgrst, 'reload schema';

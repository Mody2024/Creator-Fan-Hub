-- Raye2 Wave 3: explainable, privacy-safe video recommendations.
--
-- Plan 3.2 requires a recommended surface whose ranking is explainable, abuse-resistant, and does not
-- reveal private interests or memberships. There was no "recommended / for you" RPC: the home page only
-- showed the newest videos and the watch page only showed related videos by shared tags.
--
-- This ranks accessible published videos by an engagement-and-recency score (the same abuse-resistant
-- shape as trending) and adds a bounded personalisation lift from the viewer's OWN recent watch history.
-- The viewer's affinity is derived only from their own views, is never exposed to others, and every row
-- carries an explicit reason so the surface is explainable.

create index if not exists video_views_viewer_idx on public.video_views(viewer_id, viewed_at desc);

create or replace function public.raye2_get_recommended_videos(
  p_limit integer default 12,
  p_window_days integer default 30
)
returns table (
  slug text,
  title text,
  category text,
  description text,
  published_at timestamptz,
  reason text,
  matched_category text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 12), 1), 50) as lim,
           least(greatest(coalesce(p_window_days, 30), 1), 3650) as win
  ),
  affinity as (
    select vc.category, count(*) as n
    from public.video_views vv
    join public.video_catalog vc on vc.media_id = vv.media_id
    where vv.viewer_id = (select auth.uid())
      and vv.viewed_at > now() - make_interval(days => (select win from bounded))
    group by vc.category
  ),
  scored as (
    select vc.media_id,
           vc.slug,
           vc.category,
           vc.description,
           vc.published_at,
           coalesce(af.n, 0) as affinity_n,
           (coalesce(vw.c, 0) + 3 * coalesce(vr.c, 0) + 2 * coalesce(vcm.c, 0) + 1) as engagement,
           power(extract(epoch from (now() - coalesce(vc.published_at, vc.updated_at))) / 86400.0 + 2, 1.5) as decay
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id
    cross join bounded b
    left join affinity af on af.category = vc.category
    left join lateral (select count(*) c from public.video_views vv2 where vv2.media_id = vc.media_id) vw on true
    left join lateral (select count(*) c from public.video_reactions vre where vre.media_id = vc.media_id) vr on true
    left join lateral (select count(*) c from public.video_comments vcmt where vcmt.media_id = vc.media_id and vcmt.status = 'published') vcm on true
    where mi.is_published = true
      and mi.media_type in ('video','youtube')
      and vc.published_at is not null
      and vc.published_at > now() - make_interval(days => b.win)
      -- Respect exclusivity and availability expiry exactly like the catalog read policy.
      and (vc.exclusive_until is null or vc.exclusive_until <= now())
      and (vc.available_until is null or vc.available_until > now())
  )
  select s.slug,
         mi.title,
         s.category,
         s.description,
         s.published_at,
         case when s.affinity_n > 0 then 'based_on_watch_history' else 'trending' end as reason,
         case when s.affinity_n > 0 then s.category else null end as matched_category
  from scored s
  join public.media_items mi on mi.id = s.media_id
  order by
    ((s.engagement / s.decay) * (1 + case when s.affinity_n > 0 then 0.5 * least(s.affinity_n, 4) / 4.0 else 0 end)) desc,
    s.published_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_recommended_videos(integer,integer) from public;
grant execute on function public.raye2_get_recommended_videos(integer,integer) to anon, authenticated;

-- The caller's own recommendation topics, so the surface can explain itself without exposing others.
create or replace function public.raye2_get_my_recommendation_topics(p_limit integer default 5)
returns table (category text, weight bigint)
language sql
stable
security definer
set search_path = ''
as $fn$
  select vc.category, count(*) as weight
  from public.video_views vv
  join public.video_catalog vc on vc.media_id = vv.media_id
  where vv.viewer_id = (select auth.uid())
    and vv.viewed_at > now() - interval '30 days'
  group by vc.category
  order by weight desc, category asc
  limit least(greatest(coalesce(p_limit,5),1),20);
$fn$;
revoke all on function public.raye2_get_my_recommendation_topics(integer) from public,anon;
grant execute on function public.raye2_get_my_recommendation_topics(integer) to authenticated;

notify pgrst, 'reload schema';

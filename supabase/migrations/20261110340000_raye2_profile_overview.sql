-- Raye2 Wave 5 profile depth: a real member/creator overview.
--
-- The profile page labelled its header stat "Posts" but actually summed posts + videos + shorts,
-- and it showed no engagement at all (views, reactions) or creator status. This read RPC returns
-- one row of identity plus real, individually-labelled counts so the profile header can be honest.
--
-- SECURITY DEFINER, STABLE, pinned to an empty search_path, granted to anon + authenticated.
-- Visibility matches the member_profiles RLS policy exactly: a public, unblocked profile, the
-- viewer's own profile, or a profile the viewer blocked (so they can reach the unblock control).

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

notify pgrst, 'reload schema';

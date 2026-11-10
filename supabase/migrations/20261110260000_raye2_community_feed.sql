-- Raye2 Wave 5 community depth: feed and comments.
--
-- The community feed fetched posts, authors and reaction counts with several round trips,
-- showed no comment counts, and its comment thread displayed bodies with no author
-- attribution. There was no "hot" ordering and blocked members still appeared in the feed.
-- These pinned SECURITY DEFINER read RPCs fix all of that in one place.
--
-- Both are granted to anon + authenticated because the community feed is public, and only
-- ever expose published posts and published comments.

-- Community feed: published posts with author, reaction count, comment count and pinned
-- flag in a single call, optionally restricted to followed authors and/or hot ordering.
create or replace function public.raye2_get_community_feed(
  p_limit integer default 40,
  p_sort text default 'latest',
  p_following_only boolean default false
)
returns table (
  id uuid,
  author_id uuid,
  post_type text,
  body text,
  linked_video_id uuid,
  created_at timestamptz,
  pinned boolean,
  author_handle text,
  author_display_name text,
  author_avatar_url text,
  reaction_count bigint,
  comment_count bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with viewer as (
    select (select auth.uid()) as me
  ),
  bounded as (
    select least(greatest(coalesce(p_limit, 40), 1), 80) as lim,
           case when p_sort = 'hot' then 'hot' else 'latest' end as sort_key
  ),
  followed as (
    select f.followed_id
    from public.member_follows f, viewer v
    where f.follower_id = v.me
  ),
  blocked as (
    select b.blocked_id as uid from public.member_blocks b, viewer v where b.blocker_id = v.me
    union
    select b.blocker_id as uid from public.member_blocks b, viewer v where b.blocked_id = v.me
  ),
  scored as (
    select p.id,
           p.author_id,
           p.post_type,
           p.body,
           p.linked_video_id,
           p.created_at,
           p.pinned,
           coalesce(r.reaction_count, 0) as reaction_count,
           coalesce(c.comment_count, 0) as comment_count,
           (3 * coalesce(r.reaction_count, 0) + 2 * coalesce(c.comment_count, 0) + 1)
             / power(extract(epoch from (now() - p.created_at)) / 3600.0 + 2, 1.5) as hot_score
    from public.community_posts p
    cross join viewer v
    left join lateral (
      select count(*) as reaction_count from public.community_reactions cr where cr.post_id = p.id
    ) r on true
    left join lateral (
      select count(*) as comment_count from public.community_comments cc
      where cc.post_id = p.id and cc.status = 'published'
    ) c on true
    where p.status = 'published'
      and (not p_following_only or p.author_id in (select followed_id from followed))
      and not exists (select 1 from blocked b where b.uid = p.author_id)
  )
  select s.id,
         s.author_id,
         s.post_type,
         s.body,
         s.linked_video_id,
         s.created_at,
         s.pinned,
         mp.handle,
         mp.display_name,
         mp.avatar_url,
         s.reaction_count,
         s.comment_count
  from scored s
  left join public.member_profiles mp on mp.user_id = s.author_id
  cross join bounded b
  order by s.pinned desc,
           case when b.sort_key = 'hot' then s.hot_score end desc nulls last,
           s.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_community_feed(integer,text,boolean) from public;
grant execute on function public.raye2_get_community_feed(integer,text,boolean) to anon, authenticated;

-- Comment thread: published comments with author attribution, oldest first.
create or replace function public.raye2_get_post_comments(
  p_post_id uuid,
  p_limit integer default 50
)
returns table (
  id uuid,
  author_id uuid,
  body text,
  created_at timestamptz,
  author_handle text,
  author_display_name text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 50), 1), 100) as lim
  ),
  allowed as (
    select p.id
    from public.community_posts p
    where p.id = p_post_id
      and p.status = 'published'
  )
  select cc.id,
         cc.author_id,
         cc.body,
         cc.created_at,
         mp.handle,
         mp.display_name
  from public.community_comments cc
  join allowed a on a.id = cc.post_id
  left join public.member_profiles mp on mp.user_id = cc.author_id
  cross join bounded b
  where cc.status = 'published'
  order by cc.created_at asc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_post_comments(uuid,integer) from public;
grant execute on function public.raye2_get_post_comments(uuid,integer) to anon, authenticated;

notify pgrst, 'reload schema';

-- Raye2 Wave 3: keyset pagination for the community feed.
--
-- Plan 3.1 requires feed pagination without duplicate or missing items, with loading/empty/error states.
-- The home feed loaded a single window of 30 posts with no way to continue. This adds a cursor-based
-- (keyset) page function so "load more" never duplicates or skips a post, even as new posts arrive.
--
-- The cursor is (created_at, id) of the last row of the previous page; ordering is created_at desc, id
-- desc. Pinned posts are surfaced by the first page only; the paged stream is strictly chronological so
-- the keyset stays exact.

create or replace function public.raye2_get_community_feed_page(
  p_limit integer default 20,
  p_following_only boolean default false,
  p_before timestamptz default null,
  p_before_id uuid default null
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
    select least(greatest(coalesce(p_limit, 20), 1), 50) as lim
  ),
  followed as (
    select f.followed_id from public.member_follows f, viewer v where f.follower_id = v.me
  ),
  blocked as (
    select b.blocked_id as uid from public.member_blocks b, viewer v where b.blocker_id = v.me
    union
    select b.blocker_id as uid from public.member_blocks b, viewer v where b.blocked_id = v.me
  )
  select p.id,
         p.author_id,
         p.post_type,
         p.body,
         p.linked_video_id,
         p.created_at,
         p.pinned,
         mp.handle,
         mp.display_name,
         mp.avatar_url,
         coalesce(r.reaction_count, 0),
         coalesce(c.comment_count, 0)
  from public.community_posts p
  cross join bounded b
  left join lateral (
    select count(*) as reaction_count from public.community_reactions cr where cr.post_id = p.id
  ) r on true
  left join lateral (
    select count(*) as comment_count from public.community_comments cc
    where cc.post_id = p.id and cc.status = 'published'
  ) c on true
  left join public.member_profiles mp on mp.user_id = p.author_id
  where p.status = 'published'
    and (not p_following_only or p.author_id in (select followed_id from followed))
    and not exists (select 1 from blocked b where b.uid = p.author_id)
    and (p_before is null or (p.created_at, p.id) < (p_before, coalesce(p_before_id, '00000000-0000-0000-0000-000000000000'::uuid)))
  order by p.created_at desc, p.id desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_community_feed_page(integer,boolean,timestamptz,uuid) from public;
grant execute on function public.raye2_get_community_feed_page(integer,boolean,timestamptz,uuid) to anon, authenticated;

notify pgrst, 'reload schema';

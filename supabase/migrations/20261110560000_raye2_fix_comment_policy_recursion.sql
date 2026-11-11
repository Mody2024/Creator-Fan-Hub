-- Raye2 Wave 9: fix infinite recursion in comment-thread read policies.
--
-- The comment-thread migrations (20261110360000/370000/380000) added reply visibility by checking
-- the parent row with a subquery against the same table inside that table's own SELECT policy. A
-- policy that reads its own relation recurses infinitely, so every read (and any write with a
-- RETURNING clause) on community_comments, community_short_comments and video_comments failed with
-- "infinite recursion detected in policy". These helpers run as the definer (bypassing RLS) so the
-- parent lookup no longer re-enters the policy.

create or replace function public.raye2_comment_parent_visible(p_parent_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.community_comments c where c.id = p_parent_id and c.status = 'published' and not public.is_member_blocked(c.author_id)); $$;
revoke all on function public.raye2_comment_parent_visible(uuid) from public,anon;
grant execute on function public.raye2_comment_parent_visible(uuid) to anon,authenticated;

create or replace function public.raye2_short_comment_parent_visible(p_parent_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.community_short_comments c where c.id = p_parent_id and c.status = 'published' and not public.is_member_blocked(c.author_id)); $$;
revoke all on function public.raye2_short_comment_parent_visible(uuid) from public,anon;
grant execute on function public.raye2_short_comment_parent_visible(uuid) to anon,authenticated;

create or replace function public.raye2_video_comment_parent_visible(p_parent_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.video_comments c where c.id = p_parent_id and c.status = 'published' and not public.is_member_blocked(c.author_id)); $$;
revoke all on function public.raye2_video_comment_parent_visible(uuid) from public,anon;
grant execute on function public.raye2_video_comment_parent_visible(uuid) to anon,authenticated;

-- Recreate the three policies with the helper instead of the self-referencing subquery.
drop policy if exists "Published comments visible" on public.community_comments;
create policy "Published comments visible"
on public.community_comments for select to anon, authenticated
using (
  (
    status = 'published'
    and not public.is_member_blocked(author_id)
    and exists (
      select 1 from public.community_posts p
      where p.id = community_comments.post_id and p.status = 'published' and not public.is_member_blocked(p.author_id)
    )
    and (parent_comment_id is null or public.raye2_comment_parent_visible(community_comments.parent_comment_id))
  )
  or author_id = (select auth.uid())
  or private.can_moderate_community()
);

drop policy if exists "Published comments visible on community shorts" on public.community_short_comments;
create policy "Published comments visible on community shorts"
on public.community_short_comments for select to anon, authenticated
using (
  (
    status = 'published'
    and not public.is_member_blocked(author_id)
    and exists (
      select 1 from public.community_short_videos s
      where s.id = community_short_comments.short_id and s.status = 'published' and not public.is_member_blocked(s.author_id)
    )
    and (parent_comment_id is null or public.raye2_short_comment_parent_visible(community_short_comments.parent_comment_id))
  )
  or author_id = (select auth.uid())
  or private.can_moderate_community()
);

drop policy if exists "Published video comments visible" on public.video_comments;
create policy "Published video comments visible"
on public.video_comments for select to anon, authenticated
using (
  (
    status = 'published'
    and not public.is_member_blocked(author_id)
    and exists (
      select 1 from public.video_catalog v
      join public.media_items m on m.id = v.media_id
      where v.media_id = video_comments.media_id and v.published_at is not null and m.is_published = true
    )
    and (parent_comment_id is null or public.raye2_video_comment_parent_visible(video_comments.parent_comment_id))
  )
  or author_id = (select auth.uid())
  or private.can_moderate_community()
);

notify pgrst, 'reload schema';

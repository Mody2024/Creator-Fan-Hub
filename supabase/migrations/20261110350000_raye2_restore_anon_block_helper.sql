-- Raye2 Wave 5 public community repair.
--
-- Regression (same class as the workspace-helper repair): an earlier hardening pass revoked
-- execute on public.is_member_blocked(uuid) from anon, but that helper is called by the anon
-- SELECT policies on community_posts, community_comments, community_short_videos, video_comments,
-- member_follows and member_profiles. For anonymous callers every one of those reads raised
-- "permission denied for function is_member_blocked", so the entire public community surface
-- (feed, comments, shorts, follow lists) rendered empty for logged-out visitors.
--
-- Restoring the grant is safe: for anon auth.uid() is null, so the helper's two-sided block
-- lookup can never match and it returns false without revealing any block relationship. This
-- mirrors the earlier restore in 20261102175115.

grant execute on function public.is_member_blocked(uuid) to anon;

-- The member_profiles SELECT policy also reads member_blocks directly to let a viewer who blocked
-- a member still open that profile (to unblock). anon has no SELECT on member_blocks, so that
-- clause raised "permission denied for table member_blocks". Move the check into a SECURITY
-- DEFINER helper anon can execute, keeping the exact same visibility semantics.

create or replace function public.raye2_viewer_blocked(p_target_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists(
    select 1 from public.member_blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = p_target_id
  );
$$;
revoke all on function public.raye2_viewer_blocked(uuid) from public;
grant execute on function public.raye2_viewer_blocked(uuid) to anon, authenticated;

drop policy if exists "Public profiles visible unless private" on public.member_profiles;
create policy "Public profiles visible unless private" on public.member_profiles for select to anon,authenticated
using(
  (visibility = 'public' and not public.is_member_blocked(user_id))
  or user_id = (select auth.uid())
  or public.can_view_creator_workspace()
  or public.raye2_viewer_blocked(user_id)
);

-- A second layer of the same outage: the moderation helper was moved to the `private` schema and
-- granted only to authenticated, but the anon SELECT policies on community_posts,
-- community_comments, community_short_videos and video_comments still call
-- private.can_moderate_community() in their published branch. anon had neither schema usage nor
-- execute, so those reads raised "permission denied for function can_moderate_community".
--
-- Grant anon usage + execute. The helper is SECURITY DEFINER and returns whether the *caller* is a
-- moderator; for anon auth.uid() is null so it is always false, revealing nothing. The `private`
-- schema is not part of the PostgREST exposed schemas, so this does not create an API endpoint.

grant usage on schema private to anon;
grant execute on function private.can_moderate_community() to anon;

notify pgrst, 'reload schema';

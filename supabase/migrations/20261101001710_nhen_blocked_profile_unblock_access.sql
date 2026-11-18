drop policy if exists "Public profiles visible unless private" on public.member_profiles;
create policy "Public profiles visible unless private" on public.member_profiles for select to anon,authenticated
using(
 (visibility='public' and not public.is_member_blocked(user_id))
 or user_id=(select auth.uid())
 or public.can_view_creator_workspace()
 or exists(select 1 from public.member_blocks b where b.blocker_id=(select auth.uid()) and b.blocked_id=member_profiles.user_id)
);

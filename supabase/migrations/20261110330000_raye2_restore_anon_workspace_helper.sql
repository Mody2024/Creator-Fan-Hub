-- Raye2 Wave 6 public watch repair.
--
-- Regression: an earlier hardening pass revoked execute on public.can_view_creator_workspace()
-- from anon, but the anon SELECT policies on video_catalog, video_playlists,
-- video_playlist_items and member_profiles still call that helper. For an anonymous caller the
-- policy expression raised "permission denied for function can_view_creator_workspace", so every
-- published watch page and series page 404'd for logged-out visitors.
--
-- This restores the grant. For anon, auth.uid() is null, so has_creator_role() returns false and
-- the policy reduces to its published-only branch — no unpublished content is ever revealed.

grant execute on function public.can_view_creator_workspace() to anon;

notify pgrst, 'reload schema';

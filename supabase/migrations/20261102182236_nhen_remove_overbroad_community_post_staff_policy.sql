-- The dedicated moderator policy already grants owner/admin/moderator access.
-- This older permissive policy also granted editor/analyst accounts ALL access.
drop policy if exists "NHEN staff moderate community posts" on public.community_posts;

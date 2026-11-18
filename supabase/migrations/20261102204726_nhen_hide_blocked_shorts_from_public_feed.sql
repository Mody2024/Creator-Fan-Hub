-- Hide published community Shorts from members who have blocked or been blocked by their author.
-- Anonymous visitors have no auth.uid(), so is_member_blocked() safely returns false for them.
drop policy if exists "Published community shorts are public" on public.community_short_videos;
create policy "Published community shorts are visible unless blocked"
on public.community_short_videos for select to anon, authenticated
using (
  (status = 'published' and not public.is_member_blocked(author_id))
  or author_id = (select auth.uid())
  or private.can_moderate_community()
);
notify pgrst, 'reload schema';

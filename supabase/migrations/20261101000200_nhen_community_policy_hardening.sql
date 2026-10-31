-- Ensure anonymous public reads can evaluate the safe creator predicate.
grant execute on function public.is_active_creator() to anon, authenticated;

-- A member may comment only on a currently published post.
drop policy if exists "Members submit moderated comments" on public.community_comments;
create policy "Members submit moderated comments"
on public.community_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'pending'
  and exists(select 1 from public.community_posts p where p.id = post_id and p.status = 'published')
);

drop policy if exists "Members edit own pending comments" on public.community_comments;
create policy "Members edit own pending comments"
on public.community_comments for update to authenticated
using (
  author_id = (select auth.uid())
  and status = 'pending'
  and exists(select 1 from public.community_posts p where p.id = post_id and p.status = 'published')
)
with check (
  author_id = (select auth.uid())
  and status = 'pending'
  and exists(select 1 from public.community_posts p where p.id = post_id and p.status = 'published')
);

-- Members cannot turn an arbitrary media item into a community post attachment.
drop policy if exists "Members submit moderated posts" on public.community_posts;
create policy "Members submit moderated posts"
on public.community_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and post_type = 'member'
  and status = 'pending'
  and pinned = false
  and (linked_video_id is null or exists(
    select 1 from public.media_items m where m.id = linked_video_id and m.is_published = true and m.media_type in ('video','youtube')
  ))
);

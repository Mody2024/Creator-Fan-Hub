-- Mutual member blocking: hide blocked profiles and their public conversations.
create or replace function public.is_member_blocked(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(
  select 1 from public.member_blocks b
  where (b.blocker_id=(select auth.uid()) and b.blocked_id=p_user_id)
     or (b.blocker_id=p_user_id and b.blocked_id=(select auth.uid()))
 );
$$;
revoke all on function public.is_member_blocked(uuid) from public;
grant execute on function public.is_member_blocked(uuid) to anon,authenticated;

drop policy if exists "Published posts visible" on public.community_posts;
create policy "Published posts visible" on public.community_posts for select to anon,authenticated
using((status='published' and not public.is_member_blocked(author_id)) or author_id=(select auth.uid()) or public.can_moderate_community());

drop policy if exists "Published comments visible" on public.community_comments;
create policy "Published comments visible" on public.community_comments for select to anon,authenticated
using(
 (status='published'
  and not public.is_member_blocked(author_id)
  and exists(select 1 from public.community_posts p where p.id=post_id and p.status='published' and not public.is_member_blocked(p.author_id)))
 or author_id=(select auth.uid()) or public.can_moderate_community()
);

drop policy if exists "Public profiles visible unless private" on public.member_profiles;
create policy "Public profiles visible unless private" on public.member_profiles for select to anon,authenticated
using((visibility='public' and not public.is_member_blocked(user_id)) or user_id=(select auth.uid()) or public.can_view_creator_workspace());

drop policy if exists "Published video comments visible" on public.video_comments;
create policy "Published video comments visible" on public.video_comments for select to anon,authenticated
using((status='published' and not public.is_member_blocked(author_id)
 and exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=video_comments.media_id and v.published_at is not null and m.is_published=true))
 or author_id=(select auth.uid()) or public.can_moderate_community());

-- Prevent a member from following an account that has blocked them or that they have blocked.
drop policy if exists "Members follow others" on public.member_follows;
create policy "Members follow others" on public.member_follows for insert to authenticated
with check(follower_id=(select auth.uid()) and not public.is_member_blocked(followed_id));

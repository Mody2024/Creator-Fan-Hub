-- Raye2 community lifecycle: let members edit and delete their own posts and comments,
-- and let moderators pin posts. All mutations are guarded SECURITY DEFINER RPCs so the
-- ownership, moderation and audit rules live in one server-side place.
--
-- Background: the pre-existing table policies only allowed a member to update a post or
-- comment while its status was still 'pending'. Posts and comments now publish instantly
-- (status defaults to 'published'), so members had no server-sanctioned way to edit or
-- remove their own published content. This migration closes that gap.

-- Keep updated_at honest when a member edits a post.
create or replace function public.raye2_community_posts_touch_updated_at()
returns trigger language plpgsql set search_path = ''
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;
revoke all on function public.raye2_community_posts_touch_updated_at() from public, anon, authenticated;
drop trigger if exists raye2_community_posts_touch_updated_at on public.community_posts;
create trigger raye2_community_posts_touch_updated_at
before update on public.community_posts
for each row execute function public.raye2_community_posts_touch_updated_at();

-- Edit the body of a post the caller owns.
create or replace function public.raye2_update_community_post(p_post_id uuid, p_body text)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_post_id is null then
    raise exception 'post id is required' using errcode = '22023';
  end if;
  if p_body is null or char_length(btrim(p_body)) < 1 or char_length(btrim(p_body)) > 2000 then
    raise exception 'post body must be between 1 and 2000 characters' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.community_posts
    where id = p_post_id and author_id = (select auth.uid())
  ) then
    raise exception 'you can only edit your own post' using errcode = '42501';
  end if;
  update public.community_posts set body = btrim(p_body) where id = p_post_id;
end;
$fn$;
revoke all on function public.raye2_update_community_post(uuid,text) from public, anon;
grant execute on function public.raye2_update_community_post(uuid,text) to authenticated;

-- Delete a post the caller owns. Linked comments, reactions and bookmarks cascade away.
create or replace function public.raye2_delete_community_post(p_post_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_post_id is null then
    raise exception 'post id is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.community_posts
    where id = p_post_id and author_id = (select auth.uid())
  ) then
    raise exception 'you can only delete your own post' using errcode = '42501';
  end if;
  delete from public.community_posts where id = p_post_id;
end;
$fn$;
revoke all on function public.raye2_delete_community_post(uuid) from public, anon;
grant execute on function public.raye2_delete_community_post(uuid) to authenticated;

-- Delete a comment the caller owns.
create or replace function public.raye2_delete_community_comment(p_comment_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_comment_id is null then
    raise exception 'comment id is required' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.community_comments
    where id = p_comment_id and author_id = (select auth.uid())
  ) then
    raise exception 'you can only delete your own comment' using errcode = '42501';
  end if;
  delete from public.community_comments where id = p_comment_id;
end;
$fn$;
revoke all on function public.raye2_delete_community_comment(uuid) from public, anon;
grant execute on function public.raye2_delete_community_comment(uuid) to authenticated;

-- Pin or unpin a post. Restricted to owner/admin/moderator roles.
create or replace function public.raye2_set_community_post_pin(p_post_id uuid, p_pinned boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if not private.can_moderate_community() then
    raise exception 'moderator access required' using errcode = '42501';
  end if;
  if p_post_id is null or p_pinned is null then
    raise exception 'post id and pin state are required' using errcode = '22023';
  end if;
  if not exists (select 1 from public.community_posts where id = p_post_id) then
    raise exception 'post not found' using errcode = '22023';
  end if;
  update public.community_posts set pinned = p_pinned where id = p_post_id;
end;
$fn$;
revoke all on function public.raye2_set_community_post_pin(uuid,boolean) from public, anon;
grant execute on function public.raye2_set_community_post_pin(uuid,boolean) to authenticated;

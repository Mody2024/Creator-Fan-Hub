-- Raye2 Wave 5 community announcements.
--
-- The plan requires official announcements that stay distinct from member discussions (plan line
-- 651). The schema already had community_posts.post_type = 'official' and the feed already filters
-- and badges them, but nothing could ever author one: only member posts could be inserted. This
-- adds a guarded creator-only announcement RPC that also notifies the author's followers.

-- 1. Creators publish an official announcement, optionally pinning it.
create or replace function public.raye2_create_community_announcement(
  p_body text,
  p_linked_video_id uuid default null,
  p_pin boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $fn$
declare v_id uuid;
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'active creator access required' using errcode = '42501';
  end if;
  if p_body is null or char_length(btrim(p_body)) not between 1 and 2000 then
    raise exception 'an announcement body is required' using errcode = '22023';
  end if;
  if p_linked_video_id is not null and not exists (
    select 1 from public.video_catalog v join public.media_items m on m.id = v.media_id
    where v.media_id = p_linked_video_id and v.published_at is not null and m.is_published = true
  ) then
    raise exception 'the linked video is unavailable' using errcode = '22023';
  end if;

  insert into public.community_posts(author_id, post_type, body, status, pinned, linked_video_id)
  values (auth.uid(), 'official', btrim(p_body), 'published', coalesce(p_pin, false), p_linked_video_id)
  returning id into v_id;

  return v_id;
end;
$fn$;
revoke all on function public.raye2_create_community_announcement(text,uuid,boolean) from public, anon;
grant execute on function public.raye2_create_community_announcement(text,uuid,boolean) to authenticated;

-- 2. Notify the creator's followers when an announcement is published.
alter table public.member_notifications drop constraint if exists member_notifications_notification_type_check;
alter table public.member_notifications add constraint member_notifications_notification_type_check
  check(notification_type in ('follow','community_reaction','community_comment','video_reaction','video_comment','video_comment_reply','video_comment_reaction','community_short_comment_reply','community_short_comment_reaction','community_comment_reply','community_comment_reaction','community_poll_vote','community_announcement'));

create or replace function public.notify_community_announcement()
returns trigger language plpgsql security definer set search_path = ''
as $fn$
begin
  insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
  select f.follower_id, new.author_id, 'community_announcement', 'post', new.id, 'posted an announcement'
  from public.member_follows f
  where f.followed_id = new.author_id;
  return new;
end;
$fn$;
revoke all on function public.notify_community_announcement() from public, anon, authenticated;
grant execute on function public.notify_community_announcement() to postgres;
drop trigger if exists community_announcement_notification on public.community_posts;
create trigger community_announcement_notification
after insert on public.community_posts
for each row when (new.post_type = 'official' and new.status = 'published')
execute function public.notify_community_announcement();

-- 3. Notifications read and summary understand the new type: announcements are neither a follow,
--    a reaction nor a comment, so they appear under the unfiltered and unread views.
create or replace function public.raye2_get_notification_summary()
returns table (
  unread_total bigint,
  follow_count bigint,
  reaction_count bigint,
  comment_count bigint
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with me as (
    select (select auth.uid()) as uid
  ),
  blocked as (
    select b.blocked_id as uid from public.member_blocks b, me where b.blocker_id = me.uid
    union
    select b.blocker_id as uid from public.member_blocks b, me where b.blocked_id = me.uid
  ),
  visible as (
    select n.notification_type, n.read_at
    from public.member_notifications n
    join me on me.uid is not null and n.recipient_id = me.uid
    where (n.actor_id is null or not exists (select 1 from blocked bl where bl.uid = n.actor_id))
  )
  select count(*) filter (where read_at is null) as unread_total,
         count(*) filter (where notification_type = 'follow') as follow_count,
         count(*) filter (where notification_type in (
           'community_reaction','video_reaction',
           'video_comment_reaction','community_short_comment_reaction','community_comment_reaction'
         )) as reaction_count,
         count(*) filter (where notification_type in (
           'community_comment','video_comment',
           'video_comment_reply','community_short_comment_reply','community_comment_reply'
         )) as comment_count
  from visible;
$fn$;
revoke all on function public.raye2_get_notification_summary() from public, anon;
grant execute on function public.raye2_get_notification_summary() to authenticated;

notify pgrst, 'reload schema';

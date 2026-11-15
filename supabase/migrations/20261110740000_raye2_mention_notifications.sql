-- Raye2 Wave 5 notification depth: @mention notifications.
--
-- Plan 9 requires in-app notifications for mentions, but nothing ever parsed a body for @handle, so a
-- mention produced no notification at all. This adds a mention type, a summary bucket, a filter in the
-- inbox RPC, and INSERT triggers on community posts, post comments, Shorts comments and native video
-- comments. A mention is keyed on the unique profile handle and deduplicated per (recipient, actor,
-- target) so a body that repeats @handle does not stack notifications.

-- 1. Allow the new notification type.
alter table public.member_notifications drop constraint if exists member_notifications_notification_type_check;
alter table public.member_notifications add constraint member_notifications_notification_type_check
  check (notification_type in ('follow','community_reaction','community_comment','video_reaction','video_comment','video_comment_reply','video_comment_reaction','community_short_comment_reply','community_short_comment_reaction','community_comment_reply','community_comment_reaction','community_poll_vote','community_announcement','event_reminder','mention'));

-- 2. Summary gains a mention bucket.
drop function if exists public.raye2_get_notification_summary();
create or replace function public.raye2_get_notification_summary()
returns table (
  unread_total bigint,
  follow_count bigint,
  reaction_count bigint,
  comment_count bigint,
  mention_count bigint
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
         )) as comment_count,
         count(*) filter (where notification_type = 'mention') as mention_count
  from visible;
$fn$;
revoke all on function public.raye2_get_notification_summary() from public, anon;
grant execute on function public.raye2_get_notification_summary() to authenticated;

-- 3. Inbox filter understands mentions.
create or replace function public.raye2_get_notifications(
  p_limit integer default 40,
  p_before timestamptz default null,
  p_only_unread boolean default false,
  p_filter text default 'all'
)
returns table (
  id uuid,
  notification_type text,
  target_type text,
  target_id uuid,
  message text,
  read_at timestamptz,
  created_at timestamptz,
  actor_handle text,
  actor_display_name text,
  actor_avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with me as (
    select (select auth.uid()) as uid
  ),
  bounded as (
    select least(greatest(coalesce(p_limit, 40), 1), 100) as lim
  ),
  blocked as (
    select b.blocked_id as uid from public.member_blocks b, me where b.blocker_id = me.uid
    union
    select b.blocker_id as uid from public.member_blocks b, me where b.blocked_id = me.uid
  )
  select n.id,
         n.notification_type,
         n.target_type,
         n.target_id,
         n.message,
         n.read_at,
         n.created_at,
         mp.handle,
         mp.display_name,
         mp.avatar_url
  from public.member_notifications n
  join me on me.uid is not null and n.recipient_id = me.uid
  cross join bounded b
  left join public.member_profiles mp on mp.user_id = n.actor_id
  where (not p_only_unread or n.read_at is null)
    and (p_before is null or n.created_at < p_before)
    and (n.actor_id is null or not exists (select 1 from blocked bl where bl.uid = n.actor_id))
    and (
      p_filter is null or p_filter = 'all'
      or (p_filter = 'follow' and n.notification_type = 'follow')
      or (p_filter = 'reaction' and n.notification_type like '%reaction%')
      or (p_filter = 'comment' and n.notification_type like '%comment%' and n.notification_type not like '%reaction%')
      or (p_filter = 'mention' and n.notification_type = 'mention')
    )
  order by n.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_notifications(integer,timestamptz,boolean,text) from public, anon;
grant execute on function public.raye2_get_notifications(integer,timestamptz,boolean,text) to authenticated;

-- 4. Shared mention resolver: every @handle in a body that maps to a real profile, excluding the author.
create or replace function public.raye2_mention_recipients(p_body text, p_actor uuid)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = ''
as $fn$
  select distinct mp.user_id
  from regexp_matches(coalesce(p_body, ''), '(?:^|[^A-Za-z0-9_])@([a-z0-9_]{3,24})', 'g') as m(h)
  join public.member_profiles mp on mp.handle = m.h[1]
  where mp.user_id <> p_actor;
$fn$;
revoke all on function public.raye2_mention_recipients(text,uuid) from public, anon, authenticated;
grant execute on function public.raye2_mention_recipients(text,uuid) to postgres;

-- 5. Insert triggers per surface. Each only fires once the row is published and skips self-mentions,
--    already-notified recipients and blocked pairs.
create or replace function public.raye2_notify_mentions_post()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status = 'published' then
    insert into public.member_notifications(recipient_id, actor_id, notification_type, target_type, target_id, message)
    select r.user_id, new.author_id, 'mention', 'post', new.id, 'mentioned you in a post'
    from public.raye2_mention_recipients(new.body, new.author_id) r
    where not exists (
      select 1 from public.member_blocks b
      where (b.blocker_id = new.author_id and b.blocked_id = r.user_id)
         or (b.blocker_id = r.user_id and b.blocked_id = new.author_id))
      and not exists (
        select 1 from public.member_notifications n
        where n.recipient_id = r.user_id and n.actor_id = new.author_id and n.notification_type = 'mention'
          and n.target_type = 'post' and n.target_id = new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_notify_mentions_post() from public, anon, authenticated;
grant execute on function public.raye2_notify_mentions_post() to postgres;
drop trigger if exists raye2_post_mention_notification on public.community_posts;
create trigger raye2_post_mention_notification after insert on public.community_posts
for each row execute function public.raye2_notify_mentions_post();

create or replace function public.raye2_notify_mentions_comment()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status = 'published' then
    insert into public.member_notifications(recipient_id, actor_id, notification_type, target_type, target_id, message)
    select r.user_id, new.author_id, 'mention', 'post', new.post_id, 'mentioned you in a comment'
    from public.raye2_mention_recipients(new.body, new.author_id) r
    where not exists (
      select 1 from public.member_blocks b
      where (b.blocker_id = new.author_id and b.blocked_id = r.user_id)
         or (b.blocker_id = r.user_id and b.blocked_id = new.author_id))
      and not exists (
        select 1 from public.member_notifications n
        where n.recipient_id = r.user_id and n.actor_id = new.author_id and n.notification_type = 'mention'
          and n.target_type = 'post' and n.target_id = new.post_id);
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_notify_mentions_comment() from public, anon, authenticated;
grant execute on function public.raye2_notify_mentions_comment() to postgres;
drop trigger if exists raye2_comment_mention_notification on public.community_comments;
create trigger raye2_comment_mention_notification after insert on public.community_comments
for each row execute function public.raye2_notify_mentions_comment();

create or replace function public.raye2_notify_mentions_short_comment()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status = 'published' then
    insert into public.member_notifications(recipient_id, actor_id, notification_type, target_type, target_id, message)
    select r.user_id, new.author_id, 'mention', 'post', new.short_id, 'mentioned you in a Shorts comment'
    from public.raye2_mention_recipients(new.body, new.author_id) r
    where not exists (
      select 1 from public.member_blocks b
      where (b.blocker_id = new.author_id and b.blocked_id = r.user_id)
         or (b.blocker_id = r.user_id and b.blocked_id = new.author_id))
      and not exists (
        select 1 from public.member_notifications n
        where n.recipient_id = r.user_id and n.actor_id = new.author_id and n.notification_type = 'mention'
          and n.target_type = 'post' and n.target_id = new.short_id);
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_notify_mentions_short_comment() from public, anon, authenticated;
grant execute on function public.raye2_notify_mentions_short_comment() to postgres;
drop trigger if exists raye2_short_comment_mention_notification on public.community_short_comments;
create trigger raye2_short_comment_mention_notification after insert on public.community_short_comments
for each row execute function public.raye2_notify_mentions_short_comment();

create or replace function public.raye2_notify_mentions_video_comment()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status = 'published' then
    insert into public.member_notifications(recipient_id, actor_id, notification_type, target_type, target_id, message)
    select r.user_id, new.author_id, 'mention', 'video', new.media_id, 'mentioned you in a comment'
    from public.raye2_mention_recipients(new.body, new.author_id) r
    where not exists (
      select 1 from public.member_blocks b
      where (b.blocker_id = new.author_id and b.blocked_id = r.user_id)
         or (b.blocker_id = r.user_id and b.blocked_id = new.author_id))
      and not exists (
        select 1 from public.member_notifications n
        where n.recipient_id = r.user_id and n.actor_id = new.author_id and n.notification_type = 'mention'
          and n.target_type = 'video' and n.target_id = new.media_id);
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_notify_mentions_video_comment() from public, anon, authenticated;
grant execute on function public.raye2_notify_mentions_video_comment() to postgres;
drop trigger if exists raye2_video_comment_mention_notification on public.video_comments;
create trigger raye2_video_comment_mention_notification after insert on public.video_comments
for each row execute function public.raye2_notify_mentions_video_comment();

notify pgrst, 'reload schema';

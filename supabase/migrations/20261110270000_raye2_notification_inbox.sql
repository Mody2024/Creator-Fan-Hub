-- Raye2 Wave 5 notification depth: inbox reads and summary.
--
-- The notification inbox was a flat, unpaged 100-row select, showed notifications from
-- members the viewer had blocked, and re-fetched each actor profile one at a time on the
-- realtime path. These authenticated read RPCs give the inbox real paging, block-aware
-- filtering and per-type counts in one place.
--
-- Both are SECURITY DEFINER, STABLE, pinned to an empty search_path and granted only to
-- authenticated, and they only ever read the caller's own notifications.

-- Notification inbox page: the caller's notifications with actor attribution, optionally
-- unread-only and cursor-paged by created_at, excluding actors the caller blocked (or who
-- blocked the caller).
create or replace function public.raye2_get_notifications(
  p_limit integer default 40,
  p_before timestamptz default null,
  p_only_unread boolean default false
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
  order by n.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_notifications(integer,timestamptz,boolean) from public, anon;
grant execute on function public.raye2_get_notifications(integer,timestamptz,boolean) to authenticated;

-- Notification summary: the caller's unread total and a per-type breakdown, for badges and
-- filter counts, with blocked actors excluded so the numbers match the inbox.
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
         count(*) filter (where notification_type in ('community_reaction', 'video_reaction')) as reaction_count,
         count(*) filter (where notification_type in ('community_comment', 'video_comment')) as comment_count
  from visible;
$fn$;
revoke all on function public.raye2_get_notification_summary() from public, anon;
grant execute on function public.raye2_get_notification_summary() to authenticated;

notify pgrst, 'reload schema';

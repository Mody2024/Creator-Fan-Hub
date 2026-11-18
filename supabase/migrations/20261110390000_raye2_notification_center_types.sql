-- Raye2 notification center completeness + filter-aware paging.
--
-- The threaded-comment work added six notification types (video/Shorts/post comment replies and
-- comment reactions), but the inbox summary and the notifications read only knew the five legacy
-- types. That left the filter badges under-counting and made filtered paging return unrelated rows.

-- 1. Summary counts every reaction and comment notification, including the threaded ones.
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

-- 2. Notifications read gains a type filter so "load more" respects the active tab.
drop function if exists public.raye2_get_notifications(integer,timestamptz,boolean);
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
    )
  order by n.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_notifications(integer,timestamptz,boolean,text) from public, anon;
grant execute on function public.raye2_get_notifications(integer,timestamptz,boolean,text) to authenticated;

notify pgrst, 'reload schema';

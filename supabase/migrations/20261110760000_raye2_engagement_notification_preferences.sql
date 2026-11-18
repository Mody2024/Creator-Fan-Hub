-- Raye2 Wave 5/6 notification controls: per-category mute and timezone-aware quiet hours.
--
-- Plan 9 asks for notification preferences by type, mute and quiet hours, but the engagement inbox
-- (member_notifications) had no recipient controls at all. This adds a preference row per member with
-- muted categories and quiet hours, enforces the mute authoritatively in the inbox read and summary, and
-- exposes a timezone-aware "quiet now" check plus a pure in-quiet-hours helper for delivery decisions.
--
-- Muting is a read-time filter (nothing is deleted), so unmuting restores history. Quiet hours never hide
-- stored notifications; they only inform delivery nudges.

-- 1. Preferences table.
create table if not exists public.raye2_engagement_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  muted_categories text[] not null default '{}'
    check (muted_categories <@ array['follow','reactions','comments','mentions','announcements','events','live','groups']::text[]),
  quiet_hours_enabled boolean not null default false,
  quiet_hours_start time not null default time '22:00',
  quiet_hours_end time not null default time '08:00',
  quiet_hours_timezone text not null default 'UTC',
  updated_at timestamptz not null default now()
);
alter table public.raye2_engagement_notification_preferences enable row level security;
revoke all on public.raye2_engagement_notification_preferences from anon, authenticated;
grant select on public.raye2_engagement_notification_preferences to authenticated;
drop policy if exists "Raye2 members read own engagement notification preferences" on public.raye2_engagement_notification_preferences;
create policy "Raye2 members read own engagement notification preferences"
  on public.raye2_engagement_notification_preferences for select to authenticated
  using (user_id = (select auth.uid()));

-- 2. Map a notification type to its preference category.
create or replace function public.raye2_notification_category(p_type text)
returns text language sql immutable
as $fn$
  select case
    when p_type = 'follow' then 'follow'
    when p_type in ('community_reaction','video_reaction','video_comment_reaction','community_short_comment_reaction','community_comment_reaction') then 'reactions'
    when p_type in ('community_comment','video_comment','video_comment_reply','community_short_comment_reply','community_comment_reply') then 'comments'
    when p_type = 'mention' then 'mentions'
    when p_type in ('community_announcement','community_poll_vote') then 'announcements'
    when p_type = 'event_reminder' then 'events'
    when p_type = 'live_start' then 'live'
    when p_type in ('group_join_request','group_join_decision') then 'groups'
    else 'other'
  end;
$fn$;
revoke all on function public.raye2_notification_category(text) from public, anon;
grant execute on function public.raye2_notification_category(text) to authenticated;

-- 3. Pure, testable in-quiet-hours check (handles windows that wrap past midnight).
create or replace function public.raye2_in_quiet_hours(p_start time, p_end time, p_at timestamptz, p_tz text)
returns boolean language plpgsql stable
as $$
declare v_local time;
begin
  if p_start is null or p_end is null or p_start = p_end then return false; end if;
  v_local := (p_at at time zone coalesce(nullif(p_tz, ''), 'UTC'))::time;
  if p_start < p_end then
    return v_local >= p_start and v_local < p_end;
  end if;
  return v_local >= p_start or v_local < p_end;
end;
$$;
revoke all on function public.raye2_in_quiet_hours(time,time,timestamptz,text) from public, anon;
grant execute on function public.raye2_in_quiet_hours(time,time,timestamptz,text) to authenticated;

-- 4. Read/set the caller's preferences (defaults when no row exists).
create or replace function public.raye2_get_my_engagement_notification_preferences()
returns table (
  muted_categories text[],
  quiet_hours_enabled boolean,
  quiet_hours_start time,
  quiet_hours_end time,
  quiet_hours_timezone text
)
language sql stable security definer set search_path=''
as $fn$
  with me as (select (select auth.uid()) as uid)
  select coalesce(p.muted_categories, '{}'::text[]),
         coalesce(p.quiet_hours_enabled, false),
         coalesce(p.quiet_hours_start, time '22:00'),
         coalesce(p.quiet_hours_end, time '08:00'),
         coalesce(p.quiet_hours_timezone, 'UTC')
  from me
  left join public.raye2_engagement_notification_preferences p on p.user_id = me.uid
  where me.uid is not null;
$fn$;
revoke all on function public.raye2_get_my_engagement_notification_preferences() from public, anon;
grant execute on function public.raye2_get_my_engagement_notification_preferences() to authenticated;

create or replace function public.raye2_set_engagement_notification_preferences(
  p_muted_categories text[] default '{}',
  p_quiet_hours_enabled boolean default false,
  p_quiet_hours_start time default time '22:00',
  p_quiet_hours_end time default time '08:00',
  p_quiet_hours_timezone text default 'UTC'
)
returns void language plpgsql security definer set search_path=''
as $$
declare v_cats text[] := coalesce(p_muted_categories, '{}');
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not (v_cats <@ array['follow','reactions','comments','mentions','announcements','events','live','groups']::text[]) then
    raise exception 'unknown notification category' using errcode='22023';
  end if;
  if p_quiet_hours_start is null or p_quiet_hours_end is null or p_quiet_hours_start = p_quiet_hours_end then
    raise exception 'quiet hours must have distinct start and end times' using errcode='22023';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = p_quiet_hours_timezone) then
    raise exception 'invalid timezone' using errcode='22023';
  end if;
  insert into public.raye2_engagement_notification_preferences(
    user_id, muted_categories, quiet_hours_enabled, quiet_hours_start, quiet_hours_end, quiet_hours_timezone, updated_at
  ) values (
    auth.uid(), v_cats, coalesce(p_quiet_hours_enabled, false), p_quiet_hours_start, p_quiet_hours_end, p_quiet_hours_timezone, now()
  )
  on conflict (user_id) do update set
    muted_categories = excluded.muted_categories,
    quiet_hours_enabled = excluded.quiet_hours_enabled,
    quiet_hours_start = excluded.quiet_hours_start,
    quiet_hours_end = excluded.quiet_hours_end,
    quiet_hours_timezone = excluded.quiet_hours_timezone,
    updated_at = now();
end;
$$;
revoke all on function public.raye2_set_engagement_notification_preferences(text[],boolean,time,time,text) from public, anon;
grant execute on function public.raye2_set_engagement_notification_preferences(text[],boolean,time,time,text) to authenticated;

-- 5. Delivery check: should this recipient be nudged now for this type? False when muted or quiet.
create or replace function public.raye2_engagement_should_deliver(p_recipient uuid, p_type text)
returns boolean language sql stable security definer set search_path=''
as $fn$
  select not coalesce((
    select public.raye2_notification_category(p_type) = any(p.muted_categories)
       or (p.quiet_hours_enabled and public.raye2_in_quiet_hours(p.quiet_hours_start, p.quiet_hours_end, now(), p.quiet_hours_timezone))
    from public.raye2_engagement_notification_preferences p
    where p.user_id = p_recipient
  ), false);
$fn$;
revoke all on function public.raye2_engagement_should_deliver(uuid,text) from public, anon;
grant execute on function public.raye2_engagement_should_deliver(uuid,text) to authenticated;

-- 6. Inbox read and summary honour muted categories (authoritative).
drop function if exists public.raye2_get_notifications(integer,timestamptz,boolean,text);
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
  muted as (
    select coalesce(p.muted_categories, '{}'::text[]) as cats
    from me left join public.raye2_engagement_notification_preferences p on p.user_id = me.uid
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
  cross join muted m
  left join public.member_profiles mp on mp.user_id = n.actor_id
  where (not p_only_unread or n.read_at is null)
    and (p_before is null or n.created_at < p_before)
    and (n.actor_id is null or not exists (select 1 from blocked bl where bl.uid = n.actor_id))
    and not (public.raye2_notification_category(n.notification_type) = any(m.cats))
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
  muted as (
    select coalesce(p.muted_categories, '{}'::text[]) as cats
    from me left join public.raye2_engagement_notification_preferences p on p.user_id = me.uid
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
    cross join muted m
    where (n.actor_id is null or not exists (select 1 from blocked bl where bl.uid = n.actor_id))
      and not (public.raye2_notification_category(n.notification_type) = any(m.cats))
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

notify pgrst, 'reload schema';

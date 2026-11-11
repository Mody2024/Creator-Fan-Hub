-- Raye2 Wave 5 events: reminders, host/co-host roles and event types.
--
-- The plan requires scheduled events with RSVP, reminders, event details, host/co-host roles and
-- typed event kinds such as creator office hours and Q&A (plan lines 231-232). RSVP and the public
-- calendar already existed; this adds the rest.

-- 1. Event detail columns.
alter table public.events add column if not exists event_type text not null default 'community';
alter table public.events add column if not exists reminder_minutes_before integer;
alter table public.events add column if not exists reminder_sent_at timestamptz;
alter table public.events drop constraint if exists events_event_type_check;
alter table public.events add constraint events_event_type_check
  check (event_type in ('community','office_hours','qa','collab','watch_party','other'));
alter table public.events drop constraint if exists events_reminder_check;
alter table public.events add constraint events_reminder_check
  check (reminder_minutes_before is null or reminder_minutes_before between 5 and 10080);

-- 2. Host and co-host roles. A single host per event; many co-hosts.
create table if not exists public.event_hosts (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'cohost' check (role in ('host','cohost')),
  created_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create unique index if not exists event_hosts_single_host on public.event_hosts(event_id) where role = 'host';
alter table public.event_hosts enable row level security;
revoke all on public.event_hosts from anon, authenticated;

create or replace function public.raye2_set_event_host(p_event_id uuid, p_user_id uuid, p_role text default 'cohost')
returns void language plpgsql security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  if p_role not in ('host','cohost') then
    raise exception 'invalid host role' using errcode = '22023';
  end if;
  if not exists (select 1 from public.events where id = p_event_id) then
    raise exception 'event not found' using errcode = 'P0002';
  end if;
  if p_role = 'host' and exists (
    select 1 from public.event_hosts where event_id = p_event_id and role = 'host' and user_id <> p_user_id
  ) then
    raise exception 'event already has a host' using errcode = '23505';
  end if;
  insert into public.event_hosts(event_id, user_id, role)
  values (p_event_id, p_user_id, p_role)
  on conflict (event_id, user_id) do update set role = excluded.role;
  insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
  values(auth.uid(),'event.host_set','event',p_event_id::text,jsonb_build_object('user_id',p_user_id,'role',p_role));
end;
$fn$;
revoke all on function public.raye2_set_event_host(uuid,uuid,text) from public, anon;
grant execute on function public.raye2_set_event_host(uuid,uuid,text) to authenticated;

create or replace function public.raye2_remove_event_host(p_event_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  delete from public.event_hosts where event_id = p_event_id and user_id = p_user_id;
  insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
  values(auth.uid(),'event.host_removed','event',p_event_id::text,jsonb_build_object('user_id',p_user_id));
end;
$fn$;
revoke all on function public.raye2_remove_event_host(uuid,uuid) from public, anon;
grant execute on function public.raye2_remove_event_host(uuid,uuid) to authenticated;

create or replace function public.raye2_get_event_hosts(p_event_id uuid)
returns table (user_id uuid, role text, handle text, display_name text, avatar_url text)
language sql stable security definer set search_path = ''
as $fn$
  select h.user_id, h.role, mp.handle, mp.display_name, mp.avatar_url
  from public.event_hosts h
  left join public.member_profiles mp on mp.user_id = h.user_id
  where h.event_id = p_event_id
    and exists (select 1 from public.events e where e.id = p_event_id and e.status in ('published','completed'))
  order by case h.role when 'host' then 0 else 1 end, h.created_at asc;
$fn$;
revoke all on function public.raye2_get_event_hosts(uuid) from public;
grant execute on function public.raye2_get_event_hosts(uuid) to anon, authenticated;

-- 3. Event creation now accepts an event type and an optional reminder lead time.
drop function if exists public.save_creator_event(uuid,text,text,timestamptz,timestamptz);
create or replace function public.save_creator_event(
  p_event_id uuid,
  p_title text,
  p_description text,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_event_type text default 'community',
  p_reminder_minutes_before integer default null
)
returns table(saved boolean,result_code text,event_id uuid)
language plpgsql security definer set search_path = ''
as $fn$
declare v_id uuid; v_type text := coalesce(nullif(btrim(coalesce(p_event_type,'')),''),'community');
begin
  if auth.uid() is null or not public.is_active_creator() then raise exception 'creator access required' using errcode='42501'; end if;
  if length(btrim(coalesce(p_title,''))) not between 3 and 160
    or length(coalesce(p_description,''))>1200
    or (p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at)
    or v_type not in ('community','office_hours','qa','collab','watch_party','other')
    or (p_reminder_minutes_before is not null and p_reminder_minutes_before not between 5 and 10080) then
    raise exception 'invalid event configuration' using errcode='22023';
  end if;
  if p_event_id is null then
    insert into public.events(title,description,starts_at,ends_at,status,event_type,reminder_minutes_before)
    values(btrim(p_title),btrim(coalesce(p_description,'')),p_starts_at,p_ends_at,'draft',v_type,p_reminder_minutes_before)
    returning id into v_id;
  else
    update public.events set title=btrim(p_title),description=btrim(coalesce(p_description,'')),starts_at=p_starts_at,ends_at=p_ends_at,
      event_type=v_type,reminder_minutes_before=p_reminder_minutes_before
    where id=p_event_id returning id into v_id;
    if v_id is null then return query select false,'not_found'::text,null::uuid; return; end if;
  end if;
  insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
  values(auth.uid(),case when p_event_id is null then 'event.created' else 'event.updated' end,'event',v_id::text,
    jsonb_build_object('title',btrim(p_title),'event_type',v_type));
  return query select true,'saved'::text,v_id;
end;
$fn$;
revoke all on function public.save_creator_event(uuid,text,text,timestamptz,timestamptz,text,integer) from public, anon;
grant execute on function public.save_creator_event(uuid,text,text,timestamptz,timestamptz,text,integer) to authenticated;

-- 4. Public calendar exposes the event type, host count and the caller's exact RSVP status.
drop function if exists public.raye2_get_public_events(integer);
create or replace function public.raye2_get_public_events(p_limit integer default 24)
returns table (
  id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  event_type text,
  going_count integer,
  host_count integer,
  my_rsvp boolean,
  my_rsvp_status text
)
language plpgsql security definer set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_me uuid := (select auth.uid());
begin
  return query
    select e.id, e.title, e.description, e.starts_at, e.ends_at, e.status, e.event_type,
      coalesce(r.going_count, 0)::integer as going_count,
      coalesce(h.host_count, 0)::integer as host_count,
      coalesce(r.mine_going, false) as my_rsvp,
      case when r.mine_going then 'going' when r.mine_interested then 'interested' else null end as my_rsvp_status
    from public.events e
    left join (
      select event_id,
        count(*) filter (where status = 'going') as going_count,
        bool_or(user_id = v_me and status = 'going') as mine_going,
        bool_or(user_id = v_me and status = 'interested') as mine_interested
      from public.event_rsvps
      group by event_id
    ) r on r.event_id = e.id
    left join (
      select event_id, count(*) as host_count from public.event_hosts group by event_id
    ) h on h.event_id = e.id
    where e.status in ('published', 'completed')
    order by (e.starts_at is null), e.starts_at asc, e.created_at desc
    limit v_limit;
end;
$fn$;
revoke all on function public.raye2_get_public_events(integer) from public;
grant execute on function public.raye2_get_public_events(integer) to anon, authenticated;

-- 5. A notification preference to opt out of event reminders.
alter table public.raye2_notification_preferences add column if not exists event_reminders boolean not null default true;
drop function if exists public.raye2_set_notification_preferences(boolean,boolean,boolean,time,time,text);
create or replace function public.raye2_set_notification_preferences(
  p_direct_messages boolean,
  p_group_messages boolean,
  p_quiet_hours_enabled boolean default false,
  p_quiet_hours_start time default time '22:00',
  p_quiet_hours_end time default time '08:00',
  p_quiet_hours_timezone text default 'UTC',
  p_event_reminders boolean default true
)
returns void language plpgsql security definer set search_path=''
as $fn$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_quiet_hours_start is null or p_quiet_hours_end is null or p_quiet_hours_start=p_quiet_hours_end then
    raise exception 'quiet hours must have distinct start and end times' using errcode='22023';
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_quiet_hours_timezone) then
    raise exception 'invalid timezone' using errcode='22023';
  end if;
  insert into public.raye2_notification_preferences(
    user_id,direct_messages,group_messages,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_timezone,event_reminders,updated_at
  ) values(
    auth.uid(),coalesce(p_direct_messages,true),coalesce(p_group_messages,true),
    coalesce(p_quiet_hours_enabled,false),p_quiet_hours_start,p_quiet_hours_end,p_quiet_hours_timezone,coalesce(p_event_reminders,true),now()
  )
  on conflict(user_id) do update set
    direct_messages=excluded.direct_messages,
    group_messages=excluded.group_messages,
    quiet_hours_enabled=excluded.quiet_hours_enabled,
    quiet_hours_start=excluded.quiet_hours_start,
    quiet_hours_end=excluded.quiet_hours_end,
    quiet_hours_timezone=excluded.quiet_hours_timezone,
    event_reminders=excluded.event_reminders,
    updated_at=now();
end;
$fn$;
revoke all on function public.raye2_set_notification_preferences(boolean,boolean,boolean,time,time,text,boolean) from public,anon;
grant execute on function public.raye2_set_notification_preferences(boolean,boolean,boolean,time,time,text,boolean) to authenticated;

-- 6. Event reminders: notify going members once, honouring the opt-out and quiet hours.
alter table public.member_notifications drop constraint if exists member_notifications_target_type_check;
alter table public.member_notifications add constraint member_notifications_target_type_check
  check (target_type in ('profile','post','video','event'));
alter table public.member_notifications drop constraint if exists member_notifications_notification_type_check;
alter table public.member_notifications add constraint member_notifications_notification_type_check
  check (notification_type in ('follow','community_reaction','community_comment','video_reaction','video_comment','video_comment_reply','video_comment_reaction','community_short_comment_reply','community_short_comment_reaction','community_comment_reply','community_comment_reaction','community_poll_vote','community_announcement','event_reminder'));

create or replace function public.raye2_dispatch_event_reminders()
returns integer
language plpgsql security definer set search_path = ''
as $fn$
declare v_sent integer := 0;
begin
  with due as (
    select e.id, e.title
    from public.events e
    where e.status = 'published'
      and e.starts_at is not null
      and e.reminder_minutes_before is not null
      and e.reminder_sent_at is null
      and now() >= e.starts_at - make_interval(mins => e.reminder_minutes_before)
      and now() < e.starts_at
    for update skip locked
  ),
  mark as (
    update public.events set reminder_sent_at = now()
    where id in (select id from due)
    returning id, title
  ),
  inserted as (
    insert into public.member_notifications(recipient_id,actor_id,notification_type,target_type,target_id,message)
    select r.user_id, null, 'event_reminder', 'event', m.id, 'reminder: ' || left(m.title, 200)
    from mark m
    join public.event_rsvps r on r.event_id = m.id and r.status = 'going'
    left join public.raye2_notification_preferences pref on pref.user_id = r.user_id
    where coalesce(pref.event_reminders, true)
      and not (
        coalesce(pref.quiet_hours_enabled, false) and (
          case when pref.quiet_hours_start < pref.quiet_hours_end
            then (now() at time zone coalesce(pref.quiet_hours_timezone, 'UTC'))::time >= pref.quiet_hours_start
             and (now() at time zone coalesce(pref.quiet_hours_timezone, 'UTC'))::time < pref.quiet_hours_end
            else (now() at time zone coalesce(pref.quiet_hours_timezone, 'UTC'))::time >= pref.quiet_hours_start
              or (now() at time zone coalesce(pref.quiet_hours_timezone, 'UTC'))::time < pref.quiet_hours_end
          end
        )
      )
    returning 1
  )
  select count(*) into v_sent from inserted;
  return v_sent;
end;
$fn$;
revoke all on function public.raye2_dispatch_event_reminders() from public, anon;
grant execute on function public.raye2_dispatch_event_reminders() to authenticated;

notify pgrst, 'reload schema';

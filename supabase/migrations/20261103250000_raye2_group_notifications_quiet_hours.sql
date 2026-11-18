-- Raye2 per-group notification overrides and timezone-aware quiet hours.
alter table public.raye2_notification_preferences
  add column if not exists quiet_hours_enabled boolean not null default false,
  add column if not exists quiet_hours_start time not null default time '22:00',
  add column if not exists quiet_hours_end time not null default time '08:00',
  add column if not exists quiet_hours_timezone text not null default 'UTC';
create table if not exists public.raye2_group_notification_preferences (
  group_id uuid not null references public.raye2_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  mode text not null default 'inherit' check(mode in ('inherit','all','muted')),
  updated_at timestamptz not null default now(),
  primary key(group_id,user_id)
);
alter table public.raye2_group_notification_preferences enable row level security;
revoke all on public.raye2_group_notification_preferences from anon,authenticated;
grant select on public.raye2_group_notification_preferences to authenticated;
create policy "Raye2 members read own group notification preferences"
  on public.raye2_group_notification_preferences for select to authenticated
  using(user_id=(select auth.uid()) and exists(
    select 1 from public.raye2_group_members gm
    where gm.group_id=raye2_group_notification_preferences.group_id
      and gm.user_id=(select auth.uid()) and gm.status='active'
  ));
drop function if exists public.raye2_set_notification_preferences(boolean,boolean);
create or replace function public.raye2_set_notification_preferences(
  p_direct_messages boolean,
  p_group_messages boolean,
  p_quiet_hours_enabled boolean default false,
  p_quiet_hours_start time default time '22:00',
  p_quiet_hours_end time default time '08:00',
  p_quiet_hours_timezone text default 'UTC'
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_quiet_hours_start is null or p_quiet_hours_end is null or p_quiet_hours_start=p_quiet_hours_end then
    raise exception 'quiet hours must have distinct start and end times' using errcode='22023';
  end if;
  if not exists(select 1 from pg_catalog.pg_timezone_names where name=p_quiet_hours_timezone) then
    raise exception 'invalid timezone' using errcode='22023';
  end if;
  insert into public.raye2_notification_preferences(
    user_id,direct_messages,group_messages,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_timezone,updated_at
  ) values(
    auth.uid(),coalesce(p_direct_messages,true),coalesce(p_group_messages,true),
    coalesce(p_quiet_hours_enabled,false),p_quiet_hours_start,p_quiet_hours_end,p_quiet_hours_timezone,now()
  )
  on conflict(user_id) do update set
    direct_messages=excluded.direct_messages,
    group_messages=excluded.group_messages,
    quiet_hours_enabled=excluded.quiet_hours_enabled,
    quiet_hours_start=excluded.quiet_hours_start,
    quiet_hours_end=excluded.quiet_hours_end,
    quiet_hours_timezone=excluded.quiet_hours_timezone,
    updated_at=now();
end;
$$;
revoke all on function public.raye2_set_notification_preferences(boolean,boolean,boolean,time,time,text) from public,anon;
grant execute on function public.raye2_set_notification_preferences(boolean,boolean,boolean,time,time,text) to authenticated;
create or replace function public.raye2_set_group_notification_preference(p_group_id uuid,p_mode text)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_mode not in ('inherit','all','muted') then raise exception 'invalid notification mode' using errcode='22023'; end if;
  if not exists(select 1 from public.raye2_group_members gm where gm.group_id=p_group_id and gm.user_id=auth.uid() and gm.status='active') then
    raise exception 'group membership required' using errcode='42501';
  end if;
  if p_mode='inherit' then
    delete from public.raye2_group_notification_preferences where group_id=p_group_id and user_id=auth.uid();
  else
    insert into public.raye2_group_notification_preferences(group_id,user_id,mode)
    values(p_group_id,auth.uid(),p_mode)
    on conflict(group_id,user_id) do update set mode=excluded.mode,updated_at=now();
  end if;
end;
$$;
revoke all on function public.raye2_set_group_notification_preference(uuid,text) from public,anon;
grant execute on function public.raye2_set_group_notification_preference(uuid,text) to authenticated;

create or replace function public.raye2_notify_conversation_message()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_type text;
  v_group_id uuid;
begin
  select case when c.conversation_type='group' then 'group_message' else 'direct_message' end,c.group_id
    into v_type,v_group_id from public.raye2_conversations c where c.id=new.conversation_id and c.status='active';
  if v_type is null then return new; end if;
  insert into public.raye2_notifications(user_id,actor_id,conversation_id,message_id,notification_type,preview)
  select cm.user_id,new.sender_id,new.conversation_id,new.id,v_type,left(new.body,180)
  from public.raye2_conversation_members cm
  left join public.raye2_notification_preferences pref on pref.user_id=cm.user_id
  left join public.raye2_group_notification_preferences gp on gp.group_id=v_group_id and gp.user_id=cm.user_id
  cross join lateral (
    select pg_catalog.timezone(coalesce(pref.quiet_hours_timezone,'UTC'),now())::time as local_time
  ) local_clock
  where cm.conversation_id=new.conversation_id
    and cm.user_id<>new.sender_id
    and (cm.muted_until is null or cm.muted_until<=now())
    and case when coalesce(pref.quiet_hours_enabled,false) then
      case when pref.quiet_hours_start < pref.quiet_hours_end
        then local_clock.local_time < pref.quiet_hours_start or local_clock.local_time >= pref.quiet_hours_end
        else local_clock.local_time < pref.quiet_hours_end or local_clock.local_time >= pref.quiet_hours_start end
      else true end
    and case when v_type='group_message' then
      case coalesce(gp.mode,'inherit')
        when 'muted' then false
        when 'all' then true
        else coalesce(pref.group_messages,true)
      end
      else coalesce(pref.direct_messages,true) end
  on conflict(user_id,message_id) do nothing;
  return new;
end;
$$;
revoke all on function public.raye2_notify_conversation_message() from public,anon,authenticated;
grant execute on function public.raye2_notify_conversation_message() to authenticated;
drop trigger if exists raye2_messages_create_notifications on public.raye2_messages;
create trigger raye2_messages_create_notifications after insert on public.raye2_messages
for each row execute function public.raye2_notify_conversation_message();

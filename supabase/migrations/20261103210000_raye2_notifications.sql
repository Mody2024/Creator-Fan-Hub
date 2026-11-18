-- Raye2: recipient-scoped in-app notifications and durable messaging preferences.
create table if not exists public.raye2_notification_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  direct_messages boolean not null default true,
  group_messages boolean not null default true,
  updated_at timestamptz not null default now()
);
create table if not exists public.raye2_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  actor_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.raye2_conversations(id) on delete cascade,
  message_id uuid references public.raye2_messages(id) on delete cascade,
  notification_type text not null check (notification_type in ('direct_message','group_message')),
  preview text not null default '' check (char_length(preview)<=180),
  read_at timestamptz,
  created_at timestamptz not null default now(),
  unique(user_id,message_id)
);
create index if not exists raye2_notifications_inbox_idx
  on public.raye2_notifications(user_id,created_at desc);
alter table public.raye2_notification_preferences enable row level security;
alter table public.raye2_notifications enable row level security;
revoke all on public.raye2_notification_preferences,public.raye2_notifications from anon,authenticated;
grant select on public.raye2_notification_preferences,public.raye2_notifications to authenticated;
grant update(read_at) on public.raye2_notifications to authenticated;
create policy "Raye2 users read own notification preferences"
  on public.raye2_notification_preferences for select to authenticated
  using (user_id=(select auth.uid()));
create policy "Raye2 users read own notifications"
  on public.raye2_notifications for select to authenticated
  using (user_id=(select auth.uid()));
create policy "Raye2 users mark own notifications read"
  on public.raye2_notifications for update to authenticated
  using (user_id=(select auth.uid()))
  with check (user_id=(select auth.uid()));
create or replace function public.raye2_set_notification_preferences(
  p_direct_messages boolean, p_group_messages boolean
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  insert into public.raye2_notification_preferences(user_id,direct_messages,group_messages,updated_at)
  values(auth.uid(),coalesce(p_direct_messages,true),coalesce(p_group_messages,true),now())
  on conflict(user_id) do update set
    direct_messages=excluded.direct_messages,
    group_messages=excluded.group_messages,
    updated_at=now();
end;
$$;
revoke all on function public.raye2_set_notification_preferences(boolean,boolean) from public,anon;
grant execute on function public.raye2_set_notification_preferences(boolean,boolean) to authenticated;
create or replace function public.raye2_notify_conversation_message()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_type text;
begin
  select case when c.conversation_type='group' then 'group_message' else 'direct_message' end
  into v_type from public.raye2_conversations c where c.id=new.conversation_id and c.status='active';
  if v_type is null then return new; end if;
  insert into public.raye2_notifications(user_id,actor_id,conversation_id,message_id,notification_type,preview)
  select cm.user_id,new.sender_id,new.conversation_id,new.id,v_type,left(new.body,180)
  from public.raye2_conversation_members cm
  left join public.raye2_notification_preferences pref on pref.user_id=cm.user_id
  where cm.conversation_id=new.conversation_id
    and cm.user_id<>new.sender_id
    and (cm.muted_until is null or cm.muted_until<=now())
    and case when v_type='group_message'
      then coalesce(pref.group_messages,true)
      else coalesce(pref.direct_messages,true) end
  on conflict(user_id,message_id) do nothing;
  return new;
end;
$$;
revoke all on function public.raye2_notify_conversation_message() from public,anon,authenticated;
grant execute on function public.raye2_notify_conversation_message() to authenticated;
drop trigger if exists raye2_messages_create_notifications on public.raye2_messages;
create trigger raye2_messages_create_notifications
after insert on public.raye2_messages
for each row execute function public.raye2_notify_conversation_message();

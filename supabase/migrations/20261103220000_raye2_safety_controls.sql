-- Raye2 trust and safety: message/group/account reports and direct-message block enforcement.
create table if not exists public.raye2_safety_reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('message','group','user')),
  target_id uuid not null,
  conversation_id uuid references public.raye2_conversations(id) on delete set null,
  reason text not null check (reason in ('spam','harassment','hate','impersonation','copyright','other')),
  details text not null default '' check (char_length(details)<=500),
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create index if not exists raye2_safety_reports_queue_idx
  on public.raye2_safety_reports(status,created_at desc);
create index if not exists raye2_safety_reports_reporter_idx
  on public.raye2_safety_reports(reporter_id,created_at desc);
alter table public.raye2_safety_reports enable row level security;
revoke all on public.raye2_safety_reports from anon,authenticated;

create or replace function public.raye2_submit_safety_report(
  p_target_type text,
  p_target_id uuid,
  p_conversation_id uuid default null,
  p_reason text default 'other',
  p_details text default ''
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_target_type not in ('message','group','user') then raise exception 'invalid report target' using errcode='22023'; end if;
  if p_reason not in ('spam','harassment','hate','impersonation','copyright','other') then raise exception 'invalid report reason' using errcode='22023'; end if;
  if p_target_type='message' and not exists(
    select 1 from public.raye2_messages m
    where m.id=p_target_id and (p_conversation_id is null or m.conversation_id=p_conversation_id)
      and public.raye2_is_conversation_member(m.conversation_id)
  ) then raise exception 'message unavailable' using errcode='42501'; end if;
  if p_target_type='group' and not exists(
    select 1 from public.raye2_groups g where g.id=p_target_id
      and (g.visibility='public' or public.raye2_is_group_member(g.id))
  ) then raise exception 'group unavailable' using errcode='42501'; end if;
  if p_target_type='user' and (p_target_id=auth.uid() or not exists(select 1 from auth.users u where u.id=p_target_id)) then
    raise exception 'account unavailable' using errcode='22023';
  end if;
  insert into public.raye2_safety_reports(reporter_id,target_type,target_id,conversation_id,reason,details)
  values(auth.uid(),p_target_type,p_target_id,p_conversation_id,p_reason,left(coalesce(p_details,''),500))
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raye2_submit_safety_report(text,uuid,uuid,text,text) from public,anon;
grant execute on function public.raye2_submit_safety_report(text,uuid,uuid,text,text) to authenticated;

create or replace function public.raye2_guard_blocked_direct_message()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_type text; v_other uuid;
begin
  select c.conversation_type into v_type
  from public.raye2_conversations c where c.id=new.conversation_id and c.status='active';
  if v_type='direct' then
    select cm.user_id into v_other from public.raye2_conversation_members cm
    where cm.conversation_id=new.conversation_id and cm.user_id<>new.sender_id limit 1;
    if v_other is null or exists(
      select 1 from public.member_blocks b where
        (b.blocker_id=new.sender_id and b.blocked_id=v_other) or
        (b.blocker_id=v_other and b.blocked_id=new.sender_id)
    ) then raise exception 'conversation is unavailable' using errcode='42501'; end if;
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_guard_blocked_direct_message() from public,anon,authenticated;
grant execute on function public.raye2_guard_blocked_direct_message() to authenticated;
drop trigger if exists raye2_messages_block_guard on public.raye2_messages;
create trigger raye2_messages_block_guard before insert on public.raye2_messages
for each row execute function public.raye2_guard_blocked_direct_message();

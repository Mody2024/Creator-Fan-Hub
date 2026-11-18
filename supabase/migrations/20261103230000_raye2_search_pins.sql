-- Raye2 pinned messages: conversation members can view pins; group pins are manager-controlled.
create table if not exists public.raye2_pinned_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.raye2_conversations(id) on delete cascade,
  message_id uuid not null,
  pinned_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  unique(conversation_id,message_id),
  foreign key(message_id,conversation_id) references public.raye2_messages(id,conversation_id) on delete cascade
);
create index if not exists raye2_pinned_messages_conversation_idx
  on public.raye2_pinned_messages(conversation_id,created_at desc);
alter table public.raye2_pinned_messages enable row level security;
revoke all on public.raye2_pinned_messages from anon,authenticated;
grant select on public.raye2_pinned_messages to authenticated;
create policy "Raye2 members view conversation pins"
  on public.raye2_pinned_messages for select to authenticated
  using (public.raye2_is_conversation_member(conversation_id));

create or replace function public.raye2_pin_message(p_conversation_id uuid,p_message_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid; v_count integer;
begin
  if auth.uid() is null or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'conversation unavailable' using errcode='42501';
  end if;
  select group_id into v_group_id from public.raye2_conversations
    where id=p_conversation_id and status='active' for update;
  if not found then raise exception 'conversation unavailable' using errcode='42501'; end if;
  if v_group_id is not null and not public.raye2_is_group_manager(v_group_id) then
    raise exception 'group manager permission required' using errcode='42501';
  end if;
  if not exists(select 1 from public.raye2_messages m where m.id=p_message_id
    and m.conversation_id=p_conversation_id and m.deleted_at is null
    and (m.expires_at is null or m.expires_at>now())) then
    raise exception 'message unavailable' using errcode='P0002';
  end if;
  if exists(select 1 from public.raye2_pinned_messages p where p.conversation_id=p_conversation_id and p.message_id=p_message_id) then
    return;
  end if;
  select count(*) into v_count from public.raye2_pinned_messages p where p.conversation_id=p_conversation_id;
  if v_count>=20 then raise exception 'conversation pin limit reached' using errcode='54000'; end if;
  insert into public.raye2_pinned_messages(conversation_id,message_id,pinned_by)
  values(p_conversation_id,p_message_id,auth.uid());
end;
$$;
create or replace function public.raye2_unpin_message(p_conversation_id uuid,p_message_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid;
begin
  if auth.uid() is null or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'conversation unavailable' using errcode='42501';
  end if;
  select group_id into v_group_id from public.raye2_conversations
    where id=p_conversation_id and status='active';
  if not found then raise exception 'conversation unavailable' using errcode='42501'; end if;
  if v_group_id is not null and not public.raye2_is_group_manager(v_group_id) then
    raise exception 'group manager permission required' using errcode='42501';
  end if;
  delete from public.raye2_pinned_messages where conversation_id=p_conversation_id and message_id=p_message_id;
end;
$$;
revoke all on function public.raye2_pin_message(uuid,uuid) from public,anon;
revoke all on function public.raye2_unpin_message(uuid,uuid) from public,anon;
grant execute on function public.raye2_pin_message(uuid,uuid) to authenticated;
grant execute on function public.raye2_unpin_message(uuid,uuid) to authenticated;

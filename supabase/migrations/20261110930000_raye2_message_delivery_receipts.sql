-- Raye2 Wave 6: message delivery and read receipts.
--
-- Plan Wave 6 requires delivery/read/presence states. Read state existed (conversation_members.last_read_at) but
-- there was no delivery state and senders could not see any receipt, so "delivered" was impossible to show.
--
-- This adds a delivery marker per recipient per message. Read state is derived from the existing
-- last_read_at clock rather than duplicated, so it stays consistent with unread counts.

-- 1. Delivery marker: one row per recipient per message.
create table if not exists public.raye2_message_deliveries (
  message_id uuid not null references public.raye2_messages(id) on delete cascade,
  conversation_id uuid not null references public.raye2_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  delivered_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists raye2_message_deliveries_conversation_idx
  on public.raye2_message_deliveries(conversation_id, user_id);

alter table public.raye2_message_deliveries enable row level security;
revoke all on public.raye2_message_deliveries from anon, authenticated;
grant select on public.raye2_message_deliveries to authenticated;

-- Members may read deliveries for conversations they belong to; recipients may insert their own.
drop policy if exists "Raye2 members read message deliveries" on public.raye2_message_deliveries;
create policy "Raye2 members read message deliveries" on public.raye2_message_deliveries for select to authenticated
  using (user_id=(select auth.uid()) or public.raye2_is_conversation_member(conversation_id));
drop policy if exists "Raye2 recipients record own deliveries" on public.raye2_message_deliveries;
create policy "Raye2 recipients record own deliveries" on public.raye2_message_deliveries for insert to authenticated
  with check (user_id=(select auth.uid()) and public.raye2_is_conversation_member(conversation_id));

-- 2. Backfill deliveries for a newly added conversation member (so status is correct from the first message).
create or replace function public.raye2_backfill_message_deliveries()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  insert into public.raye2_message_deliveries(message_id,conversation_id,user_id)
  select m.id,m.conversation_id,new.user_id
  from public.raye2_messages m
  where m.conversation_id=new.conversation_id and m.sender_id<>new.user_id
  on conflict do nothing;
  return new;
end;
$$;
revoke all on function public.raye2_backfill_message_deliveries() from public,anon,authenticated;
drop trigger if exists raye2_conversation_members_backfill_deliveries on public.raye2_conversation_members;
create trigger raye2_conversation_members_backfill_deliveries
after insert on public.raye2_conversation_members
for each row execute function public.raye2_backfill_message_deliveries();

-- 3. Record delivery for all messages the caller can see in a conversation, except their own. Idempotent.
create or replace function public.raye2_mark_messages_delivered(p_conversation_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_inserted integer := 0;
begin
  if auth.uid() is null or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'conversation membership required' using errcode='42501';
  end if;
  with inserted as (
    insert into public.raye2_message_deliveries(message_id,conversation_id,user_id)
    select m.id,m.conversation_id,auth.uid()
    from public.raye2_messages m
    where m.conversation_id=p_conversation_id and m.sender_id<>auth.uid()
    on conflict do nothing
    returning 1)
  select count(*) into v_inserted from inserted;
  return v_inserted;
end;
$$;
revoke all on function public.raye2_mark_messages_delivered(uuid) from public,anon;
grant execute on function public.raye2_mark_messages_delivered(uuid) to authenticated;

-- 4. Receipt status for the caller's own messages in a conversation: the other participant's delivery and read
--    clocks. Group conversations return null (per-member read state is not exposed to senders).
create or replace function public.raye2_message_receipt_status(p_conversation_id uuid)
returns table (other_delivered_at timestamptz, other_read_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
declare v_type text;
begin
  if auth.uid() is null or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'conversation membership required' using errcode='42501';
  end if;
  select conversation_type into v_type from public.raye2_conversations where id=p_conversation_id;
  if v_type <> 'direct' then
    return query select null::timestamptz, null::timestamptz;
    return;
  end if;
  return query
    select
      (select max(d.delivered_at) from public.raye2_message_deliveries d
        where d.conversation_id=p_conversation_id and d.user_id<>auth.uid()),
      (select max(cm.last_read_at) from public.raye2_conversation_members cm
        where cm.conversation_id=p_conversation_id and cm.user_id<>auth.uid());
end;
$$;
revoke all on function public.raye2_message_receipt_status(uuid) from public,anon;
grant execute on function public.raye2_message_receipt_status(uuid) to authenticated;

-- 5. Publish the deliveries table to Realtime when the standard publication is available.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    if not exists (select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename='raye2_message_deliveries') then
      execute 'alter publication supabase_realtime add table public.raye2_message_deliveries';
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';

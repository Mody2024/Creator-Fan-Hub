-- Raye2 Wave 6: disappearing messages and group slow mode (plan section 8 / companion plan section 3).
--
-- Plan section 8 requires "optional disappearing messages per conversation, subject to the platform's minimum
-- retention and safety/legal requirements", and the group-chat spec requires "slow mode, anti-spam controls,
-- member limits and message rate limits". The messages table already had an unused expires_at column and a
-- hidden-when-expired read policy, but nothing ever set it and nothing swept it; group slow mode did not exist.
-- Additive: adds two settings, two server-enforced write guards and an automatic expiry sweep.

-- 1. Per-conversation disappearing window. Bounded below by the one-day retention floor so it can never undercut
--    the platform's minimum retention and safety/legal requirements.
alter table public.raye2_conversations
  add column if not exists disappearing_seconds integer;
alter table public.raye2_conversations drop constraint if exists raye2_conversations_disappearing_check;
alter table public.raye2_conversations add constraint raye2_conversations_disappearing_check
  check (disappearing_seconds is null or disappearing_seconds in (86400, 604800, 2592000));

-- 2. Per-group slow mode (seconds between messages from the same member). Zero disables it.
alter table public.raye2_groups
  add column if not exists slow_mode_seconds integer not null default 0;
alter table public.raye2_groups drop constraint if exists raye2_groups_slow_mode_check;
alter table public.raye2_groups add constraint raye2_groups_slow_mode_check
  check (slow_mode_seconds between 0 and 3600);

-- 3. Turn disappearing messages on or off for a conversation. A member may set their own direct conversation; a
--    group window is a group-level policy, so it requires a group manager.
create or replace function public.raye2_set_conversation_disappearing(p_conversation_id uuid, p_seconds integer)
returns void language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid;
begin
  if auth.uid() is null or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'conversation unavailable' using errcode='42501';
  end if;
  if p_seconds is not null and p_seconds not in (86400, 604800, 2592000) then
    raise exception 'disappearing window must be 1, 7 or 30 days' using errcode='22023';
  end if;
  select group_id into v_group_id from public.raye2_conversations where id=p_conversation_id;
  if v_group_id is not null and not public.raye2_is_group_manager(v_group_id) then
    raise exception 'group manager permission required' using errcode='42501';
  end if;
  update public.raye2_conversations set disappearing_seconds=p_seconds, updated_at=now() where id=p_conversation_id;
end;
$$;
revoke all on function public.raye2_set_conversation_disappearing(uuid,integer) from public, anon;
grant execute on function public.raye2_set_conversation_disappearing(uuid,integer) to authenticated;

-- 4. Set group slow mode. Manager-only, capped at one hour.
create or replace function public.raye2_set_group_slow_mode(p_group_id uuid, p_seconds integer)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.raye2_is_group_manager(p_group_id) then
    raise exception 'group manager permission required' using errcode='42501';
  end if;
  if p_seconds is null or p_seconds < 0 or p_seconds > 3600 then
    raise exception 'slow mode must be between 0 and 3600 seconds' using errcode='22023';
  end if;
  update public.raye2_groups set slow_mode_seconds=p_seconds, updated_at=now() where id=p_group_id;
end;
$$;
revoke all on function public.raye2_set_group_slow_mode(uuid,integer) from public, anon;
grant execute on function public.raye2_set_group_slow_mode(uuid,integer) to authenticated;

-- 5. Stamp new messages with the conversation's disappearing window when the caller did not set one. Server-side
--    and trigger-enforced, so a client cannot opt out of a conversation's disappearing policy.
create or replace function public.raye2_apply_message_expiry()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_seconds integer;
begin
  if new.expires_at is null then
    select disappearing_seconds into v_seconds from public.raye2_conversations where id=new.conversation_id;
    if v_seconds is not null then
      new.expires_at := now() + (v_seconds || ' seconds')::interval;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_apply_message_expiry() from public, anon, authenticated;
drop trigger if exists raye2_messages_apply_expiry on public.raye2_messages;
create trigger raye2_messages_apply_expiry before insert on public.raye2_messages
for each row execute function public.raye2_apply_message_expiry();

-- 6. Enforce group slow mode at insert time. Raises a clear, retryable error when the same member writes again
--    inside the window. Direct conversations are never throttled.
create or replace function public.raye2_guard_message_slow_mode()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid; v_slow integer; v_last timestamptz;
begin
  select c.group_id, coalesce(g.slow_mode_seconds, 0) into v_group_id, v_slow
  from public.raye2_conversations c
  left join public.raye2_groups g on g.id=c.group_id
  where c.id=new.conversation_id;
  if v_group_id is null or v_slow <= 0 then
    return new;
  end if;
  select max(m.created_at) into v_last from public.raye2_messages m
    where m.conversation_id=new.conversation_id and m.sender_id=new.sender_id;
  if v_last is not null and now() < v_last + (v_slow || ' seconds')::interval then
    raise exception 'slow mode is active; wait % seconds', ceil(extract(epoch from (v_last + (v_slow || ' seconds')::interval - now()))) using errcode='55006';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_guard_message_slow_mode() from public, anon, authenticated;
drop trigger if exists raye2_messages_slow_mode on public.raye2_messages;
create trigger raye2_messages_slow_mode before insert on public.raye2_messages
for each row execute function public.raye2_guard_message_slow_mode();

-- 7. Physically sweep messages whose disappearing window has passed. Messages backing a preserved Shared Memory
--    are never removed, matching the retention sweep. Expired messages are already hidden by the read policy,
--    so this only reclaims storage.
create or replace function public.raye2_sweep_expired_messages()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_removed integer := 0;
begin
  with removed as (
    delete from public.raye2_messages m
    where m.expires_at is not null and m.expires_at < now()
      and not exists(
        select 1 from public.raye2_shared_memories sm
        where sm.source_message_id=m.id and sm.retention_mode='preserved')
    returning 1)
  select count(*) into v_removed from removed;
  if v_removed > 0 then
    insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values(auth.uid(),'disappearing_message_sweep','conversation','all','Automatic disappearing-message sweep',
           jsonb_build_object('removed',v_removed));
  end if;
  return v_removed;
end;
$$;
revoke all on function public.raye2_sweep_expired_messages() from public, anon;
grant execute on function public.raye2_sweep_expired_messages() to authenticated;

-- 8. Fold the disappearing sweep into the maintenance runner, preserving the existing keys.
create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_minis integer := -1; v_moments integer := -1; v_clips integer := -1; v_memories integer := -1;
  v_direct integer := -1; v_group integer := -1; v_expired integer := -1;
begin
  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  begin v_clips := public.raye2_expire_community_clips(); exception when others then v_clips := -1; end;
  begin v_memories := public.raye2_expire_shared_memories(); exception when others then v_memories := -1; end;
  begin v_direct := public.raye2_sweep_message_retention('direct_messages'); exception when others then v_direct := -1; end;
  begin v_group := public.raye2_sweep_message_retention('group_messages'); exception when others then v_group := -1; end;
  begin v_expired := public.raye2_sweep_expired_messages(); exception when others then v_expired := -1; end;
  return jsonb_build_object('minis_expired', v_minis, 'moments_expired', v_moments,
    'clips_expired', v_clips, 'shared_memories_expired', v_memories,
    'direct_messages_expired', v_direct, 'group_messages_expired', v_group,
    'disappearing_messages_expired', v_expired, 'ran_at', now());
end;
$$;
revoke all on function public.raye2_run_maintenance() from public;
grant execute on function public.raye2_run_maintenance() to anon, authenticated;

notify pgrst, 'reload schema';

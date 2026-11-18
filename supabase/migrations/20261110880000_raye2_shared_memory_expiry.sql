-- Raye2 Wave 7: Shared Memories expiry clock and guarded lifecycle (plan 13.9).
--
-- Plan 13.9 requires Shared Memories to stay separate from ordinary chat retention, to be excluded from bulk
-- cleanup unless their own explicit policy permits deletion, and (companion plan) temporary memories to expire
-- on their own clock. The table already stored retention_mode and expires_at and the UI showed an expiry, but
-- nothing ever expired a temporary memory, and a "preserved" memory could still be given an expiry.
--
-- This adds the missing clock and enforces the lifecycle invariant at the data layer:
--   preserved   -> never carries an expiry and is never touched by the clock;
--   temporary   -> must carry an expiry and is deleted when due;
--   group_lifetime -> no expiry.

-- 1. Lifecycle invariant. preserved memories must not carry an expiry; temporary ones must.
create or replace function public.raye2_guard_memory_expiry()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.retention_mode = 'preserved' then
    new.expires_at := null;
  elsif new.retention_mode = 'temporary' then
    if new.expires_at is null then
      raise exception 'a temporary Shared Memory requires an expiry' using errcode='22023';
    end if;
  elsif new.retention_mode = 'group_lifetime' then
    new.expires_at := null;
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_guard_memory_expiry() from public, anon, authenticated;
drop trigger if exists raye2_memories_guard_expiry on public.raye2_shared_memories;
create trigger raye2_memories_guard_expiry
before insert or update on public.raye2_shared_memories
for each row execute function public.raye2_guard_memory_expiry();

-- 2. Expiry clock. Deletes only due temporary memories. Preserved and group-lifetime memories are never
--    touched here, so Shared Memories stay out of ordinary chat retention by construction.
create or replace function public.raye2_expire_shared_memories()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_expired integer := 0;
begin
  with due as (
    delete from public.raye2_shared_memories
    where retention_mode = 'temporary' and expires_at is not null and expires_at <= now()
    returning 1
  )
  select count(*) into v_expired from due;
  return v_expired;
end;
$$;
revoke all on function public.raye2_expire_shared_memories() from public;
grant execute on function public.raye2_expire_shared_memories() to anon, authenticated;

-- 3. Guarded lifecycle controls. Author or group manager only, and the memory must belong to a group.
create or replace function public.raye2_set_memory_expiry(p_memory_id uuid, p_days integer)
returns table (applied boolean, result_code text)
language plpgsql security definer set search_path=''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_group uuid;
  v_author uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if p_days is null or p_days < 1 or p_days > 3650 then
    raise exception 'expiry must be between 1 and 3650 days' using errcode='22023';
  end if;
  select group_id, created_by into v_group, v_author from public.raye2_shared_memories where id = p_memory_id;
  if v_group is null then return query select false, 'not_found'::text; return; end if;
  if v_uid <> v_author and not public.raye2_is_group_manager(v_group) then
    raise exception 'only the author or a group manager can set expiry' using errcode='42501';
  end if;
  update public.raye2_shared_memories
     set retention_mode = 'temporary', expires_at = now() + make_interval(days => p_days)
   where id = p_memory_id;
  return query select true, 'temporary'::text;
end;
$fn$;
revoke all on function public.raye2_set_memory_expiry(uuid,integer) from public, anon;
grant execute on function public.raye2_set_memory_expiry(uuid,integer) to authenticated;

create or replace function public.raye2_preserve_memory(p_memory_id uuid)
returns table (applied boolean, result_code text)
language plpgsql security definer set search_path=''
as $fn$
declare
  v_uid uuid := (select auth.uid());
  v_group uuid;
  v_author uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  select group_id, created_by into v_group, v_author from public.raye2_shared_memories where id = p_memory_id;
  if v_group is null then return query select false, 'not_found'::text; return; end if;
  if v_uid <> v_author and not public.raye2_is_group_manager(v_group) then
    raise exception 'only the author or a group manager can preserve' using errcode='42501';
  end if;
  update public.raye2_shared_memories set retention_mode = 'preserved', expires_at = null where id = p_memory_id;
  return query select true, 'preserved'::text;
end;
$fn$;
revoke all on function public.raye2_preserve_memory(uuid) from public, anon;
grant execute on function public.raye2_preserve_memory(uuid) to authenticated;

-- 4. Fold memory expiry into the maintenance runner, preserving the existing keys.
create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_minis integer := -1; v_moments integer := -1; v_clips integer := -1; v_memories integer := -1;
begin
  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  begin v_clips := public.raye2_expire_community_clips(); exception when others then v_clips := -1; end;
  begin v_memories := public.raye2_expire_shared_memories(); exception when others then v_memories := -1; end;
  return jsonb_build_object('minis_expired', v_minis, 'moments_expired', v_moments,
    'clips_expired', v_clips, 'shared_memories_expired', v_memories, 'ran_at', now());
end;
$$;
revoke all on function public.raye2_run_maintenance() from public;
grant execute on function public.raye2_run_maintenance() to anon, authenticated;

notify pgrst, 'reload schema';

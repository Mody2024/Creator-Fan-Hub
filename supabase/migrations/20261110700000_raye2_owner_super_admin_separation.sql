-- Raye2 Wave 2: separate Owner from Super-Admin and gate destructive operations.
--
-- Plan 2.2 requires the Owner and Super-Admin powers to be distinct. raye2_is_platform_admin() treated
-- 'owner' and 'admin' as one role, so a platform admin could run irreversible retention deletions and
-- grant or revoke per-account privilege overrides - actions that should sit with the Owner. This keeps
-- read/coordination access for both (dashboard, rosters, health) but moves the irreversible and
-- privilege-granting operations to the Owner via raye2_is_super_admin(), and exposes a self-describing
-- capability matrix so the dashboard can explain what each role may do.

-- 1. Super Admin is the Owner. Platform admin stays the broader owner+admin set for reads.
create or replace function public.raye2_is_super_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.creator_admins a
    where a.user_id = (select auth.uid())
      and a.active = true and a.role = 'owner'
      and (a.expires_at is null or a.expires_at > now())
  );
$$;
revoke all on function public.raye2_is_super_admin() from public,anon;
grant execute on function public.raye2_is_super_admin() to authenticated;

-- 2. Capability matrix: what the caller may do, and which role each capability requires.
create or replace function public.raye2_admin_capabilities()
returns table (capability text, required_role text, allowed boolean, description text)
language sql stable security definer set search_path=''
as $fn$
  with me as (
    select public.raye2_is_platform_admin() as is_admin,
           public.raye2_is_super_admin() as is_owner
  )
  select v.capability, v.required_role, v.allowed, v.description
  from me
  cross join lateral (values
    ('view_dashboard','platform_admin', me.is_admin, 'View platform health, rosters and dashboards.'),
    ('moderate_content','platform_admin', me.is_admin, 'Moderate community content and review reports.'),
    ('manage_sponsors','platform_admin', me.is_admin, 'Manage sponsorship contracts and payouts.'),
    ('queue_cleanup','platform_admin', me.is_admin, 'Preview and queue retention cleanup jobs (reversible).'),
    ('run_cleanup','owner', me.is_owner, 'Run a retention cleanup job (irreversible deletion).'),
    ('grant_overrides','owner', me.is_owner, 'Grant or revoke per-account capability overrides.'),
    ('manage_roles','owner', me.is_owner, 'Assign roles, invitations and temporary grants.')
  ) as v(capability, required_role, allowed, description)
  order by (v.required_role = 'owner') desc, v.capability;
$fn$;
revoke all on function public.raye2_admin_capabilities() from public,anon;
grant execute on function public.raye2_admin_capabilities() to authenticated;

-- 3. Capability overrides become an Owner action (they change what an account may do).
create or replace function public.raye2_set_capability_override(
  p_user_id uuid,
  p_capability text,
  p_value jsonb,
  p_reason text,
  p_expires_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.raye2_is_super_admin() then raise exception 'owner access required' using errcode='42501'; end if;
  if p_capability is null or p_capability !~ '^[a-z][a-z0-9_.]{1,60}$' then raise exception 'invalid capability name' using errcode='22023'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'an expiry must be in the future' using errcode='22023'; end if;
  if not exists(select 1 from auth.users u where u.id = p_user_id) then raise exception 'account not found' using errcode='P0002'; end if;
  insert into public.raye2_capability_overrides(user_id,capability,value,reason,issued_by,expires_at)
  values(p_user_id,p_capability,p_value,v_reason,auth.uid(),p_expires_at)
  returning id into v_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'capability_override_set','member',p_user_id::text,v_reason,
    jsonb_build_object('override_id',v_id,'capability',p_capability,'value',p_value,'expires_at',p_expires_at));
  return v_id;
end;
$$;
revoke all on function public.raye2_set_capability_override(uuid,text,jsonb,text,timestamptz) from public,anon;
grant execute on function public.raye2_set_capability_override(uuid,text,jsonb,text,timestamptz) to authenticated;

create or replace function public.raye2_revoke_capability_override(p_override_id uuid, p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user uuid; v_cap text; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.raye2_is_super_admin() then raise exception 'owner access required' using errcode='42501'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  select user_id, capability into v_user, v_cap from public.raye2_capability_overrides
    where id = p_override_id and status = 'active' for update;
  if v_user is null then raise exception 'active override not found' using errcode='P0002'; end if;
  update public.raye2_capability_overrides set status = 'revoked' where id = p_override_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'capability_override_revoked','member',v_user::text,v_reason,
    jsonb_build_object('override_id',p_override_id,'capability',v_cap));
end;
$$;
revoke all on function public.raye2_revoke_capability_override(uuid,text) from public,anon;
grant execute on function public.raye2_revoke_capability_override(uuid,text) to authenticated;

-- Override listing is still available to platform admins (read-only).
create or replace function public.raye2_list_capability_overrides(p_user_id uuid)
returns table (id uuid, capability text, value jsonb, reason text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then raise exception 'administrator access required' using errcode='42501'; end if;
  return query
    select o.id, o.capability, o.value, o.reason, o.expires_at, o.created_at
    from public.raye2_capability_overrides o
    where o.user_id = p_user_id and o.status = 'active'
      and (o.expires_at is null or o.expires_at > now())
    order by o.created_at desc;
end;
$$;
revoke all on function public.raye2_list_capability_overrides(uuid) from public,anon;
grant execute on function public.raye2_list_capability_overrides(uuid) to authenticated;

-- 4. Running a cleanup job performs irreversible deletion, so it is Owner-only. Queueing and cancelling
--    stay with platform admins because a queued job can still be cancelled.
create or replace function public.raye2_run_cleanup_job(p_job_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_job public.raye2_cleanup_jobs%rowtype; v_category text; v_policy public.raye2_retention_policies%rowtype;
  v_deleted bigint; v_bytes bigint; v_total bigint := 0; v_total_bytes bigint := 0; v_skipped bigint := 0;
  v_breakdown jsonb := '{}'::jsonb; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.raye2_is_super_admin() then raise exception 'owner access required' using errcode='42501'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  select * into v_job from public.raye2_cleanup_jobs where id = p_job_id for update;
  if not found then raise exception 'cleanup job not found' using errcode='P0002'; end if;
  if v_job.status not in ('queued','running') then raise exception 'job cannot run' using errcode='22023'; end if;
  update public.raye2_cleanup_jobs set status = 'running', started_at = coalesce(started_at, now()) where id = p_job_id;
  for v_category in select jsonb_array_elements_text(v_job.scope) loop
    select * into v_policy from public.raye2_retention_policies where category = v_category;
    if not v_policy.enabled then
      v_breakdown := v_breakdown || jsonb_build_object(v_category, jsonb_build_object('state','disabled','deleted',0));
      continue;
    end if;
    if v_policy.expiry_action <> 'delete' then
      select count(*) into v_deleted from public.raye2_cleanup_candidates(v_category, v_policy.retention_days, v_job.preserve_chat_history, v_job.preserve_shared_memories);
      v_skipped := v_skipped + v_deleted;
      v_breakdown := v_breakdown || jsonb_build_object(v_category, jsonb_build_object('state','archived_unsupported','deleted',0));
      continue;
    end if;
    select coalesce(sum(c.bytes),0) into v_bytes
      from public.raye2_cleanup_candidates(v_category, v_policy.retention_days, v_job.preserve_chat_history, v_job.preserve_shared_memories) c;
    if v_category = 'direct_messages' or v_category = 'group_messages' then
      with removed as (delete from public.raye2_messages where id in (
        select id from public.raye2_cleanup_candidates(v_category, v_policy.retention_days, v_job.preserve_chat_history, v_job.preserve_shared_memories)) returning 1)
      select count(*) into v_deleted from removed;
    elsif v_category = 'voice_rooms' then
      with removed as (delete from public.raye2_voice_sessions where id in (
        select id from public.raye2_cleanup_candidates(v_category, v_policy.retention_days, v_job.preserve_chat_history, v_job.preserve_shared_memories)) returning 1)
      select count(*) into v_deleted from removed;
    elsif v_category = 'watch_sessions' then
      with removed as (delete from public.raye2_watch_sessions where id in (
        select id from public.raye2_cleanup_candidates(v_category, v_policy.retention_days, v_job.preserve_chat_history, v_job.preserve_shared_memories)) returning 1)
      select count(*) into v_deleted from removed;
    elsif v_category = 'shared_memories' then
      with removed as (delete from public.raye2_shared_memories where id in (
        select id from public.raye2_cleanup_candidates(v_category, v_policy.retention_days, v_job.preserve_chat_history, v_job.preserve_shared_memories)) returning 1)
      select count(*) into v_deleted from removed;
    else
      v_deleted := 0;
    end if;
    v_total := v_total + v_deleted; v_total_bytes := v_total_bytes + coalesce(v_bytes,0);
    v_breakdown := v_breakdown || jsonb_build_object(v_category, jsonb_build_object('state','deleted','deleted',v_deleted,'bytes',coalesce(v_bytes,0)));
  end loop;
  update public.raye2_cleanup_jobs
     set status = 'completed', completed_at = now(),
         result = jsonb_build_object('deleted_items', v_total, 'deleted_bytes', v_total_bytes, 'skipped_items', v_skipped, 'categories', v_breakdown)
   where id = p_job_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values (auth.uid(),'cleanup_job_completed','cleanup_job',p_job_id::text,v_reason,
    jsonb_build_object('deleted_items', v_total, 'deleted_bytes', v_total_bytes, 'skipped_items', v_skipped));
  return jsonb_build_object('deleted_items', v_total, 'deleted_bytes', v_total_bytes, 'skipped_items', v_skipped);
end;
$fn$;
revoke all on function public.raye2_run_cleanup_job(uuid,text) from public, anon;
grant execute on function public.raye2_run_cleanup_job(uuid,text) to authenticated;

notify pgrst, 'reload schema';

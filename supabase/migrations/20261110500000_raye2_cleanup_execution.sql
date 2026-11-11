-- Raye2 Wave 8: execute storage cleanup jobs and preview retention sweeps.
--
-- Plan 10.3 requires cleanup previews to become real, reviewable jobs. Previews already exist but
-- nothing can queue or run them, and there is no way to see what an enabled retention policy would
-- remove. This migration adds a single candidate resolver shared by estimate and execution, the
-- queue/run/cancel lifecycle with item+byte accounting, and a retention sweep preview.

-- 1. Single source of truth for which rows a category would remove. Returns nothing when the
--    policy is disabled, and respects the preserve flags carried by the job.
create or replace function public.raye2_cleanup_candidates(
  p_category text,
  p_retention_days integer,
  p_preserve_chat_history boolean,
  p_preserve_shared_memories boolean
)
returns table (id uuid, bytes bigint)
language plpgsql stable set search_path = ''
as $fn$
declare v_cutoff timestamptz;
begin
  if p_retention_days is null then return; end if;
  v_cutoff := now() - (p_retention_days || ' days')::interval;
  case p_category
    when 'direct_messages' then
      return query select m.id, octet_length(m.body)::bigint
        from public.raye2_messages m
        join public.raye2_conversations c on c.id = m.conversation_id
        where c.conversation_type = 'direct' and m.created_at < v_cutoff;
    when 'group_messages' then
      if p_preserve_chat_history then return; end if;
      return query select m.id, octet_length(m.body)::bigint
        from public.raye2_messages m
        join public.raye2_conversations c on c.id = m.conversation_id
        where c.conversation_type = 'group' and m.created_at < v_cutoff;
    when 'voice_rooms' then
      return query select s.id, 0::bigint
        from public.raye2_voice_sessions s
        where s.status in ('ended','expired','declined','cancelled')
          and coalesce(s.ended_at, s.updated_at) < v_cutoff;
    when 'watch_sessions' then
      return query select s.id, 0::bigint
        from public.raye2_watch_sessions s
        where s.status in ('ended','expired') and coalesce(s.updated_at, s.created_at) < v_cutoff;
    when 'shared_memories' then
      if p_preserve_shared_memories then return; end if;
      return query select m.id, octet_length(coalesce(m.title,'') || coalesce(m.caption,''))::bigint
        from public.raye2_shared_memories m
        where m.retention_mode = 'temporary'
          and ((m.expires_at is not null and m.expires_at < now()) or m.created_at < v_cutoff);
    else
      return; -- storage-backed categories (voice_recordings, attachments, uploads…) have no queryable rows yet
  end case;
end;
$fn$;
revoke all on function public.raye2_cleanup_candidates(text,integer,boolean,boolean) from public, anon, authenticated;

-- 2. Estimate the whole scope using each category's enabled policy.
create or replace function public.raye2_estimate_cleanup_scope(
  p_scope jsonb,
  p_preserve_chat_history boolean,
  p_preserve_shared_memories boolean
)
returns table (items bigint, bytes bigint)
language plpgsql stable security definer set search_path = ''
as $fn$
declare v_category text; v_policy public.raye2_retention_policies%rowtype; v_items bigint; v_bytes bigint;
begin
  items := 0; bytes := 0;
  for v_category in select jsonb_array_elements_text(p_scope) loop
    select * into v_policy from public.raye2_retention_policies where category = v_category;
    if v_policy.enabled then
      select count(*), coalesce(sum(c.bytes), 0) into v_items, v_bytes
        from public.raye2_cleanup_candidates(v_category, v_policy.retention_days, p_preserve_chat_history, p_preserve_shared_memories) c;
      items := items + v_items; bytes := bytes + v_bytes;
    end if;
  end loop;
  return next;
end;
$fn$;
revoke all on function public.raye2_estimate_cleanup_scope(jsonb,boolean,boolean) from public, anon;
grant execute on function public.raye2_estimate_cleanup_scope(jsonb,boolean,boolean) to authenticated;

-- 3. Queue a previewed job, freezing its estimate.
create or replace function public.raye2_queue_cleanup_job(p_job_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_job public.raye2_cleanup_jobs%rowtype; v_items bigint; v_bytes bigint; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  select * into v_job from public.raye2_cleanup_jobs where id = p_job_id for update;
  if not found then raise exception 'cleanup job not found' using errcode='P0002'; end if;
  if v_job.status not in ('preview','failed') then raise exception 'job cannot be queued' using errcode='22023'; end if;
  select e.items, e.bytes into v_items, v_bytes from public.raye2_estimate_cleanup_scope(v_job.scope, v_job.preserve_chat_history, v_job.preserve_shared_memories) e;
  update public.raye2_cleanup_jobs
     set status = 'queued', estimated_items = v_items, estimated_bytes = v_bytes, result = jsonb_build_object('queued_reason', v_reason)
   where id = p_job_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values (auth.uid(),'cleanup_job_queued','cleanup_job',p_job_id::text,v_reason,
    jsonb_build_object('scope', v_job.scope, 'estimated_items', v_items, 'estimated_bytes', v_bytes));
end;
$fn$;
revoke all on function public.raye2_queue_cleanup_job(uuid,text) from public, anon;
grant execute on function public.raye2_queue_cleanup_job(uuid,text) to authenticated;

-- 4. Run a queued job. Deletes only for categories whose policy action is 'delete'; 'archive'
--    policies are counted as skipped because no archive sink exists yet.
create or replace function public.raye2_run_cleanup_job(p_job_id uuid, p_reason text)
returns jsonb
language plpgsql security definer set search_path = ''
as $fn$
declare
  v_job public.raye2_cleanup_jobs%rowtype; v_category text; v_policy public.raye2_retention_policies%rowtype;
  v_deleted bigint; v_bytes bigint; v_total bigint := 0; v_total_bytes bigint := 0; v_skipped bigint := 0;
  v_breakdown jsonb := '{}'::jsonb; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
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

-- 5. Cancel a job that has not started.
create or replace function public.raye2_cancel_cleanup_job(p_job_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_status text; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  select status into v_status from public.raye2_cleanup_jobs where id = p_job_id for update;
  if v_status is null then raise exception 'cleanup job not found' using errcode='P0002'; end if;
  if v_status not in ('preview','queued') then raise exception 'job cannot be cancelled' using errcode='22023'; end if;
  update public.raye2_cleanup_jobs set status = 'cancelled', completed_at = now() where id = p_job_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values (auth.uid(),'cleanup_job_cancelled','cleanup_job',p_job_id::text,v_reason,'{}'::jsonb);
end;
$fn$;
revoke all on function public.raye2_cancel_cleanup_job(uuid,text) from public, anon;
grant execute on function public.raye2_cancel_cleanup_job(uuid,text) to authenticated;

-- 6. Retention sweep preview: what each enabled policy would remove right now.
create or replace function public.raye2_preview_retention_sweep()
returns table (category text, retention_days integer, expiry_action text, candidates bigint, oldest timestamptz)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  return query
    select p.category, p.retention_days, p.expiry_action,
           (select count(*) from public.raye2_cleanup_candidates(p.category, p.retention_days, false, false) c),
           (select min(c.created) from (
              select case p.category
                when 'direct_messages' then (select min(m.created_at) from public.raye2_messages m join public.raye2_conversations c2 on c2.id=m.conversation_id where c2.conversation_type='direct' and m.created_at < now() - (p.retention_days||' days')::interval)
                when 'group_messages' then (select min(m.created_at) from public.raye2_messages m join public.raye2_conversations c2 on c2.id=m.conversation_id where c2.conversation_type='group' and m.created_at < now() - (p.retention_days||' days')::interval)
                when 'voice_rooms' then (select min(coalesce(s.ended_at,s.updated_at)) from public.raye2_voice_sessions s where s.status in ('ended','expired','declined','cancelled') and coalesce(s.ended_at,s.updated_at) < now() - (p.retention_days||' days')::interval)
                when 'watch_sessions' then (select min(coalesce(s.updated_at,s.created_at)) from public.raye2_watch_sessions s where s.status in ('ended','expired') and coalesce(s.updated_at,s.created_at) < now() - (p.retention_days||' days')::interval)
                else null
              end as created) c)
    from public.raye2_retention_policies p
    where p.enabled and p.retention_days is not null
    order by p.category;
end;
$fn$;
revoke all on function public.raye2_preview_retention_sweep() from public, anon;
grant execute on function public.raye2_preview_retention_sweep() to authenticated;

notify pgrst, 'reload schema';

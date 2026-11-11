-- Raye2 Wave 9/10: durable background-job framework.
--
-- Plan 11.3 and 13.11 require background jobs to be durable, retryable, idempotent and observable.
-- The media pipeline has its own lease-based queue, but platform jobs (cleanup execution, fanout,
-- re-encode, notifications) have no durable home. This generalises the proven lease pattern.

create table if not exists public.raye2_background_jobs (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind ~ '^[a-z][a-z0-9_.-]{1,60}$'),
  payload jsonb not null default '{}'::jsonb check (octet_length(payload::text) <= 8192),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled')),
  priority integer not null default 0 check (priority between -100 and 100),
  run_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  max_attempts integer not null default 3 check (max_attempts between 1 and 10),
  lease_until timestamptz,
  lease_token uuid,
  idempotency_key text check (idempotency_key is null or char_length(idempotency_key) between 1 and 200),
  last_error text check (last_error is null or char_length(last_error) <= 1000),
  result jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);
create unique index if not exists raye2_background_jobs_idempotency_idx on public.raye2_background_jobs(idempotency_key) where idempotency_key is not null;
create index if not exists raye2_background_jobs_claim_idx on public.raye2_background_jobs(status,run_at,priority desc,created_at) where status in ('queued','running');
create index if not exists raye2_background_jobs_kind_idx on public.raye2_background_jobs(kind,status);
alter table public.raye2_background_jobs enable row level security;
revoke all on public.raye2_background_jobs from anon,authenticated;

-- 1. Enqueue. Platform admins and the trusted service role may enqueue; the idempotency key makes
--    a repeat enqueue a no-op that returns the existing job.
create or replace function public.raye2_enqueue_background_job(
  p_kind text,
  p_payload jsonb default '{}'::jsonb,
  p_priority integer default 0,
  p_run_at timestamptz default now(),
  p_idempotency_key text default null,
  p_max_attempts integer default 3
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if not (public.raye2_is_platform_admin() or auth.role() = 'service_role') then
    raise exception 'platform admin or trusted worker required' using errcode='42501';
  end if;
  if p_kind is null or p_kind !~ '^[a-z][a-z0-9_.-]{1,60}$' then raise exception 'invalid job kind' using errcode='22023'; end if;
  if octet_length(coalesce(p_payload,'{}'::jsonb)::text) > 8192 then raise exception 'payload too large' using errcode='22023'; end if;
  if p_priority is null or p_priority < -100 or p_priority > 100 then raise exception 'invalid priority' using errcode='22023'; end if;
  if p_max_attempts is null or p_max_attempts < 1 or p_max_attempts > 10 then raise exception 'invalid max attempts' using errcode='22023'; end if;
  if p_idempotency_key is not null then
    select id into v_id from public.raye2_background_jobs where idempotency_key = p_idempotency_key;
    if v_id is not null then return v_id; end if;
  end if;
  insert into public.raye2_background_jobs(kind,payload,priority,run_at,idempotency_key,max_attempts,created_by)
  values(p_kind,coalesce(p_payload,'{}'::jsonb),p_priority,coalesce(p_run_at,now()),p_idempotency_key,p_max_attempts,auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raye2_enqueue_background_job(text,jsonb,integer,timestamptz,text,integer) from public,anon,authenticated;
grant execute on function public.raye2_enqueue_background_job(text,jsonb,integer,timestamptz,text,integer) to authenticated,service_role;

-- 2. Claim the next due job. Trusted worker only. Reclaims jobs whose lease expired.
create or replace function public.raye2_claim_background_job()
returns table (job_id uuid, kind text, payload jsonb, attempts integer, max_attempts integer, lease_token uuid)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_token uuid := gen_random_uuid();
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'trusted worker required' using errcode='42501';
  end if;
  select j.id into v_id from public.raye2_background_jobs j
   where (
     (j.status = 'queued' and j.run_at <= now())
     or (j.status = 'running' and j.lease_until < now())
   )
   order by j.priority desc, j.run_at asc, j.created_at asc
   for update skip locked limit 1;
  if v_id is null then return; end if;
  return query
   update public.raye2_background_jobs j
      set status = 'running', attempts = j.attempts + 1, lease_until = now() + interval '15 minutes',
          lease_token = v_token, updated_at = now()
    where j.id = v_id
    returning j.id, j.kind, j.payload, j.attempts, j.max_attempts, j.lease_token;
end;
$$;
revoke all on function public.raye2_claim_background_job() from public,anon,authenticated;
grant execute on function public.raye2_claim_background_job() to service_role;

-- 3. Complete a claimed job. Failure requeues with backoff until max_attempts, then fails.
create or replace function public.raye2_complete_background_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_success boolean,
  p_result jsonb default '{}'::jsonb,
  p_error text default null
)
returns text language plpgsql security definer set search_path=''
as $$
declare v_job public.raye2_background_jobs%rowtype; v_backoff interval; v_status text;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'trusted worker required' using errcode='42501';
  end if;
  select * into v_job from public.raye2_background_jobs where id = p_job_id for update;
  if not found then raise exception 'job not found' using errcode='P0002'; end if;
  if v_job.status <> 'running' or v_job.lease_token is distinct from p_lease_token then
    raise exception 'job lease is not held by this worker' using errcode='42501';
  end if;
  if p_success then
    update public.raye2_background_jobs
       set status = 'succeeded', result = coalesce(p_result,'{}'::jsonb), last_error = null,
           lease_until = null, lease_token = null, completed_at = now(), updated_at = now()
     where id = p_job_id;
    return 'succeeded';
  end if;
  if v_job.attempts >= v_job.max_attempts then
    update public.raye2_background_jobs
       set status = 'failed', last_error = left(coalesce(p_error,'failed'),1000),
           lease_until = null, lease_token = null, completed_at = now(), updated_at = now()
     where id = p_job_id;
    return 'failed';
  end if;
  v_backoff := (power(2, v_job.attempts)::text || ' minutes')::interval;
  update public.raye2_background_jobs
     set status = 'queued', last_error = left(coalesce(p_error,'failed'),1000),
         run_at = now() + v_backoff, lease_until = null, lease_token = null, updated_at = now()
   where id = p_job_id;
  return 'queued';
end;
$$;
revoke all on function public.raye2_complete_background_job(uuid,uuid,boolean,jsonb,text) from public,anon,authenticated;
grant execute on function public.raye2_complete_background_job(uuid,uuid,boolean,jsonb,text) to service_role;

-- 4. Cancel a job (admin or worker).
create or replace function public.raye2_cancel_background_job(p_job_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path=''
as $$
declare v_status text;
begin
  if not (public.raye2_is_platform_admin() or auth.role() = 'service_role') then
    raise exception 'platform admin or trusted worker required' using errcode='42501';
  end if;
  select status into v_status from public.raye2_background_jobs where id = p_job_id for update;
  if v_status is null then raise exception 'job not found' using errcode='P0002'; end if;
  if v_status not in ('queued','running','failed') then raise exception 'job cannot be cancelled' using errcode='22023'; end if;
  update public.raye2_background_jobs
     set status = 'cancelled', lease_until = null, lease_token = null, completed_at = now(), updated_at = now()
   where id = p_job_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'background_job_cancelled','background_job',p_job_id::text,left(btrim(coalesce(p_reason,'')),500),'{}'::jsonb);
end;
$$;
revoke all on function public.raye2_cancel_background_job(uuid,text) from public,anon;
grant execute on function public.raye2_cancel_background_job(uuid,text) to authenticated,service_role;

-- 5. Manual retry of a failed job (admin only), resetting the attempt counter.
create or replace function public.raye2_retry_background_job(p_job_id uuid, p_reason text default '')
returns void language plpgsql security definer set search_path=''
as $$
declare v_status text;
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  select status into v_status from public.raye2_background_jobs where id = p_job_id for update;
  if v_status is null then raise exception 'job not found' using errcode='P0002'; end if;
  if v_status <> 'failed' then raise exception 'only failed jobs can be retried' using errcode='22023'; end if;
  update public.raye2_background_jobs
     set status = 'queued', attempts = 0, run_at = now(), last_error = null,
         lease_until = null, lease_token = null, completed_at = null, updated_at = now()
   where id = p_job_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'background_job_retried','background_job',p_job_id::text,left(btrim(coalesce(p_reason,'')),500),'{}'::jsonb);
end;
$$;
revoke all on function public.raye2_retry_background_job(uuid,text) from public,anon;
grant execute on function public.raye2_retry_background_job(uuid,text) to authenticated;

-- 6. Observability: aggregate counts by status and kind, backlog age and recent failures.
create or replace function public.raye2_get_background_job_stats()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v jsonb;
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  select jsonb_build_object(
    'by_status', coalesce((select jsonb_object_agg(s.status, s.n) from
      (select status, count(*) n from public.raye2_background_jobs group by status) s), '{}'::jsonb),
    'by_kind', coalesce((select jsonb_object_agg(k.kind, k.n) from
      (select kind, count(*) n from public.raye2_background_jobs where status in ('queued','running','failed') group by kind) k), '{}'::jsonb),
    'oldest_queued_at', (select min(run_at) from public.raye2_background_jobs where status = 'queued'),
    'failed_last_24h', (select count(*) from public.raye2_background_jobs where status = 'failed' and updated_at > now() - interval '24 hours'),
    'stuck_running', (select count(*) from public.raye2_background_jobs where status = 'running' and lease_until < now())
  ) into v;
  return v;
end;
$$;
revoke all on function public.raye2_get_background_job_stats() from public,anon;
grant execute on function public.raye2_get_background_job_stats() to authenticated;

-- 7. Recent jobs for the admin view.
create or replace function public.raye2_list_background_jobs(p_limit integer default 50, p_status text default null)
returns table (job_id uuid, kind text, status text, priority integer, attempts integer, max_attempts integer, last_error text, run_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  if p_status is not null and p_status not in ('queued','running','succeeded','failed','cancelled') then
    raise exception 'invalid status' using errcode='22023';
  end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit,50),1),200) as lim)
    select j.id, j.kind, j.status, j.priority, j.attempts, j.max_attempts, j.last_error, j.run_at, j.created_at
    from public.raye2_background_jobs j
    cross join bounded b
    where p_status is null or j.status = p_status
    order by j.created_at desc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_list_background_jobs(integer,text) from public,anon;
grant execute on function public.raye2_list_background_jobs(integer,text) to authenticated;

notify pgrst, 'reload schema';

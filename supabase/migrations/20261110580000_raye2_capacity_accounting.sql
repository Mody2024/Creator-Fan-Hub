-- Raye2 Wave 9: cost and capacity accounting with backpressure.
--
-- Plan 11.4 requires tracking provider limits and current usage, applying quotas and backpressure
-- before capacity exhaustion, and showing admins real limits. Only the upload reservation path had a
-- storage guard; there was no configurable capacity table, no usage report and no general backpressure.

create table if not exists public.raye2_capacity_limits (
  metric text primary key check (metric ~ '^[a-z][a-z0-9_.]{1,60}$'),
  unit text not null default 'count' check (unit in ('bytes','count','minutes','connections','requests')),
  limit_value bigint not null check (limit_value > 0),
  warning_percent integer not null default 80 check (warning_percent between 1 and 99),
  enabled boolean not null default true,
  description text not null default '' check (char_length(description) <= 300),
  updated_at timestamptz not null default now()
);
alter table public.raye2_capacity_limits enable row level security;
revoke all on public.raye2_capacity_limits from anon,authenticated;

-- Seed measured, provider-shaped limits. These are conservative starting values, not promises.
insert into public.raye2_capacity_limits(metric,unit,limit_value,warning_percent,description) values
 ('storage_bytes','bytes',1073741824,80,'Total stored object bytes across managed buckets (default 1 GiB free tier).'),
 ('background_jobs_queued','count',1000,80,'Queued plus running background jobs before enqueue backpressure.'),
 ('realtime_connections','connections',500,80,'Concurrently joined realtime (voice) participants.'),
 ('encoding_queue','count',200,80,'Media items awaiting or undergoing processing.')
on conflict (metric) do nothing;

-- Authoritative current usage for a metric. Returns null when no source exists, so the report never
-- invents numbers.
create or replace function public.raye2_capacity_used(p_metric text)
returns bigint language sql stable security definer set search_path=''
as $$
  select case p_metric
    when 'storage_bytes' then
      (select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0) from storage.objects o)
    when 'background_jobs_queued' then
      (select count(*) from public.raye2_background_jobs j where j.status in ('queued','running'))
    when 'realtime_connections' then
      (select count(*) from public.raye2_voice_participants p where p.status = 'joined')
    when 'encoding_queue' then
      (select count(*) from public.media_items m where m.processing_status in ('pending','uploading','uploaded','processing'))
    else null
  end;
$$;
revoke all on function public.raye2_capacity_used(text) from public,anon,authenticated;
-- Internal helper: only reached through the admin-gated report and other definer functions.
grant execute on function public.raye2_capacity_used(text) to service_role;

-- Backpressure: raise before work would push a metric past its configured limit.
create or replace function public.raye2_assert_capacity(p_metric text, p_amount bigint default 1)
returns void language plpgsql security definer set search_path=''
as $$
declare v_limit bigint; v_enabled boolean; v_used bigint;
begin
  if p_amount is null or p_amount < 0 then raise exception 'invalid amount' using errcode='22023'; end if;
  select l.limit_value, l.enabled into v_limit, v_enabled from public.raye2_capacity_limits l where l.metric = p_metric;
  if v_limit is null or not v_enabled then return; end if;
  v_used := public.raye2_capacity_used(p_metric);
  if v_used is null then return; end if;
  if v_used + p_amount > v_limit then
    raise exception 'capacity limit reached for %: % of %', p_metric, v_used, v_limit using errcode='53100';
  end if;
end;
$$;
revoke all on function public.raye2_assert_capacity(text,bigint) from public,anon,authenticated;
-- Internal helper: called by the job-capacity trigger and system code, not by clients.
grant execute on function public.raye2_assert_capacity(text,bigint) to service_role;

-- Enqueue backpressure: refuse a new job when the queue is at its configured ceiling.
create or replace function public.raye2_enforce_job_capacity()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.raye2_assert_capacity('background_jobs_queued', 1);
  return new;
end;
$$;
revoke all on function public.raye2_enforce_job_capacity() from public,anon,authenticated;
drop trigger if exists raye2_background_jobs_capacity on public.raye2_background_jobs;
create trigger raye2_background_jobs_capacity before insert on public.raye2_background_jobs
for each row execute function public.raye2_enforce_job_capacity();

-- Admin capacity report: usage, limit, percentage, state and headroom per metric.
create or replace function public.raye2_get_capacity_report()
returns table (metric text, unit text, limit_value bigint, used bigint, usage_percent numeric, state text, headroom bigint, enabled boolean)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  return query
    select l.metric, l.unit, l.limit_value, u.used,
           case when u.used is null then null else round(u.used::numeric * 100 / l.limit_value, 1) end,
           case
             when u.used is null then 'unknown'
             when u.used >= l.limit_value then 'critical'
             when u.used::numeric * 100 / l.limit_value >= l.warning_percent then 'warning'
             else 'ok'
           end,
           case when u.used is null then null else greatest(0, l.limit_value - u.used) end,
           l.enabled
    from public.raye2_capacity_limits l
    cross join lateral (select public.raye2_capacity_used(l.metric) as used) u
    order by l.metric;
end;
$fn$;
revoke all on function public.raye2_get_capacity_report() from public,anon;
grant execute on function public.raye2_get_capacity_report() to authenticated;

-- Admin tuning of a limit.
create or replace function public.raye2_set_capacity_limit(p_metric text, p_limit bigint, p_warning_percent integer default null, p_enabled boolean default null)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  if p_limit is null or p_limit <= 0 then raise exception 'limit must be positive' using errcode='22023'; end if;
  if p_warning_percent is not null and (p_warning_percent < 1 or p_warning_percent > 99) then raise exception 'invalid warning percent' using errcode='22023'; end if;
  update public.raye2_capacity_limits
     set limit_value = p_limit,
         warning_percent = coalesce(p_warning_percent, warning_percent),
         enabled = coalesce(p_enabled, enabled),
         updated_at = now()
   where metric = p_metric;
  if not found then raise exception 'unknown capacity metric' using errcode='22023'; end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'capacity_limit_set','capacity',p_metric,p_limit::text,jsonb_build_object('limit',p_limit,'warning_percent',p_warning_percent,'enabled',p_enabled));
end;
$$;
revoke all on function public.raye2_set_capacity_limit(text,bigint,integer,boolean) from public,anon;
grant execute on function public.raye2_set_capacity_limit(text,bigint,integer,boolean) to authenticated;

notify pgrst, 'reload schema';

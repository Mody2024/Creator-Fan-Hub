-- Raye2 Wave 9: telemetry for client errors, API latency and realtime quality.
--
-- Plan 13 requires telemetry for client errors, API latency, background jobs, media processing and
-- realtime quality. Nothing collected it, so the admin dashboards could only guess. This adds a
-- bounded, account-scoped event store with aggregated, percentile-aware reporting.

create table if not exists public.raye2_telemetry_events (
  id bigint generated always as identity primary key,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('client_error','api_latency','realtime_quality','media_playback','background_job')),
  surface text not null default '' check (char_length(surface) <= 120),
  severity text not null default 'info' check (severity in ('info','warning','error','critical')),
  message text not null default '' check (char_length(message) <= 500),
  duration_ms integer check (duration_ms is null or duration_ms between 0 and 3600000),
  metric numeric check (metric is null or metric between -1000000 and 1000000),
  context jsonb not null default '{}'::jsonb check (octet_length(context::text) <= 2048),
  created_at timestamptz not null default now()
);
create index if not exists raye2_telemetry_events_type_idx on public.raye2_telemetry_events(event_type,severity,created_at desc);
create index if not exists raye2_telemetry_events_created_idx on public.raye2_telemetry_events(created_at desc);
alter table public.raye2_telemetry_events enable row level security;
revoke all on public.raye2_telemetry_events from anon,authenticated;

-- 1. Record an event. Signed-in users record their own; the service role records system events.
create or replace function public.raye2_record_telemetry(
  p_event_type text,
  p_surface text default '',
  p_severity text default 'info',
  p_message text default '',
  p_duration_ms integer default null,
  p_metric numeric default null,
  p_context jsonb default '{}'::jsonb
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null and auth.role() is distinct from 'service_role' then
    raise exception 'sign in required' using errcode='42501';
  end if;
  if p_event_type not in ('client_error','api_latency','realtime_quality','media_playback','background_job') then
    raise exception 'invalid event type' using errcode='22023';
  end if;
  if p_severity not in ('info','warning','error','critical') then
    raise exception 'invalid severity' using errcode='22023';
  end if;
  if char_length(coalesce(p_surface,'')) > 120 or char_length(coalesce(p_message,'')) > 500 then
    raise exception 'telemetry field too long' using errcode='22023';
  end if;
  if p_duration_ms is not null and (p_duration_ms < 0 or p_duration_ms > 3600000) then
    raise exception 'invalid duration' using errcode='22023';
  end if;
  if octet_length(coalesce(p_context,'{}'::jsonb)::text) > 2048 then
    raise exception 'context too large' using errcode='22023';
  end if;
  insert into public.raye2_telemetry_events(user_id,event_type,surface,severity,message,duration_ms,metric,context)
  values(auth.uid(),p_event_type,coalesce(p_surface,''),p_severity,coalesce(p_message,''),p_duration_ms,p_metric,coalesce(p_context,'{}'::jsonb));
end;
$$;
revoke all on function public.raye2_record_telemetry(text,text,text,text,integer,numeric,jsonb) from public,anon;
grant execute on function public.raye2_record_telemetry(text,text,text,text,integer,numeric,jsonb) to authenticated,service_role;

-- 2. Platform-admin summary: counts by type/severity and API latency percentiles.
create or replace function public.raye2_get_telemetry_summary(p_hours integer default 24)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_hours integer := least(greatest(coalesce(p_hours,24),1),720); v jsonb;
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  select jsonb_build_object(
    'window_hours', v_hours,
    'by_type', coalesce((select jsonb_object_agg(t.event_type, t.n) from
      (select event_type, count(*) n from public.raye2_telemetry_events where created_at > now() - (v_hours || ' hours')::interval group by event_type) t), '{}'::jsonb),
    'by_severity', coalesce((select jsonb_object_agg(s.severity, s.n) from
      (select severity, count(*) n from public.raye2_telemetry_events where created_at > now() - (v_hours || ' hours')::interval group by severity) s), '{}'::jsonb),
    'errors', (select count(*) from public.raye2_telemetry_events where severity in ('error','critical') and created_at > now() - (v_hours || ' hours')::interval),
    'latency_p50_ms', (select round(percentile_cont(0.5) within group (order by duration_ms)) from public.raye2_telemetry_events where event_type = 'api_latency' and duration_ms is not null and created_at > now() - (v_hours || ' hours')::interval),
    'latency_p95_ms', (select round(percentile_cont(0.95) within group (order by duration_ms)) from public.raye2_telemetry_events where event_type = 'api_latency' and duration_ms is not null and created_at > now() - (v_hours || ' hours')::interval)
  ) into v;
  return v;
end;
$$;
revoke all on function public.raye2_get_telemetry_summary(integer) from public,anon;
grant execute on function public.raye2_get_telemetry_summary(integer) to authenticated;

-- 3. Recent events for the admin view.
create or replace function public.raye2_list_telemetry_events(p_limit integer default 50, p_event_type text default null, p_severity text default null)
returns table (event_id bigint, event_type text, surface text, severity text, message text, duration_ms integer, created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  if p_event_type is not null and p_event_type not in ('client_error','api_latency','realtime_quality','media_playback','background_job') then
    raise exception 'invalid event type' using errcode='22023';
  end if;
  if p_severity is not null and p_severity not in ('info','warning','error','critical') then
    raise exception 'invalid severity' using errcode='22023';
  end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit,50),1),200) as lim)
    select e.id, e.event_type, e.surface, e.severity, e.message, e.duration_ms, e.created_at
    from public.raye2_telemetry_events e
    cross join bounded b
    where (p_event_type is null or e.event_type = p_event_type)
      and (p_severity is null or e.severity = p_severity)
    order by e.created_at desc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_list_telemetry_events(integer,text,text) from public,anon;
grant execute on function public.raye2_list_telemetry_events(integer,text,text) to authenticated;

-- 4. Retention: prune events older than the window (admin).
create or replace function public.raye2_prune_telemetry(p_days integer default 30)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_days integer := least(greatest(coalesce(p_days,30),1),365); v_deleted integer;
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  delete from public.raye2_telemetry_events where created_at < now() - (v_days || ' days')::interval;
  get diagnostics v_deleted = row_count;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'telemetry_pruned','telemetry','retention',v_days || ' days', jsonb_build_object('deleted',v_deleted));
  return v_deleted;
end;
$$;
revoke all on function public.raye2_prune_telemetry(integer) from public,anon;
grant execute on function public.raye2_prune_telemetry(integer) to authenticated;

notify pgrst, 'reload schema';

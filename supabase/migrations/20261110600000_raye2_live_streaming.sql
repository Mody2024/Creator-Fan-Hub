-- Raye2 Wave 4: live streaming lifecycle, quotas, moderation and replay retention.
--
-- Plan 5 requires that only Streamer and Creator+Streamer roles start streams (Streamer 5/month, 2/week;
-- combined 3/month, 1/week), a 3-hour maximum duration (configurable), stream health/visibility/chat/
-- moderation, end-stream handling, and replay retention of 24 hours after the stream ends enforced
-- logically at the application layer with physical deletion queued separately.
--
-- This migration provides the server-authoritative lifecycle and quota enforcement that Wave 4 was
-- missing. Actual ingest/transcode/deliver must come from a real provider (plan 5: "OBS is a possible
-- broadcaster client, not the live backend"); nothing here fabricates viewer counts or provider state.

-- 0. Live rules. Duration and concurrency are capacity-dependent and stay configurable by Admin.
insert into public.raye2_platform_rules(rule_key,category,rule_value,status,description) values
 ('live.max_duration_seconds','content','10800'::jsonb,'active','Maximum live duration (3 hours); validate against provider/capacity.'),
 ('live.max_concurrent_streams','content','2'::jsonb,'active','Maximum concurrent live streams per streamer; validate against provider capacity.'),
 ('live.replay_retention_hours','retention','24'::jsonb,'active','Replay retention after the stream ends, enforced logically then deleted.')
on conflict (rule_key) do nothing;

-- 1. Live streams. provider fields stay null until a real provider is integrated; nothing is invented.
create table if not exists public.raye2_live_streams (
  id uuid primary key default gen_random_uuid(),
  streamer_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 140),
  description text not null default '' check (char_length(description) <= 1000),
  thumbnail_url text check (thumbnail_url is null or thumbnail_url ~ '^https?://'),
  visibility text not null default 'public' check (visibility in ('public','unlisted','private')),
  status text not null default 'scheduled' check (status in ('scheduled','live','ended','cancelled','moderated','replay','expired')),
  scheduled_start_at timestamptz,
  started_at timestamptz,
  ended_at timestamptz,
  replay_until timestamptz,
  max_duration_seconds integer not null check (max_duration_seconds between 60 and 43200),
  health text not null default 'unknown' check (health in ('unknown','connecting','good','degraded','reconnecting','offline')),
  health_detail text not null default '' check (char_length(health_detail) <= 300),
  ingest_url text check (ingest_url is null or ingest_url ~ '^https?://'),
  playback_url text check (playback_url is null or playback_url ~ '^https?://'),
  recording_path text,
  moderated_by uuid references auth.users(id) on delete set null,
  moderated_reason text not null default '' check (char_length(moderated_reason) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raye2_live_streams_streamer_idx on public.raye2_live_streams(streamer_id, created_at desc);
create index if not exists raye2_live_streams_live_idx on public.raye2_live_streams(visibility, created_at desc) where status = 'live';
create index if not exists raye2_live_streams_replay_idx on public.raye2_live_streams(replay_until) where status = 'replay';
alter table public.raye2_live_streams enable row level security;
revoke all on public.raye2_live_streams from anon,authenticated;

-- 2. Stream event log (health transitions, visibility changes, moderation, replay lifecycle).
create table if not exists public.raye2_live_stream_events (
  id bigint generated always as identity primary key,
  stream_id uuid not null references public.raye2_live_streams(id) on delete cascade,
  kind text not null check (kind in ('created','started','health','visibility','ended','replay_ready','replay_expired','moderated','cancelled')),
  detail jsonb not null default '{}'::jsonb,
  actor_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists raye2_live_stream_events_stream_idx on public.raye2_live_stream_events(stream_id, created_at desc);
alter table public.raye2_live_stream_events enable row level security;
revoke all on public.raye2_live_stream_events from anon,authenticated;

-- 3. Helpers.
create or replace function public.raye2_live_replay_retention_hours()
returns integer language sql stable security definer set search_path=''
as $$ select greatest(1, public.raye2_rule_int('live.replay_retention_hours', 24)); $$;
revoke all on function public.raye2_live_replay_retention_hours() from public,anon;
grant execute on function public.raye2_live_replay_retention_hours() to service_role;

-- Count of streams a user started inside a rolling window, from the authoritative table.
create or replace function public.raye2_live_streams_used(p_user_id uuid, p_window_seconds integer)
returns integer language sql stable security definer set search_path=''
as $$
  select count(*)::integer from public.raye2_live_streams s
  where s.streamer_id = p_user_id and s.started_at is not null
    and s.started_at > now() - make_interval(secs => p_window_seconds)
    and s.status <> 'cancelled';
$$;
revoke all on function public.raye2_live_streams_used(uuid,integer) from public,anon;
grant execute on function public.raye2_live_streams_used(uuid,integer) to service_role;

-- 4. Start a live stream. Server-authoritative: role permission + monthly/weekly quota + concurrency.
create or replace function public.raye2_start_live_stream(
  p_title text,
  p_description text default '',
  p_visibility text default 'public',
  p_thumbnail_url text default null,
  p_scheduled_start_at timestamptz default null
)
returns table (stream_id uuid, started_at timestamptz, max_duration_seconds integer)
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text; v_month_limit integer; v_week_limit integer;
  v_used_month integer; v_used_week integer; v_live integer; v_max_concurrent integer;
  v_max_duration integer; v_id uuid; v_started timestamptz;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_visibility not in ('public','unlisted','private') then raise exception 'invalid visibility' using errcode='22023'; end if;
  if char_length(btrim(coalesce(p_title,''))) < 1 or char_length(p_title) > 140 then raise exception 'title must be 1-140 characters' using errcode='22023'; end if;

  -- Serialize per streamer so concurrent starts cannot both pass the concurrency/quota checks.
  perform pg_advisory_xact_lock(hashtextextended('live:'||v_uid::text, 0));

  v_tier := public.raye2_creator_tier(v_uid);
  if not public.raye2_tier_allows(v_tier, 'start_stream') then
    raise exception 'only Streamer and Creator+Streamer roles can start live streams' using errcode='42501';
  end if;

  v_month_limit := public.raye2_role_quota(v_tier, 'streams_per_month');
  v_week_limit := public.raye2_role_quota(v_tier, 'streams_per_week');
  v_used_month := public.raye2_live_streams_used(v_uid, 2592000);
  v_used_week := public.raye2_live_streams_used(v_uid, 604800);
  if v_used_month >= v_month_limit then
    raise exception 'monthly stream quota reached (% of %)', v_used_month, v_month_limit using errcode='53100';
  end if;
  if v_used_week >= v_week_limit then
    raise exception 'weekly stream quota reached (% of %)', v_used_week, v_week_limit using errcode='53100';
  end if;

  v_max_concurrent := greatest(1, public.raye2_rule_int('live.max_concurrent_streams', 2));
  select count(*) into v_live from public.raye2_live_streams s where s.streamer_id = v_uid and s.status = 'live';
  if v_live >= v_max_concurrent then
    raise exception 'concurrent stream limit reached (% of %)', v_live, v_max_concurrent using errcode='53100';
  end if;

  v_max_duration := least(43200, greatest(60, public.raye2_rule_int('live.max_duration_seconds', 10800)));

  insert into public.raye2_live_streams(streamer_id,title,description,thumbnail_url,visibility,status,scheduled_start_at,started_at,max_duration_seconds)
  values (v_uid, btrim(p_title), coalesce(p_description,''), p_thumbnail_url, p_visibility, 'live', p_scheduled_start_at, now(), v_max_duration)
  returning id, raye2_live_streams.started_at into v_id, v_started;

  insert into public.raye2_live_stream_events(stream_id,kind,detail,actor_id)
  values (v_id,'started',jsonb_build_object('visibility',p_visibility,'max_duration_seconds',v_max_duration),v_uid);

  return query select v_id, v_started, v_max_duration;
end;
$$;
revoke all on function public.raye2_start_live_stream(text,text,text,text,timestamptz) from public,anon;
grant execute on function public.raye2_start_live_stream(text,text,text,text,timestamptz) to authenticated;

-- 5. Report connection/health state. Owner or trusted service role only.
create or replace function public.raye2_update_live_stream_health(p_stream_id uuid, p_health text, p_detail text default '')
returns void language plpgsql security definer set search_path=''
as $$
declare v_owner uuid;
begin
  if p_health not in ('unknown','connecting','good','degraded','reconnecting','offline') then
    raise exception 'invalid health state' using errcode='22023';
  end if;
  if char_length(coalesce(p_detail,'')) > 300 then raise exception 'detail too long' using errcode='22023'; end if;
  select streamer_id into v_owner from public.raye2_live_streams where id = p_stream_id for update;
  if v_owner is null then raise exception 'stream not found' using errcode='P0002'; end if;
  if not ((auth.uid() is not null and v_owner = auth.uid()) or auth.role() = 'service_role' or public.raye2_is_platform_admin()) then
    raise exception 'not permitted to report this stream' using errcode='42501';
  end if;
  update public.raye2_live_streams set health = p_health, health_detail = coalesce(p_detail,''), updated_at = now() where id = p_stream_id;
  insert into public.raye2_live_stream_events(stream_id,kind,detail,actor_id)
  values (p_stream_id,'health',jsonb_build_object('health',p_health,'detail',coalesce(p_detail,'')),auth.uid());
end;
$$;
revoke all on function public.raye2_update_live_stream_health(uuid,text,text) from public,anon;
grant execute on function public.raye2_update_live_stream_health(uuid,text,text) to authenticated;

-- 6. End a stream. Sets the logical replay window and queues physical deletion separately (plan 5).
create or replace function public.raye2_end_live_stream(p_stream_id uuid)
returns table (ended_at timestamptz, replay_until timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_owner uuid; v_status text; v_ended timestamptz; v_replay timestamptz; v_hours integer;
begin
  select streamer_id, status into v_owner, v_status from public.raye2_live_streams where id = p_stream_id for update;
  if v_owner is null then raise exception 'stream not found' using errcode='P0002'; end if;
  if not ((auth.uid() is not null and v_owner = auth.uid()) or public.raye2_is_platform_admin()) then
    raise exception 'not permitted to end this stream' using errcode='42501';
  end if;
  if v_status <> 'live' then raise exception 'only a live stream can be ended' using errcode='22023'; end if;

  v_hours := public.raye2_live_replay_retention_hours();
  v_ended := now();
  v_replay := v_ended + make_interval(hours => v_hours);
  update public.raye2_live_streams set status = 'replay', ended_at = v_ended, replay_until = v_replay, health = 'offline', updated_at = now()
   where id = p_stream_id;
  insert into public.raye2_live_stream_events(stream_id,kind,detail,actor_id)
  values (p_stream_id,'ended',jsonb_build_object('replay_until',v_replay,'retention_hours',v_hours),auth.uid());
  -- Queue physical deletion at the replay deadline; skip if one is already queued for this stream
  -- (the idempotency index is partial, so a plain ON CONFLICT cannot target it).
  insert into public.raye2_background_jobs(kind,payload,run_at,idempotency_key,created_by)
  select 'live.replay_cleanup', jsonb_build_object('stream_id',p_stream_id), v_replay, 'live_replay:'||p_stream_id::text, auth.uid()
  where not exists (select 1 from public.raye2_background_jobs j where j.idempotency_key = 'live_replay:'||p_stream_id::text);
  return query select v_ended, v_replay;
end;
$$;
revoke all on function public.raye2_end_live_stream(uuid) from public,anon;
grant execute on function public.raye2_end_live_stream(uuid) to authenticated;

-- 7. Change visibility. Owner or admin.
create or replace function public.raye2_set_live_stream_visibility(p_stream_id uuid, p_visibility text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_owner uuid;
begin
  if p_visibility not in ('public','unlisted','private') then raise exception 'invalid visibility' using errcode='22023'; end if;
  select streamer_id into v_owner from public.raye2_live_streams where id = p_stream_id for update;
  if v_owner is null then raise exception 'stream not found' using errcode='P0002'; end if;
  if not ((auth.uid() is not null and v_owner = auth.uid()) or public.raye2_is_platform_admin()) then
    raise exception 'not permitted to change this stream' using errcode='42501';
  end if;
  update public.raye2_live_streams set visibility = p_visibility, updated_at = now() where id = p_stream_id;
  insert into public.raye2_live_stream_events(stream_id,kind,detail,actor_id)
  values (p_stream_id,'visibility',jsonb_build_object('visibility',p_visibility),auth.uid());
end;
$$;
revoke all on function public.raye2_set_live_stream_visibility(uuid,text) from public,anon;
grant execute on function public.raye2_set_live_stream_visibility(uuid,text) to authenticated;

-- 8. Moderation: end or hide a stream with a reason. Admin/moderator; audited.
create or replace function public.raye2_moderate_live_stream(p_stream_id uuid, p_action text, p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_exists boolean;
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  if p_action not in ('end','hide') then raise exception 'invalid moderation action' using errcode='22023'; end if;
  if char_length(btrim(coalesce(p_reason,''))) < 3 then raise exception 'a reason is required' using errcode='22023'; end if;
  select true into v_exists from public.raye2_live_streams where id = p_stream_id for update;
  if not found then raise exception 'stream not found' using errcode='P0002'; end if;

  if p_action = 'end' then
    update public.raye2_live_streams set status = 'moderated', ended_at = now(), health = 'offline',
      moderated_by = auth.uid(), moderated_reason = btrim(p_reason), updated_at = now() where id = p_stream_id;
  else
    update public.raye2_live_streams set visibility = 'private', moderated_by = auth.uid(),
      moderated_reason = btrim(p_reason), updated_at = now() where id = p_stream_id;
  end if;
  insert into public.raye2_live_stream_events(stream_id,kind,detail,actor_id)
  values (p_stream_id,'moderated',jsonb_build_object('action',p_action,'reason',btrim(p_reason)),auth.uid());
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values (auth.uid(),'live_stream_'||p_action,'live_stream',p_stream_id::text,btrim(p_reason),jsonb_build_object('action',p_action));
end;
$$;
revoke all on function public.raye2_moderate_live_stream(uuid,text,text) from public,anon;
grant execute on function public.raye2_moderate_live_stream(uuid,text,text) to authenticated;

-- 9. Owner's own streams (any status).
create or replace function public.raye2_get_my_live_streams(p_limit integer default 40)
returns table (id uuid, title text, status text, visibility text, health text, started_at timestamptz, ended_at timestamptz, replay_until timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  return query
    select s.id, s.title, s.status, s.visibility, s.health, s.started_at, s.ended_at, s.replay_until, s.created_at
    from public.raye2_live_streams s
    where s.streamer_id = auth.uid()
    order by s.created_at desc
    limit least(greatest(coalesce(p_limit,40),1),100);
end;
$$;
revoke all on function public.raye2_get_my_live_streams(integer) from public,anon;
grant execute on function public.raye2_get_my_live_streams(integer) to authenticated;

-- 10. Public listing: currently live and public, plus public replays still within their window.
create or replace function public.raye2_list_live_streams(p_limit integer default 40)
returns table (id uuid, title text, streamer_id uuid, status text, health text, playback_url text, started_at timestamptz, replay_until timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
  return query
    select s.id, s.title, s.streamer_id, s.status, s.health, s.playback_url, s.started_at, s.replay_until
    from public.raye2_live_streams s
    where s.visibility = 'public'
      and (s.status = 'live' or (s.status = 'replay' and s.replay_until > now()))
    order by (s.status = 'live') desc, s.started_at desc nulls last
    limit least(greatest(coalesce(p_limit,40),1),100);
end;
$$;
revoke all on function public.raye2_list_live_streams(integer) from public,anon;
grant execute on function public.raye2_list_live_streams(integer) to authenticated, anon;

-- 11. Single stream: public if live/public or within replay window; owner and admin always.
create or replace function public.raye2_get_live_stream(p_stream_id uuid)
returns table (id uuid, title text, description text, streamer_id uuid, status text, visibility text, health text, health_detail text, playback_url text, started_at timestamptz, ended_at timestamptz, replay_until timestamptz, max_duration_seconds integer)
language plpgsql stable security definer set search_path=''
as $$
declare v_owner uuid; v_visibility text; v_status text; v_replay timestamptz; v_admin boolean;
begin
  select s.streamer_id, s.visibility, s.status, s.replay_until into v_owner, v_visibility, v_status, v_replay
   from public.raye2_live_streams s where s.id = p_stream_id;
  if v_owner is null then raise exception 'stream not found' using errcode='P0002'; end if;
  v_admin := public.raye2_is_platform_admin();
  if not (v_admin or (auth.uid() is not null and v_owner = auth.uid())
          or (v_visibility = 'public' and (v_status = 'live' or (v_status = 'replay' and v_replay > now())))) then
    raise exception 'stream not available' using errcode='42501';
  end if;
  return query
    select s.id, s.title, s.description, s.streamer_id, s.status, s.visibility, s.health, s.health_detail,
           s.playback_url, s.started_at, s.ended_at, s.replay_until, s.max_duration_seconds
    from public.raye2_live_streams s where s.id = p_stream_id;
end;
$$;
revoke all on function public.raye2_get_live_stream(uuid) from public,anon;
grant execute on function public.raye2_get_live_stream(uuid) to authenticated;

-- 12. Enforce replay expiry logically. Admin or trusted service role (also a background job target).
create or replace function public.raye2_expire_live_replays()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer := 0;
begin
  if not (public.raye2_is_platform_admin() or auth.role() = 'service_role') then
    raise exception 'platform admin access required' using errcode='42501';
  end if;
  with expired as (
    update public.raye2_live_streams set status = 'expired', updated_at = now()
     where status = 'replay' and replay_until <= now()
    returning id
  )
  insert into public.raye2_live_stream_events(stream_id,kind,detail)
  select id,'replay_expired','{}'::jsonb from expired;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke all on function public.raye2_expire_live_replays() from public,anon;
grant execute on function public.raye2_expire_live_replays() to authenticated;

-- 13. Operational overview for the admin dashboard.
create or replace function public.raye2_get_live_admin_overview()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  return jsonb_build_object(
    'live', (select count(*) from public.raye2_live_streams where status = 'live'),
    'replay', (select count(*) from public.raye2_live_streams where status = 'replay' and replay_until > now()),
    'moderated', (select count(*) from public.raye2_live_streams where status = 'moderated'),
    'degraded', (select count(*) from public.raye2_live_streams where status = 'live' and health in ('degraded','reconnecting','offline')),
    'replay_retention_hours', public.raye2_live_replay_retention_hours(),
    'max_duration_seconds', public.raye2_rule_int('live.max_duration_seconds', 10800),
    'max_concurrent_streams', public.raye2_rule_int('live.max_concurrent_streams', 2)
  );
end;
$$;
revoke all on function public.raye2_get_live_admin_overview() from public,anon;
grant execute on function public.raye2_get_live_admin_overview() to authenticated;

notify pgrst, 'reload schema';

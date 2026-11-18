-- Raye2 storage allowances and owner control (additive to the provider control plane).
-- Provides generous monthly per-role allowances that reset, fixes the managed-bucket allow-list
-- for the live upload path, and exposes owner/admin control over allowances and providers.
-- Provider credentials stay server-only environment secrets; nothing here stores a secret.

-- 1. Canonical managed-bucket set. Kept as an immutable function so triggers and audits agree.
create or replace function public.raye2_managed_buckets()
returns text[] language sql immutable set search_path=''
as $$ select array['creator-media-private','creator-media-public','nhen-community-shorts','raye2-community-shorts','raye2-minis','raye2-clips']::text[] $$;
revoke all on function public.raye2_managed_buckets() from public, anon;
grant execute on function public.raye2_managed_buckets() to authenticated, service_role;

-- 2. Fix the reservation bucket allow-list. Member uploads to raye2-* buckets were rejected here.
alter table public.nhen_media_upload_reservations
  drop constraint if exists nhen_media_upload_reservations_bucket_id_check;
alter table public.nhen_media_upload_reservations
  add constraint nhen_media_upload_reservations_bucket_id_check
    check (bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts','raye2-community-shorts','raye2-minis','raye2-clips'));

-- 3. Monthly allowances by role tier, with a per-account override table. Values are generous and reset
--    each month; the true ceiling remains the platform pool (Supabase free plus connected providers).
create table if not exists public.raye2_storage_allowances (
  role_key text primary key check (role_key in ('user','creator','streamer','combined','owner')),
  monthly_bytes bigint not null check (monthly_bytes >= 0),
  max_file_bytes bigint not null default 52428800 check (max_file_bytes between 1 and 5368709120),
  period_days integer not null default 30 check (period_days between 1 and 366),
  reset_day integer not null default 1 check (reset_day between 1 and 28),
  description text not null default '',
  updated_at timestamptz not null default now()
);
insert into public.raye2_storage_allowances(role_key,monthly_bytes,max_file_bytes,period_days,reset_day,description)
values
  ('user',     2147483648,52428800,30,1,'Every member: Mini''s, clips, Moments and shared memories.'),
  ('creator',  8589934592,52428800,30,1,'Creators: long videos, exclusives, thumbnails and Mini''s.'),
  ('streamer', 8589934592,52428800,30,1,'Streamers: live streams, replays and Mini''s.'),
  ('combined', 12884901888,52428800,30,1,'Combined creator+streamer: not the sum of both roles.'),
  ('owner',   21474836480,52428800,30,1,'Platform owner: highest allowance for platform assets.')
on conflict(role_key) do nothing;

create table if not exists public.raye2_storage_allowance_overrides (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  monthly_bytes bigint not null check (monthly_bytes >= 0),
  max_file_bytes bigint check (max_file_bytes is null or max_file_bytes between 1 and 5368709120),
  note text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

-- 4. Platform ceiling and reset configuration (single row, tunable by the owner).
create table if not exists public.raye2_storage_settings (
  settings_key text primary key,
  value_numeric bigint not null check (value_numeric >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.raye2_storage_settings(settings_key,value_numeric)
values ('platform_ceiling_bytes',786432000)  -- 750 MiB safety ceiling under Supabase Free's 1 GiB
on conflict(settings_key) do nothing;

alter table public.raye2_storage_allowances enable row level security;
alter table public.raye2_storage_allowance_overrides enable row level security;
alter table public.raye2_storage_settings enable row level security;
revoke all on public.raye2_storage_allowances from anon, authenticated;
revoke all on public.raye2_storage_allowance_overrides from anon, authenticated;
revoke all on public.raye2_storage_settings from anon, authenticated;
grant all on public.raye2_storage_allowances to service_role;
grant all on public.raye2_storage_allowance_overrides to service_role;
grant all on public.raye2_storage_settings to service_role;

-- 5. Resolve a user's allowance: per-account override wins, else their role tier.
create or replace function public.raye2_storage_allowance_for(p_user_id uuid)
returns table(role_key text, monthly_bytes bigint, max_file_bytes bigint, period_days integer, reset_day integer, is_override boolean)
language plpgsql stable security definer set search_path=''
as $$
declare
  v_tier text;
  v_role text;
  v_override public.raye2_storage_allowance_overrides%rowtype;
  v_row public.raye2_storage_allowances%rowtype;
begin
  if p_user_id is null then
    raise exception 'a user id is required' using errcode='22023';
  end if;
  v_tier := public.raye2_creator_tier(p_user_id);
  v_role := case v_tier when 'combined' then 'owner' when 'creator' then 'creator' when 'streamer' then 'streamer' else 'user' end;
  select * into v_row from public.raye2_storage_allowances where raye2_storage_allowances.role_key=v_role;
  if not found then
    select * into v_row from public.raye2_storage_allowances where raye2_storage_allowances.role_key='user';
  end if;
  select * into v_override from public.raye2_storage_allowance_overrides where owner_id=p_user_id;
  if found then
    return query select v_role, v_override.monthly_bytes,
      coalesce(v_override.max_file_bytes, v_row.max_file_bytes),
      v_row.period_days, v_row.reset_day, true;
  end if;
  return query select v_role, v_row.monthly_bytes, v_row.max_file_bytes, v_row.period_days, v_row.reset_day, false;
end;
$$;
revoke all on function public.raye2_storage_allowance_for(uuid) from public, anon;
grant execute on function public.raye2_storage_allowance_for(uuid) to authenticated, service_role;

-- 6. Bytes a user has stored this period, from storage.objects metadata (provider-agnostic for Supabase).
create or replace function public.raye2_storage_period_used(p_user_id uuid, p_period_start timestamptz)
returns bigint language sql stable security definer set search_path=''
as $$
  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0)
  from storage.objects o
  where o.bucket_id = any(public.raye2_managed_buckets())
    and o.owner_id = p_user_id::text
    and o.created_at >= p_period_start;
$$;
revoke all on function public.raye2_storage_period_used(uuid,timestamptz) from public, anon;
grant execute on function public.raye2_storage_period_used(uuid,timestamptz) to service_role;

-- 7. My storage status, for any signed-in account: plan, period usage and reset date.
create or replace function public.raye2_my_storage_status()
returns table(role_key text, allowance_bytes bigint, max_file_bytes bigint, used_bytes bigint, reserved_bytes bigint,
              available_bytes bigint, usage_percent numeric, period_start timestamptz, period_end timestamptz, is_override boolean)
language plpgsql stable security definer set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_plan record;
  v_period_start timestamptz;
  v_period_end timestamptz;
  v_used bigint;
  v_reserved bigint;
begin
  if v_user is null then raise exception 'sign in required' using errcode='42501'; end if;
  select * into v_plan from public.raye2_storage_allowance_for(v_user);
  v_period_start := date_trunc('month', now()) + make_interval(days => v_plan.reset_day - 1);
  if v_period_start > now() then
    v_period_start := v_period_start - make_interval(days => v_plan.period_days);
  end if;
  v_period_end := v_period_start + make_interval(days => v_plan.period_days);
  v_used := public.raye2_storage_period_used(v_user, v_period_start);
  select coalesce(sum(r.expected_bytes),0) into v_reserved
    from public.nhen_media_upload_reservations r where r.user_id=v_user and r.expires_at>now();
  return query select v_plan.role_key, v_plan.monthly_bytes, v_plan.max_file_bytes, v_used, v_reserved,
    greatest(0, v_plan.monthly_bytes - v_used - v_reserved),
    round((v_used+v_reserved)::numeric*100/greatest(1,v_plan.monthly_bytes),1),
    v_period_start, v_period_end, v_plan.is_override;
end;
$$;
revoke all on function public.raye2_my_storage_status() from public, anon;
grant execute on function public.raye2_my_storage_status() to authenticated;

-- 8. Redefine the live reservation RPC: allow the raye2-* buckets and enforce the monthly allowance
--    in addition to the legacy project ceiling. Both must pass.
create or replace function public.reserve_nhen_media_upload(p_bytes bigint, p_bucket text)
returns table(reservation_id uuid, used_bytes bigint, reserved_bytes bigint, quota_bytes bigint, available_bytes bigint)
language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_plan record;
  v_period_start timestamptz;
  v_period_used bigint;
  v_reserved bigint;
  v_project_used bigint;
  v_ceiling bigint;
  v_id uuid;
begin
  if v_user is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_bytes is null or p_bytes < 1 or p_bytes > 52428800 then raise exception 'file must be between 1 byte and 50 MiB' using errcode='22023'; end if;
  if not (p_bucket = any(public.raye2_managed_buckets())) then raise exception 'unsupported Raye2 media bucket' using errcode='22023'; end if;
  if p_bucket in ('creator-media-private','creator-media-public') and not public.is_nhen_video_publisher() then
    raise exception 'assigned creator access required' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-quota:' || v_user::text, 0));
  delete from public.nhen_media_upload_reservations where expires_at <= now();

  -- Per-user monthly allowance (generous, resets each period).
  select * into v_plan from public.raye2_storage_allowance_for(v_user);
  if p_bytes > v_plan.max_file_bytes then
    raise exception 'file exceeds your per-file limit of % bytes', v_plan.max_file_bytes using errcode='22023';
  end if;
  v_period_start := date_trunc('month', now()) + make_interval(days => v_plan.reset_day - 1);
  if v_period_start > now() then v_period_start := v_period_start - make_interval(days => v_plan.period_days); end if;
  v_period_used := public.raye2_storage_period_used(v_user, v_period_start);
  select coalesce(sum(r.expected_bytes),0) into v_reserved
    from public.nhen_media_upload_reservations r where r.user_id=v_user and r.expires_at>now();
  if v_period_used + v_reserved + p_bytes > v_plan.monthly_bytes then
    raise exception 'monthly storage allowance reached. You have used % of % bytes this period; it resets on the next period.', v_period_used + v_reserved, v_plan.monthly_bytes using errcode='53100';
  end if;

  -- Platform ceiling: the Supabase free pool until extra providers are connected and raised by an owner.
  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0)
    into v_project_used from storage.objects o where o.bucket_id = any(public.raye2_managed_buckets());
  select value_numeric into v_ceiling from public.raye2_storage_settings where settings_key='platform_ceiling_bytes';
  v_ceiling := coalesce(v_ceiling, 786432000);
  if v_project_used + v_reserved + p_bytes > v_ceiling then
    raise exception 'platform storage is temporarily full. Existing files use % bytes; uploads resume when temporary media expires or an owner connects more free storage.', v_project_used using errcode='53100';
  end if;

  insert into public.nhen_media_upload_reservations(user_id,bucket_id,expected_bytes) values(v_user,p_bucket,p_bytes) returning id into v_id;
  return query select v_id, v_period_used, v_reserved, v_plan.monthly_bytes,
    greatest(0, least(v_plan.monthly_bytes, v_ceiling - v_project_used - v_reserved) - v_period_used - p_bytes);
end;
$$;
revoke all on function public.reserve_nhen_media_upload(bigint,text) from public, anon;
grant execute on function public.reserve_nhen_media_upload(bigint,text) to authenticated;

-- 9. Redefine the enforcement trigger to use the canonical bucket set.
create or replace function public.enforce_nhen_storage_upload_reservation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_bytes bigint;
  v_consumed_id uuid;
begin
  if not (new.bucket_id = any(public.raye2_managed_buckets())) then return new; end if;
  if v_user is null then raise exception 'authenticated Raye2 upload reservation required' using errcode='42501'; end if;
  if coalesce(new.metadata->>'size','') !~ '^[0-9]+$' then raise exception 'Raye2 upload size metadata is required' using errcode='22023'; end if;
  v_bytes := (new.metadata->>'size')::bigint;
  delete from public.nhen_media_upload_reservations r
  where r.id=(
    select candidate.id from public.nhen_media_upload_reservations candidate
    where candidate.user_id=v_user and candidate.bucket_id=new.bucket_id
      and candidate.expected_bytes=v_bytes and candidate.expires_at>now()
    order by candidate.created_at for update skip locked limit 1
  )
  returning r.id into v_consumed_id;
  if v_consumed_id is null then raise exception 'Raye2 upload reservation is missing, expired, or already used for this file' using errcode='53100'; end if;
  return new;
end;
$$;
revoke all on function public.enforce_nhen_storage_upload_reservation() from public, anon, authenticated;
grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated;

-- 10. Keep the creator capacity read-out aligned with the managed bucket set.
create or replace function public.get_nhen_storage_capacity()
returns table(used_bytes bigint, reserved_bytes bigint, quota_bytes bigint, available_bytes bigint, usage_percent numeric)
language plpgsql stable security definer set search_path=''
as $$
declare v_used bigint; v_reserved bigint; v_quota bigint;
begin
  if auth.uid() is null or not public.is_nhen_video_publisher() then raise exception 'creator access required' using errcode='42501'; end if;
  select value_numeric into v_quota from public.raye2_storage_settings where settings_key='platform_ceiling_bytes';
  v_quota := coalesce(v_quota, 786432000);
  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0)
    into v_used from storage.objects o where o.bucket_id = any(public.raye2_managed_buckets());
  select coalesce(sum(r.expected_bytes),0) into v_reserved from public.nhen_media_upload_reservations r where r.expires_at>now();
  return query select v_used, v_reserved, v_quota, greatest(0, v_quota - v_used - v_reserved),
    round((v_used+v_reserved)::numeric*100/greatest(1,v_quota),1);
end;
$$;
revoke all on function public.get_nhen_storage_capacity() from public, anon;
grant execute on function public.get_nhen_storage_capacity() to authenticated;

-- 11. Owner/admin control plane. All writes require an active owner/admin and are audit-logged.
create or replace function public.raye2_storage_admin_overview()
returns table(section text, key text, label text, value_numeric bigint, value_text text, enabled boolean, detail text)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then raise exception 'owner or admin required' using errcode='42501'; end if;
  return query
    select 'provider'::text, p.provider_id, p.provider_id, p.capacity_bytes,
           p.health, p.enabled,
           format('priority %s · used %s · reserved %s · verified %s', p.priority, p.used_bytes, p.reserved_bytes,
                  coalesce(to_char(p.capacity_verified_at,'YYYY-MM-DD HH24:MI'),'never'))
    from public.raye2_storage_providers p
    order by p.priority;
  return query
    select 'allowance'::text, a.role_key, a.role_key, a.monthly_bytes, a.description, true,
           format('max file %s bytes · resets every %s days on day %s', a.max_file_bytes, a.period_days, a.reset_day)
    from public.raye2_storage_allowances a
    order by a.monthly_bytes desc;
  return query
    select 'override'::text, o.owner_id::text, coalesce(pr.handle, o.owner_id::text), o.monthly_bytes,
           coalesce(o.note,''), true, format('max file %s', coalesce(o.max_file_bytes::text,'role default'))
    from public.raye2_storage_allowance_overrides o
    left join public.member_profiles pr on pr.user_id = o.owner_id
    order by o.updated_at desc
    limit 100;
  return query
    select 'setting'::text, s.settings_key, s.settings_key, s.value_numeric, null, true,
           coalesce(to_char(s.updated_at,'YYYY-MM-DD HH24:MI'),'')
    from public.raye2_storage_settings s
    order by s.settings_key;
end;
$$;
revoke all on function public.raye2_storage_admin_overview() from public, anon;
grant execute on function public.raye2_storage_admin_overview() to authenticated;

create or replace function public.raye2_set_storage_allowance(p_role_key text, p_monthly_bytes bigint, p_max_file_bytes bigint, p_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.raye2_is_platform_admin() then raise exception 'owner or admin required' using errcode='42501'; end if;
  if p_role_key not in ('user','creator','streamer','combined','owner') then raise exception 'unknown role' using errcode='22023'; end if;
  if p_monthly_bytes is null or p_monthly_bytes < 0 then raise exception 'invalid monthly allowance' using errcode='22023'; end if;
  if p_max_file_bytes is null or p_max_file_bytes < 1 or p_max_file_bytes > 5368709120 then raise exception 'invalid per-file limit' using errcode='22023'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'a reason is required' using errcode='22023'; end if;
  update public.raye2_storage_allowances
    set monthly_bytes=p_monthly_bytes, max_file_bytes=p_max_file_bytes, updated_at=now()
    where role_key=p_role_key;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values (v_actor,'storage.allowance.update','storage_allowance',p_role_key,p_reason,
            jsonb_build_object('monthly_bytes',p_monthly_bytes,'max_file_bytes',p_max_file_bytes));
  return true;
end;
$$;
revoke all on function public.raye2_set_storage_allowance(text,bigint,bigint,text) from public, anon;
grant execute on function public.raye2_set_storage_allowance(text,bigint,bigint,text) to authenticated;

create or replace function public.raye2_set_storage_allowance_override(p_owner_id uuid, p_monthly_bytes bigint, p_max_file_bytes bigint, p_note text, p_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.raye2_is_platform_admin() then raise exception 'owner or admin required' using errcode='42501'; end if;
  if p_owner_id is null then raise exception 'a target account is required' using errcode='22023'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'a reason is required' using errcode='22023'; end if;
  if p_monthly_bytes is null or p_monthly_bytes < 0 then raise exception 'invalid monthly allowance' using errcode='22023'; end if;
  if p_max_file_bytes is not null and (p_max_file_bytes < 1 or p_max_file_bytes > 5368709120) then raise exception 'invalid per-file limit' using errcode='22023'; end if;
  insert into public.raye2_storage_allowance_overrides(owner_id,monthly_bytes,max_file_bytes,note,updated_by,updated_at)
    values (p_owner_id,p_monthly_bytes,p_max_file_bytes,coalesce(p_note,''),v_actor,now())
    on conflict(owner_id) do update
      set monthly_bytes=excluded.monthly_bytes, max_file_bytes=excluded.max_file_bytes,
          note=excluded.note, updated_by=excluded.updated_by, updated_at=now();
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values (v_actor,'storage.allowance.override','storage_allowance_override',p_owner_id::text,p_reason,
            jsonb_build_object('monthly_bytes',p_monthly_bytes,'max_file_bytes',p_max_file_bytes));
  return true;
end;
$$;
revoke all on function public.raye2_set_storage_allowance_override(uuid,bigint,bigint,text,text) from public, anon;
grant execute on function public.raye2_set_storage_allowance_override(uuid,bigint,bigint,text,text) to authenticated;

create or replace function public.raye2_clear_storage_allowance_override(p_owner_id uuid, p_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.raye2_is_platform_admin() then raise exception 'owner or admin required' using errcode='42501'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'a reason is required' using errcode='22023'; end if;
  delete from public.raye2_storage_allowance_overrides where owner_id=p_owner_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values (v_actor,'storage.allowance.override.clear','storage_allowance_override',p_owner_id::text,p_reason,'{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.raye2_clear_storage_allowance_override(uuid,text) from public, anon;
grant execute on function public.raye2_clear_storage_allowance_override(uuid,text) to authenticated;

create or replace function public.raye2_set_storage_provider(p_provider_id text, p_enabled boolean, p_priority integer, p_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.raye2_is_platform_admin() then raise exception 'owner or admin required' using errcode='42501'; end if;
  if p_provider_id not in ('supabase','cloudflare_r2','backblaze_b2') then raise exception 'unknown provider' using errcode='22023'; end if;
  if p_priority is null or p_priority < 0 or p_priority > 10000 then raise exception 'invalid priority' using errcode='22023'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'a reason is required' using errcode='22023'; end if;
  update public.raye2_storage_providers
    set enabled=p_enabled, priority=p_priority, updated_at=now()
    where provider_id=p_provider_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values (v_actor,'storage.provider.update','storage_provider',p_provider_id,p_reason,
            jsonb_build_object('enabled',p_enabled,'priority',p_priority));
  return true;
end;
$$;
revoke all on function public.raye2_set_storage_provider(text,boolean,integer,text) from public, anon;
grant execute on function public.raye2_set_storage_provider(text,boolean,integer,text) to authenticated;

create or replace function public.raye2_set_storage_ceiling(p_ceiling_bytes bigint, p_reason text)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_actor uuid := auth.uid();
begin
  if not public.raye2_is_platform_admin() then raise exception 'owner or admin required' using errcode='42501'; end if;
  if p_ceiling_bytes is null or p_ceiling_bytes < 0 then raise exception 'invalid ceiling' using errcode='22023'; end if;
  if coalesce(btrim(p_reason),'') = '' then raise exception 'a reason is required' using errcode='22023'; end if;
  insert into public.raye2_storage_settings(settings_key,value_numeric,updated_by,updated_at)
    values ('platform_ceiling_bytes',p_ceiling_bytes,v_actor,now())
    on conflict(settings_key) do update set value_numeric=excluded.value_numeric, updated_by=excluded.updated_by, updated_at=now();
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values (v_actor,'storage.ceiling.update','storage_setting','platform_ceiling_bytes',p_reason,
            jsonb_build_object('ceiling_bytes',p_ceiling_bytes));
  return true;
end;
$$;
revoke all on function public.raye2_set_storage_ceiling(bigint,text) from public, anon;
grant execute on function public.raye2_set_storage_ceiling(bigint,text) to authenticated;

notify pgrst, 'reload schema';

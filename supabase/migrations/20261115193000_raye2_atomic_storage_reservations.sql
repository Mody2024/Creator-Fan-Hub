-- Atomic, service-only storage reservations and verified object accounting.
-- Provider credentials and signed URL creation remain in the application server.
-- This migration is intentionally pending; do not apply to production before isolated validation.

create table if not exists public.raye2_storage_role_quotas (
  role_key text not null check (role_key ~ '^[a-z][a-z0-9_-]{0,63}$'),
  asset_class text not null check (asset_class in ('video','mini','moment','stream_replay','thumbnail','chat_attachment','voice_recording','memory','other')),
  quota_bytes bigint not null check (quota_bytes >= 0),
  updated_at timestamptz not null default now(),
  primary key(role_key,asset_class)
);
alter table public.raye2_storage_role_quotas enable row level security;
revoke all on public.raye2_storage_role_quotas from anon, authenticated;
grant all on public.raye2_storage_role_quotas to service_role;

create or replace function public.raye2_reserve_storage(
  p_owner_id uuid,
  p_provider_id text,
  p_asset_class text,
  p_role_key text,
  p_expected_bytes bigint,
  p_idempotency_key text,
  p_expires_in_seconds integer default 3600
)
returns table(reservation_id uuid, provider_id text, available_provider_bytes bigint, available_user_bytes bigint)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_provider public.raye2_storage_providers%rowtype;
  v_existing public.raye2_storage_reservations%rowtype;
  v_provider_used bigint;
  v_provider_reserved bigint;
  v_user_used bigint;
  v_user_reserved bigint;
  v_user_quota bigint;
  v_provider_limit bigint;
  v_provider_available bigint;
  v_user_available bigint;
  v_reservation_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_owner_id is null
    or p_provider_id not in ('supabase','cloudflare_r2','backblaze_b2')
    or p_asset_class not in ('video','mini','moment','stream_replay','thumbnail','chat_attachment','voice_recording','memory','other')
    or p_role_key !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_expected_bytes is null or p_expected_bytes < 1 or p_expected_bytes > 5368709120
    or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200
    or p_expires_in_seconds not between 60 and 86400 then
    raise exception 'invalid storage reservation request' using errcode='22023';
  end if;

  -- Serialize a user's quota across all providers and serialize each provider's
  -- global capacity across all owners. The stable lock order avoids deadlocks.
  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-owner:' || p_owner_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-provider:' || p_provider_id,0));

  select * into v_existing
  from public.raye2_storage_reservations
  where idempotency_key=p_idempotency_key
  for update;
  if found then
    if v_existing.owner_id<>p_owner_id
      or v_existing.provider_id<>p_provider_id
      or v_existing.asset_class<>p_asset_class
      or v_existing.expected_bytes<>p_expected_bytes then
      raise exception 'idempotency key already used for a different storage reservation' using errcode='23505';
    end if;
    if v_existing.reservation_state='active' and v_existing.expires_at>now() then
      select * into v_provider from public.raye2_storage_providers where provider_id=p_provider_id;
      return query select v_existing.reservation_id,p_provider_id,
        greatest(0,coalesce(v_provider.capacity_bytes,0)-coalesce(v_provider.used_bytes,0)-coalesce(v_provider.reserved_bytes,0)-coalesce(v_provider.safety_reserve_bytes,0)),
        0::bigint;
      return;
    end if;
    raise exception 'reservation idempotency key has already been finalized or expired' using errcode='55000';
  end if;

  select * into v_provider
  from public.raye2_storage_providers
  where provider_id=p_provider_id
  for update;
  if not found or not v_provider.enabled or v_provider.health<>'healthy'
    or v_provider.capacity_verified_at is null
    or v_provider.capacity_verified_at < now()-interval '15 minutes' then
    raise exception 'storage provider is disabled, unhealthy, or has stale capacity data' using errcode='55000';
  end if;

  select coalesce(sum(size_bytes),0) into v_provider_used
  from public.raye2_storage_objects
  where provider_id=p_provider_id and object_state in ('staged','verified','active','orphan_candidate');
  select coalesce(sum(expected_bytes),0) into v_provider_reserved
  from public.raye2_storage_reservations
  where provider_id=p_provider_id and reservation_state='active' and expires_at>now();

  v_provider_limit := least(v_provider.capacity_bytes,
    coalesce(v_provider.max_managed_bytes,v_provider.capacity_bytes));
  v_provider_available := greatest(0,v_provider_limit-v_provider_used-v_provider_reserved-v_provider.safety_reserve_bytes);
  if p_expected_bytes>v_provider_available then
    raise exception 'provider safe storage capacity exhausted' using errcode='53100';
  end if;

  select quota_bytes into v_user_quota
  from public.raye2_storage_user_quotas
  where owner_id=p_owner_id and asset_class=p_asset_class;
  if v_user_quota is null then
    select quota_bytes into v_user_quota
    from public.raye2_storage_role_quotas
    where role_key=p_role_key and asset_class=p_asset_class;
  end if;
  if v_user_quota is null then
    raise exception 'no storage quota policy is configured for this account and asset class' using errcode='55000';
  end if;

  select coalesce(sum(size_bytes),0) into v_user_used
  from public.raye2_storage_objects
  where owner_id=p_owner_id and asset_class=p_asset_class
    and object_state in ('staged','verified','active','orphan_candidate');
  select coalesce(sum(expected_bytes),0) into v_user_reserved
  from public.raye2_storage_reservations
  where owner_id=p_owner_id and asset_class=p_asset_class
    and reservation_state='active' and expires_at>now();
  v_user_available := greatest(0,v_user_quota-v_user_used-v_user_reserved);
  if p_expected_bytes>v_user_available then
    raise exception 'user storage quota exhausted' using errcode='53100';
  end if;

  insert into public.raye2_storage_reservations(
    idempotency_key,owner_id,provider_id,asset_class,expected_bytes,expires_at
  ) values (
    p_idempotency_key,p_owner_id,p_provider_id,p_asset_class,p_expected_bytes,
    now()+make_interval(secs=>p_expires_in_seconds)
  ) returning public.raye2_storage_reservations.reservation_id into v_reservation_id;

  update public.raye2_storage_providers
  set reserved_bytes=v_provider_reserved+p_expected_bytes,updated_at=now()
  where provider_id=p_provider_id;

  return query select v_reservation_id,p_provider_id,
    v_provider_available-p_expected_bytes,v_user_available-p_expected_bytes;
end;
$$;

create or replace function public.raye2_commit_storage_object(
  p_reservation_id uuid,
  p_bucket_id text,
  p_object_key text,
  p_size_bytes bigint,
  p_mime_type text,
  p_checksum_sha256 text,
  p_etag text default null,
  p_visibility text default 'private',
  p_media_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reservation public.raye2_storage_reservations%rowtype;
  v_object_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_bucket_id is null or length(p_bucket_id) not between 1 and 128
    or p_object_key is null or length(p_object_key) not between 1 and 1024
    or p_size_bytes is null or p_size_bytes<1
    or p_visibility not in ('private','public')
    or (p_checksum_sha256 is not null and p_checksum_sha256 !~ '^[a-fA-F0-9]{64}
  from public.raye2_storage_reservations
  where reservation_id=p_reservation_id
  for update;
  if not found or v_reservation.reservation_state<>'active' or v_reservation.expires_at<=now() then
    raise exception 'active storage reservation not found' using errcode='55000';
  end if;
  if p_size_bytes>v_reservation.expected_bytes then
    raise exception 'verified object exceeds reserved bytes' using errcode='53100';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-owner:' || v_reservation.owner_id::text,0));
  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-provider:' || v_reservation.provider_id,0));

  if not exists (
    select 1 from public.raye2_storage_providers p
    where p.provider_id=v_reservation.provider_id
      and ((p_visibility='public' and p.public_bucket=p_bucket_id)
        or (p_visibility='private' and p.private_bucket=p_bucket_id))
  ) then
    raise exception 'object bucket does not match provider visibility configuration' using errcode='22023';
  end if;

  insert into public.raye2_storage_objects(
    provider_id,bucket_id,object_key,owner_id,asset_class,visibility,object_state,
    size_bytes,mime_type,checksum_sha256,etag,media_id,idempotency_key,verified_at
  ) values (
    v_reservation.provider_id,p_bucket_id,p_object_key,v_reservation.owner_id,
    v_reservation.asset_class,p_visibility,'active',p_size_bytes,p_mime_type,
    p_checksum_sha256,p_etag,p_media_id,'object:'||v_reservation.idempotency_key,now()
  ) returning object_id into v_object_id;

  update public.raye2_storage_reservations
  set reservation_state='consumed',object_id=v_object_id,completed_at=now()
  where reservation_id=p_reservation_id;

  update public.raye2_storage_providers
  set used_bytes=used_bytes+p_size_bytes,
      reserved_bytes=greatest(0,reserved_bytes-v_reservation.expected_bytes),
      updated_at=now()
  where provider_id=v_reservation.provider_id;

  insert into public.raye2_storage_usage_ledger(
    idempotency_key,provider_id,owner_id,object_id,event_kind,delta_bytes,details
  ) values (
    'verified:'||v_reservation.idempotency_key,v_reservation.provider_id,
    v_reservation.owner_id,v_object_id,'upload_verified',p_size_bytes,
    jsonb_build_object('bucket',p_bucket_id,'key',p_object_key,'visibility',p_visibility)
  );

  return v_object_id;
end;
$$;

create or replace function public.raye2_release_storage_reservation(
  p_reservation_id uuid,
  p_final_state text default 'released'
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reservation public.raye2_storage_reservations%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_final_state not in ('released','expired') then
    raise exception 'invalid reservation final state' using errcode='22023';
  end if;
  select * into v_reservation
  from public.raye2_storage_reservations
  where reservation_id=p_reservation_id
  for update;
  if not found or v_reservation.reservation_state<>'active' then return false; end if;

  update public.raye2_storage_reservations
  set reservation_state=p_final_state,completed_at=now()
  where reservation_id=p_reservation_id;
  update public.raye2_storage_providers
  set reserved_bytes=greatest(0,reserved_bytes-v_reservation.expected_bytes),updated_at=now()
  where provider_id=v_reservation.provider_id;
  return true;
end;
$$;

revoke all on function public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer) from public,anon,authenticated;
revoke all on function public.raye2_commit_storage_object(uuid,text,text,bigint,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.raye2_release_storage_reservation(uuid,text) from public,anon,authenticated;
grant execute on function public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer) to service_role;
grant execute on function public.raye2_commit_storage_object(uuid,text,text,bigint,text,text,text,text,uuid) to service_role;
grant execute on function public.raye2_release_storage_reservation(uuid,text) to service_role;

comment on function public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer) is
  'Atomically reserves provider and per-user/per-role capacity. Called only by trusted server code after it resolves the authenticated role.';
comment on function public.raye2_commit_storage_object(uuid,text,text,bigint,text,text,text,text,uuid) is
  'Commits server-verified object metadata and consumes its reservation atomically.';
) then
    raise exception 'invalid verified storage object metadata' using errcode='22023';
  end if;

  select * into v_reservation
  from public.raye2_storage_reservations
  where reservation_id=p_reservation_id
  for update;
  if not found or v_reservation.reservation_state<>'active' or v_reservation.expires_at<=now() then
    raise exception 'active storage reservation not found' using errcode='55000';
  end if;
  if p_size_bytes>v_reservation.expected_bytes then
    raise exception 'verified object exceeds reserved bytes' using errcode='53100';
  end if;

  insert into public.raye2_storage_objects(
    provider_id,bucket_id,object_key,owner_id,asset_class,visibility,object_state,
    size_bytes,mime_type,checksum_sha256,etag,media_id,idempotency_key,verified_at
  ) values (
    v_reservation.provider_id,p_bucket_id,p_object_key,v_reservation.owner_id,
    v_reservation.asset_class,p_visibility,'active',p_size_bytes,p_mime_type,
    p_checksum_sha256,p_etag,p_media_id,'object:'||v_reservation.idempotency_key,now()
  ) returning object_id into v_object_id;

  update public.raye2_storage_reservations
  set reservation_state='consumed',object_id=v_object_id,completed_at=now()
  where reservation_id=p_reservation_id;

  update public.raye2_storage_providers
  set used_bytes=used_bytes+p_size_bytes,
      reserved_bytes=greatest(0,reserved_bytes-v_reservation.expected_bytes),
      updated_at=now()
  where provider_id=v_reservation.provider_id;

  insert into public.raye2_storage_usage_ledger(
    idempotency_key,provider_id,owner_id,object_id,event_kind,delta_bytes,details
  ) values (
    'verified:'||v_reservation.idempotency_key,v_reservation.provider_id,
    v_reservation.owner_id,v_object_id,'upload_verified',p_size_bytes,
    jsonb_build_object('bucket',p_bucket_id,'key',p_object_key,'visibility',p_visibility)
  );

  return v_object_id;
end;
$$;

create or replace function public.raye2_release_storage_reservation(
  p_reservation_id uuid,
  p_final_state text default 'released'
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reservation public.raye2_storage_reservations%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_final_state not in ('released','expired') then
    raise exception 'invalid reservation final state' using errcode='22023';
  end if;
  select * into v_reservation
  from public.raye2_storage_reservations
  where reservation_id=p_reservation_id
  for update;
  if not found or v_reservation.reservation_state<>'active' then return false; end if;

  update public.raye2_storage_reservations
  set reservation_state=p_final_state,completed_at=now()
  where reservation_id=p_reservation_id;
  update public.raye2_storage_providers
  set reserved_bytes=greatest(0,reserved_bytes-v_reservation.expected_bytes),updated_at=now()
  where provider_id=v_reservation.provider_id;
  return true;
end;
$$;

revoke all on function public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer) from public,anon,authenticated;
revoke all on function public.raye2_commit_storage_object(uuid,text,text,bigint,text,text,text,text,uuid) from public,anon,authenticated;
revoke all on function public.raye2_release_storage_reservation(uuid,text) from public,anon,authenticated;
grant execute on function public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer) to service_role;
grant execute on function public.raye2_commit_storage_object(uuid,text,text,bigint,text,text,text,text,uuid) to service_role;
grant execute on function public.raye2_release_storage_reservation(uuid,text) to service_role;

comment on function public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer) is
  'Atomically reserves provider and per-user/per-role capacity. Called only by trusted server code after it resolves the authenticated role.';
comment on function public.raye2_commit_storage_object(uuid,text,text,bigint,text,text,text,text,uuid) is
  'Commits server-verified object metadata and consumes its reservation atomically.';

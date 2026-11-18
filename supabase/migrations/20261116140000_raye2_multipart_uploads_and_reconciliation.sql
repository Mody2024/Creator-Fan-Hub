-- Raye2 multipart upload ledger + provider reconciliation (additive).
-- Tracks in-progress multipart uploads so a large upload can resume, and lets a trusted worker feed
-- real provider usage/capacity back into the control plane before the ceiling is synced.
--
-- Provider credentials remain server-only environment secrets; nothing here stores a secret.

-- 1. Relax the reservation RPC for pooled provider instances and large parts ---------------
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
    or p_provider_id !~ '^[a-z0-9][a-z0-9_-]{1,62}$'
    or p_asset_class not in ('video','mini','moment','stream_replay','thumbnail','chat_attachment','voice_recording','memory','other')
    or p_role_key !~ '^[a-z][a-z0-9_-]{0,63}$'
    or p_expected_bytes is null or p_expected_bytes < 1 or p_expected_bytes > 107374182400
    or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200
    or p_expires_in_seconds not between 60 and 86400 then
    raise exception 'invalid storage reservation request' using errcode='22023';
  end if;

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
revoke all on function public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer) from public, anon, authenticated;
grant execute on function public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer) to service_role;

-- 2. Multipart upload ledger ----------------------------------------------------------------
create table if not exists public.raye2_multipart_uploads (
  upload_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  reservation_id uuid not null references public.raye2_storage_reservations(reservation_id) on delete cascade,
  provider_id text not null references public.raye2_storage_providers(provider_id),
  bucket_id text not null,
  object_key text not null,
  upload_ref text not null,
  total_bytes bigint not null check (total_bytes between 1 and 107374182400),
  part_size_bytes bigint not null check (part_size_bytes between 5242880 and 5368709120),
  part_count integer not null check (part_count between 1 and 10000),
  uploaded_parts jsonb not null default '[]'::jsonb,
  upload_state text not null default 'active' check (upload_state in ('active','completed','aborted','expired')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  completed_at timestamptz
);
create index if not exists raye2_multipart_uploads_owner_state_idx
  on public.raye2_multipart_uploads(owner_id,upload_state,expires_at);
create index if not exists raye2_multipart_uploads_reservation_idx
  on public.raye2_multipart_uploads(reservation_id);

alter table public.raye2_multipart_uploads enable row level security;
revoke all on public.raye2_multipart_uploads from anon, authenticated;
grant all on public.raye2_multipart_uploads to service_role;

create or replace function public.raye2_begin_multipart_upload(
  p_owner_id uuid,
  p_reservation_id uuid,
  p_provider_id text,
  p_bucket_id text,
  p_object_key text,
  p_upload_ref text,
  p_total_bytes bigint,
  p_part_size_bytes bigint,
  p_part_count integer
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_reservation public.raye2_storage_reservations%rowtype;
  v_upload_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_owner_id is null
    or p_bucket_id is null or length(p_bucket_id) not between 1 and 128
    or p_object_key is null or length(p_object_key) not between 1 and 1024
    or p_upload_ref is null or length(p_upload_ref) not between 1 and 1024
    or p_total_bytes is null or p_total_bytes not between 1 and 107374182400
    or p_part_size_bytes is null or p_part_size_bytes not between 5242880 and 5368709120
    or p_part_count is null or p_part_count not between 1 and 10000 then
    raise exception 'invalid multipart upload request' using errcode='22023';
  end if;

  select * into v_reservation
  from public.raye2_storage_reservations
  where reservation_id=p_reservation_id
  for update;
  if not found or v_reservation.owner_id<>p_owner_id or v_reservation.provider_id<>p_provider_id then
    raise exception 'storage reservation does not match this upload' using errcode='22023';
  end if;
  if v_reservation.reservation_state<>'active' or v_reservation.expires_at<=now() then
    raise exception 'active storage reservation not found' using errcode='55000';
  end if;
  if p_total_bytes>v_reservation.expected_bytes then
    raise exception 'upload exceeds reserved bytes' using errcode='53100';
  end if;

  insert into public.raye2_multipart_uploads(
    owner_id,reservation_id,provider_id,bucket_id,object_key,upload_ref,total_bytes,part_size_bytes,part_count
  ) values (
    p_owner_id,p_reservation_id,p_provider_id,p_bucket_id,p_object_key,p_upload_ref,p_total_bytes,p_part_size_bytes,p_part_count
  ) returning upload_id into v_upload_id;
  return v_upload_id;
end;
$$;
revoke all on function public.raye2_begin_multipart_upload(uuid,uuid,text,text,text,text,bigint,bigint,integer) from public, anon, authenticated;
grant execute on function public.raye2_begin_multipart_upload(uuid,uuid,text,text,text,text,bigint,bigint,integer) to service_role;

-- Record one uploaded part. Parts may arrive out of order; the latest etag for a part number wins.
create or replace function public.raye2_record_upload_part(
  p_upload_id uuid,
  p_part_number integer,
  p_etag text,
  p_bytes bigint
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_upload public.raye2_multipart_uploads%rowtype;
  v_parts jsonb;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_part_number is null or p_part_number<1 or p_part_number>10000
    or p_etag is null or length(p_etag) not between 1 and 200
    or p_bytes is null or p_bytes<1 then
    raise exception 'invalid multipart part' using errcode='22023';
  end if;

  select * into v_upload from public.raye2_multipart_uploads where upload_id=p_upload_id for update;
  if not found or v_upload.upload_state<>'active' or v_upload.expires_at<=now() then
    raise exception 'active multipart upload not found' using errcode='55000';
  end if;
  if p_part_number>v_upload.part_count then
    raise exception 'part number exceeds the planned part count' using errcode='22023';
  end if;

  v_parts := (
    select coalesce(jsonb_agg(item order by (item->>'partNumber')::int),'[]'::jsonb)
    from (
      select value as item
      from jsonb_array_elements(coalesce(v_upload.uploaded_parts,'[]'::jsonb))
      where (value->>'partNumber')::int <> p_part_number
      union all
      select jsonb_build_object('partNumber',p_part_number,'etag',p_etag,'bytes',p_bytes) as item
    ) merged
  );
  update public.raye2_multipart_uploads
    set uploaded_parts=v_parts
    where upload_id=p_upload_id;
  return v_parts;
end;
$$;
revoke all on function public.raye2_record_upload_part(uuid,integer,text,bigint) from public, anon, authenticated;
grant execute on function public.raye2_record_upload_part(uuid,integer,text,bigint) to service_role;

create or replace function public.raye2_finish_multipart_upload(
  p_upload_id uuid,
  p_object_id uuid,
  p_upload_state text
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_upload public.raye2_multipart_uploads%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_upload_state not in ('completed','aborted','expired') then
    raise exception 'invalid multipart terminal state' using errcode='22023';
  end if;
  select * into v_upload from public.raye2_multipart_uploads where upload_id=p_upload_id for update;
  if not found then raise exception 'unknown multipart upload' using errcode='22023'; end if;
  if v_upload.upload_state<>'active' then return; end if;
  update public.raye2_multipart_uploads
    set upload_state=p_upload_state, completed_at=now()
    where upload_id=p_upload_id;
end;
$$;
revoke all on function public.raye2_finish_multipart_upload(uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.raye2_finish_multipart_upload(uuid,uuid,text) to service_role;

-- 3. Provider reconciliation ----------------------------------------------------------------
-- A trusted worker reports real provider usage/capacity; this records it and marks capacity fresh.
-- It never trusts the caller to set the platform ceiling directly.
create or replace function public.raye2_reconcile_storage_provider(
  p_provider_id text,
  p_used_bytes bigint,
  p_capacity_bytes bigint,
  p_idempotency_key text,
  p_health text default 'healthy'
)
returns void
language plpgsql
security definer
set search_path=''
as $$
declare
  v_previous bigint;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_provider_id is null or p_used_bytes is null or p_used_bytes<0
    or p_capacity_bytes is null or p_capacity_bytes<0 or p_used_bytes>p_capacity_bytes
    or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200
    or p_health not in ('healthy','degraded','unavailable','unknown') then
    raise exception 'invalid provider reconciliation' using errcode='22023';
  end if;

  select used_bytes into v_previous from public.raye2_storage_providers where provider_id=p_provider_id for update;
  if not found then raise exception 'unknown storage provider' using errcode='22023'; end if;

  update public.raye2_storage_providers
    set used_bytes=p_used_bytes,
        capacity_bytes=p_capacity_bytes,
        health=p_health,
        capacity_verified_at=now(),
        last_reconciled_at=now(),
        updated_at=now()
    where provider_id=p_provider_id;

  insert into public.raye2_storage_usage_ledger(
    idempotency_key,provider_id,owner_id,object_id,event_kind,delta_bytes,details
  ) values (
    p_idempotency_key,p_provider_id,null,null,'object_reconciled',p_used_bytes-coalesce(v_previous,0),
    jsonb_build_object('used_bytes',p_used_bytes,'capacity_bytes',p_capacity_bytes,'health',p_health)
  ) on conflict(idempotency_key) do nothing;
end;
$$;
revoke all on function public.raye2_reconcile_storage_provider(text,bigint,bigint,text,text) from public, anon, authenticated;
grant execute on function public.raye2_reconcile_storage_provider(text,bigint,bigint,text,text) to service_role;

comment on table public.raye2_multipart_uploads is
  'In-progress multipart uploads keyed to a storage reservation; lets large uploads resume and reconcile.';

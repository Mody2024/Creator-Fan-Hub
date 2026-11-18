-- Raye2 storage pooling, content-addressed dedup and multipart uploads (additive).
-- Layered on the provider control plane and the allowance/control migration.
--
-- 1. Provider pooling: many instances of the same provider kind (R2 account #1, R2 #2, B2, ...)
--    can be registered. A provider_kind column drives routing; provider_id stays the unique
--    instance key. Existing supabase/r2/b2 rows are preserved.
-- 2. Content-addressed dedup: raye2_storage_blobs is keyed by sha256 so identical bytes are stored
--    once and shared by reference. Objects point at a blob and hold a physical replica.
-- 3. Multipart uploads: reservation/object constraints accept large parts.
--
-- Provider credentials remain server-only environment secrets and are never stored here.

-- 1. Provider pooling ---------------------------------------------------------
alter table public.raye2_storage_providers
  drop constraint if exists raye2_storage_providers_provider_id_check;

alter table public.raye2_storage_providers
  add column if not exists provider_kind text;

update public.raye2_storage_providers
  set provider_kind = case
    when provider_id = 'cloudflare_r2' then 'cloudflare_r2'
    when provider_id = 'backblaze_b2' then 'backblaze_b2'
    else 'supabase'
  end
  where provider_kind is null;

alter table public.raye2_storage_providers
  alter column provider_kind set not null;

alter table public.raye2_storage_providers
  drop constraint if exists raye2_storage_providers_kind_check,
  add constraint raye2_storage_providers_kind_check
    check (provider_kind in ('supabase','cloudflare_r2','backblaze_b2'));

alter table public.raye2_storage_providers
  drop constraint if exists raye2_storage_providers_instance_check,
  add constraint raye2_storage_providers_instance_check
    check (provider_id ~ '^[a-z0-9][a-z0-9_-]{1,62}$');

create index if not exists raye2_storage_providers_kind_enabled_idx
  on public.raye2_storage_providers(provider_kind, enabled, health);

comment on column public.raye2_storage_providers.provider_kind is
  'Provider family (routing/failover class). provider_id is the unique instance key, so several R2/B2 instances can be pooled.';

-- 2. Content-addressed dedup ------------------------------------------------
create table if not exists public.raye2_storage_blobs (
  sha256 text primary key check (sha256 ~ '^[a-f0-9]{64}$'),
  size_bytes bigint not null check (size_bytes >= 0),
  ref_count integer not null default 0 check (ref_count >= 0),
  canonical_provider_id text references public.raye2_storage_providers(provider_id) on delete set null,
  canonical_bucket_id text,
  canonical_object_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raye2_storage_blobs_ref_idx on public.raye2_storage_blobs(ref_count) where ref_count > 0;

-- Physical replica of a logical object. One object may exist on more than one provider.
create table if not exists public.raye2_storage_object_replicas (
  object_id uuid not null references public.raye2_storage_objects(object_id) on delete cascade,
  provider_id text not null references public.raye2_storage_providers(provider_id),
  bucket_id text not null,
  object_key text not null,
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  replica_state text not null default 'active' check (replica_state in ('active','stale','removed')),
  created_at timestamptz not null default now(),
  primary key(object_id, provider_id, bucket_id, object_key)
);
create index if not exists raye2_storage_object_replicas_provider_idx
  on public.raye2_storage_object_replicas(provider_id, replica_state);

alter table public.raye2_storage_objects
  add column if not exists sha256 text;

alter table public.raye2_storage_objects
  drop constraint if exists raye2_storage_objects_sha256_check,
  add constraint raye2_storage_objects_sha256_check
    check (sha256 is null or sha256 ~ '^[a-f0-9]{64}$');

create index if not exists raye2_storage_objects_sha256_idx on public.raye2_storage_objects(sha256);

alter table public.raye2_storage_blobs enable row level security;
alter table public.raye2_storage_object_replicas enable row level security;
revoke all on public.raye2_storage_blobs from anon, authenticated;
revoke all on public.raye2_storage_object_replicas from anon, authenticated;
grant all on public.raye2_storage_blobs to service_role;
grant all on public.raye2_storage_object_replicas to service_role;

-- Register a verified object. If the same sha256 already exists (dedup hit), the object references
-- the existing blob and is accounted as a shared replica (zero new physical bytes on the provider);
-- otherwise a new blob row is created and the object becomes its canonical replica.
create or replace function public.raye2_register_storage_object(
  p_object_id uuid,
  p_sha256 text,
  p_idempotency_key text
)
returns table(blob_sha256 text,deduplicated boolean,charged_bytes bigint)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_object public.raye2_storage_objects%rowtype;
  v_blob public.raye2_storage_blobs%rowtype;
  v_dedup boolean := false;
  v_charged bigint := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'a lowercase sha256 digest is required' using errcode='22023';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid dedup request' using errcode='22023';
  end if;

  select * into v_object from public.raye2_storage_objects where object_id=p_object_id for update;
  if not found then raise exception 'unknown storage object' using errcode='22023'; end if;

  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-blob:' || p_sha256,0));

  select * into v_blob from public.raye2_storage_blobs where sha256=p_sha256 for update;
  if found then
    v_dedup := true;
    update public.raye2_storage_blobs
      set ref_count=ref_count+1, updated_at=now()
      where sha256=p_sha256;
  else
    insert into public.raye2_storage_blobs(sha256,size_bytes,ref_count,canonical_provider_id,canonical_bucket_id,canonical_object_key)
    values (p_sha256,v_object.size_bytes,1,v_object.provider_id,v_object.bucket_id,v_object.object_key);
    v_charged := v_object.size_bytes;
  end if;

  update public.raye2_storage_objects
    set sha256=p_sha256, object_state='verified', verified_at=now()
    where object_id=p_object_id;

  insert into public.raye2_storage_object_replicas(object_id,provider_id,bucket_id,object_key,size_bytes,replica_state)
  values (p_object_id,v_object.provider_id,v_object.bucket_id,v_object.object_key,v_object.size_bytes,'active')
  on conflict(object_id,provider_id,bucket_id,object_key) do update set replica_state='active';

  insert into public.raye2_storage_usage_ledger(
    idempotency_key,provider_id,owner_id,object_id,event_kind,delta_bytes,details
  ) values (
    p_idempotency_key,v_object.provider_id,v_object.owner_id,p_object_id,
    'upload_verified',v_charged,
    jsonb_build_object('sha256',p_sha256,'deduplicated',v_dedup,'bucket',v_object.bucket_id)
  ) on conflict(idempotency_key) do nothing;

  return query select p_sha256,v_dedup,v_charged;
end;
$$;
revoke all on function public.raye2_register_storage_object(uuid,text,text) from public, anon, authenticated;
grant execute on function public.raye2_register_storage_object(uuid,text,text) to service_role;

-- Release a blob reference when its last object is deleted; the blob row survives as a cheap index.
create or replace function public.raye2_release_storage_blob(
  p_sha256 text,
  p_idempotency_key text
)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_remaining integer;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_sha256 is null or p_sha256 !~ '^[a-f0-9]{64}$' then
    raise exception 'a lowercase sha256 digest is required' using errcode='22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-blob:' || p_sha256,0));
  update public.raye2_storage_blobs
    set ref_count=greatest(0,ref_count-1), updated_at=now()
    where sha256=p_sha256;
  select ref_count into v_remaining from public.raye2_storage_blobs where sha256=p_sha256;
  return coalesce(v_remaining,0);
end;
$$;
revoke all on function public.raye2_release_storage_blob(text,text) from public, anon, authenticated;
grant execute on function public.raye2_release_storage_blob(text,text) to service_role;

comment on table public.raye2_storage_blobs is
  'Content-addressed dedup index. Identical bytes share one blob row and one physical replica; ref_count tracks logical references.';
comment on table public.raye2_storage_object_replicas is
  'Physical replicas of a logical storage object; supports one object on multiple pooled providers.';

-- 3. Multipart uploads ------------------------------------------------------
-- Parts can exceed the single-shot 50 MiB per-file cap, so the reservation/object ceilings are widened
-- while per-file policy remains enforced by raye2_storage_allowances.max_file_bytes.
alter table public.raye2_storage_reservations
  drop constraint if exists raye2_storage_reservations_expected_bytes_check;
alter table public.raye2_storage_reservations
  add constraint raye2_storage_reservations_expected_bytes_check
    check (expected_bytes between 1 and 107374182400); -- 100 GiB ceiling for multipart

-- 4. Capacity summary + ceiling sync ---------------------------------------
create or replace function public.raye2_storage_capacity_summary()
returns table(provider_kind text,enabled boolean,capacity_bytes bigint,used_bytes bigint,reserved_bytes bigint,safety_reserve_bytes bigint,verified boolean)
language sql
security definer
set search_path=''
as $$
  select provider_kind,enabled,capacity_bytes,used_bytes,reserved_bytes,safety_reserve_bytes,
         (capacity_verified_at is not null) as verified
  from public.raye2_storage_providers
  where enabled
  order by provider_kind,priority;
$$;
revoke all on function public.raye2_storage_capacity_summary() from public, anon;
grant execute on function public.raye2_storage_capacity_summary() to service_role;

-- Raise the platform ceiling to the pooled verified capacity, never above the owner-set cap.
-- The owner may also lower the cap; this function only moves the ceiling up to real capacity and
-- never below what is already used, so it can never strand existing objects.
create or replace function public.raye2_sync_platform_ceiling(p_idempotency_key text)
returns bigint
language plpgsql
security definer
set search_path=''
as $$
declare
  v_cap bigint;
  v_capacity bigint;
  v_used bigint;
  v_ceiling bigint;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid ceiling sync request' using errcode='22023';
  end if;

  select value_numeric into v_cap from public.raye2_storage_settings where settings_key='platform_ceiling_cap_bytes';
  select coalesce(sum(capacity_bytes),0), coalesce(sum(used_bytes),0)
    into v_capacity,v_used
    from public.raye2_storage_providers
    where enabled and capacity_verified_at is not null;
  v_ceiling := greatest(v_used, least(v_capacity, coalesce(v_cap, v_capacity)));
  if v_ceiling < 1 then v_ceiling := v_used; end if;

  insert into public.raye2_storage_settings(settings_key,value_numeric)
  values ('platform_ceiling_bytes',v_ceiling)
  on conflict(settings_key) do update set value_numeric=excluded.value_numeric,updated_at=now();

  insert into public.raye2_storage_usage_ledger(
    idempotency_key,provider_id,owner_id,object_id,event_kind,delta_bytes,details
  ) values (
    p_idempotency_key,'supabase',null,null,'manual_adjustment',0,
    jsonb_build_object('action','ceiling_sync','capacity_bytes',v_capacity,'used_bytes',v_used,'ceiling_bytes',v_ceiling)
  ) on conflict(idempotency_key) do nothing;

  return v_ceiling;
end;
$$;
revoke all on function public.raye2_sync_platform_ceiling(text) from public, anon, authenticated;
grant execute on function public.raye2_sync_platform_ceiling(text) to service_role;

insert into public.raye2_storage_settings(settings_key,value_numeric)
values ('platform_ceiling_cap_bytes',1099511627776) -- 1 TiB owner safety cap until raised
on conflict(settings_key) do nothing;

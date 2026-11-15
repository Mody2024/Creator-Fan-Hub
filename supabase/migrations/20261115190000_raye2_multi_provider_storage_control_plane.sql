-- Raye2 provider-neutral storage control plane foundation.
-- This migration is intentionally not applied to the live Supabase project.
-- Provider credentials remain server-only environment secrets, never table data.

alter table public.media_items
  drop constraint if exists media_items_provider_check,
  add constraint media_items_provider_check
    check (provider in ('supabase','cloudflare_r2','backblaze_b2','youtube','external'));

alter table public.community_short_videos
  drop constraint if exists community_short_videos_provider_check,
  add constraint community_short_videos_provider_check
    check (provider in ('supabase','cloudflare_r2','backblaze_b2','youtube','external'));

create table if not exists public.raye2_storage_providers (
  provider_id text primary key check (provider_id in ('supabase','cloudflare_r2','backblaze_b2')),
  enabled boolean not null default false,
  priority integer not null default 100 check (priority between 0 and 10000),
  health text not null default 'unknown' check (health in ('healthy','degraded','unavailable','unknown')),
  capacity_bytes bigint not null default 0 check (capacity_bytes >= 0),
  safety_reserve_bytes bigint not null default 0 check (safety_reserve_bytes >= 0),
  max_managed_bytes bigint check (max_managed_bytes is null or max_managed_bytes >= 0),
  used_bytes bigint not null default 0 check (used_bytes >= 0),
  reserved_bytes bigint not null default 0 check (reserved_bytes >= 0),
  capacity_verified_at timestamptz,
  last_reconciled_at timestamptz,
  public_bucket text,
  private_bucket text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (safety_reserve_bytes <= capacity_bytes),
  check (max_managed_bytes is null or max_managed_bytes <= capacity_bytes)
);

create table if not exists public.raye2_storage_objects (
  object_id uuid primary key default gen_random_uuid(),
  provider_id text not null references public.raye2_storage_providers(provider_id),
  bucket_id text not null,
  object_key text not null,
  owner_id uuid references auth.users(id) on delete set null,
  asset_class text not null check (asset_class in ('video','mini','moment','stream_replay','thumbnail','chat_attachment','voice_recording','memory','other')),
  visibility text not null check (visibility in ('private','public')),
  object_state text not null default 'staged' check (object_state in ('staged','verified','active','deleting','deleted','orphan_candidate','failed')),
  size_bytes bigint not null default 0 check (size_bytes >= 0),
  mime_type text,
  checksum_sha256 text check (checksum_sha256 is null or checksum_sha256 ~ '^[a-fA-F0-9]{64}$'),
  etag text,
  media_id uuid,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  verified_at timestamptz,
  deleted_at timestamptz,
  unique(provider_id,bucket_id,object_key)
);
create index if not exists raye2_storage_objects_owner_class_idx
  on public.raye2_storage_objects(owner_id,asset_class,object_state);
create index if not exists raye2_storage_objects_provider_state_idx
  on public.raye2_storage_objects(provider_id,object_state);

create table if not exists public.raye2_storage_reservations (
  reservation_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null references public.raye2_storage_providers(provider_id),
  asset_class text not null check (asset_class in ('video','mini','moment','stream_replay','thumbnail','chat_attachment','voice_recording','memory','other')),
  expected_bytes bigint not null check (expected_bytes between 1 and 5368709120),
  reservation_state text not null default 'active' check (reservation_state in ('active','consumed','released','expired')),
  object_id uuid references public.raye2_storage_objects(object_id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '1 hour'),
  completed_at timestamptz
);
create index if not exists raye2_storage_reservations_provider_expiry_idx
  on public.raye2_storage_reservations(provider_id,reservation_state,expires_at);
create index if not exists raye2_storage_reservations_owner_expiry_idx
  on public.raye2_storage_reservations(owner_id,reservation_state,expires_at);

create table if not exists public.raye2_storage_usage_ledger (
  event_id uuid primary key default gen_random_uuid(),
  idempotency_key text not null unique,
  provider_id text not null references public.raye2_storage_providers(provider_id),
  owner_id uuid references auth.users(id) on delete set null,
  object_id uuid references public.raye2_storage_objects(object_id) on delete set null,
  event_kind text not null check (event_kind in ('upload_verified','object_deleted','object_reconciled','replica_created','replica_removed','reservation_expired','manual_adjustment')),
  delta_bytes bigint not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists raye2_storage_usage_ledger_provider_date_idx
  on public.raye2_storage_usage_ledger(provider_id,created_at desc);

create table if not exists public.raye2_storage_user_quotas (
  owner_id uuid not null references auth.users(id) on delete cascade,
  asset_class text not null check (asset_class in ('video','mini','moment','stream_replay','thumbnail','chat_attachment','voice_recording','memory','other')),
  quota_bytes bigint not null check (quota_bytes >= 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key(owner_id,asset_class)
);

-- These control-plane tables are private to trusted server-side operations.
alter table public.raye2_storage_providers enable row level security;
alter table public.raye2_storage_objects enable row level security;
alter table public.raye2_storage_reservations enable row level security;
alter table public.raye2_storage_usage_ledger enable row level security;
alter table public.raye2_storage_user_quotas enable row level security;

revoke all on public.raye2_storage_providers from anon, authenticated;
revoke all on public.raye2_storage_objects from anon, authenticated;
revoke all on public.raye2_storage_reservations from anon, authenticated;
revoke all on public.raye2_storage_usage_ledger from anon, authenticated;
revoke all on public.raye2_storage_user_quotas from anon, authenticated;

grant all on public.raye2_storage_providers to service_role;
grant all on public.raye2_storage_objects to service_role;
grant all on public.raye2_storage_reservations to service_role;
grant all on public.raye2_storage_usage_ledger to service_role;
grant all on public.raye2_storage_user_quotas to service_role;

insert into public.raye2_storage_providers(provider_id,enabled,priority,health,capacity_bytes,safety_reserve_bytes,max_managed_bytes,public_bucket,private_bucket)
values
  ('supabase',true,30,'unknown',0,0,null,'creator-media-public','creator-media-private'),
  ('cloudflare_r2',false,10,'unknown',0,0,null,null,null),
  ('backblaze_b2',false,20,'unknown',0,0,null,null,null)
on conflict(provider_id) do nothing;

comment on table public.raye2_storage_providers is
  'Non-secret provider registry. Capacity stays zero/unverified until a server-side provider health and usage check confirms it.';
comment on table public.raye2_storage_objects is
  'Provider-neutral inventory of Raye2-owned objects; object keys are not public authorization tokens.';
comment on table public.raye2_storage_reservations is
  'Atomic upload-capacity reservation ledger; reservations are not monthly allocations and expire only when an upload attempt is abandoned.';
comment on table public.raye2_storage_usage_ledger is
  'Idempotent byte-accounting audit trail for managed storage objects.';

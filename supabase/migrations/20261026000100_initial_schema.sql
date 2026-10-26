create extension if not exists pgcrypto;

-- Keep drafts in a private table: RLS filters rows, not individual columns.
-- Public visitors can read only the separate published snapshot.
create table if not exists public.site_config_drafts (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique default 'primary',
  draft jsonb not null default '{}'::jsonb,
  draft_revision integer not null default 1 check (draft_revision > 0),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.published_site_config (
  id uuid primary key default gen_random_uuid(),
  config_key text not null unique default 'primary',
  published jsonb not null default '{}'::jsonb,
  published_version integer not null default 1 check (published_version > 0),
  maintenance_mode boolean not null default false,
  published_at timestamptz not null default now()
);

-- Immutable snapshots enable safe rollback and audit-friendly publishing.
create table if not exists public.published_site_config_versions (
  id uuid primary key default gen_random_uuid(),
  config_key text not null,
  version integer not null check (version > 0),
  published jsonb not null,
  maintenance_mode boolean not null default false,
  published_by uuid references auth.users(id) on delete set null,
  published_at timestamptz not null default now(),
  unique (config_key, version)
);

create index if not exists published_site_config_versions_recent_idx
  on public.published_site_config_versions(config_key, version desc);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 160),
  description text not null default '',
  status text not null default 'draft' check (status in ('draft','scheduled','open','closed','archived')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  label text not null check (char_length(label) between 1 and 180),
  position integer not null default 0,
  unique (poll_id, position),
  unique (poll_id, id)
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_id uuid not null,
  voter_token_hash text not null,
  created_at timestamptz not null default now(),
  unique (poll_id, voter_token_hash),
  constraint poll_votes_option_matches_poll
    foreign key (poll_id, option_id)
    references public.poll_options(poll_id, id) on delete cascade
);

create table if not exists public.ideas (
  id uuid primary key default gen_random_uuid(),
  display_name text not null default 'Anonymous',
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 2000),
  status text not null default 'pending' check (status in ('pending','approved','rejected','featured','archived')),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null
);

create table if not exists public.media_items (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  media_type text not null check (media_type in ('youtube','video','image','audio','sprite','model3d')),
  source_url text,
  storage_path text,
  alt_text text not null default '',
  metadata jsonb not null default '{}'::jsonb,
  is_published boolean not null default false,
  created_at timestamptz not null default now(),
  check (source_url is null or source_url ~ '^https?://')
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text not null default '',
  starts_at timestamptz,
  ends_at timestamptz,
  status text not null default 'draft' check (status in ('draft','scheduled','published','cancelled','completed')),
  media_id uuid references public.media_items(id) on delete set null,
  created_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);

create table if not exists public.social_links (
  id uuid primary key default gen_random_uuid(),
  label text not null,
  url text not null check (url ~ '^https?://'),
  platform text not null default 'custom',
  position integer not null default 0,
  is_published boolean not null default false
);

create table if not exists public.admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists polls_status_dates_idx on public.polls(status, starts_at, ends_at);
create index if not exists poll_options_poll_position_idx on public.poll_options(poll_id, position);
create index if not exists poll_votes_poll_idx on public.poll_votes(poll_id);
create index if not exists ideas_status_submitted_idx on public.ideas(status, submitted_at desc);
create index if not exists events_status_dates_idx on public.events(status, starts_at);
create index if not exists media_items_published_idx on public.media_items(is_published, created_at desc);

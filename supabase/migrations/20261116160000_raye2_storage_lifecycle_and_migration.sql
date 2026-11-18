-- Raye2 storage lifecycle: owner-scoped object access, deletion, BYOS probing, provider discovery
-- and object migration. Additive; all privileged operations are service-role only or gated.
--
-- raye2_storage_objects is RLS-enabled with no policies and revoked from anon/authenticated, so
-- owners reach only their own objects through the SECURITY DEFINER RPCs below, which re-apply the
-- owner predicate themselves.

-- ---------------------------------------------------------------------------
-- Owner-scoped object listing
-- ---------------------------------------------------------------------------
create or replace function public.raye2_my_storage_objects(p_limit integer default 100)
returns table(
  object_id uuid, provider_id text, bucket_id text, object_key text, asset_class text,
  visibility text, object_state text, size_bytes bigint, mime_type text, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  return query
    select o.object_id,o.provider_id,o.bucket_id,o.object_key,o.asset_class,
           o.visibility,o.object_state,o.size_bytes,o.mime_type,o.created_at
    from public.raye2_storage_objects o
    where o.owner_id=v_actor and o.object_state<>'deleted'
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit,100),1),500);
end;
$$;
revoke all on function public.raye2_my_storage_objects(integer) from public, anon;
grant execute on function public.raye2_my_storage_objects(integer) to authenticated;

-- Owner requests deletion of one of their own objects. Bytes are removed by a trusted server, so
-- this only marks the object 'deleting' and returns the metadata the server needs. If the object is
-- already deleted the call is idempotent and returns no row.
create or replace function public.raye2_request_object_deletion(p_object_id uuid)
returns table(provider_id text, bucket_id text, object_key text, size_bytes bigint, already_deleted boolean)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_object public.raye2_storage_objects%rowtype;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if p_object_id is null then
    raise exception 'an object id is required' using errcode='22023';
  end if;

  select * into v_object from public.raye2_storage_objects
    where object_id=p_object_id and owner_id=v_actor for update;
  if not found then
    raise exception 'storage object not found' using errcode='22023';
  end if;
  if v_object.object_state='deleted' then
    return query select v_object.provider_id,v_object.bucket_id,v_object.object_key,v_object.size_bytes,true;
    return;
  end if;
  if v_object.object_state='deleting' then
    return query select v_object.provider_id,v_object.bucket_id,v_object.object_key,v_object.size_bytes,false;
    return;
  end if;

  update public.raye2_storage_objects set object_state='deleting' where object_id=p_object_id;
  return query select v_object.provider_id,v_object.bucket_id,v_object.object_key,v_object.size_bytes,false;
end;
$$;
revoke all on function public.raye2_request_object_deletion(uuid) from public, anon;
grant execute on function public.raye2_request_object_deletion(uuid) to authenticated;

-- Admin listing across all owners (metadata only).
create or replace function public.raye2_admin_storage_objects(p_limit integer default 200)
returns table(
  object_id uuid, owner_id uuid, provider_id text, bucket_id text, asset_class text,
  visibility text, object_state text, size_bytes bigint, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then
    raise exception 'platform administrator required' using errcode='42501';
  end if;
  return query
    select o.object_id,o.owner_id,o.provider_id,o.bucket_id,o.asset_class,
           o.visibility,o.object_state,o.size_bytes,o.created_at
    from public.raye2_storage_objects o
    order by o.created_at desc
    limit least(greatest(coalesce(p_limit,200),1),500);
end;
$$;
revoke all on function public.raye2_admin_storage_objects(integer) from public, anon;
grant execute on function public.raye2_admin_storage_objects(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- BYOS probing metadata
-- ---------------------------------------------------------------------------
alter table public.raye2_byos_connections
  add column if not exists last_probed_at timestamptz,
  add column if not exists probe_listed_keys integer;

comment on column public.raye2_byos_connections.secret_ref is
  'Name of the server-side environment variable holding this connection''s credentials. Never the value.';

-- ---------------------------------------------------------------------------
-- Provider discovery: a trusted server reconciles the env-discovered provider set into the registry.
-- Rows already present keep their usage counters; only identity/config columns are refreshed.
-- ---------------------------------------------------------------------------
create or replace function public.raye2_sync_storage_providers(p_providers jsonb)
returns integer
language plpgsql
security definer
set search_path=''
as $$
declare
  v_item jsonb;
  v_count integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_providers is null or jsonb_typeof(p_providers) <> 'array' then
    raise exception 'a provider array is required' using errcode='22023';
  end if;

  for v_item in select * from jsonb_array_elements(p_providers) loop
    if v_item->>'provider_id' is null or (v_item->>'provider_id') !~ '^[a-z0-9][a-z0-9_-]{1,62}$' then
      raise exception 'invalid provider id' using errcode='22023';
    end if;
    insert into public.raye2_storage_providers(
      provider_id,provider_kind,enabled,priority,health,capacity_bytes,safety_reserve_bytes,
      max_managed_bytes,public_bucket,private_bucket,capacity_verified_at
    ) values (
      v_item->>'provider_id',
      coalesce(v_item->>'provider_kind', v_item->>'provider_id'),
      coalesce((v_item->>'enabled')::boolean, true),
      coalesce((v_item->>'priority')::integer, 100),
      coalesce(v_item->>'health','unknown'),
      coalesce((v_item->>'capacity_bytes')::bigint, 0),
      coalesce((v_item->>'safety_reserve_bytes')::bigint, 0),
      nullif(v_item->>'max_managed_bytes','')::bigint,
      coalesce(v_item->>'public_bucket',''),
      coalesce(v_item->>'private_bucket',''),
      null
    )
    on conflict (provider_id) do update set
      provider_kind=excluded.provider_kind,
      public_bucket=excluded.public_bucket,
      private_bucket=excluded.private_bucket,
      updated_at=now();
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.raye2_sync_storage_providers(jsonb) from public, anon, authenticated;
grant execute on function public.raye2_sync_storage_providers(jsonb) to service_role;

-- ---------------------------------------------------------------------------
-- Object migration ledger
-- ---------------------------------------------------------------------------
create table if not exists public.raye2_storage_object_migrations (
  migration_id uuid primary key default gen_random_uuid(),
  object_id uuid not null references public.raye2_storage_objects(object_id) on delete cascade,
  from_provider_id text not null,
  to_provider_id text not null,
  to_bucket_id text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  migration_state text not null default 'pending' check (migration_state in ('pending','copied','committed','failed')),
  idempotency_key text not null unique,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raye2_storage_object_migrations_state_idx
  on public.raye2_storage_object_migrations(migration_state,created_at);

alter table public.raye2_storage_object_migrations enable row level security;
revoke all on public.raye2_storage_object_migrations from anon, authenticated;
grant all on public.raye2_storage_object_migrations to service_role;

-- Objects that live on a draining provider and are eligible to move (service-role worker only).
create or replace function public.raye2_list_draining_objects(p_source_providers text[], p_limit integer default 500)
returns table(object_id uuid, provider_id text, bucket_id text, object_key text, asset_class text, visibility text, size_bytes bigint)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_source_providers is null or array_length(p_source_providers,1) is null then
    return;
  end if;
  return query
    select o.object_id,o.provider_id,o.bucket_id,o.object_key,o.asset_class,o.visibility,o.size_bytes
    from public.raye2_storage_objects o
    where o.object_state='active'
      and o.provider_id = any(p_source_providers)
      and o.asset_class not in ('voice_recording','memory')
      and not exists (
        select 1 from public.raye2_storage_object_migrations m
        where m.object_id=o.object_id and m.migration_state in ('pending','copied')
      )
    order by o.size_bytes desc
    limit least(greatest(coalesce(p_limit,500),1),2000);
end;
$$;
revoke all on function public.raye2_list_draining_objects(text[],integer) from public, anon, authenticated;
grant execute on function public.raye2_list_draining_objects(text[],integer) to service_role;

create or replace function public.raye2_begin_object_migration(
  p_object_id uuid,
  p_to_provider_id text,
  p_to_bucket_id text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_object public.raye2_storage_objects%rowtype;
  v_id uuid;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_object_id is null or p_to_provider_id is null or p_to_bucket_id is null
    or p_idempotency_key is null or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid migration request' using errcode='22023';
  end if;
  select * into v_object from public.raye2_storage_objects where object_id=p_object_id for update;
  if not found then
    raise exception 'storage object not found' using errcode='22023';
  end if;
  if v_object.provider_id=p_to_provider_id then
    raise exception 'source and destination providers must differ' using errcode='22023';
  end if;
  insert into public.raye2_storage_object_migrations(
    object_id,from_provider_id,to_provider_id,to_bucket_id,size_bytes,idempotency_key
  ) values (
    p_object_id,v_object.provider_id,p_to_provider_id,p_to_bucket_id,v_object.size_bytes,p_idempotency_key
  )
  on conflict (idempotency_key) do update set updated_at=now()
  returning migration_id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raye2_begin_object_migration(uuid,text,text,text) from public, anon, authenticated;
grant execute on function public.raye2_begin_object_migration(uuid,text,text,text) to service_role;

-- Commit a completed copy: the object's provider/bucket/key are repointed and provider byte counters
-- are moved. The old bytes are deleted by the worker before this is called.
create or replace function public.raye2_complete_object_migration(
  p_migration_id uuid,
  p_new_object_key text,
  p_migration_state text default 'committed'
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_migration public.raye2_storage_object_migrations%rowtype;
  v_object public.raye2_storage_objects%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_migration_state not in ('copied','committed','failed') then
    raise exception 'invalid migration state' using errcode='22023';
  end if;

  select * into v_migration from public.raye2_storage_object_migrations where migration_id=p_migration_id for update;
  if not found then
    raise exception 'migration not found' using errcode='22023';
  end if;
  if v_migration.migration_state='committed' then
    return true;
  end if;

  if p_migration_state='failed' then
    update public.raye2_storage_object_migrations set migration_state='failed',updated_at=now() where migration_id=p_migration_id;
    return false;
  end if;

  if p_migration_state='copied' then
    update public.raye2_storage_object_migrations set migration_state='copied',updated_at=now() where migration_id=p_migration_id;
    return true;
  end if;

  if p_new_object_key is null or length(p_new_object_key) not between 1 and 1024 then
    raise exception 'a new object key is required' using errcode='22023';
  end if;

  select * into v_object from public.raye2_storage_objects where object_id=v_migration.object_id for update;
  if not found then
    raise exception 'storage object not found' using errcode='22023';
  end if;

  update public.raye2_storage_objects
    set provider_id=v_migration.to_provider_id,bucket_id=v_migration.to_bucket_id,object_key=p_new_object_key
    where object_id=v_object.object_id;

  update public.raye2_storage_providers
    set used_bytes=greatest(0,used_bytes-v_migration.size_bytes),updated_at=now()
    where provider_id=v_migration.from_provider_id;
  update public.raye2_storage_providers
    set used_bytes=used_bytes+v_migration.size_bytes,updated_at=now()
    where provider_id=v_migration.to_provider_id;

  insert into public.raye2_storage_usage_ledger(
    idempotency_key,provider_id,owner_id,object_id,event_kind,delta_bytes,details
  ) values (
    'migration:'||v_migration.migration_id::text,v_migration.to_provider_id,v_object.owner_id,
    v_object.object_id,'object_migrated',v_migration.size_bytes,
    jsonb_build_object('from',v_migration.from_provider_id,'to',v_migration.to_provider_id,'bucket',v_migration.to_bucket_id)
  ) on conflict (idempotency_key) do nothing;

  update public.raye2_storage_object_migrations set migration_state='committed',updated_at=now() where migration_id=p_migration_id;
  return true;
end;
$$;
revoke all on function public.raye2_complete_object_migration(uuid,text,text) from public, anon, authenticated;
grant execute on function public.raye2_complete_object_migration(uuid,text,text) to service_role;

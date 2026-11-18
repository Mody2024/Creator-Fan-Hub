-- Raye2 bring-your-own-storage (BYOS) connection registry (additive).
-- A contributor connects an S3-compatible bucket they own (Storj, Backblaze B2, R2) as private overflow.
-- The row stores only non-secret metadata plus the NAME of a server-side environment secret; the secret
-- value itself is never stored in SQL and never returned to a browser.
--
-- Placement policy: contributed storage is private overflow only. Public-delivery assets (thumbnails,
-- public video) stay on Raye2-owned providers so a contributor cannot break public playback by revoking
-- a key. The database enforces the structural half of that policy; the placement planner enforces the rest.

create table if not exists public.raye2_byos_connections (
  connection_id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  provider_id text not null check (provider_id in ('storj','backblaze_b2','cloudflare_r2')),
  label text not null check (length(label) between 1 and 80),
  endpoint text not null check (endpoint ~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?$'),
  region text not null check (region ~ '^[a-z0-9-]{2,32}$'),
  bucket_id text not null check (bucket_id ~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$'),
  path_style boolean not null default true,
  secret_ref text not null check (secret_ref ~ '^[A-Z0-9_]{3,64}$'),
  connection_state text not null default 'pending' check (connection_state in ('pending','verified','disabled','failed')),
  verified_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, bucket_id, endpoint)
);
create index if not exists raye2_byos_connections_owner_idx
  on public.raye2_byos_connections(owner_id,connection_state);

alter table public.raye2_byos_connections enable row level security;
revoke all on public.raye2_byos_connections from anon, authenticated;
grant select, insert, update, delete on public.raye2_byos_connections to service_role;

-- Return shape shared by the RPCs. Never exposes secret material.
-- connection_id, provider_id, label, endpoint, region, bucket_id, path_style, secret_ref, connection_state,
-- verified_at, last_error, updated_at

-- A contributor registers/updates their own connection. Any material change resets it to 'pending'.
create or replace function public.raye2_upsert_byos_connection(
  p_connection_id uuid,
  p_provider_id text,
  p_label text,
  p_endpoint text,
  p_region text,
  p_bucket_id text,
  p_path_style boolean,
  p_secret_ref text
)
returns table(
  connection_id uuid, provider_id text, label text, endpoint text, region text, bucket_id text,
  path_style boolean, secret_ref text, connection_state text, verified_at timestamptz, last_error text, updated_at timestamptz
)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
  v_existing public.raye2_byos_connections%rowtype;
  v_id uuid;
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if p_provider_id not in ('storj','backblaze_b2','cloudflare_r2')
    or p_label is null or length(p_label) not between 1 and 80
    or p_endpoint is null or p_endpoint !~ '^https://[a-z0-9.-]+(:[0-9]{1,5})?$'
    or p_region is null or p_region !~ '^[a-z0-9-]{2,32}$'
    or p_bucket_id is null or p_bucket_id !~ '^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$'
    or p_secret_ref is null or p_secret_ref !~ '^[A-Z0-9_]{3,64}$'
    or p_path_style is null then
    raise exception 'invalid bring-your-own-storage connection' using errcode='22023';
  end if;

  if p_connection_id is not null then
    select * into v_existing from public.raye2_byos_connections
      where connection_id=p_connection_id for update;
    if not found or v_existing.owner_id<>v_actor then
      raise exception 'bring-your-own-storage connection not found' using errcode='22023';
    end if;
    update public.raye2_byos_connections
      set provider_id=p_provider_id, label=p_label, endpoint=p_endpoint, region=p_region,
          bucket_id=p_bucket_id, path_style=p_path_style, secret_ref=p_secret_ref,
          connection_state='pending', verified_at=null, last_error=null, updated_at=now()
      where connection_id=p_connection_id
      returning public.raye2_byos_connections.connection_id into v_id;
  else
    insert into public.raye2_byos_connections(
      owner_id,provider_id,label,endpoint,region,bucket_id,path_style,secret_ref
    ) values (
      v_actor,p_provider_id,p_label,p_endpoint,p_region,p_bucket_id,p_path_style,p_secret_ref
    ) returning public.raye2_byos_connections.connection_id into v_id;
  end if;

  return query
    select c.connection_id,c.provider_id,c.label,c.endpoint,c.region,c.bucket_id,
           c.path_style,c.secret_ref,c.connection_state,c.verified_at,c.last_error,c.updated_at
    from public.raye2_byos_connections c where c.connection_id=v_id;
end;
$$;
revoke all on function public.raye2_upsert_byos_connection(uuid,text,text,text,text,text,boolean,text) from public, anon;
grant execute on function public.raye2_upsert_byos_connection(uuid,text,text,text,text,text,boolean,text) to authenticated;

create or replace function public.raye2_delete_byos_connection(p_connection_id uuid)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if v_actor is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  if p_connection_id is null then
    raise exception 'a connection id is required' using errcode='22023';
  end if;
  delete from public.raye2_byos_connections
    where connection_id=p_connection_id and owner_id=v_actor;
  return found;
end;
$$;
revoke all on function public.raye2_delete_byos_connection(uuid) from public, anon;
grant execute on function public.raye2_delete_byos_connection(uuid) to authenticated;

-- A contributor lists only their own connections.
create or replace function public.raye2_my_byos_connections()
returns table(
  connection_id uuid, provider_id text, label text, endpoint text, region text, bucket_id text,
  path_style boolean, secret_ref text, connection_state text, verified_at timestamptz, last_error text, updated_at timestamptz
)
language sql
stable
security definer
set search_path=''
as $$
  select c.connection_id,c.provider_id,c.label,c.endpoint,c.region,c.bucket_id,
         c.path_style,c.secret_ref,c.connection_state,c.verified_at,c.last_error,c.updated_at
  from public.raye2_byos_connections c
  where c.owner_id=auth.uid()
  order by c.updated_at desc;
$$;
revoke all on function public.raye2_my_byos_connections() from public, anon;
grant execute on function public.raye2_my_byos_connections() to authenticated;

-- Admins list every connection (metadata only) and may disable or re-verify one.
create or replace function public.raye2_admin_byos_connections()
returns table(
  connection_id uuid, owner_id uuid, provider_id text, label text, endpoint text, region text,
  bucket_id text, connection_state text, verified_at timestamptz, last_error text, updated_at timestamptz
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
    select c.connection_id,c.owner_id,c.provider_id,c.label,c.endpoint,c.region,
           c.bucket_id,c.connection_state,c.verified_at,c.last_error,c.updated_at
    from public.raye2_byos_connections c
    order by c.updated_at desc
    limit 500;
end;
$$;
revoke all on function public.raye2_admin_byos_connections() from public, anon;
grant execute on function public.raye2_admin_byos_connections() to authenticated;

-- Only a trusted server (service role) may mark a connection verified/failed after it actually probes the bucket.
create or replace function public.raye2_set_byos_connection_state(
  p_connection_id uuid,
  p_state text,
  p_error text default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_state not in ('pending','verified','disabled','failed')
    or (p_error is not null and length(p_error) > 300) then
    raise exception 'invalid connection state' using errcode='22023';
  end if;
  update public.raye2_byos_connections
    set connection_state=p_state,
        verified_at=case when p_state='verified' then now() else verified_at end,
        last_error=case when p_state in ('failed','disabled') then p_error else null end,
        updated_at=now()
    where connection_id=p_connection_id;
  return found;
end;
$$;
revoke all on function public.raye2_set_byos_connection_state(uuid,text,text) from public, anon, authenticated;
grant execute on function public.raye2_set_byos_connection_state(uuid,text,text) to service_role;

-- An admin may disable or re-arm a connection (metadata change only; no secret is touched).
create or replace function public.raye2_admin_set_byos_state(
  p_connection_id uuid,
  p_state text,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_actor uuid := auth.uid();
begin
  if not public.raye2_is_platform_admin() then
    raise exception 'platform administrator required' using errcode='42501';
  end if;
  if p_state not in ('pending','disabled')
    or p_reason is null or length(p_reason) not between 3 and 500 then
    raise exception 'invalid connection state change' using errcode='22023';
  end if;
  update public.raye2_byos_connections
    set connection_state=p_state, updated_at=now()
    where connection_id=p_connection_id;
  if not found then
    raise exception 'bring-your-own-storage connection not found' using errcode='22023';
  end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values (v_actor,'storage.byos.state','byos_connection',p_connection_id::text,p_reason,
            jsonb_build_object('state',p_state));
  return true;
end;
$$;
revoke all on function public.raye2_admin_set_byos_state(uuid,text,text) from public, anon;
grant execute on function public.raye2_admin_set_byos_state(uuid,text,text) to authenticated;

comment on table public.raye2_byos_connections is
  'Contributor bring-your-own-storage connections. Stores only the NAME of a server-side secret, never its value.';

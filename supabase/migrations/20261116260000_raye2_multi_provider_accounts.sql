-- Raye2 storage: pool any number of S3-compatible providers and multiple accounts per provider.
--
-- The control plane originally allowed only three provider kinds (supabase, cloudflare_r2,
-- backblaze_b2). Free/no-card S3-compatible providers (Tigris, Filebase, Storj, ...) and extra
-- accounts of a provider (B2 account #2, ...) are now first-class: provider_id stays the unique
-- instance key (e.g. backblaze_b2_account2) and provider_kind is the routing family (backblaze_b2).
--
-- Credentials remain server-only environment secrets and are never stored here.

-- 1. Allow arbitrary provider kinds ------------------------------------------
alter table public.raye2_storage_providers
  drop constraint if exists raye2_storage_providers_kind_check,
  add constraint raye2_storage_providers_kind_check
    check (provider_kind ~ '^[a-z0-9][a-z0-9_-]{1,62}$');

comment on column public.raye2_storage_providers.provider_kind is
  'Provider family used for routing/failover (e.g. backblaze_b2). provider_id is the unique instance key, so several accounts of one provider can be pooled.';

-- 2. Admin overview includes the provider family ---------------------------------
create or replace function public.raye2_storage_admin_overview()
returns table(section text, key text, label text, value_numeric bigint, value_text text, enabled boolean, detail text)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then raise exception 'owner or admin required' using errcode='42501'; end if;
  return query
    select 'provider'::text, p.provider_id, p.provider_id, p.capacity_bytes,
           p.provider_kind, p.enabled,
           format('kind %s · priority %s · used %s · reserved %s · verified %s',
                  p.provider_kind, p.priority, p.used_bytes, p.reserved_bytes,
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

-- 3. Provider/account inventory for the admin panel ------------------------------
create or replace function public.raye2_storage_provider_list()
returns table(
  provider_id text, provider_kind text, enabled boolean, priority integer, health text,
  capacity_bytes bigint, used_bytes bigint, reserved_bytes bigint, safety_reserve_bytes bigint,
  max_managed_bytes bigint, used_percent numeric, capacity_verified_at timestamptz,
  last_reconciled_at timestamptz, public_bucket text, private_bucket text
)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then raise exception 'owner or admin required' using errcode='42501'; end if;
  return query
    select p.provider_id, p.provider_kind, p.enabled, p.priority, p.health,
           p.capacity_bytes, p.used_bytes, p.reserved_bytes, p.safety_reserve_bytes,
           p.max_managed_bytes,
           case when p.capacity_bytes > 0
                then round((p.used_bytes::numeric * 100) / p.capacity_bytes, 1)
                else null end,
           p.capacity_verified_at, p.last_reconciled_at, p.public_bucket, p.private_bucket
    from public.raye2_storage_providers p
    order by p.priority, p.provider_id;
end;
$$;
revoke all on function public.raye2_storage_provider_list() from public, anon;
grant execute on function public.raye2_storage_provider_list() to authenticated;

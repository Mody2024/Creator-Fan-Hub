-- Idempotent storage deletion accounting and provider-capacity reconciliation.
-- External object deletion/HEAD checks happen in trusted server workers before these RPCs.

create or replace function public.raye2_mark_storage_object_deleted(
  p_object_id uuid,
  p_idempotency_key text
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_object public.raye2_storage_objects%rowtype;
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_object_id is null or p_idempotency_key is null
    or length(p_idempotency_key) not between 8 and 200 then
    raise exception 'invalid storage deletion request' using errcode='22023';
  end if;

  select * into v_object
  from public.raye2_storage_objects
  where object_id=p_object_id
  for update;
  if not found then return false; end if;
  if v_object.object_state='deleted' then return true; end if;
  if v_object.object_state not in ('active','verified','staged','deleting','orphan_candidate') then
    raise exception 'object is not in a deletable state' using errcode='55000';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-owner:' || coalesce(v_object.owner_id::text,'system'),0));
  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-provider:' || v_object.provider_id,0));

  update public.raye2_storage_objects
  set object_state='deleted',deleted_at=now()
  where object_id=p_object_id;

  update public.raye2_storage_providers
  set used_bytes=greatest(0,used_bytes-v_object.size_bytes),updated_at=now()
  where provider_id=v_object.provider_id;

  insert into public.raye2_storage_usage_ledger(
    idempotency_key,provider_id,owner_id,object_id,event_kind,delta_bytes,details
  ) values (
    p_idempotency_key,v_object.provider_id,v_object.owner_id,p_object_id,
    'object_deleted',-v_object.size_bytes,
    jsonb_build_object('bucket',v_object.bucket_id,'key',v_object.object_key)
  ) on conflict(idempotency_key) do nothing;

  return true;
end;
$$;

create or replace function public.raye2_reconcile_storage_provider(
  p_provider_id text,
  p_health text,
  p_capacity_bytes bigint,
  p_safety_reserve_bytes bigint,
  p_max_managed_bytes bigint default null
)
returns table(used_bytes bigint,reserved_bytes bigint,available_bytes bigint,capacity_verified_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_used bigint;
  v_reserved bigint;
  v_capacity_verified_at timestamptz:=now();
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_provider_id not in ('supabase','cloudflare_r2','backblaze_b2')
    or p_health not in ('healthy','degraded','unavailable','unknown')
    or p_capacity_bytes is null or p_capacity_bytes<0
    or p_safety_reserve_bytes is null or p_safety_reserve_bytes<0
    or p_safety_reserve_bytes>p_capacity_bytes
    or (p_max_managed_bytes is not null and (p_max_managed_bytes<0 or p_max_managed_bytes>p_capacity_bytes)) then
    raise exception 'invalid provider capacity reconciliation' using errcode='22023';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('raye2-storage-provider:' || p_provider_id,0));
  select coalesce(sum(size_bytes),0) into v_used
  from public.raye2_storage_objects
  where provider_id=p_provider_id and object_state in ('staged','verified','active','orphan_candidate');
  select coalesce(sum(expected_bytes),0) into v_reserved
  from public.raye2_storage_reservations
  where provider_id=p_provider_id and reservation_state='active' and expires_at>now();

  update public.raye2_storage_providers
  set health=p_health,
      capacity_bytes=p_capacity_bytes,
      safety_reserve_bytes=p_safety_reserve_bytes,
      max_managed_bytes=p_max_managed_bytes,
      used_bytes=v_used,
      reserved_bytes=v_reserved,
      capacity_verified_at=v_capacity_verified_at,
      last_reconciled_at=now(),
      updated_at=now()
  where provider_id=p_provider_id;

  if not found then raise exception 'storage provider is not registered' using errcode='P0002'; end if;
  return query select v_used,v_reserved,
    greatest(0,least(p_capacity_bytes,coalesce(p_max_managed_bytes,p_capacity_bytes))-v_used-v_reserved-p_safety_reserve_bytes),
    v_capacity_verified_at;
end;
$$;

revoke all on function public.raye2_mark_storage_object_deleted(uuid,text) from public,anon,authenticated;
revoke all on function public.raye2_reconcile_storage_provider(text,text,bigint,bigint,bigint) from public,anon,authenticated;
grant execute on function public.raye2_mark_storage_object_deleted(uuid,text) to service_role;
grant execute on function public.raye2_reconcile_storage_provider(text,text,bigint,bigint,bigint) to service_role;

comment on function public.raye2_mark_storage_object_deleted(uuid,text) is
  'Call only after the provider confirms object deletion; updates managed usage idempotently.';
comment on function public.raye2_reconcile_storage_provider(text,text,bigint,bigint,bigint) is
  'Records a server-verified provider capacity snapshot and recomputes managed object and active reservation totals.';

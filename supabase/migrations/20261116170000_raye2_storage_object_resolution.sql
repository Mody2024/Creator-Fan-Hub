-- Raye2 storage object resolution: look up where a logical object (bucket + key) physically lives so
-- read surfaces can deliver it from the correct provider. Additive; the RPC is service-role only and
-- returns metadata only, never credentials.

-- Fast point lookups for the resolve RPC and any registry-driven read path.
create index if not exists raye2_storage_objects_bucket_key_idx
  on public.raye2_storage_objects(bucket_id,object_key);

-- Resolve a batch of logical objects to their current physical location. A trusted server calls this
-- with the service role, then signs or serves each object from the provider it actually lives on.
-- Unknown objects return no row so the caller falls back to the legacy Supabase path.
create or replace function public.raye2_resolve_storage_objects(p_objects jsonb)
returns table(bucket_id text, object_key text, provider_id text, object_state text, visibility text, owner_id uuid)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
  if coalesce(current_setting('request.jwt.claim.role',true),'') <> 'service_role' then
    raise exception 'service role required' using errcode='42501';
  end if;
  if p_objects is null or jsonb_typeof(p_objects) <> 'array' then
    raise exception 'an object array is required' using errcode='22023';
  end if;
  if jsonb_array_length(p_objects) > 200 then
    raise exception 'at most 200 objects may be resolved at once' using errcode='22023';
  end if;

  return query
    select distinct on (o.bucket_id,o.object_key)
           o.bucket_id,o.object_key,o.provider_id,o.object_state,o.visibility,o.owner_id
    from public.raye2_storage_objects o
    join jsonb_to_recordset(p_objects) as r(bucket_id text, object_key text)
      on r.bucket_id=o.bucket_id and r.object_key=o.object_key
    where o.object_state in ('active','verified','staged')
    order by o.bucket_id,o.object_key,o.created_at desc;
end;
$$;
revoke all on function public.raye2_resolve_storage_objects(jsonb) from public, anon, authenticated;
grant execute on function public.raye2_resolve_storage_objects(jsonb) to service_role;

-- Raye2: persist the worker's SHA-256 fingerprint atomically with job completion.
-- The checksum is derived from the downloaded source bytes by the trusted worker;
-- only a matching active lease can write it.
create or replace function public.complete_raye2_media_processing_job(
 p_media_id uuid,p_lease_token uuid,p_success boolean,
 p_result_metadata jsonb default '{}',p_thumbnail_path text default null,p_error text default null
) returns boolean
language plpgsql security definer set search_path='' as $$
declare
 v_rows integer;
 v_checksum text;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'trusted media worker required' using errcode='42501';
 end if;
 if p_result_metadata is null or jsonb_typeof(p_result_metadata)<>'object'
  or char_length(coalesce(p_error,''))>1000
  or char_length(coalesce(p_thumbnail_path,''))>500 then
  raise exception 'invalid processing result' using errcode='22023';
 end if;

 v_checksum:=p_result_metadata #>> '{processing,sourceSha256}';
 if v_checksum is not null and v_checksum !~ '^[a-f0-9]{64}$' then
  raise exception 'invalid source SHA-256 fingerprint' using errcode='22023';
 end if;

 update public.media_items m set
  processing_status=case when p_success then 'ready' else 'failed' end,
  processing_error=case when p_success then null else coalesce(nullif(btrim(p_error),''),'Media processing failed.') end,
  processing_completed_at=case when p_success then now() else null end,
  processing_updated_at=now(),
  processing_lease_until=null,
  processing_lease_token=null,
  thumbnail_path=case when p_success then p_thumbnail_path else m.thumbnail_path end,
  checksum_sha256=case when p_success then coalesce(v_checksum,m.checksum_sha256) else m.checksum_sha256 end,
  metadata=coalesce(m.metadata,'{}'::jsonb)||p_result_metadata
 where m.id=p_media_id and m.processing_status='processing'
  and m.processing_lease_token=p_lease_token;
 get diagnostics v_rows=row_count;
 return v_rows=1;
end;
$$;

revoke all on function public.complete_raye2_media_processing_job(uuid,uuid,boolean,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.complete_raye2_media_processing_job(uuid,uuid,boolean,jsonb,text,text) to service_role;

comment on function public.complete_raye2_media_processing_job(uuid,uuid,boolean,jsonb,text,text) is
 'Completes a trusted Raye2 media job under its active lease and persists a validated SHA-256 source fingerprint.';

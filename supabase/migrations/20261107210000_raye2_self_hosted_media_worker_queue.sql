-- Raye2: lease-based processing queue for a self-hosted, zero-cost worker.
-- Only the trusted service-role worker may claim jobs, complete jobs or reserve
-- thumbnail capacity. Creator sessions cannot forge processing completion.
alter table public.media_items
 add column if not exists processing_lease_until timestamptz,
 add column if not exists processing_lease_token uuid,
 add column if not exists thumbnail_path text;

create index if not exists media_items_processing_claim_idx
 on public.media_items(processing_status,processing_updated_at,created_at)
 where processing_status in ('uploaded','failed','processing');

create or replace function public.claim_raye2_media_processing_job()
returns table(
 media_id uuid,owner_id uuid,media_type text,storage_path text,
 mime_type text,metadata jsonb,processing_attempts integer,lease_token uuid
)
language plpgsql security definer set search_path='' as $$
declare v_id uuid; v_token uuid:=gen_random_uuid();
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'trusted media worker required' using errcode='42501';
 end if;
 select m.id into v_id from public.media_items m
 where m.storage_path is not null
  and m.media_type in ('image','sprite','video','audio')
  and m.processing_attempts<5
  and (
   m.processing_status='uploaded'
   or (m.processing_status='failed' and m.processing_updated_at<now()-interval '2 minutes')
   or (m.processing_status='processing' and m.processing_lease_until<now())
  )
 order by m.created_at
 for update skip locked limit 1;
 if v_id is null then return; end if;
 return query
 update public.media_items m set
  processing_status='processing',
  processing_attempts=m.processing_attempts+1,
  processing_error=null,
  processing_updated_at=now(),
  processing_lease_until=now()+interval '20 minutes',
  processing_lease_token=v_token
 where m.id=v_id
 returning m.id,m.owner_id,m.media_type,m.storage_path,m.mime_type,m.metadata,
  m.processing_attempts,m.processing_lease_token;
end;
$$;
revoke all on function public.claim_raye2_media_processing_job() from public,anon,authenticated;
grant execute on function public.claim_raye2_media_processing_job() to service_role;

create or replace function public.complete_raye2_media_processing_job(
 p_media_id uuid,p_lease_token uuid,p_success boolean,
 p_result_metadata jsonb default '{}',p_thumbnail_path text default null,p_error text default null
) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_rows integer;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'trusted media worker required' using errcode='42501';
 end if;
 if p_result_metadata is null or jsonb_typeof(p_result_metadata)<>'object'
  or char_length(coalesce(p_error,''))>1000
  or char_length(coalesce(p_thumbnail_path,''))>500 then
  raise exception 'invalid processing result' using errcode='22023';
 end if;
 update public.media_items m set
  processing_status=case when p_success then 'ready' else 'failed' end,
  processing_error=case when p_success then null else coalesce(nullif(btrim(p_error),''),'Media processing failed.') end,
  processing_completed_at=case when p_success then now() else null end,
  processing_updated_at=now(),
  processing_lease_until=null,
  processing_lease_token=null,
  thumbnail_path=case when p_success then p_thumbnail_path else m.thumbnail_path end,
  metadata=coalesce(m.metadata,'{}'::jsonb)||p_result_metadata
 where m.id=p_media_id and m.processing_status='processing'
  and m.processing_lease_token=p_lease_token;
 get diagnostics v_rows=row_count;
 return v_rows=1;
end;
$$;
revoke all on function public.complete_raye2_media_processing_job(uuid,uuid,boolean,jsonb,text,text) from public,anon,authenticated;
grant execute on function public.complete_raye2_media_processing_job(uuid,uuid,boolean,jsonb,text,text) to service_role;

create or replace function public.reserve_raye2_worker_thumbnail_capacity(
 p_owner_id uuid,p_bucket text,p_bytes bigint
) returns uuid
language plpgsql security definer set search_path='' as $$
declare v_used bigint; v_reserved bigint; v_id uuid; v_quota bigint:=786432000;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'trusted media worker required' using errcode='42501';
 end if;
 if p_owner_id is null or p_bucket not in ('creator-media-private','creator-media-public')
  or p_bytes is null or p_bytes<1 or p_bytes>52428800 then
  raise exception 'invalid worker storage reservation' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended('nhen-project-storage-quota',0));
 delete from public.nhen_media_upload_reservations where expires_at<=now();
 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0)
 into v_used from storage.objects o;
 select coalesce(sum(r.expected_bytes),0) into v_reserved
 from public.nhen_media_upload_reservations r where r.expires_at>now();
 if v_used+v_reserved+p_bytes>v_quota then
  raise exception 'Raye2 free storage safety limit reached; thumbnail was not stored.' using errcode='53100';
 end if;
 insert into public.nhen_media_upload_reservations(user_id,bucket_id,expected_bytes,expires_at)
 values(p_owner_id,p_bucket,p_bytes,now()+interval '20 minutes') returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.reserve_raye2_worker_thumbnail_capacity(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_raye2_worker_thumbnail_capacity(uuid,text,bigint) to service_role;

create or replace function public.release_raye2_worker_thumbnail_capacity(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path='' as $$
declare v_rows integer;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'trusted media worker required' using errcode='42501';
 end if;
 delete from public.nhen_media_upload_reservations where id=p_reservation_id;
 get diagnostics v_rows=row_count;
 return v_rows=1;
end;
$$;
revoke all on function public.release_raye2_worker_thumbnail_capacity(uuid) from public,anon,authenticated;
grant execute on function public.release_raye2_worker_thumbnail_capacity(uuid) to service_role;

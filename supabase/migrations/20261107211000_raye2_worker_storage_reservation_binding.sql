-- Allow only the trusted service-role worker to consume an explicit
-- owner-bound reservation for generated thumbnail objects. User uploads keep
-- the existing auth.uid()-bound path. The worker cannot bypass the byte quota.
create or replace function public.enforce_nhen_storage_upload_reservation()
returns trigger language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();
 v_owner uuid;
 v_bytes bigint;
 v_reservation_id uuid;
begin
 if new.bucket_id not in ('creator-media-private','creator-media-public','nhen-community-shorts') then
  return new;
 end if;
 if coalesce(new.metadata->>'size','') !~ '^[0-9]+$' then
  raise exception 'NHEN upload size metadata is required' using errcode='22023';
 end if;
 v_bytes:=(new.metadata->>'size')::bigint;

 if auth.role()='service_role' then
  if split_part(new.name,'/',1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}
  v_owner:=v_user;
  if v_owner is null then
   raise exception 'authenticated NHEN upload reservation required' using errcode='42501';
  end if;
 end if;

 delete from public.nhen_media_upload_reservations r
 where r.id=(
  select candidate.id from public.nhen_media_upload_reservations candidate
  where candidate.user_id=v_owner and candidate.bucket_id=new.bucket_id
   and candidate.expected_bytes=v_bytes and candidate.expires_at>now()
  order by candidate.created_at for update skip locked limit 1
 )
 returning r.id into v_reservation_id;
 if v_reservation_id is null then
  raise exception 'NHEN upload reservation missing, expired, or mismatched' using errcode='53100';
 end if;
 return new;
end;
$$;
revoke all on function public.enforce_nhen_storage_upload_reservation() from public,anon,authenticated;
grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated,service_role;
 then
   raise exception 'worker upload path must begin with a valid owner id' using errcode='22023';
  end if;
  v_owner:=split_part(new.name,'/',1)::uuid;
 else
  v_owner:=v_user;
  if v_owner is null then
   raise exception 'authenticated NHEN upload reservation required' using errcode='42501';
  end if;
 end if;

 delete from public.nhen_media_upload_reservations r
 where r.id=(
  select candidate.id from public.nhen_media_upload_reservations candidate
  where candidate.user_id=v_owner and candidate.bucket_id=new.bucket_id
   and candidate.expected_bytes=v_bytes and candidate.expires_at>now()
  order by candidate.created_at for update skip locked limit 1
 )
 returning r.id into v_reservation_id;
 if v_reservation_id is null then
  raise exception 'NHEN upload reservation missing, expired, or mismatched' using errcode='53100';
 end if;
 return new;
end;
$$;
revoke all on function public.enforce_nhen_storage_upload_reservation() from public,anon,authenticated;
grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated,service_role;

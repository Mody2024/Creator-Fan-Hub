-- Enforce reservation-backed storage writes even if a client bypasses NHEN's upload UI.
-- The Storage API inserts the object row after TUS finalization; its metadata includes the declared size.
create or replace function public.enforce_nhen_storage_upload_reservation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_bytes bigint;
begin
 if new.bucket_id not in ('creator-media-private','creator-media-public','nhen-community-shorts') then
  return new;
 end if;

 if v_user is null then
  raise exception 'authenticated NHEN upload reservation required' using errcode='42501';
 end if;

 if coalesce(new.metadata->>'size','') !~ '^[0-9]+$' then
  raise exception 'NHEN upload size metadata is required' using errcode='22023';
 end if;
 v_bytes:=(new.metadata->>'size')::bigint;

 if not exists(
  select 1
  from public.nhen_media_upload_reservations r
  where r.user_id=v_user
   and r.bucket_id=new.bucket_id
   and r.expected_bytes=v_bytes
   and r.expires_at>now()
 ) then
  raise exception 'NHEN storage reservation missing or expired; request capacity before uploading' using errcode='53100';
 end if;

 return new;
end;
$$;

revoke all on function public.enforce_nhen_storage_upload_reservation() from public,anon,authenticated;
grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated;
drop trigger if exists enforce_nhen_storage_upload_reservation on storage.objects;
create trigger enforce_nhen_storage_upload_reservation
before insert on storage.objects
for each row execute function public.enforce_nhen_storage_upload_reservation();

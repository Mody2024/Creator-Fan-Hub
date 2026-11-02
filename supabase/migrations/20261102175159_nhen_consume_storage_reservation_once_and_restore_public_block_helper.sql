-- Public RLS policies call this helper. For anon auth.uid() is NULL,
-- so this returns false without revealing member block relationships.
grant execute on function public.is_member_blocked(uuid) to anon;

-- Consume one matching reservation atomically when a Storage object is created.
-- Do not bind to a reservation UUID in TUS metadata: a resumed TUS resource
-- retains its original metadata even after an expired reservation is renewed.
create or replace function public.enforce_nhen_storage_upload_reservation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_bytes bigint;
 v_consumed_id uuid;
begin
 if new.bucket_id not in ('creator-media-private','creator-media-public','nhen-community-shorts') then return new; end if;
 if v_user is null then raise exception 'authenticated NHEN upload reservation required' using errcode='42501'; end if;
 if coalesce(new.metadata->>'size','') !~ '^[0-9]+$' then raise exception 'NHEN storage upload size metadata is required' using errcode='22023'; end if;
 v_bytes:=(new.metadata->>'size')::bigint;
 delete from public.nhen_media_upload_reservations r
 where r.id=(
  select candidate.id from public.nhen_media_upload_reservations candidate
  where candidate.user_id=v_user and candidate.bucket_id=new.bucket_id
   and candidate.expected_bytes=v_bytes and candidate.expires_at>now()
  order by candidate.created_at for update skip locked limit 1
 )
 returning r.id into v_consumed_id;
 if v_consumed_id is null then raise exception 'NHEN upload reservation is missing, expired, or already used for this file' using errcode='53100'; end if;
 return new;
end;
$$;
revoke all on function public.enforce_nhen_storage_upload_reservation() from public,anon,authenticated;
grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated;

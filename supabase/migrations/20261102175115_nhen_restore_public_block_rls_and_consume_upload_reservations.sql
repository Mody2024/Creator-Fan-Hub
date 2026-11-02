-- Public RLS policies call this helper. For anon auth.uid() is NULL,
-- so this function returns false without revealing block relationships.
grant execute on function public.is_member_blocked(uuid) to anon;

-- First hardening iteration: require a reservation id in TUS object metadata.
-- Superseded below by a matching one-time reservation consume that also supports
-- resumable sessions after their original reservation expires.
create or replace function public.enforce_nhen_storage_upload_reservation()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_bytes bigint;
 v_reservation_id uuid;
 v_consumed_id uuid;
begin
 if new.bucket_id not in ('creator-media-private','creator-media-public','nhen-community-shorts') then return new; end if;
 if v_user is null then raise exception 'authenticated NHEN upload reservation required' using errcode='42501'; end if;
 if coalesce(new.metadata->>'size','') !~ '^[0-9]+$' then raise exception 'NHEN storage upload size metadata is required' using errcode='22023'; end if;
 if coalesce(new.metadata->>'reservationId','') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then raise exception 'NHEN storage upload reservation id is required' using errcode='22023'; end if;
 v_bytes:=(new.metadata->>'size')::bigint;
 v_reservation_id:=(new.metadata->>'reservationId')::uuid;
 delete from public.nhen_media_upload_reservations r
 where r.id=v_reservation_id and r.user_id=v_user and r.bucket_id=new.bucket_id
  and r.expected_bytes=v_bytes and r.expires_at>now()
 returning r.id into v_consumed_id;
 if v_consumed_id is null then raise exception 'NHEN upload reservation is missing, expired, already used, or does not match this file' using errcode='53100'; end if;
 return new;
end;
$$;
revoke all on function public.enforce_nhen_storage_upload_reservation() from public,anon,authenticated;
grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated;

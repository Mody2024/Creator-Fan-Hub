-- Extend an authenticated creator/member's matching in-progress upload reservation.
-- The reservation must still be active and match the same owner, bucket and byte count.
create or replace function public.reuse_nhen_media_upload_reservation(
 p_reservation_id uuid,
 p_bytes bigint,
 p_bucket text
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare v_user uuid:=auth.uid();
begin
 if v_user is null then raise exception 'sign in required' using errcode='42501'; end if;
 update public.nhen_media_upload_reservations
 set expires_at=now()+interval '1 hour'
 where id=p_reservation_id
   and user_id=v_user
   and bucket_id=p_bucket
   and expected_bytes=p_bytes
   and expires_at>now();
 return found;
end;
$$;
revoke all on function public.reuse_nhen_media_upload_reservation(uuid,bigint,text) from public,anon;
grant execute on function public.reuse_nhen_media_upload_reservation(uuid,bigint,text) to authenticated;

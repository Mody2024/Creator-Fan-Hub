-- Keep long-running media processing jobs leased to their active worker.
-- A stale or expired lease cannot be resurrected by a delayed heartbeat.
create or replace function public.renew_raye2_media_processing_lease(
 p_media_id uuid,p_lease_token uuid
) returns boolean
language plpgsql security definer set search_path='' as $$
declare v_rows integer;
begin
 if auth.role() is distinct from 'service_role' then
  raise exception 'trusted media worker required' using errcode='42501';
 end if;
 update public.media_items m set
  processing_lease_until=now()+interval '20 minutes',
  processing_updated_at=now()
 where m.id=p_media_id
  and m.processing_status='processing'
  and m.processing_lease_token=p_lease_token
  and m.processing_lease_until>now();
 get diagnostics v_rows=row_count;
 return v_rows=1;
end;
$$;

revoke all on function public.renew_raye2_media_processing_lease(uuid,uuid) from public,anon,authenticated;
grant execute on function public.renew_raye2_media_processing_lease(uuid,uuid) to service_role;

comment on function public.renew_raye2_media_processing_lease(uuid,uuid) is
 'Extends an unexpired Raye2 media-processing lease only for the matching trusted worker token.';

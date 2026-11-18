-- Give creators a safe, bounded recovery action for failed private media.
-- Actual processing remains exclusively owned by the trusted service-role worker.
alter table public.media_items
 add column if not exists manual_processing_retries integer not null default 0;

alter table public.media_items
 drop constraint if exists media_items_manual_processing_retries_check,
 add constraint media_items_manual_processing_retries_check
 check(manual_processing_retries between 0 and 2);

create or replace function public.retry_raye2_media_processing(p_media_id uuid)
returns table(retried boolean,result_code text,manual_retries_remaining integer)
language plpgsql security definer set search_path='' as $$
declare
 v_user uuid:=auth.uid();
 v_media public.media_items%rowtype;
begin
 if v_user is null or not exists(
  select 1 from public.creator_admins a
  where a.user_id=v_user and a.active=true and a.role in ('owner','admin','creator')
 ) then
  raise exception 'creator access required' using errcode='42501';
 end if;
 if p_media_id is null then
  raise exception 'media id required' using errcode='22023';
 end if;

 select * into v_media from public.media_items m
 where m.id=p_media_id and m.owner_id=v_user
 for update;
 if not found then
  return query select false,'not_found_or_not_owned'::text,0;
  return;
 end if;
 if v_media.media_type not in ('video','image','sprite','audio')
  or v_media.is_published
  or v_media.processing_status<>'failed'
  or (v_media.processing_lease_until is not null and v_media.processing_lease_until>now()) then
  return query select false,'not_retryable'::text,greatest(0,2-v_media.manual_processing_retries);
  return;
 end if;
 if v_media.manual_processing_retries>=2 then
  return query select false,'retry_limit'::text,0;
  return;
 end if;

 update public.media_items set
  processing_status='uploaded',
  processing_attempts=0,
  processing_error=null,
  processing_completed_at=null,
  processing_lease_until=null,
  processing_lease_token=null,
  manual_processing_retries=manual_processing_retries+1,
  processing_updated_at=now()
 where id=p_media_id and owner_id=v_user;

 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(v_user,'media.processing_retry_requested','media',p_media_id::text,
  jsonb_build_object('manual_retry',v_media.manual_processing_retries+1));

 return query select true,'queued'::text,1-v_media.manual_processing_retries;
end;
$$;

revoke all on function public.retry_raye2_media_processing(uuid) from public,anon;
grant execute on function public.retry_raye2_media_processing(uuid) to authenticated;

comment on function public.retry_raye2_media_processing(uuid) is
 'Queues a bounded manual retry for an owner-bound failed private asset; it never marks media ready or performs processing.';

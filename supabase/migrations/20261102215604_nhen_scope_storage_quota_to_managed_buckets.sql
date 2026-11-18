-- Keep NHEN storage quota metrics scoped to the buckets NHEN owns.
-- Counting unrelated project buckets can falsely exhaust or inflate NHEN's quota.
create or replace function public.get_nhen_storage_capacity()
returns table(used_bytes bigint,reserved_bytes bigint,quota_bytes bigint,available_bytes bigint,usage_percent numeric)
language plpgsql security definer set search_path=''
as $$
declare v_used bigint; v_reserved bigint; v_quota bigint:=786432000;
begin
 if auth.uid() is null or not public.is_nhen_video_publisher() then
  raise exception 'creator access required' using errcode='42501';
 end if;
 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0)
 into v_used from storage.objects o
 where o.bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts');
 select coalesce(sum(r.expected_bytes),0) into v_reserved
 from public.nhen_media_upload_reservations r where r.expires_at>now();
 return query select v_used,v_reserved,v_quota,greatest(0,v_quota-v_used-v_reserved),round((v_used+v_reserved)::numeric*100/v_quota,1);
end; $$;

create or replace function public.get_nhen_media_health()
returns table(used_bytes bigint,reserved_bytes bigint,quota_bytes bigint,available_bytes bigint,usage_percent numeric,orphan_candidate_count bigint,orphan_candidate_bytes bigint,oldest_orphan_candidate_at timestamptz,expired_reservations_cleaned integer)
language plpgsql security definer set search_path=''
as $$
declare v_used bigint; v_reserved bigint; v_quota bigint:=786432000; v_orphan_count bigint; v_orphan_bytes bigint; v_oldest timestamptz; v_expired integer;
begin
 if auth.uid() is null or not public.is_nhen_video_publisher() then raise exception 'creator access required' using errcode='42501'; end if;
 delete from public.nhen_media_upload_reservations where expires_at<=now();
 get diagnostics v_expired=row_count;
 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0)
 into v_used from storage.objects o
 where o.bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts');
 select coalesce(sum(r.expected_bytes),0) into v_reserved
 from public.nhen_media_upload_reservations r where r.expires_at>now();
 with candidates as (
  select o.created_at,case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end as bytes
  from storage.objects o
  where o.bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts')
   and o.created_at<now()-interval '24 hours'
   and ((o.bucket_id in ('creator-media-private','creator-media-public') and not exists(select 1 from public.media_items m where m.storage_path=o.bucket_id||'/'||o.name))
    or (o.bucket_id='nhen-community-shorts' and not exists(select 1 from public.community_short_videos c where c.storage_path=o.name)))
 )
 select count(*),coalesce(sum(bytes),0),min(created_at) into v_orphan_count,v_orphan_bytes,v_oldest from candidates;
 return query select v_used,v_reserved,v_quota,greatest(0,v_quota-v_used-v_reserved),round((v_used+v_reserved)::numeric*100/v_quota,1),v_orphan_count,v_orphan_bytes,v_oldest,v_expired;
end; $$;

revoke all on function public.get_nhen_storage_capacity() from public,anon;
grant execute on function public.get_nhen_storage_capacity() to authenticated;
revoke all on function public.get_nhen_media_health() from public,anon;
grant execute on function public.get_nhen_media_health() to authenticated;
notify pgrst,'reload schema';

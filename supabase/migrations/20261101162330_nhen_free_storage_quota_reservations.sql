-- Conservative free-plan storage guard for all NHEN uploads.
-- 750 MiB application ceiling leaves a reserve below Supabase Free's 1 GiB storage cap.
create table if not exists public.nhen_media_upload_reservations (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 bucket_id text not null check(bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts')),
 expected_bytes bigint not null check(expected_bytes between 1 and 52428800),
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default (now()+interval '1 hour')
);
create index if not exists nhen_media_upload_reservations_expiry_idx on public.nhen_media_upload_reservations(expires_at);
alter table public.nhen_media_upload_reservations enable row level security;
revoke all on public.nhen_media_upload_reservations from anon,authenticated;
create or replace function public.reserve_nhen_media_upload(p_bytes bigint,p_bucket text)
returns table(reservation_id uuid,used_bytes bigint,reserved_bytes bigint,quota_bytes bigint,available_bytes bigint)
language plpgsql security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_used bigint; v_reserved bigint; v_quota bigint:=786432000; v_id uuid;
begin
 if v_user is null then raise exception 'sign in required' using errcode='42501'; end if;
 if p_bytes is null or p_bytes<1 or p_bytes>52428800 then raise exception 'file must be between 1 byte and 50 MiB' using errcode='22023'; end if;
 if p_bucket not in ('creator-media-private','creator-media-public','nhen-community-shorts') then raise exception 'unsupported NHEN media bucket' using errcode='22023'; end if;
 if p_bucket in ('creator-media-private','creator-media-public') and not public.is_nhen_video_publisher() then raise exception 'assigned creator access required' using errcode='42501'; end if;
 perform pg_advisory_xact_lock(hashtextextended('nhen-project-storage-quota',0));
 delete from public.nhen_media_upload_reservations where expires_at<=now();
 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0) into v_used from storage.objects o;
 select coalesce(sum(r.expected_bytes),0) into v_reserved from public.nhen_media_upload_reservations r where r.expires_at>now();
 if v_used+v_reserved+p_bytes>v_quota then raise exception 'NHEN free storage safety limit reached. Existing files use % bytes and active uploads reserve % bytes; no upload was started.',v_used,v_reserved using errcode='53100'; end if;
 insert into public.nhen_media_upload_reservations(user_id,bucket_id,expected_bytes) values(v_user,p_bucket,p_bytes) returning id into v_id;
 return query select v_id,v_used,v_reserved,v_quota,greatest(0,v_quota-v_used-v_reserved-p_bytes);
end;
$$;
create or replace function public.release_nhen_media_upload_reservation(p_reservation_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_deleted integer;
begin
 if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
 delete from public.nhen_media_upload_reservations where id=p_reservation_id and user_id=auth.uid();
 get diagnostics v_deleted=row_count;
 return v_deleted>0;
end;
$$;
create or replace function public.get_nhen_storage_capacity()
returns table(used_bytes bigint,reserved_bytes bigint,quota_bytes bigint,available_bytes bigint,usage_percent numeric)
language plpgsql stable security definer set search_path=''
as $$
declare v_used bigint; v_reserved bigint; v_quota bigint:=786432000;
begin
 if auth.uid() is null or not public.is_nhen_video_publisher() then raise exception 'creator access required' using errcode='42501'; end if;
 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$' then (o.metadata->>'size')::bigint else 0 end),0) into v_used from storage.objects o;
 select coalesce(sum(r.expected_bytes),0) into v_reserved from public.nhen_media_upload_reservations r where r.expires_at>now();
 return query select v_used,v_reserved,v_quota,greatest(0,v_quota-v_used-v_reserved),round((v_used+v_reserved)::numeric*100/v_quota,1);
end;
$$;
revoke all on function public.reserve_nhen_media_upload(bigint,text) from public,anon;
grant execute on function public.reserve_nhen_media_upload(bigint,text) to authenticated;
revoke all on function public.release_nhen_media_upload_reservation(uuid) from public,anon;
grant execute on function public.release_nhen_media_upload_reservation(uuid) to authenticated;
revoke all on function public.get_nhen_storage_capacity() from public,anon;
grant execute on function public.get_nhen_storage_capacity() to authenticated;

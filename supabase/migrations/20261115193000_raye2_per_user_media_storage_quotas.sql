-- Raye2: give every account a separate logical media-storage allowance.
-- Physical bytes still live in the shared provider bucket; owner prefixes and
-- this ledger provide isolation without pretending that per-user quotas add capacity.
create table if not exists public.raye2_user_storage_quota_overrides (
  user_id uuid primary key references auth.users(id) on delete cascade,
  quota_bytes bigint not null check (quota_bytes between 0 and 10737418240),
  reason text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.raye2_user_storage_quota_overrides enable row level security;
revoke all on public.raye2_user_storage_quota_overrides from public, anon, authenticated;
grant select, insert, update, delete on public.raye2_user_storage_quota_overrides to service_role;

create or replace function public.get_raye2_user_storage_capacity()
returns table(
  used_bytes bigint,
  reserved_bytes bigint,
  quota_bytes bigint,
  available_bytes bigint,
  usage_percent numeric
)
language plpgsql
stable
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_used bigint;
  v_reserved bigint;
  v_quota bigint;
begin
  if v_user is null then
    raise exception 'sign in required' using errcode='42501';
  end if;

  select coalesce(
    (select q.quota_bytes from public.raye2_user_storage_quota_overrides q where q.user_id=v_user),
    case when public.is_nhen_video_publisher() then 262144000 else 104857600 end
  ) into v_quota;

  select coalesce(sum(
    case when (o.metadata->>'size') ~ '^[0-9]+$'
      then (o.metadata->>'size')::bigint else 0 end
  ),0)
  into v_used
  from storage.objects o
  where o.bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts')
    and split_part(o.name,'/',1)=v_user::text;

  select coalesce(sum(r.expected_bytes),0)
  into v_reserved
  from public.nhen_media_upload_reservations r
  where r.user_id=v_user and r.expires_at>now();

  return query
  select v_used,v_reserved,v_quota,greatest(0,v_quota-v_used-v_reserved),
    case when v_quota=0 then 100::numeric
      else round((v_used+v_reserved)::numeric*100/v_quota,1) end;
end;
$$;

revoke all on function public.get_raye2_user_storage_capacity() from public, anon;
grant execute on function public.get_raye2_user_storage_capacity() to authenticated;

-- Trusted admin API only: NULL resets the user to the role-based default.
-- Never expose this function directly to browser sessions.
create or replace function public.set_raye2_user_storage_quota(
  p_user_id uuid,
  p_quota_bytes bigint,
  p_reason text default ''
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'trusted admin service required' using errcode='42501';
  end if;
  if p_user_id is null or (p_quota_bytes is not null and p_quota_bytes not between 0 and 10737418240)
    or length(coalesce(p_reason,''))>500 then
    raise exception 'invalid user storage quota' using errcode='22023';
  end if;

  if p_quota_bytes is null then
    delete from public.raye2_user_storage_quota_overrides where user_id=p_user_id;
  else
    insert into public.raye2_user_storage_quota_overrides(user_id,quota_bytes,reason,updated_by)
    values(p_user_id,p_quota_bytes,left(coalesce(p_reason,''),500),auth.uid())
    on conflict(user_id) do update set
      quota_bytes=excluded.quota_bytes,
      reason=excluded.reason,
      updated_by=excluded.updated_by,
      updated_at=now();
  end if;
  return true;
end;
$$;

revoke all on function public.set_raye2_user_storage_quota(uuid,bigint,text) from public, anon, authenticated;
grant execute on function public.set_raye2_user_storage_quota(uuid,bigint,text) to service_role;

-- Preserve the existing 750 MiB project safety ceiling and add a per-account
-- ceiling before accepting any creator/community upload.
create or replace function public.reserve_nhen_media_upload(p_bytes bigint,p_bucket text)
returns table(reservation_id uuid,used_bytes bigint,reserved_bytes bigint,quota_bytes bigint,available_bytes bigint)
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_used bigint;
  v_reserved bigint;
  v_user_used bigint;
  v_user_reserved bigint;
  v_user_quota bigint;
  v_quota bigint := 786432000;
  v_id uuid;
begin
  if v_user is null then
    raise exception 'sign in required' using errcode='42501';
  end if;
  if p_bytes is null or p_bytes<1 or p_bytes>52428800 then
    raise exception 'file must be between 1 byte and 50 MiB' using errcode='22023';
  end if;
  if p_bucket not in ('creator-media-private','creator-media-public','nhen-community-shorts') then
    raise exception 'unsupported Raye2 media bucket' using errcode='22023';
  end if;
  if p_bucket in ('creator-media-private','creator-media-public') and not public.is_nhen_video_publisher() then
    raise exception 'assigned creator access required' using errcode='42501';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('nhen-project-storage-quota',0));
  delete from public.nhen_media_upload_reservations where expires_at<=now();

  select coalesce(
    (select q.quota_bytes from public.raye2_user_storage_quota_overrides q where q.user_id=v_user),
    case when public.is_nhen_video_publisher() then 262144000 else 104857600 end
  ) into v_user_quota;

  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
    then (o.metadata->>'size')::bigint else 0 end),0)
  into v_user_used
  from storage.objects o
  where o.bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts')
    and split_part(o.name,'/',1)=v_user::text;

  select coalesce(sum(r.expected_bytes),0) into v_user_reserved
  from public.nhen_media_upload_reservations r
  where r.user_id=v_user and r.expires_at>now();

  if v_user_used+v_user_reserved+p_bytes>v_user_quota then
    raise exception 'Your Raye2 account storage allowance is full. Used: % bytes; reserved: % bytes; allowance: % bytes. Delete an eligible file or ask an administrator to review your quota.',
      v_user_used,v_user_reserved,v_user_quota using errcode='53100';
  end if;

  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
    then (o.metadata->>'size')::bigint else 0 end),0)
  into v_used
  from storage.objects o
  where o.bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts');

  select coalesce(sum(r.expected_bytes),0) into v_reserved
  from public.nhen_media_upload_reservations r where r.expires_at>now();

  if v_used+v_reserved+p_bytes>v_quota then
    raise exception 'Raye2 managed storage safety limit reached. Existing files use % bytes and active uploads reserve % bytes; no upload was started.',
      v_used,v_reserved using errcode='53100';
  end if;

  insert into public.nhen_media_upload_reservations(user_id,bucket_id,expected_bytes)
  values(v_user,p_bucket,p_bytes) returning id into v_id;

  return query
  select v_id,v_used,v_reserved,v_quota,greatest(0,v_quota-v_used-v_reserved-p_bytes);
end;
$$;

revoke all on function public.reserve_nhen_media_upload(bigint,text) from public, anon;
grant execute on function public.reserve_nhen_media_upload(bigint,text) to authenticated;

-- Worker-generated thumbnails/HLS are charged to the same owner's allowance.
create or replace function public.reserve_raye2_worker_thumbnail_capacity(
  p_owner_id uuid,p_bucket text,p_bytes bigint
) returns uuid
language plpgsql
security definer
set search_path=''
as $$
declare
  v_used bigint;
  v_reserved bigint;
  v_user_used bigint;
  v_user_reserved bigint;
  v_user_quota bigint;
  v_id uuid;
  v_quota bigint := 786432000;
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

  select coalesce(
    (select q.quota_bytes from public.raye2_user_storage_quota_overrides q where q.user_id=p_owner_id),
    262144000
  ) into v_user_quota;

  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
    then (o.metadata->>'size')::bigint else 0 end),0)
  into v_user_used
  from storage.objects o
  where o.bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts')
    and split_part(o.name,'/',1)=p_owner_id::text;

  select coalesce(sum(r.expected_bytes),0) into v_user_reserved
  from public.nhen_media_upload_reservations r
  where r.user_id=p_owner_id and r.expires_at>now();

  if v_user_used+v_user_reserved+p_bytes>v_user_quota then
    raise exception 'Raye2 creator storage allowance reached; generated media was not stored.' using errcode='53100';
  end if;

  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
    then (o.metadata->>'size')::bigint else 0 end),0)
  into v_used from storage.objects o
  where o.bucket_id in ('creator-media-private','creator-media-public','nhen-community-shorts');

  select coalesce(sum(r.expected_bytes),0) into v_reserved
  from public.nhen_media_upload_reservations r where r.expires_at>now();

  if v_used+v_reserved+p_bytes>v_quota then
    raise exception 'Raye2 free storage safety limit reached; generated media was not stored.' using errcode='53100';
  end if;

  insert into public.nhen_media_upload_reservations(user_id,bucket_id,expected_bytes,expires_at)
  values(p_owner_id,p_bucket,p_bytes,now()+interval '20 minutes') returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.reserve_raye2_worker_thumbnail_capacity(uuid,text,bigint) from public, anon, authenticated;
grant execute on function public.reserve_raye2_worker_thumbnail_capacity(uuid,text,bigint) to service_role;

notify pgrst,'reload schema';

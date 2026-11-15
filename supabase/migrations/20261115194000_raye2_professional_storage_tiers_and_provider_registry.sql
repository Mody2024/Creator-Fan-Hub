-- Raye2 professional storage tiers and a strict-free provider registry.
-- This is policy/control-plane groundwork only. It does not enable external storage
-- or increase physical capacity until a provider adapter is deployed and verified.

-- 1. Extend the existing admin-tunable role quota matrix with storage bytes.
alter table public.raye2_role_quotas drop constraint if exists raye2_role_quotas_metric_check;
alter table public.raye2_role_quotas add constraint raye2_role_quotas_metric_check
  check (metric in (
    'long_videos_per_month','long_video_cooldown_days','streams_per_month',
    'streams_per_week','minis_per_month','moments_per_month','storage_bytes'
  ));

insert into public.raye2_role_quotas(tier,metric,limit_value,description) values
 ('creator','storage_bytes',21474836480,'Creator: 20 GiB requested allowance, subject to shared provider capacity.'),
 ('streamer','storage_bytes',21474836480,'Streamer: 20 GiB requested allowance, subject to shared provider capacity.'),
 ('combined','storage_bytes',32212254720,'Creator+Streamer: 30 GiB combined requested allowance, not additive.')
on conflict(tier,metric) do update
set limit_value=excluded.limit_value,description=excluded.description,updated_at=now();

-- 2. Registry for approved physical backends. Only service_role can change it.
-- A provider must be marked free_only and have hard-stop budgets before activation.
create table if not exists public.raye2_storage_providers (
  provider_key text primary key check (provider_key ~ '^[a-z0-9_-]{2,40}$'),
  provider_kind text not null check (provider_kind in ('supabase','s3_compatible','external_hosted')),
  enabled boolean not null default false,
  billing_mode text not null default 'free_only' check (billing_mode='free_only'),
  capacity_bytes bigint not null default 0 check (capacity_bytes between 0 and 10995116277760),
  monthly_write_ops_limit bigint not null default 0 check (monthly_write_ops_limit>=0),
  monthly_read_ops_limit bigint not null default 0 check (monthly_read_ops_limit>=0),
  monthly_egress_bytes_limit bigint not null default 0 check (monthly_egress_bytes_limit>=0),
  hard_stop_percent numeric(5,2) not null default 85 check (hard_stop_percent between 50 and 95),
  priority integer not null default 100 check (priority between 1 and 10000),
  approved_at timestamptz,
  approval_note text not null default '' check (char_length(approval_note)<=500),
  updated_at timestamptz not null default now(),
  check (not enabled or (capacity_bytes>0 and monthly_write_ops_limit>0 and monthly_read_ops_limit>0))
);
alter table public.raye2_storage_providers enable row level security;
revoke all on public.raye2_storage_providers from public,anon,authenticated;
grant select,insert,update,delete on public.raye2_storage_providers to service_role;

insert into public.raye2_storage_providers(
 provider_key,provider_kind,enabled,billing_mode,capacity_bytes,
 monthly_write_ops_limit,monthly_read_ops_limit,monthly_egress_bytes_limit,
 hard_stop_percent,priority,approved_at,approval_note
) values (
 'supabase','supabase',true,'free_only',786432000,
 100000,1000000,5368709120,85,10,now(),
 'Existing managed bucket ceiling: 750 MiB. Request and egress budgets are conservative app-level hard stops.'
) on conflict(provider_key) do nothing;

-- R2 is deliberately registered but disabled: account activation and billing
-- conditions must be approved by the owner before any credentials or uploads.
insert into public.raye2_storage_providers(
 provider_key,provider_kind,enabled,billing_mode,capacity_bytes,
 monthly_write_ops_limit,monthly_read_ops_limit,monthly_egress_bytes_limit,
 hard_stop_percent,priority,approval_note
) values (
 'cloudflare_r2','s3_compatible',false,'free_only',0,0,0,0,85,20,
 'Disabled until owner confirms no-payment/no-billable-overage setup and an end-to-end test.'
) on conflict(provider_key) do nothing;

-- Candidate free-tier backends are registered disabled until adapters, live
-- metering, and a hard $0 overage stop have been verified. Never auto-enable.
insert into public.raye2_storage_providers(
 provider_key,provider_kind,enabled,billing_mode,capacity_bytes,
 monthly_write_ops_limit,monthly_read_ops_limit,monthly_egress_bytes_limit,
 hard_stop_percent,priority,approval_note
) values
 ('backblaze_b2','s3_compatible',false,'free_only',0,0,0,0,85,30,
  'Candidate: published 10 GB free storage and signup without billing method; remains disabled until adapter, daily zero-spend caps, and usage reconciliation are tested.'),
 ('tigris','s3_compatible',false,'free_only',0,0,0,0,85,40,
  'Candidate: published 5 GB free storage, no card to start, and zero egress; remains disabled until adapter and request/storage hard-stops are tested.'),
 ('filebase','s3_compatible',false,'free_only',5368709120,100000,1000000,5368709120,85,50,
  'Candidate: 5 GB pooled storage, 5 GB monthly object bandwidth, 100K Class A and 1M Class B requests on the current pricing page; no card. Free tier hard-stops on exhaustion. Disabled until adapter and account tests pass.')
on conflict(provider_key) do nothing;

-- 3. Expose non-secret policy for diagnostics. No provider credentials are stored here.
create or replace function public.raye2_list_storage_provider_policy()
returns table(
 provider_key text,provider_kind text,enabled boolean,capacity_bytes bigint,
 monthly_write_ops_limit bigint,monthly_read_ops_limit bigint,
 monthly_egress_bytes_limit bigint,hard_stop_percent numeric,priority integer
)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
 return query
 select p.provider_key,p.provider_kind,p.enabled,p.capacity_bytes,
        p.monthly_write_ops_limit,p.monthly_read_ops_limit,
        p.monthly_egress_bytes_limit,p.hard_stop_percent,p.priority
 from public.raye2_storage_providers p
 where p.enabled=true
 order by p.priority,p.provider_key;
end;
$$;
revoke all on function public.raye2_list_storage_provider_policy() from public,anon;
grant execute on function public.raye2_list_storage_provider_policy() to authenticated;

-- 4. Apply role-based storage allowance consistently to capacity display,
-- browser upload reservations and worker-generated derivatives.
create or replace function public.get_raye2_user_storage_capacity()
returns table(
 used_bytes bigint,reserved_bytes bigint,quota_bytes bigint,
 available_bytes bigint,usage_percent numeric
)
language plpgsql stable security definer set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_used bigint;
 v_reserved bigint;
 v_quota bigint;
 v_tier text;
begin
 if v_user is null then raise exception 'sign in required' using errcode='42501'; end if;
 v_tier:=public.raye2_creator_tier(v_user);
 select coalesce(
   (select q.quota_bytes from public.raye2_user_storage_quota_overrides q where q.user_id=v_user),
   case when v_tier in ('creator','streamer','combined')
     then coalesce(public.raye2_role_quota(v_tier,'storage_bytes'),21474836480)
     else 1073741824 end
 ) into v_quota;
 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
   then (o.metadata->>'size')::bigint else 0 end),0)
 into v_used from storage.objects o
 where o.bucket_id in ('creator-media-private','creator-media-public','raye2-community-shorts')
   and split_part(o.name,'/',1)=v_user::text;
 select coalesce(sum(r.expected_bytes),0) into v_reserved
 from public.nhen_media_upload_reservations r
 where r.user_id=v_user and r.expires_at>now();
 return query select v_used,v_reserved,v_quota,
   greatest(0,v_quota-v_used-v_reserved),
   case when v_quota=0 then 100::numeric
   else round((v_used+v_reserved)::numeric*100/v_quota,1) end;
end;
$$;
revoke all on function public.get_raye2_user_storage_capacity() from public,anon;
grant execute on function public.get_raye2_user_storage_capacity() to authenticated;

create or replace function public.reserve_nhen_media_upload(p_bytes bigint,p_bucket text)
returns table(reservation_id uuid,used_bytes bigint,reserved_bytes bigint,quota_bytes bigint,available_bytes bigint)
language plpgsql security definer set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_used bigint;
 v_reserved bigint;
 v_user_used bigint;
 v_user_reserved bigint;
 v_user_quota bigint;
 v_quota bigint:=786432000;
 v_id uuid;
 v_tier text;
begin
 if v_user is null then raise exception 'sign in required' using errcode='42501'; end if;
 if p_bytes is null or p_bytes<1 or p_bytes>52428800 then
   raise exception 'file must be between 1 byte and 50 MiB' using errcode='22023';
 end if;
 if p_bucket not in ('creator-media-private','creator-media-public','raye2-community-shorts') then
   raise exception 'unsupported Raye2 media bucket' using errcode='22023';
 end if;
 if p_bucket in ('creator-media-private','creator-media-public') and not public.is_nhen_video_publisher() then
   raise exception 'assigned creator access required' using errcode='42501';
 end if;

 perform pg_advisory_xact_lock(hashtextextended('nhen-project-storage-quota',0));
 delete from public.nhen_media_upload_reservations where expires_at<=now();
 v_tier:=public.raye2_creator_tier(v_user);
 select coalesce(
   (select q.quota_bytes from public.raye2_user_storage_quota_overrides q where q.user_id=v_user),
   case when v_tier in ('creator','streamer','combined')
     then coalesce(public.raye2_role_quota(v_tier,'storage_bytes'),21474836480)
     else 1073741824 end
 ) into v_user_quota;

 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
   then (o.metadata->>'size')::bigint else 0 end),0)
 into v_user_used from storage.objects o
 where o.bucket_id in ('creator-media-private','creator-media-public','raye2-community-shorts')
   and split_part(o.name,'/',1)=v_user::text;
 select coalesce(sum(r.expected_bytes),0) into v_user_reserved
 from public.nhen_media_upload_reservations r
 where r.user_id=v_user and r.expires_at>now();
 if v_user_used+v_user_reserved+p_bytes>v_user_quota then
   raise exception 'Your Raye2 account storage allowance is full. Used: % bytes; reserved: % bytes; allowance: % bytes.',
     v_user_used,v_user_reserved,v_user_quota using errcode='53100';
 end if;

 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
   then (o.metadata->>'size')::bigint else 0 end),0)
 into v_used from storage.objects o
 where o.bucket_id in ('creator-media-private','creator-media-public','raye2-community-shorts');
 select coalesce(sum(r.expected_bytes),0) into v_reserved
 from public.nhen_media_upload_reservations r where r.expires_at>now();
 if v_used+v_reserved+p_bytes>v_quota then
   raise exception 'Raye2 shared Supabase safety limit reached; no upload was started.' using errcode='53100';
 end if;
 insert into public.nhen_media_upload_reservations(user_id,bucket_id,expected_bytes)
 values(v_user,p_bucket,p_bytes) returning id into v_id;
 return query select v_id,v_used,v_reserved,v_quota,greatest(0,v_quota-v_used-v_reserved-p_bytes);
end;
$$;
revoke all on function public.reserve_nhen_media_upload(bigint,text) from public,anon;
grant execute on function public.reserve_nhen_media_upload(bigint,text) to authenticated;

create or replace function public.reserve_raye2_worker_thumbnail_capacity(
 p_owner_id uuid,p_bucket text,p_bytes bigint
) returns uuid
language plpgsql security definer set search_path=''
as $$
declare
 v_used bigint;v_reserved bigint;v_user_used bigint;v_user_reserved bigint;
 v_user_quota bigint;v_id uuid;v_quota bigint:=786432000;v_tier text;
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
 v_tier:=public.raye2_creator_tier(p_owner_id);
 select coalesce(
   (select q.quota_bytes from public.raye2_user_storage_quota_overrides q where q.user_id=p_owner_id),
   case when v_tier in ('creator','streamer','combined')
     then coalesce(public.raye2_role_quota(v_tier,'storage_bytes'),21474836480)
     else 1073741824 end
 ) into v_user_quota;
 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
   then (o.metadata->>'size')::bigint else 0 end),0)
 into v_user_used from storage.objects o
 where o.bucket_id in ('creator-media-private','creator-media-public','raye2-community-shorts')
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
 where o.bucket_id in ('creator-media-private','creator-media-public','raye2-community-shorts');
 select coalesce(sum(r.expected_bytes),0) into v_reserved
 from public.nhen_media_upload_reservations r where r.expires_at>now();
 if v_used+v_reserved+p_bytes>v_quota then
   raise exception 'Raye2 shared Supabase safety limit reached; generated media was not stored.' using errcode='53100';
 end if;
 insert into public.nhen_media_upload_reservations(user_id,bucket_id,expected_bytes,expires_at)
 values(p_owner_id,p_bucket,p_bytes,now()+interval '20 minutes') returning id into v_id;
 return v_id;
end;
$$;
revoke all on function public.reserve_raye2_worker_thumbnail_capacity(uuid,text,bigint) from public,anon,authenticated;
grant execute on function public.reserve_raye2_worker_thumbnail_capacity(uuid,text,bigint) to service_role;

notify pgrst,'reload schema';

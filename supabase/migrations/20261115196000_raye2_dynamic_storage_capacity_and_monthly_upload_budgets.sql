-- Raye2: initial 10 GiB storage target + 10 GiB monthly ingest budget.
-- Actual accepted capacity is always the sum of enabled, verified, zero-cost
-- provider pools after their safety margins. The 10 GiB target is not a claim
-- that 10 GiB of physical storage has already been provisioned.

create table if not exists public.raye2_storage_global_policy (
  singleton boolean primary key default true check (singleton),
  target_total_capacity_bytes bigint not null default 10737418240
    check (target_total_capacity_bytes between 1 and 10737418240),
  monthly_upload_target_bytes bigint not null default 10737418240
    check (monthly_upload_target_bytes between 1 and 10737418240),
  monthly_upload_hard_limit_bytes bigint not null default 10737418240
    check (monthly_upload_hard_limit_bytes between 1 and 10737418240),
  free_only boolean not null default true check (free_only),
  updated_at timestamptz not null default now()
);
insert into public.raye2_storage_global_policy(singleton) values(true)
on conflict(singleton) do nothing;
alter table public.raye2_storage_global_policy enable row level security;
revoke all on public.raye2_storage_global_policy from public,anon,authenticated;
grant select,insert,update,delete on public.raye2_storage_global_policy to service_role;

-- Provider activation is fail-closed: a provider must have a real adapter and
-- a verified no-billing/no-overage posture before it can receive new objects.
alter table public.raye2_storage_providers
  add column if not exists adapter_ready boolean not null default false,
  add column if not exists zero_cost_verified boolean not null default false;
update public.raye2_storage_providers
set adapter_ready=true,zero_cost_verified=true
where provider_key='supabase' and enabled=true;
update public.raye2_storage_providers
set enabled=false,capacity_bytes=0,adapter_ready=false,zero_cost_verified=false
where provider_key<>'supabase' and not (adapter_ready and zero_cost_verified);
alter table public.raye2_storage_providers
  drop constraint if exists raye2_storage_providers_enabled_guard;
alter table public.raye2_storage_providers
  add constraint raye2_storage_providers_enabled_guard
  check (not enabled or (
    billing_mode='free_only' and adapter_ready and zero_cost_verified
    and capacity_bytes>0 and monthly_write_ops_limit>0
    and monthly_read_ops_limit>0 and monthly_egress_bytes_limit>0
  ));

-- Keep old bucket IDs readable during migration, but accept the current Raye2 ID.
alter table public.nhen_media_upload_reservations
  drop constraint if exists nhen_media_upload_reservations_bucket_id_check;
alter table public.nhen_media_upload_reservations
  add constraint nhen_media_upload_reservations_bucket_id_check
  check (bucket_id in (
    'creator-media-private','creator-media-public',
    'nhen-community-shorts','raye2-community-shorts'
  ));
alter table public.nhen_media_upload_reservations
  add column if not exists provider_key text not null default 'supabase'
  references public.raye2_storage_providers(provider_key);

create table if not exists public.raye2_storage_monthly_usage (
  month_start date not null,
  scope_key text not null,
  uploaded_bytes bigint not null default 0 check (uploaded_bytes>=0),
  upload_ops bigint not null default 0 check (upload_ops>=0),
  updated_at timestamptz not null default now(),
  primary key(month_start,scope_key)
);
alter table public.raye2_storage_monthly_usage enable row level security;
revoke all on public.raye2_storage_monthly_usage from public,anon,authenticated;
grant select,insert,update,delete on public.raye2_storage_monthly_usage to service_role;

-- External provider usage must be reconciled by a trusted server-side adapter.
-- A stale snapshot is not eligible for placement, so the router fails closed.
create table if not exists public.raye2_storage_provider_usage_snapshots (
  provider_key text primary key references public.raye2_storage_providers(provider_key) on delete cascade,
  used_bytes bigint not null default 0 check (used_bytes>=0),
  reserved_bytes bigint not null default 0 check (reserved_bytes>=0),
  monthly_read_bytes bigint not null default 0 check (monthly_read_bytes>=0),
  monthly_egress_bytes bigint not null default 0 check (monthly_egress_bytes>=0),
  monthly_read_ops bigint not null default 0 check (monthly_read_ops>=0),
  reconciled_at timestamptz not null default now()
);
alter table public.raye2_storage_provider_usage_snapshots enable row level security;
revoke all on public.raye2_storage_provider_usage_snapshots from public,anon,authenticated;
grant select,insert,update,delete on public.raye2_storage_provider_usage_snapshots to service_role;

-- Weight-based dynamic share: member=1, Creator=3, Streamer=3, Combined=5.
-- Inactive accounts (no sign-in in 90 days and created >30 days ago) do not
-- reserve capacity. The current account is always included in the denominator.
create or replace function public.raye2_storage_role_weight(p_user_id uuid)
returns integer language sql stable security definer set search_path=''
as $$
  select case public.raye2_creator_tier(p_user_id)
    when 'creator' then 3
    when 'streamer' then 3
    when 'combined' then 5
    else 1
  end;
$$;
revoke all on function public.raye2_storage_role_weight(uuid) from public,anon,authenticated;
grant execute on function public.raye2_storage_role_weight(uuid) to service_role;

create or replace function public.raye2_storage_effective_capacity_bytes()
returns bigint language sql stable security definer set search_path=''
as $$
  select least(
    (select p.target_total_capacity_bytes from public.raye2_storage_global_policy p where p.singleton=true),
    coalesce((
      select sum(floor(v.capacity_bytes*v.hard_stop_percent/100)::bigint)
      from public.raye2_storage_providers v
      where v.enabled=true and v.billing_mode='free_only'
        and v.adapter_ready=true and v.zero_cost_verified=true
    ),0)
  );
$$;
revoke all on function public.raye2_storage_effective_capacity_bytes() from public,anon,authenticated;
grant execute on function public.raye2_storage_effective_capacity_bytes() to authenticated,service_role;

create or replace function public.raye2_effective_user_storage_quota(p_user_id uuid)
returns bigint language plpgsql stable security definer set search_path=''
as $$
declare
  v_tier text;
  v_role_cap bigint;
  v_requested bigint;
  v_pool bigint;
  v_weight bigint;
  v_total_weight bigint;
  v_used bigint;
  v_share bigint;
begin
  if p_user_id is null then raise exception 'user id required' using errcode='22023'; end if;
  v_tier:=public.raye2_creator_tier(p_user_id);
  v_role_cap:=case when v_tier in ('creator','streamer','combined')
    then coalesce(public.raye2_role_quota(v_tier,'storage_bytes'),
      case when v_tier='combined' then 10737418240 else 5368709120 end)::bigint
    else 104857600 end;
  select coalesce(q.quota_bytes,v_role_cap) into v_requested
  from (select 1) seed
  left join public.raye2_user_storage_quota_overrides q on q.user_id=p_user_id;
  v_pool:=public.raye2_storage_effective_capacity_bytes();
  v_weight:=public.raye2_storage_role_weight(p_user_id);
  select coalesce(sum(public.raye2_storage_role_weight(u.id)),0)
  into v_total_weight
  from auth.users u
  where (u.last_sign_in_at>=now()-interval '90 days'
     or u.created_at>=now()-interval '30 days'
     or u.id=p_user_id);
  v_total_weight:=greatest(v_total_weight,v_weight,1);
  v_share:=floor(v_pool::numeric*v_weight/v_total_weight)::bigint;
  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
    then (o.metadata->>'size')::bigint else 0 end),0)
  into v_used from storage.objects o
  where o.bucket_id in ('creator-media-private','creator-media-public',
    'nhen-community-shorts','raye2-community-shorts')
    and split_part(o.name,'/',1)=p_user_id::text;
  -- Existing stored bytes are grandfathered if the active-user count changes.
  return greatest(v_used,least(v_requested,v_share));
end;
$$;
revoke all on function public.raye2_effective_user_storage_quota(uuid) from public,anon,authenticated;
grant execute on function public.raye2_effective_user_storage_quota(uuid) to authenticated,service_role;

create or replace function public.raye2_effective_monthly_upload_quota(p_user_id uuid)
returns bigint language plpgsql stable security definer set search_path=''
as $$
declare v_weight bigint; v_total_weight bigint; v_target bigint;
begin
  if p_user_id is null then raise exception 'user id required' using errcode='22023'; end if;
  select monthly_upload_target_bytes into v_target
  from public.raye2_storage_global_policy where singleton=true;
  v_weight:=public.raye2_storage_role_weight(p_user_id);
  select coalesce(sum(public.raye2_storage_role_weight(u.id)),0)
  into v_total_weight from auth.users u
  where (u.last_sign_in_at>=now()-interval '90 days'
    or u.created_at>=now()-interval '30 days' or u.id=p_user_id);
  return floor(v_target::numeric*v_weight/greatest(v_total_weight,v_weight,1))::bigint;
end;
$$;
revoke all on function public.raye2_effective_monthly_upload_quota(uuid) from public,anon,authenticated;
grant execute on function public.raye2_effective_monthly_upload_quota(uuid) to authenticated,service_role;

-- Central provider picker. It only returns providers with a verified free-only
-- configuration, a working adapter, fresh capacity data and sufficient budgets.
create or replace function public.raye2_choose_storage_provider(p_bytes bigint)
returns text language plpgsql stable security definer set search_path=''
as $$
declare v_provider text;
begin
  if p_bytes is null or p_bytes<1 then raise exception 'invalid upload size' using errcode='22023'; end if;
  select v.provider_key into v_provider
  from public.raye2_storage_providers v
  left join public.raye2_storage_provider_usage_snapshots s on s.provider_key=v.provider_key
  left join public.raye2_storage_monthly_usage m
    on m.month_start=date_trunc('month',now())::date
   and m.scope_key='provider:'||v.provider_key
  where v.enabled=true and v.billing_mode='free_only'
    and v.adapter_ready=true and v.zero_cost_verified=true
    and v.capacity_bytes>0
    and coalesce(m.upload_ops,0)<v.monthly_write_ops_limit
    and (
      (v.provider_key='supabase' and
        (select coalesce(sum((o.metadata->>'size')::bigint),0)
         from storage.objects o
         where o.bucket_id in ('creator-media-private','creator-media-public',
           'nhen-community-shorts','raye2-community-shorts')
           and coalesce(o.metadata->>'size','') ~ '^[0-9]+$')
        + (select coalesce(sum(r.expected_bytes),0) from public.nhen_media_upload_reservations r where r.provider_key=v.provider_key)
        + p_bytes <= floor(v.capacity_bytes*v.hard_stop_percent/100))
      or
      (v.provider_key<>'supabase' and s.reconciled_at>=now()-interval '15 minutes'
        and s.used_bytes+s.reserved_bytes+p_bytes<=floor(v.capacity_bytes*v.hard_stop_percent/100)
        and s.monthly_egress_bytes<v.monthly_egress_bytes_limit
        and s.monthly_read_ops<v.monthly_read_ops_limit)
    )
  order by v.priority,v.provider_key
  limit 1;
  return v_provider;
end;
$$;
revoke all on function public.raye2_choose_storage_provider(bigint) from public,anon;
grant execute on function public.raye2_choose_storage_provider(bigint) to authenticated,service_role;

create or replace function public.get_raye2_user_storage_capacity()
returns table(used_bytes bigint,reserved_bytes bigint,quota_bytes bigint,available_bytes bigint,usage_percent numeric)
language plpgsql stable security definer set search_path=''
as $$
declare v_user uuid:=auth.uid(); v_used bigint; v_reserved bigint; v_quota bigint;
begin
  if v_user is null then raise exception 'sign in required' using errcode='42501'; end if;
  v_quota:=public.raye2_effective_user_storage_quota(v_user);
  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
    then (o.metadata->>'size')::bigint else 0 end),0)
  into v_used from storage.objects o
  where o.bucket_id in ('creator-media-private','creator-media-public',
    'nhen-community-shorts','raye2-community-shorts')
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

create or replace function public.raye2_get_storage_system_capacity()
returns table(
 target_total_bytes bigint,actual_provider_capacity_bytes bigint,
 used_bytes bigint,reserved_bytes bigint,available_bytes bigint,
 monthly_upload_target_bytes bigint,monthly_uploaded_bytes bigint,
 monthly_upload_remaining_bytes bigint
)
language plpgsql stable security definer set search_path=''
as $$
declare v_used bigint;v_reserved bigint;v_monthly bigint;v_target bigint;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select target_total_capacity_bytes,monthly_upload_target_bytes
  into v_target,v_monthly from public.raye2_storage_global_policy where singleton=true;
  select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
    then (o.metadata->>'size')::bigint else 0 end),0)
  into v_used from storage.objects o
  where o.bucket_id in ('creator-media-private','creator-media-public',
    'nhen-community-shorts','raye2-community-shorts');
  select coalesce(sum(r.expected_bytes),0) into v_reserved
  from public.nhen_media_upload_reservations r where r.expires_at>now();
  select coalesce(m.uploaded_bytes,0) into v_monthly
  from public.raye2_storage_monthly_usage m
  where m.month_start=date_trunc('month',now())::date and m.scope_key='global';
  return query select v_target,public.raye2_storage_effective_capacity_bytes(),
    v_used,v_reserved,
    greatest(0,public.raye2_storage_effective_capacity_bytes()-v_used-v_reserved),
    (select monthly_upload_target_bytes from public.raye2_storage_global_policy where singleton=true),
    coalesce(v_monthly,0),greatest(0,(select monthly_upload_target_bytes from public.raye2_storage_global_policy where singleton=true)-coalesce(v_monthly,0));
end;
$$;
revoke all on function public.raye2_get_storage_system_capacity() from public,anon;
grant execute on function public.raye2_get_storage_system_capacity() to authenticated;

-- Reserve against actual enabled provider capacity, per-account dynamic storage,
-- and both the per-user and global monthly ingest budgets.
create or replace function public.reserve_nhen_media_upload(p_bytes bigint,p_bucket text)
returns table(reservation_id uuid,used_bytes bigint,reserved_bytes bigint,quota_bytes bigint,available_bytes bigint)
language plpgsql security definer set search_path=''
as $$
declare
 v_user uuid:=auth.uid();v_used bigint;v_reserved bigint;v_user_used bigint;
 v_user_reserved bigint;v_user_quota bigint;v_physical bigint;v_id uuid;
 v_month date:=date_trunc('month',now())::date;v_user_monthly bigint;
 v_global_monthly bigint;v_global_reserved bigint;v_user_monthly_reserved bigint;
 v_monthly_limit bigint;v_ops bigint;v_ops_limit bigint;
begin
 if v_user is null then raise exception 'sign in required' using errcode='42501'; end if;
 if p_bytes is null or p_bytes<1 or p_bytes>52428800 then
   raise exception 'file must be between 1 byte and 50 MiB' using errcode='22023'; end if;
 if p_bucket not in ('creator-media-private','creator-media-public','nhen-community-shorts','raye2-community-shorts') then
   raise exception 'unsupported Raye2 media bucket' using errcode='22023'; end if;
 if p_bucket in ('creator-media-private','creator-media-public') and not public.is_nhen_video_publisher() then
   raise exception 'assigned creator access required' using errcode='42501'; end if;

 perform pg_advisory_xact_lock(hashtextextended('raye2-storage-global-budget:'||v_month::text,0));
 delete from public.nhen_media_upload_reservations where expires_at<=now();

 if public.raye2_choose_storage_provider(p_bytes) is distinct from 'supabase' then
   raise exception 'No verified free storage provider currently has sufficient capacity. No upload was started.' using errcode='53100';
 end if;

 v_user_quota:=public.raye2_effective_user_storage_quota(v_user);
 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
   then (o.metadata->>'size')::bigint else 0 end),0)
 into v_user_used from storage.objects o
 where o.bucket_id in ('creator-media-private','creator-media-public',
   'nhen-community-shorts','raye2-community-shorts')
   and split_part(o.name,'/',1)=v_user::text;
 select coalesce(sum(r.expected_bytes),0) into v_user_reserved
 from public.nhen_media_upload_reservations r
 where r.user_id=v_user and r.expires_at>now();
 if v_user_used+v_user_reserved+p_bytes>v_user_quota then
   raise exception 'Your dynamic Raye2 account storage allocation is full.' using errcode='53100';
 end if;

 select coalesce(sum(case when (o.metadata->>'size') ~ '^[0-9]+$'
   then (o.metadata->>'size')::bigint else 0 end),0)
 into v_used from storage.objects o
 where o.bucket_id in ('creator-media-private','creator-media-public',
   'nhen-community-shorts','raye2-community-shorts');
 select coalesce(sum(r.expected_bytes),0) into v_reserved
 from public.nhen_media_upload_reservations r where r.expires_at>now();
 v_physical:=public.raye2_storage_effective_capacity_bytes();
 if v_used+v_reserved+p_bytes>v_physical then
   raise exception 'Raye2 verified free storage capacity is full. No paid provider will be enabled.' using errcode='53100';
 end if;

 select coalesce(uploaded_bytes,0) into v_user_monthly
 from public.raye2_storage_monthly_usage
 where month_start=v_month and scope_key='user:'||v_user::text;
 select coalesce(uploaded_bytes,0) into v_global_monthly
 from public.raye2_storage_monthly_usage
 where month_start=v_month and scope_key='global';
 select coalesce(sum(r.expected_bytes),0) into v_global_reserved
 from public.nhen_media_upload_reservations r where r.expires_at>now();
 select coalesce(sum(r.expected_bytes),0) into v_user_monthly_reserved
 from public.nhen_media_upload_reservations r
 where r.user_id=v_user and r.expires_at>now();
 v_monthly_limit:=public.raye2_effective_monthly_upload_quota(v_user);
 select monthly_upload_hard_limit_bytes into v_ops_limit
 from public.raye2_storage_global_policy where singleton=true;
 if coalesce(v_user_monthly,0)+v_user_monthly_reserved+p_bytes>v_monthly_limit then
   raise exception 'Your role-weighted monthly Raye2 upload allowance has been reached.' using errcode='53100';
 end if;
 if coalesce(v_global_monthly,0)+v_global_reserved+p_bytes>v_ops_limit then
   raise exception 'Raye2 monthly upload hard limit reached. Uploads resume next month.' using errcode='53100';
 end if;

 select coalesce(upload_ops,0) into v_ops from public.raye2_storage_monthly_usage
 where month_start=v_month and scope_key='provider:supabase';
 select monthly_write_ops_limit into v_ops_limit
 from public.raye2_storage_providers where provider_key='supabase' and enabled=true;
 if v_ops_limit is null or coalesce(v_ops,0)+
   (select count(*) from public.nhen_media_upload_reservations r
    where r.provider_key='supabase' and r.created_at>=v_month::timestamptz)+1>v_ops_limit then
   raise exception 'Raye2 provider write-operation safety budget reached.' using errcode='53100';
 end if;

 insert into public.nhen_media_upload_reservations(user_id,bucket_id,expected_bytes,provider_key)
 values(v_user,p_bucket,p_bytes,'supabase') returning id into v_id;
 return query select v_id,v_used,v_reserved,v_physical,
   greatest(0,v_physical-v_used-v_reserved-p_bytes);
end;
$$;
revoke all on function public.reserve_nhen_media_upload(bigint,text) from public,anon;
grant execute on function public.reserve_nhen_media_upload(bigint,text) to authenticated;

-- Consume reservation and atomically account accepted bytes at object creation.
-- The transaction rolls back both the usage counters and object insert on any limit.
create or replace function public.enforce_nhen_storage_upload_reservation()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
 v_user uuid:=auth.uid();v_owner uuid;v_bytes bigint;v_reservation uuid;
 v_provider text;v_month date:=date_trunc('month',now())::date;
 v_global bigint;v_user_month bigint;v_global_limit bigint;v_user_limit bigint;
 v_provider_ops bigint;v_provider_limit bigint;
begin
 if new.bucket_id not in ('creator-media-private','creator-media-public',
   'nhen-community-shorts','raye2-community-shorts') then return new; end if;
 if coalesce(new.metadata->>'size','') !~ '^[0-9]+$' then
   raise exception 'Raye2 upload size metadata is required' using errcode='22023'; end if;
 v_bytes:=(new.metadata->>'size')::bigint;

 if auth.role()='service_role' then
   if split_part(new.name,'/',1) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
     raise exception 'Worker upload path must begin with a valid owner id' using errcode='22023'; end if;
   v_owner:=split_part(new.name,'/',1)::uuid;
 else
   v_owner:=v_user;
   if v_owner is null then raise exception 'Authenticated Raye2 upload reservation required' using errcode='42501'; end if;
 end if;

 perform pg_advisory_xact_lock(hashtextextended('raye2-storage-global-budget:'||v_month::text,0));
 delete from public.nhen_media_upload_reservations r
 where r.id=(
   select candidate.id from public.nhen_media_upload_reservations candidate
   where candidate.user_id=v_owner and candidate.bucket_id=new.bucket_id
     and candidate.expected_bytes=v_bytes and candidate.expires_at>now()
   order by candidate.created_at for update skip locked limit 1
 ) returning r.id,r.provider_key into v_reservation,v_provider;
 if v_reservation is null then
   raise exception 'Raye2 upload reservation missing, expired, or mismatched' using errcode='53100'; end if;
 if v_provider is distinct from 'supabase' then
   raise exception 'This storage adapter is not enabled for Supabase object writes.' using errcode='53100'; end if;

 select coalesce(uploaded_bytes,0) into v_global from public.raye2_storage_monthly_usage
 where month_start=v_month and scope_key='global';
 select coalesce(uploaded_bytes,0) into v_user_month from public.raye2_storage_monthly_usage
 where month_start=v_month and scope_key='user:'||v_owner::text;
 select monthly_upload_hard_limit_bytes into v_global_limit
 from public.raye2_storage_global_policy where singleton=true;
 v_user_limit:=public.raye2_effective_monthly_upload_quota(v_owner);
 if coalesce(v_global,0)+v_bytes>v_global_limit
   or coalesce(v_user_month,0)+v_bytes>v_user_limit then
   raise exception 'Raye2 monthly upload hard stop reached; object write rejected.' using errcode='53100'; end if;

 select coalesce(upload_ops,0) into v_provider_ops
 from public.raye2_storage_monthly_usage
 where month_start=v_month and scope_key='provider:'||v_provider;
 select monthly_write_ops_limit into v_provider_limit
 from public.raye2_storage_providers where provider_key=v_provider and enabled=true
   and billing_mode='free_only' and adapter_ready=true and zero_cost_verified=true;
 if v_provider_limit is null or coalesce(v_provider_ops,0)+1>v_provider_limit then
   raise exception 'Provider write budget reached; object write rejected.' using errcode='53100'; end if;

 insert into public.raye2_storage_monthly_usage(month_start,scope_key,uploaded_bytes,upload_ops)
 values(v_month,'global',v_bytes,1)
 on conflict(month_start,scope_key) do update set
   uploaded_bytes=public.raye2_storage_monthly_usage.uploaded_bytes+excluded.uploaded_bytes,
   upload_ops=public.raye2_storage_monthly_usage.upload_ops+1,updated_at=now();
 insert into public.raye2_storage_monthly_usage(month_start,scope_key,uploaded_bytes,upload_ops)
 values(v_month,'user:'||v_owner::text,v_bytes,1)
 on conflict(month_start,scope_key) do update set
   uploaded_bytes=public.raye2_storage_monthly_usage.uploaded_bytes+excluded.uploaded_bytes,
   upload_ops=public.raye2_storage_monthly_usage.upload_ops+1,updated_at=now();
 insert into public.raye2_storage_monthly_usage(month_start,scope_key,uploaded_bytes,upload_ops)
 values(v_month,'provider:'||v_provider,v_bytes,1)
 on conflict(month_start,scope_key) do update set
   uploaded_bytes=public.raye2_storage_monthly_usage.uploaded_bytes+excluded.uploaded_bytes,
   upload_ops=public.raye2_storage_monthly_usage.upload_ops+1,updated_at=now();
 return new;
end;
$$;
revoke all on function public.enforce_nhen_storage_upload_reservation() from public,anon,authenticated;
grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated,service_role;


create or replace function public.raye2_get_user_monthly_upload_capacity()
returns table(
 month_start date,uploaded_bytes bigint,reserved_bytes bigint,
 quota_bytes bigint,available_bytes bigint,usage_percent numeric
)
language plpgsql stable security definer set search_path=''
as $
declare
 v_user uuid:=auth.uid();
 v_month date:=date_trunc('month',now())::date;
 v_uploaded bigint;
 v_reserved bigint;
 v_quota bigint;
begin
 if v_user is null then raise exception 'sign in required' using errcode='42501'; end if;
 v_quota:=public.raye2_effective_monthly_upload_quota(v_user);
 select coalesce(m.uploaded_bytes,0) into v_uploaded
 from (select 1) seed
 left join public.raye2_storage_monthly_usage m
   on m.month_start=v_month and m.scope_key='user:'||v_user::text;
 select coalesce(sum(r.expected_bytes),0) into v_reserved
 from public.nhen_media_upload_reservations r
 where r.user_id=v_user and r.expires_at>now()
   and r.created_at>=v_month::timestamptz;
 return query select v_month,v_uploaded,v_reserved,v_quota,
   greatest(0,v_quota-v_uploaded-v_reserved),
   case when v_quota=0 then 100::numeric
   else round((v_uploaded+v_reserved)::numeric*100/v_quota,1) end;
end;
$;
revoke all on function public.raye2_get_user_monthly_upload_capacity() from public,anon;
grant execute on function public.raye2_get_user_monthly_upload_capacity() to authenticated;

notify pgrst,'reload schema';

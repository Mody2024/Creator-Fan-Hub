-- Raye2 sponsorship delivery telemetry and immutable financial attribution.
-- This migration creates ledgers only. It does not create an ad-serving or payout provider.
create table if not exists public.raye2_sponsor_delivery_events (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('creator_contract','platform_campaign','external_network')),
  campaign_id uuid,
  media_id uuid references public.media_items(id) on delete set null,
  inventory text not null check (inventory in ('video','live')),
  event_type text not null check (event_type in ('eligible','impression','start','first_quartile','midpoint','third_quartile','complete','skip','blocked','delivery_error')),
  provider_key text not null default 'internal_simulation' check (char_length(provider_key) between 1 and 80),
  provider_event_id text,
  request_id uuid,
  viewer_key_hash text,
  occurred_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata)<=4096),
  created_at timestamptz not null default now(),
  unique(provider_key,provider_event_id)
);
create index if not exists raye2_sponsor_delivery_media_time_idx
  on public.raye2_sponsor_delivery_events(media_id,occurred_at desc);
create index if not exists raye2_sponsor_delivery_source_time_idx
  on public.raye2_sponsor_delivery_events(source_type,campaign_id,occurred_at desc);
alter table public.raye2_sponsor_delivery_events enable row level security;
revoke all on public.raye2_sponsor_delivery_events from public,anon,authenticated;
grant select,insert on public.raye2_sponsor_delivery_events to service_role;

create table if not exists public.raye2_sponsor_revenue_ledger (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('creator_contract','platform_campaign','external_network')),
  campaign_id uuid,
  delivery_event_id uuid references public.raye2_sponsor_delivery_events(id) on delete restrict,
  provider_key text not null default 'internal_simulation',
  provider_transaction_id text,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  gross_amount numeric(14,2) not null default 0 check (gross_amount>=0),
  provider_deductions numeric(14,2) not null default 0 check (provider_deductions>=0),
  refunds numeric(14,2) not null default 0 check (refunds>=0),
  invalid_traffic_adjustments numeric(14,2) not null default 0 check (invalid_traffic_adjustments>=0),
  other_adjustments numeric(14,2) not null default 0 check (other_adjustments>=0),
  net_received numeric(14,2) not null default 0 check (net_received>=0),
  platform_share numeric(14,2) not null default 0 check (platform_share>=0),
  creator_share numeric(14,2) not null default 0 check (creator_share>=0),
  status text not null default 'estimated' check (status in ('estimated','provider_reported','received','adjusted','reversed')),
  received_at timestamptz,
  created_at timestamptz not null default now(),
  unique(provider_key,provider_transaction_id),
  check (provider_deductions+refunds+invalid_traffic_adjustments+other_adjustments<=gross_amount),
  check (net_received=gross_amount-provider_deductions-refunds-invalid_traffic_adjustments-other_adjustments),
  check (
    (source_type='external_network' and
      platform_share=round(net_received*0.70,2) and creator_share=round(net_received*0.30,2))
    or
    (source_type<>'external_network' and platform_share=0 and creator_share=0)
  ),
  check (status<>'received' or received_at is not null)
);
create index if not exists raye2_sponsor_revenue_source_idx
  on public.raye2_sponsor_revenue_ledger(source_type,created_at desc);
create index if not exists raye2_sponsor_revenue_status_idx
  on public.raye2_sponsor_revenue_ledger(status,created_at desc);
alter table public.raye2_sponsor_revenue_ledger enable row level security;
revoke all on public.raye2_sponsor_revenue_ledger from public,anon,authenticated;
grant select,insert,update on public.raye2_sponsor_revenue_ledger to service_role;

-- Enforce attribution arithmetic at write time; amounts are net amounts, not advertiser gross spend.
create or replace function public.raye2_validate_sponsor_revenue_ledger()
returns trigger language plpgsql set search_path=''
as $$
declare v_expected numeric(14,2);
begin
 if new.net_received<>new.gross_amount-new.provider_deductions-new.refunds-new.invalid_traffic_adjustments-new.other_adjustments
    or new.provider_deductions+new.refunds+new.invalid_traffic_adjustments+new.other_adjustments>new.gross_amount then
   raise exception 'net received must equal gross less all recorded adjustments' using errcode='22023';
 end if;
 v_expected:=round(new.net_received*0.70,2);
 if new.source_type='external_network' then
   if new.platform_share<>v_expected or new.creator_share<>round(new.net_received*0.30,2) then
     raise exception 'external network shares must be 70/30 of net received revenue' using errcode='22023';
   end if;
 elsif new.platform_share<>0 or new.creator_share<>0 then
   raise exception 'contracted and platform sponsor revenue must remain in separate ledgers without the external-network split' using errcode='22023';
 end if;
 if new.status='received' and new.received_at is null then
   raise exception 'received revenue requires a verified received timestamp' using errcode='22023';
 end if;
 return new;
end;
$$;
revoke all on function public.raye2_validate_sponsor_revenue_ledger() from public,anon,authenticated;
drop trigger if exists raye2_validate_sponsor_revenue_ledger on public.raye2_sponsor_revenue_ledger;
create trigger raye2_validate_sponsor_revenue_ledger
 before insert or update on public.raye2_sponsor_revenue_ledger
 for each row execute function public.raye2_validate_sponsor_revenue_ledger();

-- No browser-facing policy is provided. A future trusted server/provider adapter must
-- write records using service_role and must verify provider signatures before receipt.

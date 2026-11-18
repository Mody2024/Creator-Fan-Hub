-- Raye2 Wave 8/9: sponsor campaign integrity (plan 18.5/18.6).
--
-- The director already places sponsors and records delivery, but there were no campaign budgets or impression
-- caps, no invalid-traffic handling, and no reconciliation or dispute states. This adds the operational guard
-- rails required before real monetization is enabled. Reporting only: no payment execution, no fabricated
-- figures, no viewer identities exposed.

-- 1. A rules row for the invalid-traffic heuristic threshold.
insert into public.raye2_platform_rules(rule_key, category, rule_value, status, description) values
  ('ads.invalid_traffic_impressions_per_hour', 'ads', '20'::jsonb, 'active', 'Impressions per viewer per hour above which a viewer is flagged for invalid-traffic review.')
on conflict (rule_key) do nothing;

-- 2. Campaign budgets, currencies and impression caps.
alter table public.raye2_creator_sponsor_campaigns
  add column if not exists budget_amount numeric(14,2) check (budget_amount is null or budget_amount >= 0),
  add column if not exists currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists daily_impression_cap integer check (daily_impression_cap is null or daily_impression_cap >= 0),
  add column if not exists lifetime_impression_cap integer check (lifetime_impression_cap is null or lifetime_impression_cap >= 0);

alter table public.raye2_platform_sponsor_campaigns
  add column if not exists budget_amount numeric(14,2) check (budget_amount is null or budget_amount >= 0),
  add column if not exists currency char(3) not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  add column if not exists daily_impression_cap integer check (daily_impression_cap is null or daily_impression_cap >= 0),
  add column if not exists lifetime_impression_cap integer check (lifetime_impression_cap is null or lifetime_impression_cap >= 0);

-- 3. Delivery events can be marked invalid (fraud / invalid-traffic adjustments feed the revenue ledger).
alter table public.raye2_sponsor_delivery_events
  add column if not exists invalid boolean not null default false,
  add column if not exists invalid_reason text not null default '' check (char_length(invalid_reason) <= 240);

-- 4. Re-create delivery recording with campaign daily/lifetime impression caps on top of the existing
--    per-viewer frequency cap, duplicate protection and per-source authorization.
create or replace function public.raye2_record_ad_delivery(
  p_media_id uuid, p_inventory text, p_source_type text, p_campaign_id uuid, p_event_type text,
  p_provider_key text default 'internal_simulation', p_viewer_key text default null,
  p_metadata jsonb default '{}'::jsonb, p_provider_event_id text default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid(); v_hash text; v_peid text; v_id uuid; v_freq integer; v_cnt integer;
  v_daily integer; v_life integer;
  v_window integer := greatest(1, public.raye2_rule_int('ads.frequency_window_hours', 24));
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_inventory not in ('video','live') then raise exception 'invalid inventory' using errcode='22023'; end if;
  if p_source_type not in ('creator_contract','platform_campaign','external_network') then
    raise exception 'invalid source type' using errcode='22023';
  end if;
  if p_event_type not in ('eligible','impression','start','first_quartile','midpoint','third_quartile','complete','skip','blocked','delivery_error') then
    raise exception 'invalid delivery event type' using errcode='22023';
  end if;

  if p_source_type='creator_contract' then
    if not exists(select 1 from public.raye2_creator_sponsor_campaigns c where c.id=p_campaign_id and c.creator_id=v_uid) then
      raise exception 'not your sponsor campaign' using errcode='42501';
    end if;
    select c.max_per_viewer,c.daily_impression_cap,c.lifetime_impression_cap into v_freq,v_daily,v_life
      from public.raye2_creator_sponsor_campaigns c where c.id=p_campaign_id;
  else
    if not public.raye2_is_platform_admin() then raise exception 'platform admin required' using errcode='42501'; end if;
    if p_source_type='platform_campaign' then
      select p.max_per_viewer,p.daily_impression_cap,p.lifetime_impression_cap into v_freq,v_daily,v_life
        from public.raye2_platform_sponsor_campaigns p where p.id=p_campaign_id;
    else
      v_freq := public.raye2_rule_int('ads.max_per_viewer_per_day', 2);
    end if;
  end if;

  v_hash := case when p_viewer_key is null then null else encode(extensions.digest(convert_to(p_viewer_key,'UTF8'),'sha256'),'hex') end;

  if p_event_type='impression' then
    if v_hash is not null then
      select count(*) into v_cnt from public.raye2_sponsor_delivery_events e
       where e.campaign_id=p_campaign_id and e.source_type=p_source_type and e.event_type='impression'
         and not e.invalid and e.viewer_key_hash=v_hash
         and e.occurred_at > now() - make_interval(hours => v_window);
      if v_cnt >= coalesce(v_freq, public.raye2_rule_int('ads.max_per_viewer_per_day', 2)) then
        raise exception 'per-viewer frequency cap reached for this campaign' using errcode='42501';
      end if;
    end if;
    if v_daily is not null then
      select count(*) into v_cnt from public.raye2_sponsor_delivery_events e
       where e.campaign_id=p_campaign_id and e.source_type=p_source_type and e.event_type='impression'
         and not e.invalid and e.occurred_at::date = current_date;
      if v_cnt >= v_daily then raise exception 'daily impression cap reached for this campaign' using errcode='42501'; end if;
    end if;
    if v_life is not null then
      select count(*) into v_cnt from public.raye2_sponsor_delivery_events e
       where e.campaign_id=p_campaign_id and e.source_type=p_source_type and e.event_type='impression' and not e.invalid;
      if v_cnt >= v_life then raise exception 'lifetime impression cap reached for this campaign' using errcode='42501'; end if;
    end if;
  end if;

  v_peid := coalesce(p_provider_event_id, encode(extensions.digest(convert_to(
      concat_ws(':', p_media_id::text, p_campaign_id::text, coalesce(v_hash,'anon'), p_event_type, clock_timestamp()::text, random()::text), 'UTF8'), 'sha256'), 'hex'));

  insert into public.raye2_sponsor_delivery_events(source_type, campaign_id, media_id, inventory, event_type, provider_key, provider_event_id, viewer_key_hash, metadata)
  values(p_source_type, p_campaign_id, p_media_id, p_inventory, p_event_type, coalesce(p_provider_key,'internal_simulation'), v_peid, v_hash, coalesce(p_metadata,'{}'::jsonb))
  on conflict (provider_key, provider_event_id) do nothing
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raye2_record_ad_delivery(uuid,text,text,uuid,text,text,text,jsonb,text) from public, anon;
grant execute on function public.raye2_record_ad_delivery(uuid,text,text,uuid,text,text,text,jsonb,text) to authenticated;

-- 5. Invalid-traffic review: flag a single event, or surface suspicious viewer hashes for a window.
create or replace function public.raye2_flag_invalid_traffic(p_event_id uuid, p_reason text default 'invalid traffic')
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_reason text := btrim(coalesce(p_reason,'invalid traffic'));
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if char_length(v_reason) > 240 then raise exception 'reason is too long' using errcode='22023'; end if;
  update public.raye2_sponsor_delivery_events
     set invalid=true, invalid_reason=v_reason
   where id=p_event_id;
  if not found then raise exception 'delivery event not found' using errcode='P0002'; end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'sponsor_delivery_flagged_invalid','sponsor_delivery_event',p_event_id::text,v_reason,'{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.raye2_flag_invalid_traffic(uuid,text) from public, anon;
grant execute on function public.raye2_flag_invalid_traffic(uuid,text) to authenticated;

create or replace function public.raye2_detect_invalid_traffic(
  p_campaign_id uuid default null, p_hours integer default 1, p_threshold integer default null
)
returns table (viewer_key_hash text, campaign_id uuid, source_type text, impressions bigint, distinct_media bigint, first_seen timestamptz, last_seen timestamptz)
language plpgsql stable security definer set search_path=''
as $$
declare v_hours integer := least(168, greatest(1, coalesce(p_hours,1)));
        v_threshold integer := coalesce(p_threshold, public.raye2_rule_int('ads.invalid_traffic_impressions_per_hour', 20));
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  return query
    select e.viewer_key_hash, e.campaign_id, e.source_type,
           count(*)::bigint as impressions,
           count(distinct e.media_id)::bigint as distinct_media,
           min(e.occurred_at) as first_seen, max(e.occurred_at) as last_seen
    from public.raye2_sponsor_delivery_events e
    where e.event_type='impression' and not e.invalid and e.viewer_key_hash is not null
      and e.occurred_at > now() - make_interval(hours => v_hours)
      and (p_campaign_id is null or e.campaign_id = p_campaign_id)
    group by e.viewer_key_hash, e.campaign_id, e.source_type
    having count(*) >= greatest(1, v_threshold)
    order by count(*) desc;
end;
$$;
revoke all on function public.raye2_detect_invalid_traffic(uuid,integer,integer) from public, anon;
grant execute on function public.raye2_detect_invalid_traffic(uuid,integer,integer) to authenticated;

-- 6. Reconciliation and dispute records for sponsor revenue periods.
create table if not exists public.raye2_sponsor_reconciliation (
  id uuid primary key default gen_random_uuid(),
  source_type text not null check (source_type in ('creator_contract','platform_campaign','external_network')),
  campaign_id uuid,
  provider_key text not null default 'internal_simulation' check (char_length(provider_key) between 1 and 80),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  period_start timestamptz not null,
  period_end timestamptz not null,
  expected_net numeric(14,2) not null default 0,
  reported_net numeric(14,2) not null default 0,
  variance numeric(14,2) not null default 0,
  state text not null default 'open' check (state in ('open','in_review','disputed','resolved','closed')),
  note text not null default '' check (char_length(note) <= 500),
  created_by uuid references auth.users(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (period_end > period_start)
);
create index if not exists raye2_sponsor_reconciliation_state_idx
  on public.raye2_sponsor_reconciliation(state, created_at desc);
alter table public.raye2_sponsor_reconciliation enable row level security;
revoke all on public.raye2_sponsor_reconciliation from public, anon;
grant select,insert,update on public.raye2_sponsor_reconciliation to authenticated;
drop policy if exists "Raye2 admins manage sponsor reconciliation" on public.raye2_sponsor_reconciliation;
create policy "Raye2 admins manage sponsor reconciliation"
  on public.raye2_sponsor_reconciliation for all to authenticated
  using (public.raye2_is_platform_admin())
  with check (public.raye2_is_platform_admin());

create or replace function public.raye2_open_reconciliation(
  p_source_type text, p_campaign_id uuid, p_provider_key text, p_currency char(3),
  p_period_start timestamptz, p_period_end timestamptz
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_expected numeric(14,2); v_reported numeric(14,2); v_id uuid;
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if p_source_type not in ('creator_contract','platform_campaign','external_network') then
    raise exception 'invalid source type' using errcode='22023';
  end if;
  if p_period_end <= p_period_start then raise exception 'period end must be after period start' using errcode='22023'; end if;

  select coalesce(sum(r.net_received),0)::numeric(14,2),
         coalesce(sum(case when r.status='received' then r.net_received else 0 end),0)::numeric(14,2)
    into v_expected, v_reported
  from public.raye2_sponsor_revenue_ledger r
  where r.source_type=p_source_type and r.provider_key=p_provider_key and r.currency=p_currency
    and (p_campaign_id is null or r.campaign_id=p_campaign_id)
    and r.created_at >= p_period_start and r.created_at < p_period_end;

  insert into public.raye2_sponsor_reconciliation(source_type,campaign_id,provider_key,currency,period_start,period_end,expected_net,reported_net,variance,state,created_by)
  values(p_source_type,p_campaign_id,p_provider_key,p_currency,p_period_start,p_period_end,v_expected,v_reported,v_expected-v_reported,'open',auth.uid())
  returning id into v_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'sponsor_reconciliation_opened','sponsor_reconciliation',v_id::text,'',jsonb_build_object('source_type',p_source_type,'currency',p_currency,'variance',v_expected-v_reported));
  return v_id;
end;
$$;
revoke all on function public.raye2_open_reconciliation(text,uuid,text,char(3),timestamptz,timestamptz) from public, anon;
grant execute on function public.raye2_open_reconciliation(text,uuid,text,char(3),timestamptz,timestamptz) to authenticated;

create or replace function public.raye2_set_reconciliation_state(p_id uuid, p_state text, p_note text default '')
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_state text := lower(btrim(coalesce(p_state,''))); v_note text := btrim(coalesce(p_note,''));
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if v_state not in ('open','in_review','disputed','resolved','closed') then
    raise exception 'invalid reconciliation state' using errcode='22023';
  end if;
  if char_length(v_note) > 500 then raise exception 'note is too long' using errcode='22023'; end if;
  update public.raye2_sponsor_reconciliation
     set state=v_state, note=v_note, updated_at=now(),
         resolved_by=case when v_state in ('resolved','closed') then auth.uid() else null end,
         resolved_at=case when v_state in ('resolved','closed') then now() else null end
   where id=p_id;
  if not found then raise exception 'reconciliation record not found' using errcode='P0002'; end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'sponsor_reconciliation_'||v_state,'sponsor_reconciliation',p_id::text,v_note,'{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.raye2_set_reconciliation_state(uuid,text,text) from public, anon;
grant execute on function public.raye2_set_reconciliation_state(uuid,text,text) to authenticated;

-- 7. Creator monetization report (plan 18.5): eligible campaigns, delivery, estimates vs finalized,
--    adjustments and payout status. Never fabricates figures and never exposes viewer identities.
create or replace function public.raye2_creator_monetization_report()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_user uuid := auth.uid(); v_result jsonb;
begin
  if v_user is null or not public.is_nhen_video_publisher() then
    raise exception 'assigned creator access required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'eligible_campaigns',(select count(*)::bigint from public.raye2_creator_sponsor_campaigns c where c.creator_id=v_user and c.status='active'),
    'impressions_served',(select count(*)::bigint from public.raye2_sponsor_delivery_events e
       join public.raye2_creator_sponsor_campaigns c on c.id=e.campaign_id
       where c.creator_id=v_user and e.source_type='creator_contract' and e.event_type='impression' and not e.invalid),
    'estimated_creator_share',(select coalesce(sum(r.creator_share),0)::numeric(14,2) from public.raye2_sponsor_revenue_ledger r
       join public.raye2_creator_sponsor_campaigns c on c.id=r.campaign_id
       where c.creator_id=v_user and r.status in ('estimated','provider_reported')),
    'finalized_creator_share',(select coalesce(sum(r.creator_share),0)::numeric(14,2) from public.raye2_sponsor_revenue_ledger r
       join public.raye2_creator_sponsor_campaigns c on c.id=r.campaign_id
       where c.creator_id=v_user and r.status='received'),
    'adjustments',(select coalesce(sum(r.refunds+r.invalid_traffic_adjustments+r.other_adjustments),0)::numeric(14,2) from public.raye2_sponsor_revenue_ledger r
       join public.raye2_creator_sponsor_campaigns c on c.id=r.campaign_id
       where c.creator_id=v_user),
    'payout_status','not_configured',
    'disclaimer','Estimates are not guaranteed income. Payouts require a compliant provider and eligibility.',
    'viewer_identity_data_exposed',false
  ) into v_result;
  return coalesce(v_result,'{}'::jsonb);
end;
$$;
revoke all on function public.raye2_creator_monetization_report() from public, anon;
grant execute on function public.raye2_creator_monetization_report() to authenticated;

-- 8. Admin campaign integrity overview: budgets, impression caps, attributed revenue and budget state.
create or replace function public.raye2_campaign_integrity_overview()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_result jsonb;
begin
  if not public.raye2_is_platform_admin() then
    raise exception 'Raye2 platform admin access required' using errcode='42501';
  end if;
  select jsonb_build_object(
    'scope','platform_admin_aggregate_only',
    'creator_contract',(
      select coalesce(jsonb_agg(to_jsonb(x) order by x.campaign_id),'[]'::jsonb) from (
        select c.id as campaign_id, c.status, c.currency, c.budget_amount,
          c.daily_impression_cap, c.lifetime_impression_cap,
          (select count(*)::bigint from public.raye2_sponsor_delivery_events e where e.campaign_id=c.id and e.source_type='creator_contract' and e.event_type='impression' and not e.invalid) as impressions_served,
          (select count(*)::bigint from public.raye2_sponsor_delivery_events e where e.campaign_id=c.id and e.source_type='creator_contract' and e.invalid) as invalid_events,
          (select coalesce(sum(r.net_received),0)::numeric(14,2) from public.raye2_sponsor_revenue_ledger r where r.campaign_id=c.id and r.source_type='creator_contract') as attributed_net
        from public.raye2_creator_sponsor_campaigns c
      ) x
    ),
    'platform_campaign',(
      select coalesce(jsonb_agg(to_jsonb(x) order by x.campaign_id),'[]'::jsonb) from (
        select p.id as campaign_id, p.status, p.currency, p.budget_amount,
          p.daily_impression_cap, p.lifetime_impression_cap,
          (select count(*)::bigint from public.raye2_sponsor_delivery_events e where e.campaign_id=p.id and e.source_type='platform_campaign' and e.event_type='impression' and not e.invalid) as impressions_served,
          (select count(*)::bigint from public.raye2_sponsor_delivery_events e where e.campaign_id=p.id and e.source_type='platform_campaign' and e.invalid) as invalid_events,
          (select coalesce(sum(r.net_received),0)::numeric(14,2) from public.raye2_sponsor_revenue_ledger r where r.campaign_id=p.id and r.source_type='platform_campaign') as attributed_net
        from public.raye2_platform_sponsor_campaigns p
      ) x
    ),
    'reconciliation',(
      select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) from (
        select id,source_type,campaign_id,currency,state,variance,created_at
        from public.raye2_sponsor_reconciliation
      ) x
    ),
    'payment_execution_enabled',false,
    'viewer_identity_data_exposed',false
  ) into v_result;
  return coalesce(v_result,'{}'::jsonb);
end;
$$;
revoke all on function public.raye2_campaign_integrity_overview() from public, anon;
grant execute on function public.raye2_campaign_integrity_overview() to authenticated;

notify pgrst, 'reload schema';

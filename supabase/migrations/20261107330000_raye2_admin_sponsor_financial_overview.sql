-- Raye2 admin-only, aggregate sponsor finance overview. This is reporting, not payment execution.
create or replace function public.raye2_admin_sponsor_financial_overview()
returns jsonb
language plpgsql
stable
security definer
set search_path=''
as $$
declare v_result jsonb;
begin
 if not public.raye2_is_platform_admin() then
  raise exception 'Raye2 platform admin access required' using errcode='42501';
 end if;

 select jsonb_build_object(
  'scope','platform_admin_aggregate_only',
  'revenue_by_source_currency_status',(
   select coalesce(jsonb_agg(to_jsonb(x) order by x.source_type,x.currency,x.status),'[]'::jsonb)
   from (
    select source_type,currency,status,provider_key,
     count(*)::bigint as records,
     sum(gross_amount)::numeric(14,2) as gross_amount,
     sum(net_received)::numeric(14,2) as net_received,
     sum(case when status='received' then net_received else 0 end)::numeric(14,2) as verified_received,
     sum(case when status in ('estimated','provider_reported') then net_received else 0 end)::numeric(14,2) as unconfirmed_net,
     sum(case when status='received' then platform_share else 0 end)::numeric(14,2) as platform_share_received,
     sum(case when status='received' then creator_share else 0 end)::numeric(14,2) as creator_share_received
    from public.raye2_sponsor_revenue_ledger
    group by source_type,currency,status,provider_key
   ) x
  ),
  'delivery_by_source_event',(
   select coalesce(jsonb_agg(to_jsonb(x) order by x.source_type,x.inventory,x.event_type),'[]'::jsonb)
   from (
    select source_type,inventory,event_type,count(*)::bigint as event_count
    from public.raye2_sponsor_delivery_events
    group by source_type,inventory,event_type
   ) x
  ),
  'campaign_counts',jsonb_build_object(
   'creator_contract',(select jsonb_build_object('total',count(*)::bigint,'active',count(*) filter(where status='active')::bigint,'paused',count(*) filter(where status='paused')::bigint,'draft',count(*) filter(where status='draft')::bigint) from public.raye2_creator_sponsor_campaigns),
   'platform',(select jsonb_build_object('total',count(*)::bigint,'active',count(*) filter(where status='active')::bigint,'paused',count(*) filter(where status='paused')::bigint,'draft',count(*) filter(where status='draft')::bigint) from public.raye2_platform_sponsor_campaigns)
  ),
  'payment_execution_enabled',false,
  'viewer_identity_data_exposed',false
 ) into v_result;
 return coalesce(v_result,'{}'::jsonb);
end;
$$;
revoke all on function public.raye2_admin_sponsor_financial_overview() from public,anon,authenticated;
grant execute on function public.raye2_admin_sponsor_financial_overview() to authenticated;
comment on function public.raye2_admin_sponsor_financial_overview() is
 'Raye2 platform-admin aggregate sponsorship delivery and revenue reporting. Distinguishes received from unconfirmed amounts; does not execute payments or expose viewer identities.';

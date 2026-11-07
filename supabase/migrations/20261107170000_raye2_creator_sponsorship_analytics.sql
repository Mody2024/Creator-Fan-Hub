-- Creator-scoped sponsorship reporting. No viewer identities or platform-wide campaigns are exposed.
create or replace function public.raye2_creator_sponsorship_analytics(p_media_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_user uuid := auth.uid();
  v_result jsonb;
begin
  if v_user is null or not public.is_nhen_video_publisher() then
    raise exception 'assigned creator access required' using errcode='42501';
  end if;

  if p_media_id is not null and not exists (
    select 1 from public.raye2_creator_sponsor_campaigns c
    where c.creator_id=v_user and c.media_id=p_media_id
  ) then
    raise exception 'video sponsorship access required' using errcode='42501';
  end if;

  with owned_campaigns as (
    select c.id,c.media_id
    from public.raye2_creator_sponsor_campaigns c
    where c.creator_id=v_user and (p_media_id is null or c.media_id=p_media_id)
  ),
  delivery as (
    select e.source_type,e.event_type,e.provider_key,count(*)::bigint as event_count
    from public.raye2_sponsor_delivery_events e
    join owned_campaigns c on c.id=e.campaign_id
    where e.source_type in ('creator_contract','external_network')
    group by e.source_type,e.event_type,e.provider_key
  ),
  revenue as (
    select r.currency,r.status,r.provider_key,
      sum(r.gross_amount)::numeric(14,2) as gross_amount,
      sum(r.net_received)::numeric(14,2) as net_received,
      sum(case when r.status='received' then r.creator_share else 0 end)::numeric(14,2) as creator_share_received,
      sum(case when r.status in ('estimated','provider_reported') then r.creator_share else 0 end)::numeric(14,2) as creator_share_unconfirmed,
      count(*)::bigint as records
    from public.raye2_sponsor_revenue_ledger r
    join owned_campaigns c on c.id=r.campaign_id
    where r.source_type='external_network'
    group by r.currency,r.status,r.provider_key
  ),
  campaign_counts as (
    select count(*)::bigint as total,
      count(*) filter(where status='active')::bigint as active,
      count(*) filter(where status='paused')::bigint as paused,
      count(*) filter(where status='draft')::bigint as drafts
    from public.raye2_creator_sponsor_campaigns c
    where c.creator_id=v_user and (p_media_id is null or c.media_id=p_media_id)
  )
  select jsonb_build_object(
    'scope','creator_owned_campaigns',
    'campaigns',(select to_jsonb(cc) from campaign_counts cc),
    'delivery',(select coalesce(jsonb_agg(to_jsonb(d) order by d.source_type,d.event_type,d.provider_key),'[]'::jsonb) from delivery d),
    'external_network_revenue',(select coalesce(jsonb_agg(to_jsonb(r) order by r.currency,r.status,r.provider_key),'[]'::jsonb) from revenue r),
    'contract_sponsorship_reporting','delivery_activity_only_no_platform_payout_attribution',
    'platform_campaigns_excluded',true,
    'viewer_identity_data_exposed',false
  ) into v_result;

  return coalesce(v_result,'{}'::jsonb);
end;
$$;

revoke all on function public.raye2_creator_sponsorship_analytics(uuid) from public,anon;
grant execute on function public.raye2_creator_sponsorship_analytics(uuid) to authenticated;
comment on function public.raye2_creator_sponsorship_analytics(uuid) is
  'Creator-only aggregate sponsor delivery and external-network net-revenue report. Never exposes viewer identities or platform-wide campaigns; contract sponsor deals are activity-only.';

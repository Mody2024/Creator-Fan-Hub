-- Raye2 Wave 4/8/9: Smart Advertising Director (plan 18.2/18.3/18.6).
--
-- Sponsorship campaign records, delivery telemetry, revenue ledgers and creator breakpoint reviews already
-- existed, but nothing decided where a sponsor may appear, nothing prevented a platform campaign from
-- overriding a creator contract, and there was no frequency/duplicate protection. This adds the decision
-- engine plus the reviewable natural-breakpoint model and the optional context replay.

-- 1. Rules category extension + director policy rules (admin-configurable within technical limits).
alter table public.raye2_platform_rules drop constraint if exists raye2_platform_rules_category_check;
alter table public.raye2_platform_rules add constraint raye2_platform_rules_category_check
  check (category in ('roles','content','chat','groups','voice','recording','watch','watch_together','retention','storage','safety','minis','moments','live','ads'));

insert into public.raye2_platform_rules(rule_key, category, rule_value, status, description) values
  ('ads.max_placements_per_video', 'ads', '3'::jsonb, 'active', 'Upper bound on mid-roll placements per video.'),
  ('ads.intensity_percent', 'ads', '100'::jsonb, 'active', 'Ad-intensity policy as a percentage of the placement cap (0 disables mid-rolls).'),
  ('ads.min_break_gap_seconds', 'ads', '90'::jsonb, 'active', 'Minimum spacing between two placements.'),
  ('ads.max_per_viewer_per_day', 'ads', '2'::jsonb, 'active', 'Frequency cap: impressions per viewer per campaign in the window.'),
  ('ads.frequency_window_hours', 'ads', '24'::jsonb, 'active', 'Window for the per-viewer frequency cap.'),
  ('ads.context_replay_seconds', 'ads', '5'::jsonb, 'active', 'Context replay bridge after a mid-roll in seconds (0 disables).')
on conflict (rule_key) do nothing;

-- 1b. Creator campaigns could never be activated: the lifecycle guard anticipates a trusted service-role
--     delivery gate (it permits null auth.uid()), but the validation trigger rejected any operation without a
--     browser session. Align them so the trusted server can activate, while content is still validated.
create or replace function public.raye2_validate_creator_sponsor_campaign()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_content_owner uuid;
  v_content_type text;
  v_sponsor_owner uuid;
  v_sponsor_type text;
  v_sponsor_public boolean;
begin
  if auth.uid() is null then
    -- Trusted server/service-role delivery gate: ownership is enforced by the guard, content is validated below.
    null;
  elsif new.creator_id<>(select auth.uid()) or not public.is_nhen_video_publisher() then
    raise exception 'assigned creator access required' using errcode='42501';
  end if;

  select m.owner_id,m.media_type into v_content_owner,v_content_type
    from public.media_items m where m.id=new.media_id;
  if v_content_owner is distinct from new.creator_id
     or v_content_type not in ('video','youtube')
     or not exists(select 1 from public.video_catalog v
       where v.media_id=new.media_id and v.published_at is not null) then
    raise exception 'sponsorship must attach to your own published Raye2 video' using errcode='42501';
  end if;

  select m.owner_id,m.media_type,m.is_published
    into v_sponsor_owner,v_sponsor_type,v_sponsor_public
    from public.media_items m where m.id=new.sponsor_asset_media_id;
  if v_sponsor_owner is distinct from new.creator_id
     or v_sponsor_type not in ('video','image') or v_sponsor_public is distinct from true then
    raise exception 'sponsor creative must be your own published video asset' using errcode='42501';
  end if;

  new.sponsor_name:=btrim(new.sponsor_name);
  new.disclosure_text:=btrim(new.disclosure_text);
  new.updated_at:=now();
  return new;
end;
$$;
revoke all on function public.raye2_validate_creator_sponsor_campaign() from public,anon,authenticated;

-- 2. Reviewable structural breakpoints: natural points a creator can approve or exclude.
create table if not exists public.raye2_media_breakpoints (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.media_items(id) on delete cascade,
  creator_id uuid not null references auth.users(id) on delete cascade,
  at_seconds integer not null check (at_seconds >= 0),
  source text not null default 'structural' check (source in ('structural','manual')),
  excluded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(media_id, at_seconds)
);
create index if not exists raye2_media_breakpoints_media_idx
  on public.raye2_media_breakpoints(media_id, excluded, at_seconds);
alter table public.raye2_media_breakpoints enable row level security;
revoke all on public.raye2_media_breakpoints from anon, public;
grant select,insert,update,delete on public.raye2_media_breakpoints to authenticated;
drop policy if exists "Creators manage own media breakpoints" on public.raye2_media_breakpoints;
create policy "Creators manage own media breakpoints"
  on public.raye2_media_breakpoints for all to authenticated
  using (creator_id=(select auth.uid()) and public.is_nhen_video_publisher()
    and exists(select 1 from public.media_items m where m.id=media_id and m.owner_id=(select auth.uid())))
  with check (creator_id=(select auth.uid()) and public.is_nhen_video_publisher()
    and exists(select 1 from public.media_items m where m.id=media_id and m.owner_id=(select auth.uid())));

-- 3. Structural breakpoint proposal from video structure. Deterministic natural points at scene/chapter-like
--    fractions, clamped away from the opening and closing so no break lands in the setup or the payoff.
create or replace function public.raye2_propose_breakpoints(p_media_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid; v_dur integer; v_min_gap integer; v_start_off integer; v_end_off integer;
  f numeric; v_at integer; v_added integer := 0;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  select m.owner_id into v_owner from public.media_items m where m.id=p_media_id;
  if v_owner is distinct from v_uid or not public.is_nhen_video_publisher() then
    raise exception 'creator access required' using errcode='42501';
  end if;
  select v.duration_seconds into v_dur from public.video_catalog v
   where v.media_id=p_media_id and v.published_at is not null;
  if v_dur is null or v_dur < 120 then return 0; end if;
  v_min_gap := greatest(10, public.raye2_rule_int('ads.min_break_gap_seconds', 90));
  v_start_off := least(15, floor(v_dur * 0.05)::integer);
  v_end_off := least(30, floor(v_dur * 0.15)::integer);
  for f in select unnest(array[0.15, 0.30, 0.45, 0.60, 0.75, 0.90]::numeric[]) loop
    v_at := floor(v_dur * f)::integer;
    if v_at < v_start_off or v_at > v_dur - v_end_off then continue; end if;
    insert into public.raye2_media_breakpoints(media_id, creator_id, at_seconds, source)
    values(p_media_id, v_uid, v_at, 'structural')
    on conflict (media_id, at_seconds) do nothing;
    if found then v_added := v_added + 1; end if;
  end loop;
  return v_added;
end;
$$;
revoke all on function public.raye2_propose_breakpoints(uuid) from public, anon;
grant execute on function public.raye2_propose_breakpoints(uuid) to authenticated;

-- 4. Creator review: approve or exclude a proposed breakpoint.
create or replace function public.raye2_set_media_breakpoint_excluded(p_breakpoint_id uuid, p_excluded boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  update public.raye2_media_breakpoints
     set excluded=coalesce(p_excluded,false), updated_at=now()
   where id=p_breakpoint_id and creator_id=v_uid and public.is_nhen_video_publisher();
  if not found then raise exception 'breakpoint not found or not yours' using errcode='42501'; end if;
  return true;
end;
$$;
revoke all on function public.raye2_set_media_breakpoint_excluded(uuid,boolean) from public, anon;
grant execute on function public.raye2_set_media_breakpoint_excluded(uuid,boolean) to authenticated;

-- 5. Sponsor selection for one slot: a creator contract always wins; a platform campaign is only used when
--    no creator contract applies and it is eligible by scope, region, category, priority and exclusivity.
--    Frequency caps use a hashed viewer key, never a raw identity.
create or replace function public.raye2_pick_ad_sponsor(
  p_media_id uuid, p_inventory text, p_viewer_hash text, p_region text,
  p_creator_exclusive boolean, p_platform_locked text
)
returns table (source_type text, campaign_id uuid, sponsor_name text, disclosure_text text, variant_key text, variant_media_id uuid, category_key text, category_exclusive boolean)
language sql stable security definer set search_path=''
as $$
  with window_start as (select now() - make_interval(hours => greatest(1, public.raye2_rule_int('ads.frequency_window_hours', 24))) as at),
  creator_pick as (
    select 'creator_contract'::text as source_type, c.id as campaign_id, c.sponsor_name, c.disclosure_text, c.category_key, c.category_exclusive
    from public.raye2_creator_sponsor_campaigns c, window_start w
    where c.media_id=p_media_id and c.status='active' and c.creator_confirmed_rights
      and (c.starts_at is null or c.starts_at<=now()) and (c.ends_at is null or c.ends_at>now())
      and (p_viewer_hash is null or (select count(*) from public.raye2_sponsor_delivery_events e
            where e.campaign_id=c.id and e.source_type='creator_contract' and e.event_type='impression'
              and e.occurred_at>w.at and e.viewer_key_hash=p_viewer_hash) < c.max_per_viewer)
    order by c.created_at limit 1
  ),
  creator_variant as (
    select v.variant_key, v.media_id as variant_media_id
    from public.raye2_sponsor_creative_variants v, creator_pick cp
    where v.creator_campaign_id=cp.campaign_id and v.active
    order by case v.variant_key when 'standard_10s' then 0 when 'short_5s' then 1 when 'extended' then 2 else 3 end
    limit 1
  ),
  platform_pick as (
    select 'platform_campaign'::text as source_type, p.id as campaign_id, p.sponsor_name, p.disclosure_text, p.category_key, p.category_exclusive
    from public.raye2_platform_sponsor_campaigns p
    join public.video_catalog vc on vc.media_id=p_media_id
    cross join window_start w
    where not coalesce(p_creator_exclusive,false)
      and p.status='active'
      and (p.starts_at is null or p.starts_at<=now()) and (p.ends_at is null or p.ends_at>now())
      and coalesce((p.campaign_scope->>(case p_inventory when 'video' then 'videos' else 'live' end))::boolean, false)
      and (coalesce(array_length(p.allowed_regions,1),0)=0 or (p_region is not null and p_region=any(p.allowed_regions)))
      and (p.category_key='general' or p.category_key=coalesce(vc.category,'general'))
      and (p_platform_locked is null or p.category_key=p_platform_locked)
      and (p_viewer_hash is null or (select count(*) from public.raye2_sponsor_delivery_events e
            where e.campaign_id=p.id and e.source_type='platform_campaign' and e.event_type='impression'
              and e.occurred_at>w.at and e.viewer_key_hash=p_viewer_hash) < p.max_per_viewer)
    order by p.priority desc, p.created_at limit 1
  ),
  platform_variant as (
    select v.variant_key, v.media_id as variant_media_id
    from public.raye2_sponsor_creative_variants v, platform_pick pp
    where v.platform_campaign_id=pp.campaign_id and v.active
    order by case v.variant_key when 'standard_10s' then 0 when 'short_5s' then 1 when 'extended' then 2 else 3 end
    limit 1
  )
  select q.source_type, q.campaign_id, q.sponsor_name, q.disclosure_text, q.variant_key, q.variant_media_id, q.category_key, q.category_exclusive
  from (
    select 0 as prio, cp.source_type, cp.campaign_id, cp.sponsor_name, cp.disclosure_text, cv.variant_key, cv.variant_media_id, cp.category_key, cp.category_exclusive
    from creator_pick cp left join creator_variant cv on true
    union all
    select 1 as prio, pp.source_type, pp.campaign_id, pp.sponsor_name, pp.disclosure_text, pv.variant_key, pv.variant_media_id, pp.category_key, pp.category_exclusive
    from platform_pick pp left join platform_variant pv on true
  ) q
  order by q.prio
  limit 1;
$$;
revoke all on function public.raye2_pick_ad_sponsor(uuid,text,text,text,boolean,text) from public, anon, authenticated;
grant execute on function public.raye2_pick_ad_sponsor(uuid,text,text,text,boolean,text) to service_role;

-- 6. Creator-facing plan: proposed placements for their own video, reviewable and never an override.
create or replace function public.raye2_ad_director_plan(
  p_media_id uuid, p_inventory text default 'video', p_viewer_key text default null, p_region text default null
)
returns table (at_seconds integer, source_type text, campaign_id uuid, sponsor_name text, disclosure_text text, variant_key text, variant_media_id uuid, replay_seconds integer, reason text)
language plpgsql stable security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_owner uuid; v_cap integer; v_intensity integer; v_effective integer; v_gap integer; v_replay integer;
  v_hash text; v_exclusive boolean; v_locked text; v_last integer; n integer := 0;
  v_st text; v_cid uuid; v_sname text; v_disc text; v_vk text; v_vm uuid; v_ckey text; v_cexcl boolean;
  bp record;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_inventory not in ('video','live') then raise exception 'invalid inventory' using errcode='22023'; end if;
  select m.owner_id into v_owner from public.media_items m where m.id=p_media_id;
  if v_owner is distinct from v_uid or not public.is_nhen_video_publisher() then
    raise exception 'creator review access required' using errcode='42501';
  end if;

  v_cap := greatest(0, public.raye2_rule_int('ads.max_placements_per_video', 3));
  v_intensity := least(100, greatest(0, public.raye2_rule_int('ads.intensity_percent', 100)));
  v_effective := floor(v_cap * v_intensity / 100.0)::integer;
  v_gap := greatest(10, public.raye2_rule_int('ads.min_break_gap_seconds', 90));
  v_replay := least(15, greatest(0, public.raye2_rule_int('ads.context_replay_seconds', 5)));
  v_hash := case when p_viewer_key is null then null else encode(extensions.digest(convert_to(p_viewer_key,'UTF8'),'sha256'),'hex') end;
  if v_effective = 0 then return; end if;

  select bool_or(c.category_exclusive) into v_exclusive
    from public.raye2_creator_sponsor_campaigns c
   where c.media_id=p_media_id and c.status='active' and c.creator_confirmed_rights;

  for bp in select b.at_seconds from public.raye2_media_breakpoints b
             where b.media_id=p_media_id and not b.excluded order by b.at_seconds loop
    exit when n >= v_effective;
    if v_last is not null and bp.at_seconds - v_last < v_gap then continue; end if;
    select h.source_type,h.campaign_id,h.sponsor_name,h.disclosure_text,h.variant_key,h.variant_media_id,h.category_key,h.category_exclusive
      into v_st,v_cid,v_sname,v_disc,v_vk,v_vm,v_ckey,v_cexcl
      from public.raye2_pick_ad_sponsor(p_media_id,p_inventory,v_hash,p_region,v_exclusive,v_locked) h;
    at_seconds := bp.at_seconds;
    source_type := v_st; campaign_id := v_cid; sponsor_name := v_sname; disclosure_text := v_disc;
    variant_key := v_vk; variant_media_id := v_vm; replay_seconds := v_replay;
    reason := case when v_st is null then 'no eligible sponsor'
                   when v_st='creator_contract' then 'creator contract takes priority'
                   else 'platform campaign by priority' end;
    return next;
    v_last := bp.at_seconds; n := n + 1;
    if v_st='platform_campaign' and coalesce(v_cexcl,false) then v_locked := v_ckey; end if;
  end loop;
end;
$$;
revoke all on function public.raye2_ad_director_plan(uuid,text,text,text) from public, anon;
grant execute on function public.raye2_ad_director_plan(uuid,text,text,text) to authenticated;

-- 7. Viewer-facing schedule for playback: only filled, eligible slots, labelled and with the replay bridge.
create or replace function public.raye2_public_ad_schedule(p_media_id uuid, p_viewer_key text default null, p_region text default null)
returns table (at_seconds integer, source_type text, sponsor_name text, disclosure_text text, variant_media_id uuid, replay_seconds integer, label text)
language plpgsql stable security definer set search_path=''
as $$
declare
  v_cap integer; v_intensity integer; v_effective integer; v_gap integer; v_replay integer;
  v_hash text; v_exclusive boolean; v_locked text; v_last integer; n integer := 0;
  v_st text; v_cid uuid; v_sname text; v_disc text; v_vk text; v_vm uuid; v_ckey text; v_cexcl boolean;
  bp record;
begin
  if not public.raye2_can_view_video(p_media_id) then return; end if;
  v_cap := greatest(0, public.raye2_rule_int('ads.max_placements_per_video', 3));
  v_intensity := least(100, greatest(0, public.raye2_rule_int('ads.intensity_percent', 100)));
  v_effective := floor(v_cap * v_intensity / 100.0)::integer;
  v_gap := greatest(10, public.raye2_rule_int('ads.min_break_gap_seconds', 90));
  v_replay := least(15, greatest(0, public.raye2_rule_int('ads.context_replay_seconds', 5)));
  v_hash := case when p_viewer_key is null then null else encode(extensions.digest(convert_to(p_viewer_key,'UTF8'),'sha256'),'hex') end;
  if v_effective = 0 then return; end if;

  select bool_or(c.category_exclusive) into v_exclusive
    from public.raye2_creator_sponsor_campaigns c
   where c.media_id=p_media_id and c.status='active' and c.creator_confirmed_rights;

  for bp in select b.at_seconds from public.raye2_media_breakpoints b
             where b.media_id=p_media_id and not b.excluded order by b.at_seconds loop
    exit when n >= v_effective;
    if v_last is not null and bp.at_seconds - v_last < v_gap then continue; end if;
    select h.source_type,h.campaign_id,h.sponsor_name,h.disclosure_text,h.variant_key,h.variant_media_id,h.category_key,h.category_exclusive
      into v_st,v_cid,v_sname,v_disc,v_vk,v_vm,v_ckey,v_cexcl
      from public.raye2_pick_ad_sponsor(p_media_id,'video',v_hash,p_region,v_exclusive,v_locked) h;
    if v_st is null then continue; end if;
    at_seconds := bp.at_seconds; source_type := v_st; sponsor_name := v_sname; disclosure_text := v_disc;
    variant_media_id := v_vm; replay_seconds := v_replay;
    label := case when v_st='creator_contract' then 'Sponsored by ' || v_sname else 'Advertisement · ' || v_sname end;
    return next;
    v_last := bp.at_seconds; n := n + 1;
    if v_st='platform_campaign' and coalesce(v_cexcl,false) then v_locked := v_ckey; end if;
  end loop;
end;
$$;
revoke all on function public.raye2_public_ad_schedule(uuid,text,text) from public;
grant execute on function public.raye2_public_ad_schedule(uuid,text,text) to anon, authenticated;

-- 8. Delivery recording with duplicate protection and the per-viewer frequency cap. Distinct source types
--    keep separate attribution; external-network events are admin/provider-only.
create or replace function public.raye2_record_ad_delivery(
  p_media_id uuid, p_inventory text, p_source_type text, p_campaign_id uuid, p_event_type text,
  p_provider_key text default 'internal_simulation', p_viewer_key text default null,
  p_metadata jsonb default '{}'::jsonb, p_provider_event_id text default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid(); v_hash text; v_peid text; v_id uuid; v_freq integer; v_cnt integer;
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
    select c.max_per_viewer into v_freq from public.raye2_creator_sponsor_campaigns c where c.id=p_campaign_id;
  else
    if not public.raye2_is_platform_admin() then raise exception 'platform admin required' using errcode='42501'; end if;
    if p_source_type='platform_campaign' then
      select p.max_per_viewer into v_freq from public.raye2_platform_sponsor_campaigns p where p.id=p_campaign_id;
    else
      v_freq := public.raye2_rule_int('ads.max_per_viewer_per_day', 2);
    end if;
  end if;

  v_hash := case when p_viewer_key is null then null else encode(extensions.digest(convert_to(p_viewer_key,'UTF8'),'sha256'),'hex') end;

  if p_event_type='impression' and v_hash is not null then
    select count(*) into v_cnt from public.raye2_sponsor_delivery_events e
     where e.campaign_id=p_campaign_id and e.source_type=p_source_type and e.event_type='impression'
       and e.viewer_key_hash=v_hash and e.occurred_at > now() - make_interval(hours => v_window);
    if v_cnt >= coalesce(v_freq, public.raye2_rule_int('ads.max_per_viewer_per_day', 2)) then
      raise exception 'per-viewer frequency cap reached for this campaign' using errcode='42501';
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

notify pgrst, 'reload schema';

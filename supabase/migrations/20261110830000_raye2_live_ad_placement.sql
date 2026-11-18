-- Raye2 Wave 4/9: live sponsor placement fail-safe (plan 18.2 live, 18.3 live, 18.7).
--
-- Video placement is driven by structural breakpoints. Live has no such structure: it uses streamer-declared
-- natural breaks, and it must fail safely when the approved provider cannot support compliant insertion or a
-- DVR rolling buffer. Nothing here invents provider capability or fabricates state.

-- 1. Provider capability and streamer-declared breaks.
alter table public.raye2_live_streams
  add column if not exists provider_key text check (provider_key is null or char_length(provider_key) between 1 and 80),
  add column if not exists live_insertion_capable boolean not null default false,
  add column if not exists live_dvr_capable boolean not null default false;

create table if not exists public.raye2_live_break_marks (
  id uuid primary key default gen_random_uuid(),
  stream_id uuid not null references public.raye2_live_streams(id) on delete cascade,
  streamer_id uuid not null references auth.users(id) on delete cascade,
  kind text not null default 'streamer_declared' check (kind in ('round_break','intermission','transition','streamer_declared')),
  marked_at timestamptz not null default now(),
  excluded boolean not null default false,
  note text not null default '' check (char_length(note) <= 240),
  created_at timestamptz not null default now()
);
create index if not exists raye2_live_break_marks_stream_idx
  on public.raye2_live_break_marks(stream_id, excluded, marked_at);
alter table public.raye2_live_break_marks enable row level security;
revoke all on public.raye2_live_break_marks from anon, public;
grant select,insert,update,delete on public.raye2_live_break_marks to authenticated;
drop policy if exists "Streamers manage own live break marks" on public.raye2_live_break_marks;
create policy "Streamers manage own live break marks"
  on public.raye2_live_break_marks for all to authenticated
  using (streamer_id=(select auth.uid()) and exists(select 1 from public.raye2_live_streams s where s.id=stream_id and s.streamer_id=(select auth.uid())))
  with check (streamer_id=(select auth.uid()) and exists(select 1 from public.raye2_live_streams s where s.id=stream_id and s.streamer_id=(select auth.uid())));

create or replace function public.raye2_mark_live_break(p_stream_id uuid, p_kind text default 'streamer_declared', p_note text default '')
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_owner uuid; v_status text; v_id uuid;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_kind not in ('round_break','intermission','transition','streamer_declared') then
    raise exception 'invalid break kind' using errcode='22023';
  end if;
  select s.streamer_id,s.status into v_owner,v_status from public.raye2_live_streams s where s.id=p_stream_id;
  if v_owner is distinct from v_uid then raise exception 'not your live stream' using errcode='42501'; end if;
  if v_status <> 'live' then raise exception 'breaks can only be marked on a live stream' using errcode='22023'; end if;
  insert into public.raye2_live_break_marks(stream_id,streamer_id,kind,note)
  values(p_stream_id,v_uid,p_kind,btrim(coalesce(p_note,''))) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raye2_mark_live_break(uuid,text,text) from public, anon;
grant execute on function public.raye2_mark_live_break(uuid,text,text) to authenticated;

create or replace function public.raye2_set_live_break_excluded(p_break_id uuid, p_excluded boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  update public.raye2_live_break_marks set excluded=coalesce(p_excluded,false)
   where id=p_break_id and streamer_id=v_uid;
  if not found then raise exception 'break not found or not yours' using errcode='42501'; end if;
  return true;
end;
$$;
revoke all on function public.raye2_set_live_break_excluded(uuid,boolean) from public, anon;
grant execute on function public.raye2_set_live_break_excluded(uuid,boolean) to authenticated;

-- 2. Provider capability is a release dependency; only platform admins record it (never invented).
create or replace function public.raye2_set_live_provider_capability(
  p_stream_id uuid, p_provider_key text, p_insertion_capable boolean, p_dvr_capable boolean
)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_key text := btrim(coalesce(p_provider_key,''));
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'platform admin required' using errcode='42501';
  end if;
  if char_length(v_key) not between 1 and 80 then raise exception 'invalid provider key' using errcode='22023'; end if;
  update public.raye2_live_streams
     set provider_key=v_key, live_insertion_capable=coalesce(p_insertion_capable,false),
         live_dvr_capable=coalesce(p_dvr_capable,false), updated_at=now()
   where id=p_stream_id;
  if not found then raise exception 'stream not found' using errcode='P0002'; end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'live_provider_capability_set','live_stream',p_stream_id::text,'',
    jsonb_build_object('provider_key',v_key,'insertion_capable',coalesce(p_insertion_capable,false),'dvr_capable',coalesce(p_dvr_capable,false)));
  return true;
end;
$$;
revoke all on function public.raye2_set_live_provider_capability(uuid,text,boolean,boolean) from public, anon;
grant execute on function public.raye2_set_live_provider_capability(uuid,text,boolean,boolean) to authenticated;

-- 3. Live sponsor selection: platform campaigns only (creator video contracts bind to a video, not a stream).
create or replace function public.raye2_pick_live_ad_sponsor(p_viewer_hash text, p_region text, p_platform_locked text)
returns table (source_type text, campaign_id uuid, sponsor_name text, disclosure_text text, variant_key text, variant_media_id uuid, category_key text, category_exclusive boolean)
language sql stable security definer set search_path=''
as $$
  with window_start as (select now() - make_interval(hours => greatest(1, public.raye2_rule_int('ads.frequency_window_hours', 24))) as at),
  pick as (
    select 'platform_campaign'::text as source_type, p.id as campaign_id, p.sponsor_name, p.disclosure_text, p.category_key, p.category_exclusive
    from public.raye2_platform_sponsor_campaigns p, window_start w
    where p.status='active'
      and (p.starts_at is null or p.starts_at<=now()) and (p.ends_at is null or p.ends_at>now())
      and coalesce((p.campaign_scope->>'live')::boolean, false)
      and (coalesce(array_length(p.allowed_regions,1),0)=0 or (p_region is not null and p_region=any(p.allowed_regions)))
      and (p_platform_locked is null or p.category_key=p_platform_locked)
      and (p_viewer_hash is null or (select count(*) from public.raye2_sponsor_delivery_events e
            where e.campaign_id=p.id and e.source_type='platform_campaign' and e.event_type='impression'
              and e.occurred_at>w.at and e.viewer_key_hash=p_viewer_hash) < p.max_per_viewer)
    order by p.priority desc, p.created_at limit 1
  ),
  variant as (
    select v.variant_key, v.media_id as variant_media_id from public.raye2_sponsor_creative_variants v, pick pk
    where v.platform_campaign_id=pk.campaign_id and v.active
    order by case v.variant_key when 'standard_10s' then 0 when 'short_5s' then 1 when 'extended' then 2 else 3 end
    limit 1
  )
  select pk.source_type, pk.campaign_id, pk.sponsor_name, pk.disclosure_text, v.variant_key, v.variant_media_id, pk.category_key, pk.category_exclusive
  from pick pk left join variant v on true
  limit 1;
$$;
revoke all on function public.raye2_pick_live_ad_sponsor(text,text,text) from public, anon, authenticated;
grant execute on function public.raye2_pick_live_ad_sponsor(text,text,text) to service_role;

-- 4. Readiness: why live placement is or is not safe right now. Never claims provider support that is absent.
create or replace function public.raye2_live_ad_readiness(p_stream_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare v_owner uuid; v_status text; v_health text; v_insert boolean; v_dvr boolean; v_reasons text[] := '{}';
begin
  select s.streamer_id,s.status,s.health,s.live_insertion_capable,s.live_dvr_capable
    into v_owner,v_status,v_health,v_insert,v_dvr
  from public.raye2_live_streams s where s.id=p_stream_id;
  if v_owner is null then raise exception 'stream not found' using errcode='P0002'; end if;
  if not (public.raye2_is_platform_admin() or (auth.uid() is not null and v_owner=auth.uid())) then
    raise exception 'streamer or admin access required' using errcode='42501';
  end if;
  if v_status <> 'live' then v_reasons := array_append(v_reasons,'stream is not live'); end if;
  if not v_insert then v_reasons := array_append(v_reasons,'provider does not support compliant live insertion'); end if;
  if v_health in ('offline','reconnecting') then v_reasons := array_append(v_reasons,'stream health is '||v_health); end if;
  return jsonb_build_object(
    'eligible', array_length(v_reasons,1) is null,
    'reasons', to_jsonb(v_reasons),
    'insertion_capable', v_insert,
    'dvr_capable', v_dvr,
    'health', v_health,
    'status', v_status
  );
end;
$$;
revoke all on function public.raye2_live_ad_readiness(uuid) from public, anon;
grant execute on function public.raye2_live_ad_readiness(uuid) to authenticated;

-- 5. Live placement: streamer-declared breaks only, fail-safe skip when insertion is unsafe, and a context
--    replay bridge only when the approved provider exposes a compliant DVR buffer.
create or replace function public.raye2_live_ad_schedule(
  p_stream_id uuid, p_viewer_key text default null, p_region text default null
)
returns table (break_id uuid, marked_at timestamptz, kind text, source_type text, sponsor_name text, disclosure_text text, variant_media_id uuid, replay_seconds integer, label text)
language plpgsql stable security definer set search_path=''
as $$
declare
  v_owner uuid; v_status text; v_health text; v_visibility text; v_insert boolean; v_dvr boolean;
  v_cap integer; v_intensity integer; v_effective integer; v_gap integer; v_replay integer;
  v_hash text; v_locked text; v_last timestamptz; n integer := 0;
  v_st text; v_cid uuid; v_sname text; v_disc text; v_vk text; v_vm uuid; v_ckey text; v_cexcl boolean;
  bp record;
begin
  select s.streamer_id,s.status,s.health,s.visibility,s.live_insertion_capable,s.live_dvr_capable
    into v_owner,v_status,v_health,v_visibility,v_insert,v_dvr
  from public.raye2_live_streams s where s.id=p_stream_id;
  if v_owner is null then return; end if;
  if not (public.raye2_is_platform_admin() or (auth.uid() is not null and v_owner=auth.uid())
          or (v_visibility='public' and v_status='live')) then
    return;
  end if;

  -- Fail safe: never attempt insertion the provider cannot support or during an unhealthy stream.
  if v_status <> 'live' or not v_insert or v_health in ('offline','reconnecting') then return; end if;

  v_cap := greatest(0, public.raye2_rule_int('ads.max_placements_per_video', 3));
  v_intensity := least(100, greatest(0, public.raye2_rule_int('ads.intensity_percent', 100)));
  v_effective := floor(v_cap * v_intensity / 100.0)::integer;
  v_gap := greatest(10, public.raye2_rule_int('ads.min_break_gap_seconds', 90));
  v_replay := case when v_dvr then least(15, greatest(0, public.raye2_rule_int('ads.context_replay_seconds', 5))) else 0 end;
  v_hash := case when p_viewer_key is null then null else encode(extensions.digest(convert_to(p_viewer_key,'UTF8'),'sha256'),'hex') end;
  if v_effective = 0 then return; end if;

  for bp in select b.id, b.marked_at, b.kind from public.raye2_live_break_marks b
             where b.stream_id=p_stream_id and not b.excluded order by b.marked_at loop
    exit when n >= v_effective;
    if v_last is not null and bp.marked_at - v_last < make_interval(secs => v_gap) then continue; end if;
    select h.source_type,h.campaign_id,h.sponsor_name,h.disclosure_text,h.variant_key,h.variant_media_id,h.category_key,h.category_exclusive
      into v_st,v_cid,v_sname,v_disc,v_vk,v_vm,v_ckey,v_cexcl
      from public.raye2_pick_live_ad_sponsor(v_hash,p_region,v_locked) h;
    break_id := bp.id; marked_at := bp.marked_at; kind := bp.kind;
    source_type := v_st; sponsor_name := v_sname; disclosure_text := v_disc; variant_media_id := v_vm;
    replay_seconds := v_replay;
    label := case when v_st is null then null
                  when v_st='creator_contract' then 'Sponsored by ' || v_sname
                  else 'Advertisement · ' || v_sname end;
    return next;
    v_last := bp.marked_at; n := n + 1;
    if v_st='platform_campaign' and coalesce(v_cexcl,false) then v_locked := v_ckey; end if;
  end loop;
end;
$$;
revoke all on function public.raye2_live_ad_schedule(uuid,text,text) from public;
grant execute on function public.raye2_live_ad_schedule(uuid,text,text) to anon, authenticated;

notify pgrst, 'reload schema';

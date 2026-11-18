-- Raye2 Phase C foundation: private voice-call sessions, group voice-room
-- membership, private Realtime signaling authorization, and recording consent.
-- This is the control plane only; it does not claim to provide an SFU or audio media transport.

insert into public.raye2_platform_rules(rule_key,category,rule_value,status,description) values
 ('voice.private_call.enabled','voice','false'::jsonb,'proposed','Owner-controlled availability for one-to-one voice calls.'),
 ('voice.group_room.enabled','voice','false'::jsonb,'proposed','Owner-controlled availability for group voice rooms.'),
 ('voice.group_room.max_participants','voice','10'::jsonb,'proposed','Suggested initial group-room cap; confirm against the selected SFU capacity.'),
 ('voice.session.max_duration_seconds','voice','10800'::jsonb,'proposed','Suggested maximum voice session duration.'),
 ('recording.enabled','recording','false'::jsonb,'proposed','Recording is off by default and cannot start without explicit consent from every participant.')
on conflict (rule_key) do nothing;

create table if not exists public.raye2_voice_sessions (
  id uuid primary key default gen_random_uuid(),
  session_type text not null check (session_type in ('private_call','group_room')),
  conversation_id uuid not null references public.raye2_conversations(id) on delete cascade,
  group_id uuid references public.raye2_groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'ringing' check (status in ('ringing','active','ended','declined','cancelled','expired')),
  is_locked boolean not null default false,
  recording_state text not null default 'off'
    check (recording_state in ('off','consent_pending','consent_granted','stopped')),
  started_at timestamptz,
  ended_at timestamptz,
  expires_at timestamptz not null default (now() + interval '3 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((session_type='private_call' and group_id is null) or (session_type='group_room' and group_id is not null))
);
create unique index if not exists raye2_one_active_private_call_per_conversation
  on public.raye2_voice_sessions(conversation_id)
  where session_type='private_call' and status in ('ringing','active');
create unique index if not exists raye2_one_active_group_voice_room
  on public.raye2_voice_sessions(group_id)
  where session_type='group_room' and status in ('ringing','active');
create index if not exists raye2_voice_sessions_recent_idx
  on public.raye2_voice_sessions(created_at desc,status);

create table if not exists public.raye2_voice_participants (
  session_id uuid not null references public.raye2_voice_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'speaker'
    check (role in ('host','cohost','moderator','speaker','listener')),
  status text not null default 'invited'
    check (status in ('invited','joined','left','declined','removed')),
  recording_consent text not null default 'not_requested'
    check (recording_consent in ('not_requested','pending','accepted','declined','withdrawn')),
  invited_at timestamptz not null default now(),
  joined_at timestamptz,
  left_at timestamptz,
  primary key(session_id,user_id)
);
create index if not exists raye2_voice_participants_user_idx
  on public.raye2_voice_participants(user_id,status,invited_at desc);

create table if not exists public.raye2_voice_recording_consent_events (
  id bigint generated always as identity primary key,
  session_id uuid not null references public.raye2_voice_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  event text not null check (event in ('requested','accepted','declined','withdrawn','consent_reset')),
  created_at timestamptz not null default now()
);
create index if not exists raye2_voice_consent_events_session_idx
  on public.raye2_voice_recording_consent_events(session_id,created_at desc);

alter table public.raye2_voice_sessions enable row level security;
alter table public.raye2_voice_participants enable row level security;
alter table public.raye2_voice_recording_consent_events enable row level security;

revoke all on public.raye2_voice_sessions,public.raye2_voice_participants,
  public.raye2_voice_recording_consent_events from anon,authenticated;
grant select on public.raye2_voice_sessions,public.raye2_voice_participants,
  public.raye2_voice_recording_consent_events to authenticated;

create policy "Raye2 voice sessions visible to invited and joined participants"
  on public.raye2_voice_sessions for select to authenticated
  using (exists (
    select 1 from public.raye2_voice_participants p
    where p.session_id=id and p.user_id=(select auth.uid())
      and p.status in ('invited','joined')
  ));
create or replace function public.raye2_can_access_voice_session(p_session_id uuid,p_require_joined boolean default false)
returns boolean language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.user_id=(select auth.uid())
      and case when p_require_joined then p.status='joined' else p.status in ('invited','joined') end
  );
$$;
revoke all on function public.raye2_can_access_voice_session(uuid,boolean) from public,anon;
grant execute on function public.raye2_can_access_voice_session(uuid,boolean) to authenticated;

create policy "Raye2 voice participants visible within a shared session"
  on public.raye2_voice_participants for select to authenticated
  using (user_id=(select auth.uid()) or public.raye2_can_access_voice_session(session_id,false));
create policy "Raye2 voice consent history visible to session participants"
  on public.raye2_voice_recording_consent_events for select to authenticated
  using (exists (
    select 1 from public.raye2_voice_participants p
    where p.session_id=raye2_voice_recording_consent_events.session_id
      and p.user_id=(select auth.uid()) and p.status in ('invited','joined')
  ));

create or replace function public.raye2_create_voice_session(p_conversation_id uuid,p_session_type text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_conversation public.raye2_conversations%rowtype;
  v_session uuid;
  v_group_id uuid;
  v_enabled boolean:=false;
  v_other uuid;
  v_duration integer:=10800;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_session_type not in ('private_call','group_room') then
    raise exception 'invalid voice session type' using errcode='22023';
  end if;
  select * into v_conversation from public.raye2_conversations c
    where c.id=p_conversation_id and c.status='active';
  if not found or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'conversation membership required' using errcode='42501';
  end if;
  select coalesce((r.rule_value #>> '{}')::boolean,false) into v_enabled
    from public.raye2_platform_rules r
    where r.rule_key=case when p_session_type='private_call'
      then 'voice.private_call.enabled' else 'voice.group_room.enabled' end
      and r.status='active';
  if not coalesce(v_enabled,false) then
    raise exception 'voice feature is not enabled by the platform owner' using errcode='42501';
  end if;
  select (r.rule_value #>> '{}')::integer into v_duration from public.raye2_platform_rules r
    where r.rule_key='voice.session.max_duration_seconds' and r.status='active';
  v_duration:=greatest(60,least(coalesce(v_duration,10800),43200));
  if p_session_type='private_call' then
    if v_conversation.conversation_type<>'direct' then
      raise exception 'private calls require a direct conversation' using errcode='22023';
    end if;
    select cm.user_id into v_other from public.raye2_conversation_members cm
      where cm.conversation_id=p_conversation_id and cm.user_id<>auth.uid()
      order by cm.joined_at limit 1;
    if v_other is null then raise exception 'direct conversation partner unavailable' using errcode='P0002'; end if;
    if exists(select 1 from public.member_blocks b where
      (b.blocker_id=auth.uid() and b.blocked_id=v_other)
      or (b.blocker_id=v_other and b.blocked_id=auth.uid())) then
      raise exception 'voice call unavailable for this relationship' using errcode='42501';
    end if;
    insert into public.raye2_voice_sessions(session_type,conversation_id,created_by,status,expires_at)
      values('private_call',p_conversation_id,auth.uid(),'ringing',now()+make_interval(secs=>v_duration)) returning id into v_session;
    insert into public.raye2_voice_participants(session_id,user_id,role,status)
      values(v_session,auth.uid(),'host','joined'),(v_session,v_other,'speaker','invited');
  else
    if v_conversation.conversation_type<>'group' or v_conversation.group_id is null
      or not public.raye2_is_group_member(v_conversation.group_id) then
      raise exception 'group membership required' using errcode='42501';
    end if;
    select g.id into v_group_id from public.raye2_groups g
      where g.id=v_conversation.group_id and g.status='active';
    if v_group_id is null then raise exception 'group voice is unavailable' using errcode='P0002'; end if;
    insert into public.raye2_voice_sessions(session_type,conversation_id,group_id,created_by,status,started_at,expires_at)
      values('group_room',p_conversation_id,v_group_id,auth.uid(),'active',now(),now()+make_interval(secs=>v_duration)) returning id into v_session;
    insert into public.raye2_voice_participants(session_id,user_id,role,status,joined_at)
      values(v_session,auth.uid(),'host','joined',now());
  end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values(auth.uid(),'voice_session_created','voice_session',v_session::text,'Voice session created',
      jsonb_build_object('session_type',p_session_type,'conversation_id',p_conversation_id));
  return v_session;
end;
$$;
revoke all on function public.raye2_create_voice_session(uuid,text) from public,anon;
grant execute on function public.raye2_create_voice_session(uuid,text) to authenticated;

create or replace function public.raye2_join_voice_session(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
  v_session public.raye2_voice_sessions%rowtype;
  v_capacity integer:=10;
  v_capacity_rule jsonb;
  v_count integer;
  v_existing text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select * into v_session from public.raye2_voice_sessions s
    where s.id=p_session_id and s.status in ('ringing','active') and s.expires_at>now()
    for update;
  if not found then raise exception 'voice session unavailable' using errcode='P0002'; end if;
  select p.status into v_existing from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.user_id=auth.uid();
  if v_session.session_type='private_call' then
    if v_existing is distinct from 'invited' and v_existing is distinct from 'joined' then
      raise exception 'voice invitation required' using errcode='42501';
    end if;
    if exists(
      select 1 from public.raye2_conversation_members mine
      join public.raye2_conversation_members other on other.conversation_id=mine.conversation_id
      join public.member_blocks b on
        (b.blocker_id=mine.user_id and b.blocked_id=other.user_id)
        or (b.blocker_id=other.user_id and b.blocked_id=mine.user_id)
      where mine.conversation_id=v_session.conversation_id
        and mine.user_id=auth.uid() and other.user_id<>auth.uid()
    ) then raise exception 'voice call unavailable for this relationship' using errcode='42501'; end if;
  else
    if not public.raye2_is_group_member(v_session.group_id) then
      raise exception 'group membership required' using errcode='42501';
    end if;
    if v_session.is_locked and v_existing is distinct from 'joined' then
      raise exception 'voice room is locked' using errcode='42501';
    end if;
    select (r.rule_value #>> '{}')::integer into v_capacity
      from public.raye2_platform_rules r
      where r.rule_key='voice.group_room.max_participants' and r.status='active';
    v_capacity:=greatest(2,least(coalesce(v_capacity,10),50));
  end if;
  select count(*) into v_count from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.status='joined' and p.user_id<>auth.uid();
  if v_count>=v_capacity then raise exception 'voice session is full' using errcode='54000'; end if;
  insert into public.raye2_voice_participants(session_id,user_id,role,status,joined_at)
    values(p_session_id,auth.uid(),'speaker','joined',now())
    on conflict(session_id,user_id) do update set
      status='joined',joined_at=now(),left_at=null;
  update public.raye2_voice_sessions set status='active',
    started_at=coalesce(started_at,now()),
    recording_state=case when recording_state='consent_granted' then 'consent_pending' else recording_state end,
    updated_at=now()
    where id=p_session_id;
  if v_session.recording_state in ('consent_pending','consent_granted') then
    update public.raye2_voice_participants set recording_consent='pending'
      where session_id=p_session_id and user_id=auth.uid();
    insert into public.raye2_voice_recording_consent_events(session_id,user_id,event)
      values(p_session_id,auth.uid(),'requested');
  end if;
end;
$$;
revoke all on function public.raye2_join_voice_session(uuid) from public,anon;
grant execute on function public.raye2_join_voice_session(uuid) to authenticated;

create or replace function public.raye2_decline_voice_invitation(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_session public.raye2_voice_sessions%rowtype;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select * into v_session from public.raye2_voice_sessions s
    where s.id=p_session_id and s.session_type='private_call' and s.status='ringing' for update;
  if not found then raise exception 'voice invitation unavailable' using errcode='P0002'; end if;
  update public.raye2_voice_participants set status='declined',left_at=now()
    where session_id=p_session_id and user_id=auth.uid() and status='invited';
  if not found then raise exception 'voice invitation required' using errcode='42501'; end if;
  update public.raye2_voice_sessions set status='declined',ended_at=now(),updated_at=now()
    where id=p_session_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason)
    values(auth.uid(),'voice_invitation_declined','voice_session',p_session_id::text,'Invitee declined call');
end;
$$;
revoke all on function public.raye2_decline_voice_invitation(uuid) from public,anon;
grant execute on function public.raye2_decline_voice_invitation(uuid) to authenticated;

create or replace function public.raye2_leave_voice_session(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare
  v_session public.raye2_voice_sessions%rowtype;
  v_user_role text;
  v_remaining uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select * into v_session from public.raye2_voice_sessions s
    where s.id=p_session_id and s.status in ('ringing','active') for update;
  if not found then return; end if;
  select p.role into v_user_role from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='joined';
  if not found then raise exception 'active voice participation required' using errcode='42501'; end if;
  update public.raye2_voice_participants set status='left',left_at=now(),
    recording_consent=case when recording_consent='accepted' then 'withdrawn' else recording_consent end
    where session_id=p_session_id and user_id=auth.uid();
  if v_session.recording_state in ('consent_pending','consent_granted') then
    insert into public.raye2_voice_recording_consent_events(session_id,user_id,event)
      values(p_session_id,auth.uid(),'withdrawn');
  end if;
  if v_session.session_type='private_call' then
    update public.raye2_voice_sessions set status='ended',ended_at=now(),updated_at=now(),
      recording_state=case when recording_state<>'off' then 'stopped' else 'off' end
      where id=p_session_id;
  else
    select p.user_id into v_remaining from public.raye2_voice_participants p
      where p.session_id=p_session_id and p.status='joined'
      order by case when p.role='cohost' then 0 else 1 end,p.joined_at limit 1;
    if v_remaining is null then
      update public.raye2_voice_sessions set status='ended',ended_at=now(),updated_at=now(),
        recording_state=case when recording_state<>'off' then 'stopped' else 'off' end
        where id=p_session_id;
    elsif v_user_role='host' then
      update public.raye2_voice_participants set role='host'
        where session_id=p_session_id and user_id=v_remaining;
    end if;
  end if;
end;
$$;
revoke all on function public.raye2_leave_voice_session(uuid) from public,anon;
grant execute on function public.raye2_leave_voice_session(uuid) to authenticated;

create or replace function public.raye2_moderate_voice_session(
  p_session_id uuid,p_action text,p_target_user_id uuid default null
)
returns void language plpgsql security definer set search_path=''
as $$
declare
  v_session public.raye2_voice_sessions%rowtype;
  v_actor_role text;
  v_target_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_action not in ('lock','unlock','remove','promote_cohost') then
    raise exception 'invalid voice moderation action' using errcode='22023';
  end if;
  select * into v_session from public.raye2_voice_sessions s
    where s.id=p_session_id and s.session_type='group_room' and s.status='active' for update;
  if not found then raise exception 'voice room unavailable' using errcode='P0002'; end if;
  select p.role into v_actor_role from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='joined';
  if v_actor_role is null or (v_actor_role not in ('host','cohost','moderator') and not public.raye2_is_group_manager(v_session.group_id)) then
    raise exception 'voice room moderator access required' using errcode='42501';
  end if;
  if p_action in ('lock','unlock') then
    update public.raye2_voice_sessions set is_locked=(p_action='lock'),updated_at=now()
      where id=p_session_id;
  else
    if p_target_user_id is null or p_target_user_id=auth.uid() then
      raise exception 'valid target participant required' using errcode='22023';
    end if;
    select p.role into v_target_role from public.raye2_voice_participants p
      where p.session_id=p_session_id and p.user_id=p_target_user_id and p.status='joined';
    if v_target_role is null or v_target_role='host' then
      raise exception 'target participant unavailable' using errcode='42501';
    end if;
    if p_action='remove' then
      update public.raye2_voice_participants set status='removed',left_at=now()
        where session_id=p_session_id and user_id=p_target_user_id;
    else
      update public.raye2_voice_participants set role='cohost'
        where session_id=p_session_id and user_id=p_target_user_id;
    end if;
  end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values(auth.uid(),'voice_room_moderated','voice_session',p_session_id::text,
      'Voice room moderation action',jsonb_build_object('action',p_action,'target_user_id',p_target_user_id));
end;
$$;
revoke all on function public.raye2_moderate_voice_session(uuid,text,uuid) from public,anon;
grant execute on function public.raye2_moderate_voice_session(uuid,text,uuid) to authenticated;

create or replace function public.raye2_request_voice_recording_consent(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_session public.raye2_voice_sessions%rowtype;v_enabled boolean:=false;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select * into v_session from public.raye2_voice_sessions s
    where s.id=p_session_id and s.status='active' for update;
  if not found then raise exception 'active voice session required' using errcode='P0002'; end if;
  if not exists(select 1 from public.raye2_voice_participants p where p.session_id=p_session_id
    and p.user_id=auth.uid() and p.status='joined' and p.role in ('host','cohost')) then
    raise exception 'host permission required' using errcode='42501';
  end if;
  select coalesce((r.rule_value #>> '{}')::boolean,false) into v_enabled
    from public.raye2_platform_rules r where r.rule_key='recording.enabled' and r.status='active';
  if not coalesce(v_enabled,false) then
    raise exception 'recording is disabled by platform policy' using errcode='42501';
  end if;
  update public.raye2_voice_sessions set recording_state='consent_pending',updated_at=now()
    where id=p_session_id;
  update public.raye2_voice_participants set recording_consent='pending'
    where session_id=p_session_id and status='joined';
  insert into public.raye2_voice_recording_consent_events(session_id,user_id,event)
    select p_session_id,p.user_id,'requested' from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.status='joined';
end;
$$;
revoke all on function public.raye2_request_voice_recording_consent(uuid) from public,anon;
grant execute on function public.raye2_request_voice_recording_consent(uuid) to authenticated;

create or replace function public.raye2_respond_voice_recording_consent(p_session_id uuid,p_decision text)
returns text language plpgsql security definer set search_path=''
as $$
declare v_session public.raye2_voice_sessions%rowtype;v_pending integer;v_joined integer;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_decision not in ('accepted','declined','withdrawn') then
    raise exception 'invalid recording consent decision' using errcode='22023';
  end if;
  select * into v_session from public.raye2_voice_sessions s
    where s.id=p_session_id and s.status='active' and s.recording_state in ('consent_pending','consent_granted')
    for update;
  if not found then raise exception 'recording consent is not active' using errcode='P0002'; end if;
  update public.raye2_voice_participants set recording_consent=p_decision
    where session_id=p_session_id and user_id=auth.uid() and status='joined';
  if not found then raise exception 'active voice participation required' using errcode='42501'; end if;
  insert into public.raye2_voice_recording_consent_events(session_id,user_id,event)
    values(p_session_id,auth.uid(),p_decision);
  if p_decision in ('declined','withdrawn') then
    update public.raye2_voice_sessions set recording_state='stopped',updated_at=now()
      where id=p_session_id;
    return 'stopped';
  end if;
  select count(*) filter(where p.recording_consent<>'accepted'),
         count(*) into v_pending,v_joined
    from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.status='joined';
  if v_joined>0 and v_pending=0 then
    update public.raye2_voice_sessions set recording_state='consent_granted',updated_at=now()
      where id=p_session_id;
    return 'consent_granted';
  end if;
  update public.raye2_voice_sessions set recording_state='consent_pending',updated_at=now()
    where id=p_session_id;
  return 'consent_pending';
end;
$$;
revoke all on function public.raye2_respond_voice_recording_consent(uuid,text) from public,anon;
grant execute on function public.raye2_respond_voice_recording_consent(uuid,text) to authenticated;


create or replace function public.raye2_can_access_voice_topic(p_topic text,p_require_joined boolean default false)
returns boolean language sql stable security definer set search_path=''
as $$
  select case
    when p_topic ~ '^raye2:voice:[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
    then public.raye2_can_access_voice_session(substring(p_topic from 13)::uuid,p_require_joined)
    else false
  end;
$$;
revoke all on function public.raye2_can_access_voice_topic(text,boolean) from public,anon;
grant execute on function public.raye2_can_access_voice_topic(text,boolean) to authenticated;

-- Private Realtime topics are scoped to a session participant. Invited users can
-- receive the incoming-call event; only joined participants can publish.
drop policy if exists "Raye2 voice participants can receive private signaling" on realtime.messages;
create policy "Raye2 voice participants can receive private signaling"
  on realtime.messages for select to authenticated
  using (extension in ('broadcast','presence') and public.raye2_can_access_voice_topic(realtime.topic(),false));
drop policy if exists "Raye2 joined voice participants can send private signaling" on realtime.messages;
create policy "Raye2 joined voice participants can send private signaling"
  on realtime.messages for insert to authenticated
  with check (extension in ('broadcast','presence') and public.raye2_can_access_voice_topic(realtime.topic(),true));

revoke all on function public.raye2_create_voice_session(uuid,text) from public,anon;
revoke all on function public.raye2_join_voice_session(uuid) from public,anon;
revoke all on function public.raye2_decline_voice_invitation(uuid) from public,anon;
revoke all on function public.raye2_leave_voice_session(uuid) from public,anon;
revoke all on function public.raye2_moderate_voice_session(uuid,text,uuid) from public,anon;
revoke all on function public.raye2_request_voice_recording_consent(uuid) from public,anon;
revoke all on function public.raye2_respond_voice_recording_consent(uuid,text) from public,anon;

revoke all on function public.raye2_can_access_voice_session(uuid,boolean) from public,anon;
revoke all on function public.raye2_can_access_voice_topic(text,boolean) from public,anon;


-- Publish session/participant changes so invited users and active rooms can refresh.
do $$
declare v_table text;
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    foreach v_table in array array[
      'raye2_voice_sessions',
      'raye2_voice_participants',
      'raye2_voice_recording_consent_events'
    ] loop
      if not exists (
        select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename=v_table
      ) then
        execute format('alter publication supabase_realtime add table public.%I',v_table);
      end if;
    end loop;
  end if;
end;
$$;

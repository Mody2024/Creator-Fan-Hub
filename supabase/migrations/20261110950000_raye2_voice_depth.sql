-- Raye2 Wave 7: voice depth — raise hand, audio preferences, idle-room expiry and bulk moderation.
--
-- Plan 4 requires join/leave, mute, raise hand and moderator controls, push-to-talk and noise suppression where
-- supported, configurable session duration, and idle-room timeout. Voice sessions, SFU rooms, moderation
-- (lock/remove/promote) and recording consent already existed, but:
--   * there was no raise-hand signal at all;
--   * audio preferences only covered allowing private calls;
--   * rooms never ended when everyone left, so they lingered until the 3-hour expiry;
--   * a moderator had to mute participants one at a time.

-- 1. Participant voice state: raised hand and server-visible mute.
alter table public.raye2_voice_participants
  add column if not exists hand_raised_at timestamptz,
  add column if not exists is_muted boolean not null default false;

-- 2. Session activity clock so idle rooms can be detected.
alter table public.raye2_voice_sessions
  add column if not exists last_activity_at timestamptz not null default now();

-- 3. Audio preferences: push-to-talk and noise suppression, alongside the existing private-call switch.
alter table public.raye2_voice_preferences
  add column if not exists push_to_talk boolean not null default false,
  add column if not exists noise_suppression boolean not null default true;

create or replace function public.raye2_set_voice_audio_preferences(
  p_push_to_talk boolean, p_noise_suppression boolean
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  insert into public.raye2_voice_preferences(user_id,push_to_talk,noise_suppression,updated_at)
    values(auth.uid(),coalesce(p_push_to_talk,false),coalesce(p_noise_suppression,true),now())
    on conflict(user_id) do update set
      push_to_talk=excluded.push_to_talk,
      noise_suppression=excluded.noise_suppression,
      updated_at=now();
end;
$$;
revoke all on function public.raye2_set_voice_audio_preferences(boolean,boolean) from public,anon;
grant execute on function public.raye2_set_voice_audio_preferences(boolean,boolean) to authenticated;

-- 4. Raise or lower the caller's hand in a joined voice session.
create or replace function public.raye2_set_voice_hand(p_session_id uuid,p_raised boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare v_status text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select p.status into v_status from public.raye2_voice_participants p
    join public.raye2_voice_sessions s on s.id=p.session_id
    where p.session_id=p_session_id and p.user_id=auth.uid()
      and s.status='active' and s.expires_at>now() for update of p;
  if v_status is null or v_status<>'joined' then
    raise exception 'joined voice session membership required' using errcode='42501';
  end if;
  update public.raye2_voice_participants
    set hand_raised_at = case when coalesce(p_raised,false) then now() else null end
    where session_id=p_session_id and user_id=auth.uid();
  update public.raye2_voice_sessions set last_activity_at=now(),updated_at=now() where id=p_session_id;
end;
$$;
revoke all on function public.raye2_set_voice_hand(uuid,boolean) from public,anon;
grant execute on function public.raye2_set_voice_hand(uuid,boolean) to authenticated;

-- 5. Mute state is tracked server-side so a moderator can mute everyone and the roster stays accurate.
create or replace function public.raye2_set_voice_mute(p_session_id uuid,p_muted boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare v_status text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select p.status into v_status from public.raye2_voice_participants p
    join public.raye2_voice_sessions s on s.id=p.session_id
    where p.session_id=p_session_id and p.user_id=auth.uid()
      and s.status='active' and s.expires_at>now() for update of p;
  if v_status is null or v_status<>'joined' then
    raise exception 'joined voice session membership required' using errcode='42501';
  end if;
  update public.raye2_voice_participants set is_muted=coalesce(p_muted,false)
    where session_id=p_session_id and user_id=auth.uid();
  update public.raye2_voice_sessions set last_activity_at=now(),updated_at=now() where id=p_session_id;
end;
$$;
revoke all on function public.raye2_set_voice_mute(uuid,boolean) from public,anon;
grant execute on function public.raye2_set_voice_mute(uuid,boolean) to authenticated;

-- 6. Extend voice moderation with bulk actions: mute every speaker, and clear all raised hands.
create or replace function public.raye2_voice_bulk_moderation(p_session_id uuid,p_action text)
returns integer language plpgsql security definer set search_path=''
as $$
declare
  v_session public.raye2_voice_sessions%rowtype;
  v_actor_role text;
  v_affected integer := 0;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_action not in ('mute_all','clear_hands') then
    raise exception 'invalid voice bulk moderation action' using errcode='22023';
  end if;
  select * into v_session from public.raye2_voice_sessions s
    where s.id=p_session_id and s.session_type='group_room' and s.status='active' for update;
  if not found then raise exception 'voice room unavailable' using errcode='P0002'; end if;
  select p.role into v_actor_role from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='joined';
  if v_actor_role is null
    or (v_actor_role not in ('host','cohost','moderator') and not public.raye2_is_group_manager(v_session.group_id)) then
    raise exception 'voice room moderator access required' using errcode='42501';
  end if;
  if p_action='mute_all' then
    with affected as (
      update public.raye2_voice_participants set is_muted=true
      where session_id=p_session_id and status='joined' and user_id<>auth.uid() returning 1)
    select count(*) into v_affected from affected;
  else
    with affected as (
      update public.raye2_voice_participants set hand_raised_at=null
      where session_id=p_session_id and status='joined' and hand_raised_at is not null returning 1)
    select count(*) into v_affected from affected;
  end if;
  update public.raye2_voice_sessions set last_activity_at=now(),updated_at=now() where id=p_session_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values(auth.uid(),'voice_room_bulk_'||p_action,'voice_session',p_session_id::text,
      'Voice room bulk moderation',jsonb_build_object('action',p_action,'affected',v_affected));
  return v_affected;
end;
$$;
revoke all on function public.raye2_voice_bulk_moderation(uuid,text) from public,anon;
grant execute on function public.raye2_voice_bulk_moderation(uuid,text) to authenticated;

-- 7. End rooms that have been idle: nobody joined, or the last activity is older than the idle window.
create or replace function public.raye2_expire_idle_voice_rooms(p_idle_minutes integer default 15)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer := 0; v_window interval;
begin
  if p_idle_minutes is null or p_idle_minutes < 1 or p_idle_minutes > 720 then
    raise exception 'invalid idle window' using errcode='22023';
  end if;
  v_window := (p_idle_minutes || ' minutes')::interval;
  with ended as (
    update public.raye2_voice_sessions s
      set status='ended',ended_at=coalesce(ended_at,now()),recording_state='off',updated_at=now()
    where s.status in ('ringing','active')
      and s.expires_at>now()
      and s.last_activity_at < now()-v_window
      and not exists (
        select 1 from public.raye2_voice_participants p
        where p.session_id=s.id and p.status='joined')
      and not exists (
        select 1 from public.raye2_voice_participants p
        where p.session_id=s.id and p.status='invited')
    returning 1)
  select count(*) into v_count from ended;
  return v_count;
end;
$$;
revoke all on function public.raye2_expire_idle_voice_rooms(integer) from public;
grant execute on function public.raye2_expire_idle_voice_rooms(integer) to anon,authenticated;

-- 8. Fold idle-room expiry into the maintenance runner, preserving existing keys.
create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_minis integer := -1; v_moments integer := -1; v_clips integer := -1; v_memories integer := -1;
  v_direct integer := -1; v_group integer := -1; v_watch integer := -1; v_voice integer := -1;
begin
  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  begin v_clips := public.raye2_expire_community_clips(); exception when others then v_clips := -1; end;
  begin v_memories := public.raye2_expire_shared_memories(); exception when others then v_memories := -1; end;
  begin v_direct := public.raye2_sweep_message_retention('direct_messages'); exception when others then v_direct := -1; end;
  begin v_group := public.raye2_sweep_message_retention('group_messages'); exception when others then v_group := -1; end;
  begin v_watch := public.raye2_expire_watch_sessions(); exception when others then v_watch := -1; end;
  begin v_voice := public.raye2_expire_idle_voice_rooms(15); exception when others then v_voice := -1; end;
  return jsonb_build_object('minis_expired', v_minis, 'moments_expired', v_moments,
    'clips_expired', v_clips, 'shared_memories_expired', v_memories,
    'direct_messages_expired', v_direct, 'group_messages_expired', v_group,
    'watch_sessions_expired', v_watch, 'voice_rooms_expired', v_voice, 'ran_at', now());
end;
$$;
revoke all on function public.raye2_run_maintenance() from public;
grant execute on function public.raye2_run_maintenance() to anon, authenticated;

-- 9. Publish the voice participant state to Realtime so raise-hand and mute update live.
do $$
declare v_table text;
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    foreach v_table in array array['raye2_voice_participants','raye2_voice_sessions'] loop
      if not exists (select 1 from pg_publication_tables
          where pubname='supabase_realtime' and schemaname='public' and tablename=v_table) then
        execute format('alter publication supabase_realtime add table public.%I',v_table);
      end if;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';

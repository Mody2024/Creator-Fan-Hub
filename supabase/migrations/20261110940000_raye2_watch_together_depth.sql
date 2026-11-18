-- Raye2 Wave 7: Watch Together depth — presence, host moderation and playback-control requests.
--
-- Plan 4 requires Watch Together to cover host controls, participant limits and host moderation, optional
-- playback-control requests, and reconnection/resynchronization after network interruptions. The synchronization
-- core, queue, voting and host control already existed, but:
--   * participants never refreshed last_seen_at, so presence was frozen at join time and nobody could be pruned;
--   * a host could not remove a disruptive participant;
--   * host control could not be handed over, and a participant could not request control;
--   * active sessions were never expired, so they lingered past their expiry window.

-- 1. Playback-control requests: a participant asks for control, the host/moderator approves or declines.
create table if not exists public.raye2_watch_control_requests (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.raye2_watch_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','approved','declined','expired')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id) on delete set null
);
create index if not exists raye2_watch_control_requests_session_idx
  on public.raye2_watch_control_requests(session_id,status,created_at desc);
create unique index if not exists raye2_watch_control_requests_pending_unique
  on public.raye2_watch_control_requests(session_id,user_id) where status='pending';

alter table public.raye2_watch_control_requests enable row level security;
revoke all on public.raye2_watch_control_requests from anon,authenticated;
grant select on public.raye2_watch_control_requests to authenticated;
drop policy if exists "Raye2 watch control requests visible to session members" on public.raye2_watch_control_requests;
create policy "Raye2 watch control requests visible to session members" on public.raye2_watch_control_requests for select to authenticated
  using (public.raye2_can_access_watch_session(session_id));

-- 2. Resolve the caller's watch role in an active session (host, moderator, participant) or null.
create or replace function public.raye2_watch_role(p_session_id uuid)
returns text language sql stable security definer set search_path=''
as $$
  select p.role from public.raye2_watch_participants p
  join public.raye2_watch_sessions s on s.id=p.session_id
  where p.session_id=p_session_id and p.user_id=(select auth.uid()) and p.status='joined'
    and s.status='active' and s.expires_at>now();
$$;
revoke all on function public.raye2_watch_role(uuid) from public,anon;
grant execute on function public.raye2_watch_role(uuid) to authenticated;

-- 3. Heartbeat: refresh the caller's presence and prune participants that have gone silent for too long. A pruned
--    host hands control to a moderator or the longest-joined participant, mirroring the leave behaviour.
create or replace function public.raye2_watch_heartbeat(p_session_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_pruned integer := 0; v_stale record; v_next uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  update public.raye2_watch_participants set last_seen_at=now()
    where session_id=p_session_id and user_id=auth.uid() and status='joined';
  for v_stale in
    select user_id,role from public.raye2_watch_participants
    where session_id=p_session_id and status='joined'
      and last_seen_at is not null and last_seen_at < now()-interval '90 seconds'
  loop
    update public.raye2_watch_participants set status='left'
      where session_id=p_session_id and user_id=v_stale.user_id;
    v_pruned := v_pruned + 1;
    if v_stale.role='host' then
      select user_id into v_next from public.raye2_watch_participants
        where session_id=p_session_id and status='joined'
        order by case when role='moderator' then 0 else 1 end, joined_at limit 1;
      if v_next is null then
        update public.raye2_watch_sessions set status='ended',is_playing=false,updated_at=now() where id=p_session_id;
      else
        update public.raye2_watch_participants set role='host' where session_id=p_session_id and user_id=v_next;
      end if;
    end if;
  end loop;
  return v_pruned;
end;
$$;
revoke all on function public.raye2_watch_heartbeat(uuid) from public,anon;
grant execute on function public.raye2_watch_heartbeat(uuid) to authenticated;

-- 4. Host moderation: remove a disruptive participant. Hosts and moderators may act; nobody may remove a host.
create or replace function public.raye2_remove_watch_participant(p_session_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor text; v_target text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  v_actor := public.raye2_watch_role(p_session_id);
  if v_actor is null or v_actor not in ('host','moderator') then
    raise exception 'watch host control permission required' using errcode='42501';
  end if;
  if p_user_id=auth.uid() then raise exception 'use leave instead' using errcode='22023'; end if;
  select role into v_target from public.raye2_watch_participants
    where session_id=p_session_id and user_id=p_user_id and status='joined';
  if v_target is null then raise exception 'participant unavailable' using errcode='P0002'; end if;
  if v_target='host' or (v_actor='moderator' and v_target='moderator') then
    raise exception 'cannot remove this participant' using errcode='42501';
  end if;
  update public.raye2_watch_participants set status='removed' where session_id=p_session_id and user_id=p_user_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'watch_participant_removed','watch_session',p_session_id::text,'Participant removed',
         jsonb_build_object('removed_user',p_user_id));
end;
$$;
revoke all on function public.raye2_remove_watch_participant(uuid,uuid) from public,anon;
grant execute on function public.raye2_remove_watch_participant(uuid,uuid) to authenticated;

-- 5. Transfer host control to another joined participant. Current host only.
create or replace function public.raye2_transfer_watch_host(p_session_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor text; v_target text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  v_actor := public.raye2_watch_role(p_session_id);
  if v_actor <> 'host' then raise exception 'watch host permission required' using errcode='42501'; end if;
  if p_user_id is null or p_user_id=auth.uid() then raise exception 'choose another participant' using errcode='22023'; end if;
  select role into v_target from public.raye2_watch_participants
    where session_id=p_session_id and user_id=p_user_id and status='joined';
  if v_target is null then raise exception 'participant unavailable' using errcode='P0002'; end if;
  update public.raye2_watch_participants set role='host' where session_id=p_session_id and user_id=p_user_id;
  update public.raye2_watch_participants set role='moderator' where session_id=p_session_id and user_id=auth.uid();
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'watch_host_transferred','watch_session',p_session_id::text,'Host control transferred',
         jsonb_build_object('new_host',p_user_id));
end;
$$;
revoke all on function public.raye2_transfer_watch_host(uuid,uuid) from public,anon;
grant execute on function public.raye2_transfer_watch_host(uuid,uuid) to authenticated;

-- 6. A joined participant (not host/moderator) asks for playback control.
create or replace function public.raye2_request_watch_control(p_session_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_role text; v_pending integer; v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  v_role := public.raye2_watch_role(p_session_id);
  if v_role is null then raise exception 'joined watch session membership required' using errcode='42501'; end if;
  if v_role in ('host','moderator') then raise exception 'you already control playback' using errcode='22023'; end if;
  select count(*) into v_pending from public.raye2_watch_control_requests
    where session_id=p_session_id and status='pending';
  if v_pending>=20 then raise exception 'too many pending control requests' using errcode='54000'; end if;
  insert into public.raye2_watch_control_requests(session_id,user_id) values(p_session_id,auth.uid())
    on conflict do nothing returning id into v_id;
  if v_id is null then
    select id into v_id from public.raye2_watch_control_requests
      where session_id=p_session_id and user_id=auth.uid() and status='pending';
  end if;
  return v_id;
end;
$$;
revoke all on function public.raye2_request_watch_control(uuid) from public,anon;
grant execute on function public.raye2_request_watch_control(uuid) to authenticated;

-- 7. Host/moderator approves or declines a control request. Approval grants the moderator role (control).
create or replace function public.raye2_resolve_watch_control_request(p_request_id uuid,p_decision text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_request public.raye2_watch_control_requests%rowtype; v_actor text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_decision not in ('approved','declined') then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into v_request from public.raye2_watch_control_requests where id=p_request_id for update;
  if not found then raise exception 'control request unavailable' using errcode='P0002'; end if;
  if v_request.status<>'pending' then raise exception 'control request already resolved' using errcode='22023'; end if;
  v_actor := public.raye2_watch_role(v_request.session_id);
  if v_actor is null or v_actor not in ('host','moderator') then
    raise exception 'watch host control permission required' using errcode='42501';
  end if;
  update public.raye2_watch_control_requests set status=p_decision,resolved_at=now(),resolved_by=auth.uid()
    where id=p_request_id;
  if p_decision='approved' then
    update public.raye2_watch_participants set role='moderator'
      where session_id=v_request.session_id and user_id=v_request.user_id and status='joined';
  end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'watch_control_request_'||p_decision,'watch_session',v_request.session_id::text,
         'Playback control request resolved',jsonb_build_object('requester',v_request.user_id));
end;
$$;
revoke all on function public.raye2_resolve_watch_control_request(uuid,text) from public,anon;
grant execute on function public.raye2_resolve_watch_control_request(uuid,text) to authenticated;

-- 8. End sessions past their expiry window and close out any still-pending control requests.
create or replace function public.raye2_expire_watch_sessions()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer := 0;
begin
  with expired as (
    update public.raye2_watch_sessions set status='expired',is_playing=false,updated_at=now()
    where status='active' and expires_at<=now() returning 1)
  select count(*) into v_count from expired;
  update public.raye2_watch_control_requests set status='expired',resolved_at=now()
    where status='pending' and session_id in (select id from public.raye2_watch_sessions where status<>'active');
  return v_count;
end;
$$;
revoke all on function public.raye2_expire_watch_sessions() from public;
grant execute on function public.raye2_expire_watch_sessions() to anon,authenticated;

-- 9. Fold watch-session expiry into the maintenance runner, preserving existing keys.
create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_minis integer := -1; v_moments integer := -1; v_clips integer := -1; v_memories integer := -1;
  v_direct integer := -1; v_group integer := -1; v_watch integer := -1;
begin
  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  begin v_clips := public.raye2_expire_community_clips(); exception when others then v_clips := -1; end;
  begin v_memories := public.raye2_expire_shared_memories(); exception when others then v_memories := -1; end;
  begin v_direct := public.raye2_sweep_message_retention('direct_messages'); exception when others then v_direct := -1; end;
  begin v_group := public.raye2_sweep_message_retention('group_messages'); exception when others then v_group := -1; end;
  begin v_watch := public.raye2_expire_watch_sessions(); exception when others then v_watch := -1; end;
  return jsonb_build_object('minis_expired', v_minis, 'moments_expired', v_moments,
    'clips_expired', v_clips, 'shared_memories_expired', v_memories,
    'direct_messages_expired', v_direct, 'group_messages_expired', v_group,
    'watch_sessions_expired', v_watch, 'ran_at', now());
end;
$$;
revoke all on function public.raye2_run_maintenance() from public;
grant execute on function public.raye2_run_maintenance() to anon, authenticated;

-- 10. Publish the control-requests table to Realtime when the standard publication is available.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    if not exists (select 1 from pg_publication_tables
        where pubname='supabase_realtime' and schemaname='public' and tablename='raye2_watch_control_requests') then
      execute 'alter publication supabase_realtime add table public.raye2_watch_control_requests';
    end if;
  end if;
end;
$$;

notify pgrst, 'reload schema';

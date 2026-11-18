-- Raye2 Wave 2: account sessions and devices (plan 2.1).
--
-- Plan 2.1 requires "user settings for privacy, notifications, accessibility, language, theme,
-- sessions/devices and data export/deletion". Every other item existed, but members had no way to see where
-- they are signed in or to end a session on a device they no longer control. These guarded RPCs read the
-- member's own GoTrue sessions and revoke them; the IP address is deliberately never returned.

-- 1. List the caller's own sessions, marking the one making the request.
create or replace function public.raye2_my_sessions()
returns table (
  session_id uuid, created_at timestamptz, updated_at timestamptz,
  aal text, not_after timestamptz, user_agent text, is_current boolean
)
language sql stable security definer set search_path=''
as $$
  select s.id, s.created_at, s.updated_at, s.aal, s.not_after, s.user_agent,
         (s.id = nullif((select auth.jwt() ->> 'session_id'), '')::uuid) as is_current
  from auth.sessions s
  where s.user_id = (select auth.uid())
  order by s.updated_at desc nulls last, s.created_at desc;
$$;
revoke all on function public.raye2_my_sessions() from public, anon;
grant execute on function public.raye2_my_sessions() to authenticated;

-- 2. Revoke one of the caller's own sessions. Ownership is enforced; a member can only end their own session.
create or replace function public.raye2_revoke_my_session(p_session_id uuid)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_removed integer;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_session_id is null then raise exception 'session id is required' using errcode='22023'; end if;
  delete from auth.sessions where id = p_session_id and user_id = v_uid;
  get diagnostics v_removed = row_count;
  if v_removed > 0 then
    insert into public.raye2_admin_audit_log(actor_id, action, target_type, target_id, reason, details)
    values (v_uid, 'user_session_revoked', 'session', p_session_id::text, 'member ended a session', '{}'::jsonb);
  end if;
  return v_removed > 0;
end;
$$;
revoke all on function public.raye2_revoke_my_session(uuid) from public, anon;
grant execute on function public.raye2_revoke_my_session(uuid) to authenticated;

-- 3. Revoke every other session (keep the current one). Used for "sign out everywhere else".
create or replace function public.raye2_revoke_other_sessions()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_current uuid; v_removed integer := 0;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  v_current := nullif((select auth.jwt() ->> 'session_id'), '')::uuid;
  delete from auth.sessions
   where user_id = v_uid and (v_current is null or id <> v_current);
  get diagnostics v_removed = row_count;
  if v_removed > 0 then
    insert into public.raye2_admin_audit_log(actor_id, action, target_type, target_id, reason, details)
    values (v_uid, 'user_sessions_revoked_others', 'user', v_uid::text, 'member ended other sessions',
            jsonb_build_object('revoked', v_removed));
  end if;
  return v_removed;
end;
$$;
revoke all on function public.raye2_revoke_other_sessions() from public, anon;
grant execute on function public.raye2_revoke_other_sessions() to authenticated;

notify pgrst, 'reload schema';

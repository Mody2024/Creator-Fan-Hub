-- Authorization helper for SFU moderation routes. The follow-up API still performs
-- the provider action; this function only authorizes it against current DB roles.
create or replace function public.raye2_can_moderate_voice_session(
  p_session_id uuid,
  p_target_user_id uuid
)
returns boolean language plpgsql stable security definer set search_path=''
as $$
declare
  v_group_id uuid;
  v_actor_role text;
  v_target_role text;
begin
  if auth.uid() is null or p_target_user_id is null or p_target_user_id=auth.uid() then
    return false;
  end if;
  select s.group_id into v_group_id from public.raye2_voice_sessions s
    where s.id=p_session_id and s.session_type='group_room'
      and s.status='active' and s.expires_at>now();
  if v_group_id is null then return false; end if;
  select p.role into v_actor_role from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.user_id=auth.uid() and p.status='joined';
  if v_actor_role is null or (
    v_actor_role not in ('host','cohost','moderator')
    and not public.raye2_is_group_manager(v_group_id)
  ) then
    return false;
  end if;
  select p.role into v_target_role from public.raye2_voice_participants p
    where p.session_id=p_session_id and p.user_id=p_target_user_id and p.status='joined';
  return v_target_role is not null and v_target_role<>'host';
end;
$$;
revoke all on function public.raye2_can_moderate_voice_session(uuid,uuid) from public,anon;
grant execute on function public.raye2_can_moderate_voice_session(uuid,uuid) to authenticated;

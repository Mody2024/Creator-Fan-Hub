-- Raye2 group voice room discovery/start RPC for an SFU-backed room.
create or replace function public.raye2_start_or_join_group_voice_room(p_conversation_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_conversation public.raye2_conversations%rowtype;
  v_session uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select * into v_conversation from public.raye2_conversations c
    where c.id=p_conversation_id and c.status='active';
  if not found or v_conversation.conversation_type<>'group'
    or v_conversation.group_id is null
    or not public.raye2_is_conversation_member(p_conversation_id)
    or not public.raye2_is_group_member(v_conversation.group_id) then
    raise exception 'active group membership required' using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(v_conversation.group_id::text,0));
  select s.id into v_session from public.raye2_voice_sessions s
    where s.group_id=v_conversation.group_id and s.session_type='group_room'
      and s.status='active' and s.expires_at>now()
    order by s.created_at desc limit 1 for update;
  if v_session is null then
    v_session:=public.raye2_create_voice_session(p_conversation_id,'group_room');
  end if;
  return v_session;
end;
$$;
revoke all on function public.raye2_start_or_join_group_voice_room(uuid) from public,anon;
grant execute on function public.raye2_start_or_join_group_voice_room(uuid) to authenticated;

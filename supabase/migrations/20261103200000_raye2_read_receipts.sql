-- Raye2 realtime phase: secure read receipts for conversation participants.
create or replace function public.raye2_mark_conversation_read(p_conversation_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path=''
as $$
declare
  v_read_at timestamptz := now();
begin
  if auth.uid() is null or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'conversation membership required' using errcode='42501';
  end if;
  update public.raye2_conversation_members
  set last_read_at=v_read_at
  where conversation_id=p_conversation_id and user_id=auth.uid();
  if not found then
    raise exception 'conversation membership required' using errcode='42501';
  end if;
  return v_read_at;
end;
$$;
revoke all on function public.raye2_mark_conversation_read(uuid) from public,anon;
grant execute on function public.raye2_mark_conversation_read(uuid) to authenticated;

-- Raye2 private-call preferences: members can disable incoming private calls.
create table if not exists public.raye2_voice_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  allow_private_calls boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.raye2_voice_preferences enable row level security;
revoke all on public.raye2_voice_preferences from anon,authenticated;
grant select on public.raye2_voice_preferences to authenticated;
create policy "Raye2 members read their own voice preferences"
  on public.raye2_voice_preferences for select to authenticated
  using (user_id=(select auth.uid()));

create or replace function public.raye2_set_voice_preferences(p_allow_private_calls boolean)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  insert into public.raye2_voice_preferences(user_id,allow_private_calls,updated_at)
    values(auth.uid(),coalesce(p_allow_private_calls,true),now())
    on conflict(user_id) do update set
      allow_private_calls=excluded.allow_private_calls,
      updated_at=now();
end;
$$;
revoke all on function public.raye2_set_voice_preferences(boolean) from public,anon;
grant execute on function public.raye2_set_voice_preferences(boolean) to authenticated;

create or replace function public.raye2_enforce_private_call_preferences()
returns trigger language plpgsql security definer set search_path=''
as $$
declare
  v_type text;
  v_creator uuid;
  v_allowed boolean:=true;
begin
  select s.session_type,s.created_by into v_type,v_creator
    from public.raye2_voice_sessions s where s.id=new.session_id;
  if v_type='private_call' and new.user_id<>v_creator and new.status in ('invited','joined') then
    select coalesce(p.allow_private_calls,true) into v_allowed
      from public.raye2_voice_preferences p where p.user_id=new.user_id;
    if not coalesce(v_allowed,true) then
      raise exception 'this member is not accepting private voice calls' using errcode='42501';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_enforce_private_call_preferences() from public,anon,authenticated;
drop trigger if exists raye2_enforce_private_call_preferences on public.raye2_voice_participants;
create trigger raye2_enforce_private_call_preferences
  before insert or update of status on public.raye2_voice_participants
  for each row execute function public.raye2_enforce_private_call_preferences();

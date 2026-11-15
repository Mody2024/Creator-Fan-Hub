-- Raye2 Wave 7 / plan 13.9: Watch Together rooms support in-room reactions.
--
-- Plan 13.9 requires Watch Together to support "chat/reactions". A watch session is bound to a conversation, so
-- chat is already available through the room's messages. Reactions were missing: there was no way to react to
-- the moment being watched, and no live reaction feed for other participants.

create table if not exists public.raye2_watch_reactions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.raye2_watch_sessions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('spark','orbit','legend','laugh','mindblown','support')),
  position_seconds integer,
  created_at timestamptz not null default now()
);
create index if not exists raye2_watch_reactions_session_idx
  on public.raye2_watch_reactions(session_id, created_at desc);

alter table public.raye2_watch_reactions enable row level security;
revoke all on public.raye2_watch_reactions from anon,authenticated;
grant select on public.raye2_watch_reactions to authenticated;

drop policy if exists "Raye2 watch reactions visible to session members" on public.raye2_watch_reactions;
create policy "Raye2 watch reactions visible to session members" on public.raye2_watch_reactions for select to authenticated
  using (public.raye2_can_access_watch_session(session_id));

-- Participants react to the moment being watched. Bounded rate (20 per minute) so reactions cannot be spammed.
create or replace function public.raye2_send_watch_reaction(p_session_id uuid, p_reaction text, p_position_seconds integer default null)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not public.raye2_is_watch_participant(p_session_id) then
    raise exception 'joined watch session required' using errcode='42501';
  end if;
  if p_reaction not in ('spark','orbit','legend','laugh','mindblown','support') then
    raise exception 'unsupported reaction' using errcode='22023';
  end if;
  if p_position_seconds is not null and (p_position_seconds < 0 or p_position_seconds > 86400) then
    raise exception 'invalid playback position' using errcode='22023';
  end if;
  if (select count(*) from public.raye2_watch_reactions r
        where r.session_id=p_session_id and r.user_id=auth.uid() and r.created_at > now() - interval '1 minute') >= 20 then
    raise exception 'too many reactions' using errcode='22023';
  end if;
  insert into public.raye2_watch_reactions(session_id,user_id,reaction,position_seconds)
    values(p_session_id,auth.uid(),p_reaction,p_position_seconds)
    returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raye2_send_watch_reaction(uuid,text,integer) from public,anon;
grant execute on function public.raye2_send_watch_reaction(uuid,text,integer) to authenticated;

-- Recent reactions with reactor identity for the live in-room feed.
create or replace function public.raye2_list_watch_reactions(p_session_id uuid, p_limit integer default 30)
returns table (id uuid, user_id uuid, reaction text, position_seconds integer, created_at timestamptz, display_name text, handle text)
language sql stable security definer set search_path=''
as $$
  select r.id, r.user_id, r.reaction, r.position_seconds, r.created_at, mp.display_name, mp.handle
  from public.raye2_watch_reactions r
  left join public.member_profiles mp on mp.user_id = r.user_id
  where r.session_id = p_session_id
    and public.raye2_can_access_watch_session(p_session_id)
  order by r.created_at desc
  limit greatest(1, least(coalesce(p_limit,30), 60));
$$;
revoke all on function public.raye2_list_watch_reactions(uuid,integer) from public,anon;
grant execute on function public.raye2_list_watch_reactions(uuid,integer) to authenticated;

-- Deliver reactions live to joined room members via Postgres Changes.
do $$
declare v_table text;
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    foreach v_table in array array['raye2_watch_reactions'] loop
      if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
        and schemaname='public' and tablename=v_table) then
        execute format('alter publication supabase_realtime add table public.%I',v_table);
      end if;
    end loop;
  end if;
end;
$$;

notify pgrst, 'reload schema';

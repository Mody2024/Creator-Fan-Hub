-- Raye2 Wave 3: public live discovery.
--
-- The live lifecycle (Wave 4) had no discovery surface: there was no /live route and the home page
-- never showed live streams. Plan 3 lists "live now" as a first-class home section. This exposes a
-- public, safe listing (public live streams and in-window public replays only) with streamer identity,
-- and lets anonymous visitors read a public stream. Nothing here exposes private or moderated streams.

create or replace function public.raye2_get_live_now(p_limit integer default 12)
returns table (
  stream_id uuid, title text, streamer_id uuid, handle text, display_name text, avatar_url text,
  status text, health text, playback_url text, started_at timestamptz, replay_until timestamptz
)
language sql stable security definer set search_path=''
as $$
  select s.id, s.title, s.streamer_id, p.handle, p.display_name, p.avatar_url,
         s.status, s.health, s.playback_url, s.started_at, s.replay_until
  from public.raye2_live_streams s
  left join public.member_profiles p on p.user_id = s.streamer_id
  where s.visibility = 'public'
    and (s.status = 'live' or (s.status = 'replay' and s.replay_until > now()))
  order by (s.status = 'live') desc, s.started_at desc nulls last
  limit least(greatest(coalesce(p_limit,12),1),50);
$$;
revoke all on function public.raye2_get_live_now(integer) from public;
grant execute on function public.raye2_get_live_now(integer) to anon, authenticated;

-- Anonymous visitors may read a public stream (raye2_get_live_stream already enforces visibility:
-- private/moderated streams are rejected and only public live/in-window replays are returned).
grant execute on function public.raye2_get_live_stream(uuid) to anon;

notify pgrst, 'reload schema';

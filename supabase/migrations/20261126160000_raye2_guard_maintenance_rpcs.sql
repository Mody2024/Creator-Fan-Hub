-- Restrict scheduled publishing and retention/expiry maintenance to the platform owner/admin
-- or the server-side service role. Public read pages must not trigger global message deletion.

create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_minis integer := -1; v_moments integer := -1; v_clips integer := -1; v_memories integer := -1;
  v_direct integer := -1; v_group integer := -1; v_expired integer := -1;
  v_idle_rooms integer := -1; v_long_videos integer := -1; v_watch_sessions integer := -1;
  v_videos_published integer := -1;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and (auth.uid() is null or not public.raye2_is_platform_admin()) then
    raise exception 'platform administrator or service role required' using errcode='42501';
  end if;

  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  begin v_clips := public.raye2_expire_community_clips(); exception when others then v_clips := -1; end;
  begin v_memories := public.raye2_expire_shared_memories(); exception when others then v_memories := -1; end;
  begin v_direct := public.raye2_sweep_message_retention('direct_messages'); exception when others then v_direct := -1; end;
  begin v_group := public.raye2_sweep_message_retention('group_messages'); exception when others then v_group := -1; end;
  begin v_expired := public.raye2_sweep_expired_messages(); exception when others then v_expired := -1; end;
  begin v_idle_rooms := public.raye2_expire_idle_voice_rooms(15); exception when others then v_idle_rooms := -1; end;
  begin v_long_videos := public.raye2_expire_long_videos(); exception when others then v_long_videos := -1; end;
  begin v_watch_sessions := public.raye2_expire_watch_sessions(); exception when others then v_watch_sessions := -1; end;
  begin v_videos_published := public.raye2_publish_due_videos(); exception when others then v_videos_published := -1; end;
  return jsonb_build_object(
    'minis_expired', v_minis, 'moments_expired', v_moments,
    'clips_expired', v_clips, 'shared_memories_expired', v_memories,
    'direct_messages_expired', v_direct, 'group_messages_expired', v_group,
    'disappearing_messages_expired', v_expired,
    'idle_voice_rooms_expired', v_idle_rooms, 'long_videos_expired', v_long_videos,
    'watch_sessions_expired', v_watch_sessions, 'due_videos_published', v_videos_published,
    'ran_at', now()
  );
end;
$$;
revoke all on function public.raye2_run_maintenance() from public, anon;
grant execute on function public.raye2_run_maintenance() to authenticated, service_role;

create or replace function public.raye2_publish_due_community_posts()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_published integer := 0;
begin
  if coalesce(current_setting('request.jwt.claim.role', true), '') <> 'service_role'
    and (auth.uid() is null or not public.raye2_is_platform_admin()) then
    raise exception 'platform administrator or service role required' using errcode='42501';
  end if;
  with due as (
    update public.community_posts
      set status='published', published_at=now(), publish_at=null
      where status='scheduled' and publish_at is not null and publish_at<=now()
      returning 1
  )
  select count(*) into v_published from due;
  return v_published;
end;
$$;
revoke all on function public.raye2_publish_due_community_posts() from public, anon;
grant execute on function public.raye2_publish_due_community_posts() to authenticated, service_role;

-- Internal workers are callable by the SECURITY DEFINER runner, not directly by members.
revoke all on function public.raye2_expire_minis() from public, anon, authenticated;
revoke all on function public.raye2_expire_moments() from public, anon, authenticated;
revoke all on function public.raye2_expire_community_clips() from public, anon, authenticated;
revoke all on function public.raye2_expire_shared_memories() from public, anon, authenticated;
revoke all on function public.raye2_sweep_message_retention(text) from public, anon, authenticated;
revoke all on function public.raye2_sweep_expired_messages() from public, anon, authenticated;
revoke all on function public.raye2_expire_idle_voice_rooms(integer) from public, anon, authenticated;
revoke all on function public.raye2_expire_long_videos() from public, anon, authenticated;
revoke all on function public.raye2_expire_watch_sessions() from public, anon, authenticated;
revoke all on function public.raye2_publish_due_videos() from public, anon, authenticated;
grant execute on function public.raye2_expire_minis() to service_role;
grant execute on function public.raye2_expire_moments() to service_role;
grant execute on function public.raye2_expire_community_clips() to service_role;
grant execute on function public.raye2_expire_shared_memories() to service_role;
grant execute on function public.raye2_sweep_message_retention(text) to service_role;
grant execute on function public.raye2_sweep_expired_messages() to service_role;
grant execute on function public.raye2_expire_idle_voice_rooms(integer) to service_role;
grant execute on function public.raye2_expire_long_videos() to service_role;
grant execute on function public.raye2_expire_watch_sessions() to service_role;
grant execute on function public.raye2_publish_due_videos() to service_role;

notify pgrst, 'reload schema';

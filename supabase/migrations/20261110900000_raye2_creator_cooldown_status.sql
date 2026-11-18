-- Raye2 Wave 4: surface the long-video cooldown in the creator capability payload.
--
-- Plan 13.4 requires the Creator Panel to display quota/cooldown state, and the quota matrix defines a
-- long-video cooldown (4 days for creator-only, 7 days for the combined role). The capability RPC returned the
-- cooldown limit but not whether the creator may publish right now, so the panel could not show real state.
-- This adds a `cooldown` block computed from the creator's most recent long video. It is read-only and does not
-- change enforcement, which raye2_assert_creator_action already performs.

create or replace function public.raye2_get_creator_capabilities(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid());
  v_tier text;
  v_cooldown_days integer;
  v_last timestamptz;
  v_next timestamptz;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_user_id is not null and p_user_id <> auth.uid() and not public.raye2_is_platform_admin() then
    raise exception 'platform admin access required' using errcode='42501';
  end if;
  v_tier := public.raye2_creator_tier(v_uid);
  v_cooldown_days := public.raye2_role_quota(v_tier,'long_video_cooldown_days');
  select max(m.created_at) into v_last from public.media_items m
    where m.owner_id = v_uid and m.media_type in ('video','youtube');
  if v_last is not null and v_cooldown_days is not null and v_cooldown_days > 0 then
    v_next := v_last + make_interval(days => v_cooldown_days);
  end if;
  return jsonb_build_object(
    'role', v_tier,
    'actions', jsonb_build_array(
      jsonb_build_object('action','publish_long_video','allowed',public.raye2_tier_allows(v_tier,'publish_long_video'),
        'reason', case when public.raye2_tier_allows(v_tier,'publish_long_video') then '' else 'requires the Creator role' end),
      jsonb_build_object('action','start_stream','allowed',public.raye2_tier_allows(v_tier,'start_stream'),
        'reason', case when public.raye2_tier_allows(v_tier,'start_stream') then '' else 'requires the Streamer role' end),
      jsonb_build_object('action','publish_mini','allowed',public.raye2_tier_allows(v_tier,'publish_mini'),
        'reason', case when public.raye2_tier_allows(v_tier,'publish_mini') then '' else 'requires a Creator or Streamer role' end),
      jsonb_build_object('action','publish_moment','allowed',public.raye2_tier_allows(v_tier,'publish_moment'),
        'reason', case when public.raye2_tier_allows(v_tier,'publish_moment') then '' else 'requires a Creator or Streamer role' end),
      jsonb_build_object('action','studio_upload','allowed',public.raye2_tier_allows(v_tier,'studio_upload'),
        'reason', case when public.raye2_tier_allows(v_tier,'studio_upload') then '' else 'requires the Creator role' end)
    ),
    'quotas', jsonb_build_object(
      'long_videos_per_month', public.raye2_role_quota(v_tier,'long_videos_per_month'),
      'long_video_cooldown_days', v_cooldown_days,
      'streams_per_month', public.raye2_role_quota(v_tier,'streams_per_month'),
      'streams_per_week', public.raye2_role_quota(v_tier,'streams_per_week'),
      'minis_per_month', public.raye2_role_quota(v_tier,'minis_per_month'),
      'moments_per_month', public.raye2_role_quota(v_tier,'moments_per_month')
    ),
    'usage', jsonb_build_object(
      'long_videos_per_month', public.raye2_creator_usage(v_uid,'long_videos_per_month'),
      'streams_per_month', public.raye2_creator_usage(v_uid,'streams_per_month'),
      'minis_per_month', public.raye2_creator_usage(v_uid,'minis_per_month'),
      'moments_per_month', public.raye2_creator_usage(v_uid,'moments_per_month')
    ),
    'cooldown', jsonb_build_object(
      'long_video_cooldown_days', v_cooldown_days,
      'last_long_video_at', v_last,
      'next_allowed_at', v_next,
      'can_publish_long_video_now', (v_next is null or v_next <= now())
    )
  );
end;
$$;
revoke all on function public.raye2_get_creator_capabilities(uuid) from public,anon;
grant execute on function public.raye2_get_creator_capabilities(uuid) to authenticated;

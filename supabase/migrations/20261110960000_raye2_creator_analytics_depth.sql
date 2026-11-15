-- Raye2 Wave 4: real Creator analytics, follower/engagement metrics and long-video expiry.
--
-- Plan 13.4 requires the Creator Panel to show real analytics (views, watch time, completion/retention where
-- measurable, engagement and followers) and never to fabricate metrics. Long videos must also support a
-- user-selected expiry of up to 14 days, subject to Admin policy. Neither existed:
--   * the analytics RPC returned only raw view/reaction/comment counts, with no unique viewers, no completion
--     and no follower context;
--   * long videos had no expiry column or expiry path at all.

-- 1. Long-video expiry: an optional, owner-set expiry up to an Admin-tunable ceiling (plan default 14 days).
alter table public.video_catalog
  add column if not exists expires_at timestamptz;
create index if not exists video_catalog_expiry_idx
  on public.video_catalog(expires_at) where expires_at is not null;

create or replace function public.raye2_creator_max_video_expiry_days()
returns integer language sql stable security definer set search_path=''
as $$ select least(14, greatest(1, public.raye2_rule_int('creator.max_video_expiry_days', 14))); $$;
revoke all on function public.raye2_creator_max_video_expiry_days() from public,anon;
grant execute on function public.raye2_creator_max_video_expiry_days() to authenticated;

-- 2. Set or clear a long video's expiry. Owner-only (or platform admin). 0 clears the expiry.
create or replace function public.raye2_set_video_expiry(p_media_id uuid, p_days integer)
returns timestamptz language plpgsql security definer set search_path=''
as $$
declare v_max integer; v_owner uuid; v_expires timestamptz;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select m.owner_id into v_owner from public.media_items m
    join public.video_catalog vc on vc.media_id=m.id where m.id=p_media_id;
  if v_owner is null then raise exception 'video unavailable' using errcode='P0002'; end if;
  if v_owner <> auth.uid() and not public.raye2_is_platform_admin() then
    raise exception 'video ownership required' using errcode='42501';
  end if;
  if p_days is null or p_days < 0 then raise exception 'invalid expiry' using errcode='22023'; end if;
  v_max := public.raye2_creator_max_video_expiry_days();
  if p_days > v_max then raise exception 'expiry exceeds the % day limit', v_max using errcode='22023'; end if;
  v_expires := case when p_days = 0 then null else now() + make_interval(days => p_days) end;
  update public.video_catalog set expires_at = v_expires, updated_at = now() where media_id = p_media_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values(auth.uid(),'creator_video_expiry_set','media_item',p_media_id::text,'Long-video expiry set',
           jsonb_build_object('days',p_days,'expires_at',v_expires));
  return v_expires;
end;
$$;
revoke all on function public.raye2_set_video_expiry(uuid,integer) from public,anon;
grant execute on function public.raye2_set_video_expiry(uuid,integer) to authenticated;

-- 3. Real Creator analytics: unique viewers, windowed reach, completion (where measurable), engagement and
--    followers. Watch time is NOT returned because no watch-time instrumentation exists; the response says so
--    explicitly rather than inventing a figure.
create or replace function public.raye2_get_creator_analytics(p_days integer default 30)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_days integer;
  v_followers integer;
  v_videos jsonb;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not public.is_active_creator() and not public.raye2_is_platform_admin() then
    raise exception 'creator access required' using errcode='42501';
  end if;
  v_days := least(365, greatest(1, coalesce(p_days, 30)));

  select count(*) into v_followers from public.member_follows f where f.followed_id = v_uid;

  select coalesce(jsonb_agg(row_data order by row_data->>'published_at' desc nulls last), '[]'::jsonb)
  into v_videos
  from (
    select jsonb_build_object(
      'media_id', vc.media_id,
      'title', m.title,
      'slug', vc.slug,
      'category', vc.category,
      'published_at', vc.published_at,
      'expires_at', vc.expires_at,
      'unique_viewers', (
        select count(distinct vv.viewer_id) from public.video_views vv
        where vv.media_id = vc.media_id and vv.viewer_id is not null),
      'unique_viewers_window', (
        select count(distinct vv.viewer_id) from public.video_views vv
        where vv.media_id = vc.media_id and vv.viewer_id is not null
          and vv.viewed_at > now() - make_interval(days => v_days)),
      'reactions', (
        select count(*) from public.video_reactions vr where vr.media_id = vc.media_id),
      'comments', (
        select count(*) from public.video_comments vcc
        where vcc.media_id = vc.media_id and vcc.status = 'published'),
      'completed_viewers', (
        select count(*) from public.watch_progress wp
        where wp.media_id = vc.media_id and wp.duration_seconds > 0
          and wp.position_seconds >= least(wp.duration_seconds - 30, floor(wp.duration_seconds * 0.95)))
    ) as row_data
    from public.video_catalog vc
    join public.media_items m on m.id = vc.media_id
    where m.owner_id = v_uid
  ) rows;

  return jsonb_build_object(
    'role', public.raye2_creator_tier(v_uid),
    'window_days', v_days,
    'followers', v_followers,
    'watch_time_available', false,
    'watch_time_note', 'Watch time is not yet instrumented, so no watch-time figure is shown.',
    'max_video_expiry_days', public.raye2_creator_max_video_expiry_days(),
    'totals', jsonb_build_object(
      'videos', jsonb_array_length(v_videos),
      'unique_viewers', coalesce((select sum((v->>'unique_viewers')::int) from jsonb_array_elements(v_videos) v), 0),
      'reactions', coalesce((select sum((v->>'reactions')::int) from jsonb_array_elements(v_videos) v), 0),
      'comments', coalesce((select sum((v->>'comments')::int) from jsonb_array_elements(v_videos) v), 0),
      'completed_viewers', coalesce((select sum((v->>'completed_viewers')::int) from jsonb_array_elements(v_videos) v), 0)
    ),
    'videos', v_videos
  );
end;
$$;
revoke all on function public.raye2_get_creator_analytics(integer) from public,anon;
grant execute on function public.raye2_get_creator_analytics(integer) to authenticated;

-- 4. Unpublish long videos whose expiry has passed, then clear the stamp so it does not fire again.
create or replace function public.raye2_expire_long_videos()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer := 0;
begin
  with expired as (
    select vc.media_id from public.video_catalog vc
    where vc.expires_at is not null and vc.expires_at <= now()
    for update)
  update public.media_items m set is_published = false
  where m.id in (select media_id from expired) and m.is_published = true;
  get diagnostics v_count = row_count;
  update public.video_catalog set expires_at = null, updated_at = now()
  where expires_at is not null and expires_at <= now();
  return v_count;
end;
$$;
revoke all on function public.raye2_expire_long_videos() from public;
grant execute on function public.raye2_expire_long_videos() to anon,authenticated;

-- 5. Fold long-video expiry into the maintenance runner, preserving existing keys.
create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_minis integer := -1; v_moments integer := -1; v_clips integer := -1; v_memories integer := -1;
  v_direct integer := -1; v_group integer := -1; v_watch integer := -1; v_voice integer := -1; v_videos integer := -1;
begin
  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  begin v_clips := public.raye2_expire_community_clips(); exception when others then v_clips := -1; end;
  begin v_memories := public.raye2_expire_shared_memories(); exception when others then v_memories := -1; end;
  begin v_direct := public.raye2_sweep_message_retention('direct_messages'); exception when others then v_direct := -1; end;
  begin v_group := public.raye2_sweep_message_retention('group_messages'); exception when others then v_group := -1; end;
  begin v_watch := public.raye2_expire_watch_sessions(); exception when others then v_watch := -1; end;
  begin v_voice := public.raye2_expire_idle_voice_rooms(15); exception when others then v_voice := -1; end;
  begin v_videos := public.raye2_expire_long_videos(); exception when others then v_videos := -1; end;
  return jsonb_build_object('minis_expired', v_minis, 'moments_expired', v_moments,
    'clips_expired', v_clips, 'shared_memories_expired', v_memories,
    'direct_messages_expired', v_direct, 'group_messages_expired', v_group,
    'watch_sessions_expired', v_watch, 'voice_rooms_expired', v_voice,
    'videos_expired', v_videos, 'ran_at', now());
end;
$$;
revoke all on function public.raye2_run_maintenance() from public;
grant execute on function public.raye2_run_maintenance() to anon, authenticated;

notify pgrst, 'reload schema';

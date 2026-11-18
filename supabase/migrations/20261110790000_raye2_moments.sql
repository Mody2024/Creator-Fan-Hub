-- Raye2 Wave 3/4: Moments (shareable video highlights).
--
-- Plan 4.5 defines Moments: a shareable highlight of a creator's video that lives in the community feed for a
-- set lifetime (planned 7 days, admin-configurable), with a clip length cap (planned 180s, admin-configurable)
-- and creator-role monthly quotas. Only the retention category and quota columns existed; there was no way to
-- create a Moment and no expiry. This adds them on top of the community feed and the Mini's quota fix.

-- 1. Platform rules (admin-configurable within technical limits).
insert into public.raye2_platform_rules(rule_key, category, rule_value, status, description) values
  ('moments.lifetime_days', 'moments', '7'::jsonb, 'active', 'Moment lifetime in days before it is expired.'),
  ('moments.max_clip_seconds', 'moments', '180'::jsonb, 'active', 'Maximum Moment highlight length in seconds (technical ceiling 600).')
on conflict (rule_key) do nothing;

-- 2. A Moment is a community post with a linked video and a clip window; mark it explicitly and stamp its expiry.
alter table public.community_posts
  add column if not exists is_moment boolean not null default false,
  add column if not exists expires_at timestamptz;
create index if not exists community_posts_moment_idx on public.community_posts(is_moment, expires_at);

-- 3. Extend usage counting with Moments (the Mini's migration already fixed streams and Mini's).
create or replace function public.raye2_creator_usage(p_user_id uuid, p_metric text)
returns integer language sql stable security definer set search_path=''
as $$
  select case p_metric
    when 'long_videos_per_month' then
      (select count(*)::integer from public.media_items m
        where m.owner_id = p_user_id and m.media_type in ('video','youtube')
          and m.created_at > now() - interval '30 days')
    when 'streams_per_month' then
      (select count(*)::integer from public.raye2_live_streams s
        where s.streamer_id = p_user_id and s.started_at > now() - interval '30 days')
    when 'minis_per_month' then
      (select count(*)::integer from public.raye2_minis mn
        where mn.author_id = p_user_id and mn.created_at > now() - interval '30 days')
    when 'moments_per_month' then
      (select count(*)::integer from public.community_posts p
        where p.author_id = p_user_id and p.is_moment = true
          and p.created_at > now() - interval '30 days')
    else null
  end;
$$;
revoke all on function public.raye2_creator_usage(uuid,text) from public, anon;
grant execute on function public.raye2_creator_usage(uuid,text) to service_role;

-- 4. Publish a Moment: creator-role quota, clip-length cap, linked video required, lifetime from a rule.
create or replace function public.raye2_publish_moment(
  p_linked_video_id uuid,
  p_body text,
  p_start_seconds integer,
  p_end_seconds integer
)
returns table (id uuid, expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_max integer; v_days integer; v_id uuid; v_expires timestamptz;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_body,''))) < 1 or char_length(p_body) > 2000 then
    raise exception 'body must be 1-2000 characters' using errcode='22023';
  end if;
  if p_linked_video_id is null or not exists (
    select 1 from public.media_items m where m.id = p_linked_video_id and m.media_type in ('video','youtube')
  ) then
    raise exception 'a Moment must reference a video' using errcode='22023';
  end if;
  if p_start_seconds is null or p_end_seconds is null or p_start_seconds < 0 or p_end_seconds <= p_start_seconds then
    raise exception 'invalid Moment clip window' using errcode='22023';
  end if;
  v_max := least(600, greatest(1, public.raye2_rule_int('moments.max_clip_seconds', 180)));
  if p_end_seconds - p_start_seconds > v_max then
    raise exception 'Moment highlight must be % seconds or shorter', v_max using errcode='22023';
  end if;

  -- Creator-role monthly quota (also covers the 'none' tier, which is rejected with a clear reason).
  perform public.raye2_assert_creator_action('publish_moment');

  v_days := greatest(1, public.raye2_rule_int('moments.lifetime_days', 7));
  v_expires := now() + (v_days || ' days')::interval;

  insert into public.community_posts(author_id, body, linked_video_id, moment_start_seconds, moment_end_seconds, is_moment, status, expires_at)
  values (v_uid, btrim(p_body), p_linked_video_id, p_start_seconds, p_end_seconds, true, 'pending', v_expires)
  returning community_posts.id into v_id;

  return query select v_id, v_expires;
end;
$$;
revoke all on function public.raye2_publish_moment(uuid,text,integer,integer) from public, anon;
grant execute on function public.raye2_publish_moment(uuid,text,integer,integer) to authenticated;

-- 4. Expire due Moments (queue cleanup); a Moment is hidden from the feed once expired, never deleted here.
create or replace function public.raye2_expire_moments()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_expired integer := 0;
begin
  with due as (
    update public.community_posts
    set status='removed'
    where is_moment = true and status='published' and expires_at is not null and expires_at <= now()
    returning 1
  )
  select count(*) into v_expired from due;
  return v_expired;
end;
$$;
revoke all on function public.raye2_expire_moments() from public;
grant execute on function public.raye2_expire_moments() to anon, authenticated;

-- 5. Public Moments feed with author attribution; only live, published Moments.
create or replace function public.raye2_list_moments(p_limit integer default 40)
returns table (
  id uuid, body text, linked_video_id uuid, video_slug text, moment_start_seconds integer, moment_end_seconds integer, created_at timestamptz, expires_at timestamptz,
  author_handle text, author_display_name text, author_avatar_url text
)
language sql stable security definer set search_path=''
as $fn$
  with bounded as (select least(greatest(coalesce(p_limit, 40), 1), 100) as lim)
  select p.id, p.body, p.linked_video_id, vc.slug, p.moment_start_seconds, p.moment_end_seconds, p.created_at, p.expires_at,
         mp.handle, mp.display_name, mp.avatar_url
  from public.community_posts p
  cross join bounded b
  left join public.member_profiles mp on mp.user_id = p.author_id
  left join public.video_catalog vc on vc.media_id = p.linked_video_id
  where p.is_moment = true and p.status='published'
    and (p.expires_at is null or p.expires_at > now())
    and not public.is_member_blocked(p.author_id)
  order by p.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_moments(integer) from public;
grant execute on function public.raye2_list_moments(integer) to anon, authenticated;

notify pgrst, 'reload schema';

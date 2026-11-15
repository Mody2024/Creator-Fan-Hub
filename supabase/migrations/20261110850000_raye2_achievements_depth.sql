-- Raye2 Wave 5: achievements depth (plan 13.7).
--
-- The achievement framework had a five-row catalog, no eligibility criteria, no progress surface and no
-- anti-abuse rule. Plan 13.7 requires a meaningful achievement framework with defined eligibility, anti-abuse
-- checks and transparent criteria, and forbids fabricated achievements. This adds all four.
--
-- The new codes only earn once real qualifying activity exists; nothing is awarded on a timer or by admin fiat.
-- Point rewards are only defined for codes that already carry a reward rule, so the existing creator reward
-- bridge keeps working unchanged.

-- 1. Criteria columns. Existing rows keep working with null criteria.
alter table public.achievement_catalog
  add column if not exists metric text,
  add column if not exists threshold integer check (threshold is null or threshold > 0),
  add column if not exists requires_trust boolean not null default false;

-- 2. A richer, transparent catalog. Each row states exactly what earns it (metric + threshold).
insert into public.achievement_catalog(code,title,description,icon,position,metric,threshold,requires_trust) values
  ('ten_posts','Community Regular','Publish ten community posts','◉',6,'community_posts',10,true),
  ('twentyfive_follows','Community Builder','Follow twenty-five members','❖',7,'following',25,false),
  ('first_mini','First Mini','Publish your first Mini','▦',8,'minis',1,true),
  ('ten_minis','Mini Maker','Publish ten Mini''s','▩',9,'minis',10,true),
  ('first_clip','Clipper','Publish your first community clip','✂',10,'community_clips',1,true),
  ('five_clips','Scene Stealer','Publish five community clips','✄',11,'community_clips',5,true),
  ('poll_participant','Voice Heard','Vote in a community poll','◔',12,'poll_votes',1,false),
  ('group_joiner','Group Member','Join three community groups','⌗',13,'groups',3,false),
  ('five_video_comments','Screening Room','Publish five approved video comments','▶',14,'video_comments',5,true)
on conflict(code) do update set
  title=excluded.title, description=excluded.description, icon=excluded.icon, position=excluded.position,
  metric=excluded.metric, threshold=excluded.threshold, requires_trust=excluded.requires_trust;

-- 3. Metric measurement for the current member, from real tables only.
create or replace function public.raye2_achievement_metric(p_user_id uuid, p_metric text)
returns integer language sql stable security definer set search_path=''
as $$
  select case p_metric
    when 'community_posts' then
      (select count(*)::integer from public.community_posts p where p.author_id=p_user_id and p.status='published')
    when 'following' then
      (select count(*)::integer from public.member_follows f where f.follower_id=p_user_id)
    when 'minis' then
      (select count(*)::integer from public.raye2_minis mn where mn.author_id=p_user_id and mn.status='published')
    when 'community_clips' then
      (select count(*)::integer from public.raye2_community_clips c where c.clipper_id=p_user_id and c.status='published')
    when 'poll_votes' then
      (select count(*)::integer from public.community_post_poll_votes v where v.user_id=p_user_id)
    when 'groups' then
      (select count(*)::integer from public.raye2_group_members gm where gm.user_id=p_user_id and gm.status='active')
    when 'video_comments' then
      (select count(*)::integer from public.video_comments vc where vc.author_id=p_user_id and vc.status='published')
    else 0
  end;
$$;
revoke all on function public.raye2_achievement_metric(uuid,text) from public, anon;
grant execute on function public.raye2_achievement_metric(uuid,text) to authenticated;

-- 4. Anti-abuse gate. The existing triggers must only award a trust-gated achievement when the member is in
--    good standing: active profile, not blocked by anyone, no open reports against them.
create or replace function public.raye2_member_in_good_standing(p_user_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select
    exists (select 1 from public.member_profiles mp where mp.user_id=p_user_id)
    and not exists (select 1 from public.member_blocks b where b.blocked_id=p_user_id)
    and not exists (select 1 from public.content_reports r where r.target_type='profile' and r.target_id=p_user_id::text and r.status in ('open','reviewing'));
$$;
revoke all on function public.raye2_member_in_good_standing(uuid) from public, anon;
grant execute on function public.raye2_member_in_good_standing(uuid) to authenticated;

create or replace function public.award_member_achievement(p_user_id uuid, p_code text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_metric text; v_threshold integer; v_trust boolean; v_value integer;
begin
  select a.metric, a.threshold, a.requires_trust into v_metric, v_threshold, v_trust
    from public.achievement_catalog a where a.code=p_code;
  if v_metric is null or v_threshold is null then
    -- Legacy codes with no criteria keep their original unconditional award path.
    insert into public.member_achievements(user_id,achievement_code)
    select p_user_id, a.code from public.achievement_catalog a where a.code=p_code
    on conflict(user_id,achievement_code) do nothing;
    return;
  end if;
  -- Anti-abuse: never award a trust-gated achievement to a member who is not in good standing.
  if coalesce(v_trust,false) and not public.raye2_member_in_good_standing(p_user_id) then
    return;
  end if;
  -- Never fabricate: only award once the measured value actually meets the published threshold.
  v_value := public.raye2_achievement_metric(p_user_id, v_metric);
  if v_value < v_threshold then return; end if;
  insert into public.member_achievements(user_id,achievement_code)
  select p_user_id, a.code from public.achievement_catalog a where a.code=p_code
  on conflict(user_id,achievement_code) do nothing;
end;
$$;
revoke all on function public.award_member_achievement(uuid,text) from public, anon, authenticated;
grant execute on function public.award_member_achievement(uuid,text) to postgres;

-- 5. New achievement triggers for the added signals.
create or replace function public.award_mini_achievements()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.award_member_achievement(new.author_id,'first_mini');
  perform public.award_member_achievement(new.author_id,'ten_minis');
  return new;
end;
$$;
revoke all on function public.award_mini_achievements() from public, anon, authenticated;
drop trigger if exists raye2_mini_achievement on public.raye2_minis;
create trigger raye2_mini_achievement after insert on public.raye2_minis for each row execute function public.award_mini_achievements();

create or replace function public.award_clip_achievements()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.award_member_achievement(new.clipper_id,'first_clip');
  perform public.award_member_achievement(new.clipper_id,'five_clips');
  return new;
end;
$$;
revoke all on function public.award_clip_achievements() from public, anon, authenticated;
drop trigger if exists raye2_clip_achievement on public.raye2_community_clips;
create trigger raye2_clip_achievement after insert on public.raye2_community_clips for each row execute function public.award_clip_achievements();

create or replace function public.award_poll_vote_achievements()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.award_member_achievement(new.user_id,'poll_participant');
  return new;
end;
$$;
revoke all on function public.award_poll_vote_achievements() from public, anon, authenticated;
drop trigger if exists raye2_poll_vote_achievement on public.community_post_poll_votes;
create trigger raye2_poll_vote_achievement after insert on public.community_post_poll_votes for each row execute function public.award_poll_vote_achievements();

create or replace function public.award_group_achievements()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.award_member_achievement(new.user_id,'group_joiner');
  return new;
end;
$$;
revoke all on function public.award_group_achievements() from public, anon, authenticated;
drop trigger if exists raye2_group_achievement on public.raye2_group_members;
create trigger raye2_group_achievement after insert on public.raye2_group_members for each row execute function public.award_group_achievements();

-- Extend the existing post/follow/comment triggers with their new higher tiers.
create or replace function public.award_post_achievements()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status='published' and old.status is distinct from 'published' then
    perform public.award_member_achievement(new.author_id,'first_post');
    perform public.award_member_achievement(new.author_id,'five_posts');
    perform public.award_member_achievement(new.author_id,'ten_posts');
  end if;
  return new;
end;
$$;
revoke all on function public.award_post_achievements() from public, anon, authenticated;
grant execute on function public.award_post_achievements() to postgres;

create or replace function public.award_follow_achievements()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  perform public.award_member_achievement(new.follower_id,'first_follow');
  perform public.award_member_achievement(new.follower_id,'five_follows');
  perform public.award_member_achievement(new.follower_id,'twentyfive_follows');
  return new;
end;
$$;
revoke all on function public.award_follow_achievements() from public, anon, authenticated;
grant execute on function public.award_follow_achievements() to postgres;

create or replace function public.award_video_comment_achievement()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status='published' and old.status is distinct from 'published' then
    perform public.award_member_achievement(new.author_id,'first_video_comment');
    perform public.award_member_achievement(new.author_id,'five_video_comments');
  end if;
  return new;
end;
$$;
revoke all on function public.award_video_comment_achievement() from public, anon, authenticated;
grant execute on function public.award_video_comment_achievement() to postgres;

-- 6. Transparent progress surface: published criteria plus the viewer's measured progress toward each.
create or replace function public.raye2_member_achievement_progress(p_user_id uuid default null)
returns table (
  code text, title text, description text, icon text, sort_position integer,
  metric text, threshold integer, earned boolean, earned_at timestamptz, progress integer
)
language plpgsql stable security definer set search_path=''
as $$
declare v_target uuid := coalesce(p_user_id, (select auth.uid()));
begin
  if v_target is null then raise exception 'a member is required' using errcode='22023'; end if;
  if v_target <> (select auth.uid()) and not public.raye2_is_platform_admin() then
    raise exception 'only your own progress is available' using errcode='42501';
  end if;
  return query
    select a.code, a.title, a.description, a.icon, a.position,
           a.metric, a.threshold,
           (ma.user_id is not null) as earned, ma.earned_at,
           case when a.metric is null then null else public.raye2_achievement_metric(v_target, a.metric) end as progress
    from public.achievement_catalog a
    left join public.member_achievements ma on ma.achievement_code=a.code and ma.user_id=v_target
    order by a.position, a.code;
end;
$$;
revoke all on function public.raye2_member_achievement_progress(uuid) from public, anon;
grant execute on function public.raye2_member_achievement_progress(uuid) to authenticated;

notify pgrst, 'reload schema';

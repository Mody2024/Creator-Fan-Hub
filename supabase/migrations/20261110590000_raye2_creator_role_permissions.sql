-- Raye2 Wave 9: role-based publishing permissions and the role quota matrix.
--
-- Plan 13.4 requires distinct Creator-only, Streamer-only and combined Creator+Streamer permissions
-- with a fixed quota matrix, server-side enforcement of every permission and quota, and a Creator
-- Studio that shows only permitted actions and explains why others are unavailable.
--
-- Roles are assigned by Admin/Owner through the existing creator_admins table; this migration only
-- reads them. Quota values live in raye2_role_quotas so Admin can tune them. Caps whose content type
-- has no table yet (streams, Mini's, Moments) are still permission-gated, and their numeric caps are
-- returned for display; usage is null rather than invented until a source exists.

-- 0. Introduce the Streamer role alongside Creator. Admin/Owner assign these; users cannot
--    self-assign. owner/admin act as the combined (full) content role.
alter table public.creator_admins drop constraint if exists creator_admins_role_check;
alter table public.creator_admins add constraint creator_admins_role_check
  check (role in ('owner','admin','creator','streamer','editor','moderator','analyst'));

alter table public.creator_invites drop constraint if exists creator_invites_role_check;
alter table public.creator_invites add constraint creator_invites_role_check
  check (role in ('admin','creator','streamer','editor','moderator','analyst'));

create or replace function public.create_creator_invite(p_email text,p_role text,p_token text)
returns table(invite_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_exp timestamptz; v_email text;
begin
 if auth.uid() is null or not public.is_creator_owner() then
  raise exception 'owner access required' using errcode='42501';
 end if;
 v_email=lower(btrim(p_email));
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 then
  raise exception 'valid email required' using errcode='22023';
 end if;
 if p_role not in ('admin','creator','streamer','editor','moderator','analyst') then
  raise exception 'unsupported invite role' using errcode='22023';
 end if;
 if p_token is null or length(p_token)<32 or length(p_token)>256 or p_token !~ '^[A-Za-z0-9_-]+$' then
  raise exception 'invalid invite token' using errcode='22023';
 end if;
 perform pg_advisory_xact_lock(hashtextextended(v_email,0));
 if (select count(*) from public.creator_invites i
     where i.created_by=auth.uid() and i.created_at>now()-interval '24 hours')>=20 then
  raise exception 'daily invitation limit reached' using errcode='54000';
 end if;
 if exists(select 1 from public.creator_invites i
           where i.email=v_email and i.accepted_at is null and i.expires_at>now()) then
  raise exception 'an active invitation already exists for this email' using errcode='23505';
 end if;
 if exists(select 1 from public.creator_admins a join auth.users u on u.id=a.user_id
           where lower(u.email)=v_email and a.active=true) then
  raise exception 'this email already has active creator access' using errcode='23505';
 end if;
 insert into public.creator_invites(email,role,token_hash,created_by)
 values(v_email,p_role,encode(extensions.digest(p_token,'sha256'),'hex'),auth.uid())
 returning id,creator_invites.expires_at into v_id,v_exp;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),'invite_created','creator_invite',v_id::text,
        jsonb_build_object('email',v_email,'role',p_role));
 return query select v_id,v_exp;
end;
$$;
revoke all on function public.create_creator_invite(text,text,text) from public,anon;
grant execute on function public.create_creator_invite(text,text,text) to authenticated;

create or replace function public.set_creator_admin_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_old text;
begin
 if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
 if p_role not in ('admin','creator','streamer','editor','moderator','analyst') then raise exception 'owner role cannot be assigned through this action' using errcode='22023'; end if;
 select role into v_old from public.creator_admins where user_id=p_user_id for update;
 if v_old is null or v_old='owner' then raise exception 'owner accounts cannot be changed here' using errcode='42501'; end if;
 update public.creator_admins set role=p_role where user_id=p_user_id;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),'role_changed','creator_admin',p_user_id::text,jsonb_build_object('from',v_old,'to',p_role));
end;
$$;
revoke all on function public.set_creator_admin_role(uuid,text) from public,anon;
grant execute on function public.set_creator_admin_role(uuid,text) to authenticated;

-- 1. Content role -> tier. owner/admin act as the combined (full) content role.
create or replace function public.raye2_creator_tier(p_user_id uuid)
returns text language sql stable security definer set search_path=''
as $$
  select case (select a.role from public.creator_admins a where a.user_id=p_user_id and a.active=true)
    when 'owner' then 'combined'
    when 'admin' then 'combined'
    when 'creator' then 'creator'
    when 'streamer' then 'streamer'
    else 'none'
  end;
$$;
revoke all on function public.raye2_creator_tier(uuid) from public,anon;
grant execute on function public.raye2_creator_tier(uuid) to service_role;

-- 2. Tunable role quota matrix. Metrics are the rows of the plan's table.
create table if not exists public.raye2_role_quotas (
  tier text not null check (tier in ('creator','streamer','combined')),
  metric text not null check (metric in ('long_videos_per_month','long_video_cooldown_days','streams_per_month','streams_per_week','minis_per_month','moments_per_month')),
  limit_value integer not null check (limit_value >= 0),
  description text not null default '' check (char_length(description) <= 200),
  updated_at timestamptz not null default now(),
  primary key (tier, metric)
);
alter table public.raye2_role_quotas enable row level security;
revoke all on public.raye2_role_quotas from anon,authenticated;

insert into public.raye2_role_quotas(tier,metric,limit_value,description) values
 ('creator','long_videos_per_month',5,'Creator-only: long videos per calendar month.'),
 ('creator','long_video_cooldown_days',4,'Creator-only: minimum days between long-video publishes.'),
 ('creator','streams_per_month',0,'Creator-only: streams per month (0 means not permitted).'),
 ('creator','minis_per_month',30,'Creator-only: Mini''s per month.'),
 ('creator','moments_per_month',30,'Creator-only: Moments per month.'),
 ('streamer','long_videos_per_month',0,'Streamer-only: long videos per month (0 means not permitted).'),
 ('streamer','streams_per_month',5,'Streamer-only: streams per month.'),
 ('streamer','streams_per_week',2,'Streamer-only: streams per week.'),
 ('streamer','minis_per_month',30,'Streamer-only: Mini''s per month.'),
 ('streamer','moments_per_month',30,'Streamer-only: Moments per month.'),
 ('combined','long_videos_per_month',3,'Creator+Streamer: long videos per month (combined, never additive).'),
 ('combined','long_video_cooldown_days',7,'Creator+Streamer: one long video per week.'),
 ('combined','streams_per_month',3,'Creator+Streamer: streams per month (combined, never additive).'),
 ('combined','streams_per_week',1,'Creator+Streamer: streams per week.'),
 ('combined','minis_per_month',20,'Creator+Streamer: Mini''s per month.'),
 ('combined','moments_per_month',30,'Creator+Streamer: Moments per month.')
on conflict (tier,metric) do nothing;

create or replace function public.raye2_role_quota(p_tier text, p_metric text)
returns integer language sql stable security definer set search_path=''
as $$ select (select q.limit_value from public.raye2_role_quotas q where q.tier=p_tier and q.metric=p_metric); $$;
revoke all on function public.raye2_role_quota(text,text) from public,anon;
grant execute on function public.raye2_role_quota(text,text) to service_role;

-- 3. Action permissions per tier. Combined receives only the combined matrix, never additive rights.
create or replace function public.raye2_tier_allows(p_tier text, p_action text)
returns boolean language sql immutable set search_path=''
as $$
  select case p_action
    when 'publish_long_video' then p_tier in ('creator','combined')
    when 'start_stream' then p_tier in ('streamer','combined')
    when 'publish_mini' then p_tier in ('creator','streamer','combined')
    when 'publish_moment' then p_tier in ('creator','streamer','combined')
    when 'studio_upload' then p_tier in ('creator','combined')
    else false
  end;
$$;
revoke all on function public.raye2_tier_allows(text,text) from public,anon;
grant execute on function public.raye2_tier_allows(text,text) to service_role;

-- 4. Usage for a tier metric from real sources; null when no source exists (never invented).
create or replace function public.raye2_creator_usage(p_user_id uuid, p_metric text)
returns integer language sql stable security definer set search_path=''
as $$
  select case p_metric
    when 'long_videos_per_month' then
      (select count(*)::integer from public.media_items m
        where m.owner_id = p_user_id and m.media_type in ('video','youtube')
          and m.created_at > now() - interval '30 days')
    else null
  end;
$$;
revoke all on function public.raye2_creator_usage(uuid,text) from public,anon;
grant execute on function public.raye2_creator_usage(uuid,text) to service_role;

-- 5. Server-side enforcement. Raises with a reason the Studio can show.
create or replace function public.raye2_assert_creator_action(p_action text)
returns void language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid(); v_tier text; v_limit integer; v_used integer; v_last timestamptz; v_cooldown integer;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_action not in ('publish_long_video','start_stream','publish_mini','publish_moment','studio_upload') then
    raise exception 'unknown creator action' using errcode='22023';
  end if;
  v_tier := public.raye2_creator_tier(v_uid);
  if v_tier = 'none' then
    raise exception 'creator or streamer role required for %', p_action using errcode='42501';
  end if;
  if not public.raye2_tier_allows(v_tier, p_action) then
    raise exception 'your % role does not permit %', v_tier, p_action using errcode='42501';
  end if;

  if p_action = 'publish_long_video' then
    v_limit := public.raye2_role_quota(v_tier, 'long_videos_per_month');
    v_used := public.raye2_creator_usage(v_uid, 'long_videos_per_month');
    if v_used is not null and v_used >= v_limit then
      raise exception 'monthly long-video quota reached (% of %)', v_used, v_limit using errcode='53100';
    end if;
    v_cooldown := coalesce(public.raye2_role_quota(v_tier, 'long_video_cooldown_days'), 0);
    select max(m.created_at) into v_last from public.media_items m
      where m.owner_id = v_uid and m.media_type in ('video','youtube');
    if v_last is not null and v_cooldown > 0 and v_last > now() - (v_cooldown || ' days')::interval then
      raise exception 'long-video cooldown active: wait % days between publishes', v_cooldown using errcode='53100';
    end if;
  elsif p_action = 'start_stream' then
    v_limit := public.raye2_role_quota(v_tier, 'streams_per_month');
    v_used := public.raye2_creator_usage(v_uid, 'streams_per_month');
    if v_used is not null and v_used >= v_limit then
      raise exception 'monthly stream quota reached (% of %)', v_used, v_limit using errcode='53100';
    end if;
  elsif p_action = 'publish_mini' then
    v_limit := public.raye2_role_quota(v_tier, 'minis_per_month');
    v_used := public.raye2_creator_usage(v_uid, 'minis_per_month');
    if v_used is not null and v_used >= v_limit then
      raise exception 'monthly Mini''s quota reached (% of %)', v_used, v_limit using errcode='53100';
    end if;
  elsif p_action = 'publish_moment' then
    v_limit := public.raye2_role_quota(v_tier, 'moments_per_month');
    v_used := public.raye2_creator_usage(v_uid, 'moments_per_month');
    if v_used is not null and v_used >= v_limit then
      raise exception 'monthly Moments quota reached (% of %)', v_used, v_limit using errcode='53100';
    end if;
  end if;
end;
$$;
revoke all on function public.raye2_assert_creator_action(text) from public,anon;
grant execute on function public.raye2_assert_creator_action(text) to authenticated;

-- 6. Capabilities for the Creator Studio: permitted actions with reasons, quotas and usage.
create or replace function public.raye2_get_creator_capabilities(p_user_id uuid default null)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_uid uuid := coalesce(p_user_id, auth.uid()); v_tier text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_user_id is not null and p_user_id <> auth.uid() and not public.raye2_is_platform_admin() then
    raise exception 'platform admin access required' using errcode='42501';
  end if;
  v_tier := public.raye2_creator_tier(v_uid);
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
      'long_video_cooldown_days', public.raye2_role_quota(v_tier,'long_video_cooldown_days'),
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
    )
  );
end;
$$;
revoke all on function public.raye2_get_creator_capabilities(uuid) from public,anon;
grant execute on function public.raye2_get_creator_capabilities(uuid) to authenticated;

-- 7. Admin permission matrix across tiers.
create or replace function public.raye2_get_creator_permission_matrix()
returns table (tier text, action text, allowed boolean)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  return query
    select t.tier, a.action, public.raye2_tier_allows(t.tier, a.action)
    from unnest(array['creator','streamer','combined']) t(tier)
    cross join unnest(array['publish_long_video','start_stream','publish_mini','publish_moment','studio_upload']) a(action)
    order by t.tier, a.action;
end;
$$;
revoke all on function public.raye2_get_creator_permission_matrix() from public,anon;
grant execute on function public.raye2_get_creator_permission_matrix() to authenticated;

-- 8. Admin tuning of the quota matrix.
create or replace function public.raye2_set_role_quota(p_tier text, p_metric text, p_limit integer)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  if p_limit is null or p_limit < 0 then raise exception 'limit must be zero or greater' using errcode='22023'; end if;
  update public.raye2_role_quotas set limit_value = p_limit, updated_at = now() where tier = p_tier and metric = p_metric;
  if not found then raise exception 'unknown tier or metric' using errcode='22023'; end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'role_quota_set','role_quota',p_tier||'.'||p_metric,p_limit::text,jsonb_build_object('tier',p_tier,'metric',p_metric,'limit',p_limit));
end;
$$;
revoke all on function public.raye2_set_role_quota(text,text,integer) from public,anon;
grant execute on function public.raye2_set_role_quota(text,text,integer) to authenticated;

notify pgrst, 'reload schema';

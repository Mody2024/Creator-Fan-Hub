-- Raye2 Wave 8: platform admin dashboards and role management.
--
-- Plan 10.1-10.2 require an admin dashboard for health metrics and a role-management surface.
-- The rules engine, retention policies, cleanup previews and storage snapshots already exist, but
-- there is no aggregate health view and no platform-admin roster the dashboard can render.

-- 1. Storage thresholds live in the rules engine; seed safe defaults so the health view can classify.
insert into public.raye2_platform_rules(rule_key,category,rule_value,status,description) values
 ('storage.warning.bytes','storage','53687091200'::jsonb,'active','Storage total at or above this many bytes is reported as a warning (default 50 GiB).'),
 ('storage.critical.bytes','storage','107374182400'::jsonb,'active','Storage total at or above this many bytes is reported as critical (default 100 GiB).')
on conflict (rule_key) do nothing;

-- 2. Platform health metrics for the admin dashboard. Platform admins only.
create or replace function public.raye2_get_platform_health()
returns table (metric text, value bigint, state text)
language plpgsql stable security definer set search_path = ''
as $fn$
declare v_warning bigint := 53687091200; v_critical bigint := 107374182400; v_total bigint;
begin
  if not public.raye2_is_platform_admin() then
    raise exception 'platform admin access required' using errcode = '42501';
  end if;
  select coalesce((select (r.rule_value)::text::bigint from public.raye2_platform_rules r where r.rule_key = 'storage.warning.bytes' and r.status = 'active'), v_warning) into v_warning;
  select coalesce((select (r.rule_value)::text::bigint from public.raye2_platform_rules r where r.rule_key = 'storage.critical.bytes' and r.status = 'active'), v_critical) into v_critical;
  select coalesce(sum(s.bytes_used), 0) into v_total from public.raye2_storage_usage s;
  return query
    select 'members'::text, (select count(*) from public.member_profiles)::bigint, 'ok'::text
    union all select 'groups', (select count(*) from public.raye2_groups)::bigint, 'ok'
    union all select 'conversations', (select count(*) from public.raye2_conversations)::bigint, 'ok'
    union all select 'messages', (select count(*) from public.raye2_messages)::bigint, 'ok'
    union all select 'media_published', (select count(*) from public.media_items where is_published)::bigint, 'ok'
    union all select 'videos_published', (select count(*) from public.video_catalog where published_at is not null)::bigint, 'ok'
    union all select 'ideas_pending', (select count(*) from public.ideas where status = 'pending')::bigint, 'ok'
    union all select 'community_posts_pending', (select count(*) from public.community_posts where status = 'pending')::bigint, 'ok'
    union all select 'reports_open', (select count(*) from public.content_reports where status in ('open','reviewing'))::bigint, 'ok'
    union all select 'safety_reports_open', (select count(*) from public.raye2_safety_reports where status = 'open')::bigint, 'ok'
    union all select 'cleanup_pending', (select count(*) from public.raye2_cleanup_jobs where status in ('preview','queued','running'))::bigint, 'ok'
    union all select 'storage_bytes', v_total, case when v_total >= v_critical then 'critical' when v_total >= v_warning then 'warning' else 'ok' end
    union all select 'storage_warning_bytes', v_warning, 'ok'
    union all select 'storage_critical_bytes', v_critical, 'ok';
end;
$fn$;
revoke all on function public.raye2_get_platform_health() from public, anon;
grant execute on function public.raye2_get_platform_health() to authenticated;

-- 3. Platform admin roster for the role-management surface. Platform admins only.
create or replace function public.raye2_list_platform_admins()
returns table (user_id uuid, handle text, display_name text, role text, active boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not public.raye2_is_platform_admin() then
    raise exception 'platform admin access required' using errcode = '42501';
  end if;
  return query
    select a.user_id, mp.handle, mp.display_name, a.role, a.active, a.created_at
    from public.creator_admins a
    left join public.member_profiles mp on mp.user_id = a.user_id
    order by a.active desc, a.role asc, a.created_at asc;
end;
$fn$;
revoke all on function public.raye2_list_platform_admins() from public, anon;
grant execute on function public.raye2_list_platform_admins() to authenticated;

notify pgrst, 'reload schema';

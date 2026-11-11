-- Raye2 Wave 8: safety-report review queue and audit-log filtering.
--
-- Plan 10.3-10.4 require a moderation review surface and a usable audit trail. Members can already
-- submit safety reports (message/group/user) but there is no queue to review them, no resolution
-- path and no audit entry when a report is handled. The admin audit view also reads the raw table
-- without any filtering.

-- 1. Safety review queue. Moderators and platform admins only.
create or replace function public.raye2_get_safety_report_queue(
  p_limit integer default 40,
  p_status text default 'open'
)
returns table (
  report_id uuid,
  target_type text,
  target_id uuid,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reporter_handle text,
  target_preview text
)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode = '42501';
  end if;
  if p_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit, 40), 1), 100) as lim)
    select r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at,
           mp.handle,
           case r.target_type
             when 'message' then left(coalesce((select m.body from public.raye2_messages m where m.id = r.target_id), ''), 160)
             when 'group' then coalesce((select g.name from public.raye2_groups g where g.id = r.target_id), '')
             when 'user' then coalesce((select p.display_name from public.member_profiles p where p.user_id = r.target_id), '')
             else ''
           end
    from public.raye2_safety_reports r
    cross join bounded b
    left join public.member_profiles mp on mp.user_id = r.reporter_id
    where r.status = p_status
    order by r.created_at asc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_get_safety_report_queue(integer,text) from public, anon;
grant execute on function public.raye2_get_safety_report_queue(integer,text) to authenticated;

-- 2. Resolve, dismiss or reopen a safety report, with an audit entry.
create or replace function public.raye2_resolve_safety_report(
  p_report_id uuid,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_target_type text; v_target_id uuid; v_note text := btrim(coalesce(p_note, ''));
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode = '42501';
  end if;
  if p_status not in ('reviewing','resolved','dismissed','open') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  if char_length(v_note) > 500 then raise exception 'note too long' using errcode = '22023'; end if;
  select target_type, target_id into v_target_type, v_target_id from public.raye2_safety_reports where id = p_report_id;
  if v_target_type is null then raise exception 'report not found' using errcode = 'P0002'; end if;
  update public.raye2_safety_reports set status = p_status where id = p_report_id;
  insert into public.raye2_admin_audit_log(actor_id, action, target_type, target_id, reason, details)
  values ((select auth.uid()), 'safety_report_' || p_status, 'safety_report', p_report_id::text, v_note,
    jsonb_build_object('target_type', v_target_type, 'target_id', v_target_id));
end;
$fn$;
revoke all on function public.raye2_resolve_safety_report(uuid,text,text) from public, anon;
grant execute on function public.raye2_resolve_safety_report(uuid,text,text) to authenticated;

-- 3. Filterable audit-log read for the admin dashboard. Platform admins only.
create or replace function public.raye2_get_admin_audit_log(
  p_limit integer default 50,
  p_action text default null,
  p_actor uuid default null
)
returns table (
  id bigint,
  actor_id uuid,
  action text,
  target_type text,
  target_id text,
  reason text,
  details jsonb,
  created_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not public.raye2_is_platform_admin() then
    raise exception 'platform admin access required' using errcode = '42501';
  end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit, 50), 1), 200) as lim)
    select a.id, a.actor_id, a.action, a.target_type, a.target_id, a.reason, a.details, a.created_at
    from public.raye2_admin_audit_log a
    cross join bounded b
    where (p_action is null or a.action = p_action)
      and (p_actor is null or a.actor_id = p_actor)
    order by a.created_at desc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_get_admin_audit_log(integer,text,uuid) from public, anon;
grant execute on function public.raye2_get_admin_audit_log(integer,text,uuid) to authenticated;

notify pgrst, 'reload schema';

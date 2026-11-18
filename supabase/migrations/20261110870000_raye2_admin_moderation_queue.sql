-- Raye2 Wave 8: unified moderation queue for the platform control centre (plan 13.10).
--
-- Plan 13.10 requires admin/owner moderation of reported content with appropriate permissions and audit
-- records, and dashboards that surface the real moderation queue. Community reports already had a moderator
-- queue and safety reports had their own queue, but the admin control centre only showed counts and there was
-- no single surface that an owner/admin could review both kinds and act on them.
--
-- This adds one owner/admin-scoped read across both report tables and one resolver that delegates to the
-- existing, already-audited resolve RPCs, so resolution semantics stay identical and every action is logged.

create or replace function public.raye2_get_moderation_queue(p_limit integer default 50, p_status text default 'open')
returns table (
  kind text,
  report_id uuid,
  target_type text,
  target_id text,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reporter_handle text,
  target_preview text,
  resolution_note text,
  resolved_at timestamptz
)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not (public.raye2_is_platform_admin() or private.can_moderate_community()) then
    raise exception 'moderator or platform admin access required' using errcode = '42501';
  end if;
  if p_status not in ('open','reviewing','resolved','dismissed') then
    raise exception 'invalid status' using errcode = '22023';
  end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit, 50), 1), 200) as lim)
    select q.* from (
      select 'content'::text as kind,
             r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at,
             mp.handle,
             case r.target_type
               when 'post' then left(coalesce((select p.body from public.community_posts p where p.id::text = r.target_id), ''), 160)
               when 'comment' then left(coalesce((select cc.body from public.community_comments cc where cc.id::text = r.target_id), ''), 160)
               when 'community_clip' then coalesce((select c.title from public.raye2_community_clips c where c.id::text = r.target_id), '')
               when 'event_question' then left(coalesce((select q.body from public.event_qa q where q.id::text = r.target_id), ''), 160)
               when 'profile' then coalesce((select pr.display_name from public.member_profiles pr where pr.user_id::text = r.target_id), '')
               else '' end as target_preview,
             r.resolution_note, r.resolved_at
      from public.content_reports r
      left join public.member_profiles mp on mp.user_id = r.reporter_id
      where r.status = p_status
      union all
      select 'safety'::text as kind,
             r.id, r.target_type, r.target_id::text, r.reason, r.details, r.status, r.created_at,
             mp.handle,
             case r.target_type
               when 'message' then left(coalesce((select m.body from public.raye2_messages m where m.id = r.target_id), ''), 160)
               when 'group' then coalesce((select g.name from public.raye2_groups g where g.id = r.target_id), '')
               when 'user' then coalesce((select p.display_name from public.member_profiles p where p.user_id = r.target_id), '')
               else '' end as target_preview,
             ''::text as resolution_note, null::timestamptz as resolved_at
      from public.raye2_safety_reports r
      left join public.member_profiles mp on mp.user_id = r.reporter_id
      where r.status = p_status
    ) q
    order by q.created_at asc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_get_moderation_queue(integer,text) from public, anon;
grant execute on function public.raye2_get_moderation_queue(integer,text) to authenticated;

-- One resolver that routes to the already-audited per-kind RPCs.
create or replace function public.raye2_admin_resolve_report(
  p_kind text,
  p_report_id uuid,
  p_status text,
  p_note text default ''
)
returns table (resolved boolean, result_code text)
language plpgsql security definer set search_path = ''
as $fn$
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not (public.raye2_is_platform_admin() or private.can_moderate_community()) then
    raise exception 'moderator or platform admin access required' using errcode = '42501';
  end if;
  if p_kind = 'content' then
    if p_status not in ('reviewing','resolved','dismissed') then
      raise exception 'invalid status for a content report' using errcode = '22023';
    end if;
    perform public.raye2_resolve_content_report(p_report_id, p_status, coalesce(p_note, ''));
    return query select true, 'content_report_' || p_status;
  elsif p_kind = 'safety' then
    if p_status not in ('reviewing','resolved','dismissed','open') then
      raise exception 'invalid status for a safety report' using errcode = '22023';
    end if;
    perform public.raye2_resolve_safety_report(p_report_id, p_status, coalesce(p_note, ''));
    return query select true, 'safety_report_' || p_status;
  else
    raise exception 'unknown report kind' using errcode = '22023';
  end if;
end;
$fn$;
revoke all on function public.raye2_admin_resolve_report(text,uuid,text,text) from public, anon;
grant execute on function public.raye2_admin_resolve_report(text,uuid,text,text) to authenticated;

notify pgrst, 'reload schema';

-- Raye2 Wave 5/8: community moderation toolkit.
--
-- Plan lines 653 and 668-676 require authorised moderators to edit/remove community posts and
-- comments, handle reports and apply restrictions with an audit history. Today a moderator can only
-- pin a post and review reports by reading content_reports directly; there is no server-guarded
-- removal, no restore path, no report resolution and no audit trail for community content.

-- 1. Report resolution metadata.
alter table public.content_reports add column if not exists resolved_at timestamptz;
alter table public.content_reports add column if not exists resolved_by uuid references auth.users(id) on delete set null;
alter table public.content_reports add column if not exists resolution_note text not null default '';
create index if not exists content_reports_target_idx on public.content_reports(target_type, target_id);

-- 2. Moderation metadata on community content.
alter table public.community_posts add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.community_posts add column if not exists moderated_at timestamptz;
alter table public.community_posts add column if not exists moderation_reason text not null default '';
alter table public.community_comments add column if not exists moderated_by uuid references auth.users(id) on delete set null;
alter table public.community_comments add column if not exists moderated_at timestamptz;
alter table public.community_comments add column if not exists moderation_reason text not null default '';

-- 3. Submit a report. Validates the target and reason so the client cannot write arbitrary rows.
create or replace function public.raye2_report_community_content(
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_details text default ''
)
returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare v_id uuid; v_reason text := btrim(coalesce(p_reason, '')); v_details text := btrim(coalesce(p_details, ''));
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_target_type not in ('post','comment','profile') then raise exception 'invalid target type' using errcode = '22023'; end if;
  if v_reason not in ('spam','harassment','hate','impersonation','copyright','other') then raise exception 'invalid reason' using errcode = '22023'; end if;
  if char_length(v_details) > 500 then raise exception 'details too long' using errcode = '22023'; end if;
  if p_target_type = 'post' and not exists (select 1 from public.community_posts p where p.id::text = p_target_id) then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  if p_target_type = 'comment' and not exists (select 1 from public.community_comments c where c.id::text = p_target_id) then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  insert into public.content_reports(reporter_id, target_type, target_id, reason, details)
  values ((select auth.uid()), p_target_type, p_target_id, v_reason, v_details)
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function public.raye2_report_community_content(text,text,text,text) from public, anon;
grant execute on function public.raye2_report_community_content(text,text,text,text) to authenticated;

-- 4. Remove, reject or restore a community post. Moderator only, with audit and report resolution.
create or replace function public.raye2_moderate_community_post(
  p_post_id uuid,
  p_action text,
  p_reason text default ''
)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_author uuid; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not private.can_moderate_community() then raise exception 'moderator access required' using errcode = '42501'; end if;
  if p_action not in ('remove','reject','restore') then raise exception 'invalid action' using errcode = '22023'; end if;
  select author_id into v_author from public.community_posts where id = p_post_id;
  if v_author is null then raise exception 'post not found' using errcode = 'P0002'; end if;
  update public.community_posts
     set status = case p_action when 'remove' then 'removed' when 'reject' then 'rejected' else 'published' end,
         moderated_by = (select auth.uid()),
         moderated_at = now(),
         moderation_reason = case when p_action = 'restore' then '' else v_reason end
   where id = p_post_id;
  insert into public.raye2_admin_audit_log(actor_id, action, target_type, target_id, reason, details)
  values ((select auth.uid()), 'community_post_' || p_action, 'community_post', p_post_id::text, v_reason, jsonb_build_object('author_id', v_author));
  if p_action <> 'restore' then
    update public.content_reports
       set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid()), resolution_note = v_reason
     where target_type = 'post' and target_id = p_post_id::text and status in ('open','reviewing');
  end if;
end;
$fn$;
revoke all on function public.raye2_moderate_community_post(uuid,text,text) from public, anon;
grant execute on function public.raye2_moderate_community_post(uuid,text,text) to authenticated;

-- 5. Remove, reject or restore a community comment. Moderator only, with audit and report resolution.
create or replace function public.raye2_moderate_community_comment(
  p_comment_id uuid,
  p_action text,
  p_reason text default ''
)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_author uuid; v_reason text := btrim(coalesce(p_reason, ''));
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not private.can_moderate_community() then raise exception 'moderator access required' using errcode = '42501'; end if;
  if p_action not in ('remove','reject','restore') then raise exception 'invalid action' using errcode = '22023'; end if;
  select author_id into v_author from public.community_comments where id = p_comment_id;
  if v_author is null then raise exception 'comment not found' using errcode = 'P0002'; end if;
  update public.community_comments
     set status = case p_action when 'remove' then 'removed' when 'reject' then 'rejected' else 'published' end,
         moderated_by = (select auth.uid()),
         moderated_at = now(),
         moderation_reason = case when p_action = 'restore' then '' else v_reason end
   where id = p_comment_id;
  insert into public.raye2_admin_audit_log(actor_id, action, target_type, target_id, reason, details)
  values ((select auth.uid()), 'community_comment_' || p_action, 'community_comment', p_comment_id::text, v_reason, jsonb_build_object('author_id', v_author));
  if p_action <> 'restore' then
    update public.content_reports
       set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid()), resolution_note = v_reason
     where target_type = 'comment' and target_id = p_comment_id::text and status in ('open','reviewing');
  end if;
end;
$fn$;
revoke all on function public.raye2_moderate_community_comment(uuid,text,text) from public, anon;
grant execute on function public.raye2_moderate_community_comment(uuid,text,text) to authenticated;

-- 6. The moderation queue: open and in-review reports with a target preview. Moderator only.
create or replace function public.raye2_get_community_moderation_queue(p_limit integer default 40)
returns table (
  report_id uuid,
  target_type text,
  target_id text,
  reason text,
  details text,
  status text,
  created_at timestamptz,
  reporter_handle text,
  target_status text,
  target_preview text
)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not private.can_moderate_community() then
    raise exception 'moderator access required' using errcode = '42501';
  end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit, 40), 1), 100) as lim)
    select r.id, r.target_type, r.target_id, r.reason, r.details, r.status, r.created_at,
           mp.handle,
           coalesce(p.status, cc.status),
           left(coalesce(p.body, cc.body, ''), 160)
    from public.content_reports r
    cross join bounded b
    left join public.community_posts p on r.target_type = 'post' and p.id::text = r.target_id
    left join public.community_comments cc on r.target_type = 'comment' and cc.id::text = r.target_id
    left join public.member_profiles mp on mp.user_id = r.reporter_id
    where r.status in ('open','reviewing')
    order by r.created_at asc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_get_community_moderation_queue(integer) from public, anon;
grant execute on function public.raye2_get_community_moderation_queue(integer) to authenticated;

-- 7. Resolve or dismiss a report. Moderator only, with audit.
create or replace function public.raye2_resolve_content_report(
  p_report_id uuid,
  p_status text,
  p_note text default ''
)
returns void
language plpgsql security definer set search_path = ''
as $fn$
declare v_note text := btrim(coalesce(p_note, ''));
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not private.can_moderate_community() then raise exception 'moderator access required' using errcode = '42501'; end if;
  if p_status not in ('reviewing','resolved','dismissed') then raise exception 'invalid status' using errcode = '22023'; end if;
  if not exists (select 1 from public.content_reports where id = p_report_id) then
    raise exception 'report not found' using errcode = 'P0002';
  end if;
  update public.content_reports
     set status = p_status,
         resolved_at = case when p_status in ('resolved','dismissed') then now() else resolved_at end,
         resolved_by = case when p_status in ('resolved','dismissed') then (select auth.uid()) else resolved_by end,
         resolution_note = v_note
   where id = p_report_id;
  insert into public.raye2_admin_audit_log(actor_id, action, target_type, target_id, reason, details)
  values ((select auth.uid()), 'content_report_' || p_status, 'content_report', p_report_id::text, v_note, '{}'::jsonb);
end;
$fn$;
revoke all on function public.raye2_resolve_content_report(uuid,text,text) from public, anon;
grant execute on function public.raye2_resolve_content_report(uuid,text,text) to authenticated;

-- 8. Removed and rejected posts, so a moderator can restore them. Moderator only.
create or replace function public.raye2_get_moderated_community_posts(p_limit integer default 40)
returns table (
  id uuid,
  author_id uuid,
  body text,
  status text,
  moderation_reason text,
  moderated_at timestamptz,
  author_handle text,
  author_display_name text,
  moderator_handle text
)
language plpgsql stable security definer set search_path = ''
as $fn$
begin
  if not private.can_moderate_community() then
    raise exception 'moderator access required' using errcode = '42501';
  end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit, 40), 1), 100) as lim)
    select p.id, p.author_id, p.body, p.status, p.moderation_reason, p.moderated_at,
           mp.handle, mp.display_name, mm.handle
    from public.community_posts p
    cross join bounded b
    left join public.member_profiles mp on mp.user_id = p.author_id
    left join public.member_profiles mm on mm.user_id = p.moderated_by
    where p.status in ('removed','rejected')
    order by p.moderated_at desc nulls last, p.created_at desc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_get_moderated_community_posts(integer) from public, anon;
grant execute on function public.raye2_get_moderated_community_posts(integer) to authenticated;

notify pgrst, 'reload schema';

-- Raye2 Wave 4: Mini's reporting and takedown coverage.
--
-- Plan 4.4 requires Mini's to support "reporting" and plan 13.5/13.11 require reported content to be
-- removable and every action auditable. Community clips already had report + takedown, but Mini's could not
-- be reported (the report RPC rejected the target) and the takedown workflow only covered community posts,
-- comments and media items. This closes both gaps and wires Mini's into the admin moderation queue.

-- 1. Allow reporting Mini's.
alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('post','comment','profile','community_clip','mini'));

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
  if p_target_type not in ('post','comment','profile','community_clip','mini') then raise exception 'invalid target type' using errcode = '22023'; end if;
  if v_reason not in ('spam','harassment','hate','impersonation','copyright','other') then raise exception 'invalid reason' using errcode = '22023'; end if;
  if char_length(v_details) > 500 then raise exception 'details too long' using errcode = '22023'; end if;
  if p_target_type = 'post' and not exists (select 1 from public.community_posts p where p.id::text = p_target_id) then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  if p_target_type = 'comment' and not exists (select 1 from public.community_comments c where c.id::text = p_target_id) then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  if p_target_type = 'community_clip' and not exists (select 1 from public.raye2_community_clips c where c.id::text = p_target_id) then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  if p_target_type = 'mini' and not exists (select 1 from public.raye2_minis m where m.id::text = p_target_id) then
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

-- 2. Extend the takedown workflow to Mini's and community clips (both already have a 'removed' status).
alter table public.raye2_content_takedowns drop constraint if exists raye2_content_takedowns_target_type_check;
alter table public.raye2_content_takedowns add constraint raye2_content_takedowns_target_type_check
  check (target_type in ('community_post','community_comment','media_item','mini','community_clip'));

create or replace function public.raye2_apply_content_takedown(
  p_target_type text,
  p_target_id uuid,
  p_reason_category text,
  p_claimant text default '',
  p_evidence text default '',
  p_notes text default ''
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_prev jsonb; v_claimant text := btrim(coalesce(p_claimant,''));
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode='42501';
  end if;
  if p_target_type not in ('community_post','community_comment','media_item','mini','community_clip') then
    raise exception 'invalid target type' using errcode='22023';
  end if;
  if p_reason_category not in ('copyright','policy','legal','abuse','other') then
    raise exception 'invalid reason category' using errcode='22023';
  end if;
  if char_length(v_claimant) > 200 or char_length(coalesce(p_evidence,'')) > 2000 or char_length(coalesce(p_notes,'')) > 500 then
    raise exception 'takedown details too long' using errcode='22023';
  end if;
  if p_reason_category = 'copyright' and char_length(v_claimant) < 2 then
    raise exception 'a claimant is required for a copyright takedown' using errcode='22023';
  end if;
  if exists(select 1 from public.raye2_content_takedowns t where t.target_type = p_target_type and t.target_id = p_target_id and t.status = 'active') then
    raise exception 'this content is already taken down' using errcode='23505';
  end if;
  if p_target_type = 'community_post' then
    select jsonb_build_object('status', c.status) into v_prev from public.community_posts c where c.id = p_target_id;
  elsif p_target_type = 'community_comment' then
    select jsonb_build_object('status', c.status) into v_prev from public.community_comments c where c.id = p_target_id;
  elsif p_target_type = 'mini' then
    select jsonb_build_object('status', c.status) into v_prev from public.raye2_minis c where c.id = p_target_id;
  elsif p_target_type = 'community_clip' then
    select jsonb_build_object('status', c.status) into v_prev from public.raye2_community_clips c where c.id = p_target_id;
  else
    select jsonb_build_object('is_published', m.is_published) into v_prev from public.media_items m where m.id = p_target_id;
  end if;
  if v_prev is null then raise exception 'target content not found' using errcode='P0002'; end if;
  if p_target_type = 'community_post' then
    update public.community_posts set status = 'removed' where id = p_target_id;
  elsif p_target_type = 'community_comment' then
    update public.community_comments set status = 'removed' where id = p_target_id;
  elsif p_target_type = 'mini' then
    update public.raye2_minis set status = 'removed' where id = p_target_id;
  elsif p_target_type = 'community_clip' then
    update public.raye2_community_clips set status = 'removed' where id = p_target_id;
  else
    update public.media_items set is_published = false where id = p_target_id;
  end if;
  insert into public.raye2_content_takedowns(target_type,target_id,reason_category,claimant,evidence,notes,previous_state,taken_down_by)
  values(p_target_type,p_target_id,p_reason_category,v_claimant,coalesce(p_evidence,''),coalesce(p_notes,''),v_prev,auth.uid())
  returning id into v_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'content_takedown',p_target_type,p_target_id::text,left(coalesce(nullif(btrim(coalesce(p_notes,'')),''),p_reason_category),500),
    jsonb_build_object('takedown_id',v_id,'reason_category',p_reason_category,'claimant',v_claimant));
  return v_id;
end;
$$;
revoke all on function public.raye2_apply_content_takedown(text,uuid,text,text,text,text) from public,anon;
grant execute on function public.raye2_apply_content_takedown(text,uuid,text,text,text,text) to authenticated;

create or replace function public.raye2_reinstate_content_takedown(p_takedown_id uuid, p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_row public.raye2_content_takedowns%rowtype; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode='42501';
  end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  select * into v_row from public.raye2_content_takedowns where id = p_takedown_id for update;
  if not found or v_row.status <> 'active' then raise exception 'active takedown not found' using errcode='P0002'; end if;
  if v_row.target_type = 'community_post' then
    update public.community_posts set status = coalesce(v_row.previous_state->>'status','published') where id = v_row.target_id;
  elsif v_row.target_type = 'community_comment' then
    update public.community_comments set status = coalesce(v_row.previous_state->>'status','published') where id = v_row.target_id;
  elsif v_row.target_type = 'mini' then
    update public.raye2_minis set status = coalesce(v_row.previous_state->>'status','published') where id = v_row.target_id;
  elsif v_row.target_type = 'community_clip' then
    update public.raye2_community_clips set status = coalesce(v_row.previous_state->>'status','published') where id = v_row.target_id;
  else
    update public.media_items set is_published = coalesce((v_row.previous_state->>'is_published')::boolean,false) where id = v_row.target_id;
  end if;
  update public.raye2_content_takedowns
     set status = 'reinstated', reinstated_by = auth.uid(), reinstated_at = now(), reinstatement_reason = v_reason
   where id = p_takedown_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'content_reinstated',v_row.target_type,v_row.target_id::text,v_reason,jsonb_build_object('takedown_id',p_takedown_id));
end;
$$;
revoke all on function public.raye2_reinstate_content_takedown(uuid,text) from public,anon;
grant execute on function public.raye2_reinstate_content_takedown(uuid,text) to authenticated;

-- 3. Extend the admin moderation-queue preview to render Mini's (and keep community clips) targets.
create or replace function public.raye2_get_moderation_queue(p_limit integer default 50, p_status text default 'open')
returns table (
  kind text, report_id uuid, target_type text, target_id text, reason text, details text, status text,
  created_at timestamptz, reporter_handle text, target_preview text, resolution_note text, resolved_at timestamptz
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
               when 'mini' then coalesce((select mn.title from public.raye2_minis mn where mn.id::text = r.target_id), '')
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

-- 4. Expose Mini ownership in the feed so the UI can offer report (others) and remove (own).
drop function if exists public.raye2_list_minis(integer);
create or replace function public.raye2_list_minis(p_limit integer default 40)
returns table (
  id uuid, title text, caption text, storage_path text, duration_seconds integer, created_at timestamptz, expires_at timestamptz,
  author_id uuid, author_handle text, author_display_name text, author_avatar_url text
)
language sql stable security definer set search_path=''
as $fn$
  with bounded as (select least(greatest(coalesce(p_limit, 40), 1), 100) as lim)
  select mn.id, mn.title, mn.caption, mn.storage_path, mn.duration_seconds, mn.created_at, mn.expires_at,
         mn.author_id, mp.handle, mp.display_name, mp.avatar_url
  from public.raye2_minis mn
  cross join bounded b
  left join public.member_profiles mp on mp.user_id = mn.author_id
  where mn.status='published' and mn.visibility='public' and mn.expires_at > now()
    and not public.is_member_blocked(mn.author_id)
  order by mn.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_minis(integer) from public;
grant execute on function public.raye2_list_minis(integer) to anon, authenticated;

notify pgrst, 'reload schema';

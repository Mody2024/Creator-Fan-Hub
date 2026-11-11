-- Raye2 Wave 9: content takedown and copyright workflow.
--
-- Plan 10.3 requires a copyright/ownership/consent takedown workflow, plan 11.3 requires removed
-- content to become inaccessible immediately, and plan 13.11 requires every action to be auditable.
-- Moderation could remove community posts, but there was no general takedown that also covers media
-- and carries a claimant/evidence record with reinstatement.

create table if not exists public.raye2_content_takedowns (
  id uuid primary key default gen_random_uuid(),
  target_type text not null check (target_type in ('community_post','community_comment','media_item')),
  target_id uuid not null,
  reason_category text not null check (reason_category in ('copyright','policy','legal','abuse','other')),
  claimant text not null default '' check (char_length(claimant) <= 200),
  evidence text not null default '' check (char_length(evidence) <= 2000),
  notes text not null default '' check (char_length(notes) <= 500),
  status text not null default 'active' check (status in ('active','reinstated')),
  previous_state jsonb not null default '{}'::jsonb,
  taken_down_by uuid not null references auth.users(id) on delete restrict,
  taken_down_at timestamptz not null default now(),
  reinstated_by uuid references auth.users(id) on delete set null,
  reinstated_at timestamptz,
  reinstatement_reason text check (reinstatement_reason is null or char_length(reinstatement_reason) <= 500)
);
create unique index if not exists raye2_content_takedowns_active_idx on public.raye2_content_takedowns(target_type,target_id) where status = 'active';
create index if not exists raye2_content_takedowns_status_idx on public.raye2_content_takedowns(status,taken_down_at desc);
alter table public.raye2_content_takedowns enable row level security;
revoke all on public.raye2_content_takedowns from anon,authenticated;

-- 1. Apply a takedown. Records the prior state, then immediately makes the target inaccessible so
--    the read policies hide it regardless of when physical deletion completes.
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
  if p_target_type not in ('community_post','community_comment','media_item') then
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
  else
    select jsonb_build_object('is_published', m.is_published) into v_prev from public.media_items m where m.id = p_target_id;
  end if;
  if v_prev is null then raise exception 'target content not found' using errcode='P0002'; end if;
  if p_target_type = 'community_post' then
    update public.community_posts set status = 'removed' where id = p_target_id;
  elsif p_target_type = 'community_comment' then
    update public.community_comments set status = 'removed' where id = p_target_id;
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

-- 2. Reinstate a takedown, restoring the recorded prior state.
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

-- 3. Takedown queue for moderators.
create or replace function public.raye2_get_takedown_queue(p_limit integer default 40, p_status text default 'active')
returns table (takedown_id uuid, target_type text, target_id uuid, reason_category text, claimant text, notes text, status text, taken_down_at timestamptz)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode='42501';
  end if;
  if p_status not in ('active','reinstated') then raise exception 'invalid status' using errcode='22023'; end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit,40),1),100) as lim)
    select t.id, t.target_type, t.target_id, t.reason_category, t.claimant, t.notes, t.status, t.taken_down_at
    from public.raye2_content_takedowns t
    cross join bounded b
    where t.status = p_status
    order by t.taken_down_at desc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_get_takedown_queue(integer,text) from public,anon;
grant execute on function public.raye2_get_takedown_queue(integer,text) to authenticated;

notify pgrst, 'reload schema';

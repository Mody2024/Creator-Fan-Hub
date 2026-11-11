-- Raye2 Wave 5 group bans.
--
-- The plan requires group bans alongside join requests and invites, and raye2_group_members.status
-- already permits 'banned', but nothing could ever set it: managers could only remove a member,
-- after which the person could rejoin a public group or reuse an invite. This adds an explicit
-- ban/unban flow with a moderator hierarchy, a restricted-members read for managers, and audit
-- history, so a ban actually prevents re-joining.

-- Track when a member was restricted, for the banned list and audit context.
alter table public.raye2_group_members add column if not exists restricted_at timestamptz;

-- 1. Ban a member. Mirrors the remove-member hierarchy and refuses owner/self targets.
create or replace function public.raye2_ban_group_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare v_actor_role text; v_target_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select role into v_actor_role from public.raye2_group_members
    where group_id = p_group_id and user_id = auth.uid() and status = 'active';
  select role into v_target_role from public.raye2_group_members
    where group_id = p_group_id and user_id = p_user_id for update;
  if v_actor_role is null then raise exception 'active group membership required' using errcode = '42501'; end if;
  if v_target_role is null then raise exception 'member not found' using errcode = 'P0002'; end if;
  if p_user_id = auth.uid() or v_target_role = 'owner'
    or v_actor_role not in ('owner','admin','moderator')
    or (v_actor_role = 'admin' and v_target_role in ('owner','admin'))
    or (v_actor_role = 'moderator' and v_target_role <> 'member') then
    raise exception 'insufficient group moderation permissions' using errcode = '42501';
  end if;
  update public.raye2_group_members
    set status = 'banned', restricted_at = now()
    where group_id = p_group_id and user_id = p_user_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_member_banned','group_member',p_user_id::text,'Member banned by group moderation',jsonb_build_object('group_id',p_group_id,'role',v_target_role));
end;
$fn$;
revoke all on function public.raye2_ban_group_member(uuid,uuid) from public, anon;
grant execute on function public.raye2_ban_group_member(uuid,uuid) to authenticated;

-- 2. Unban a member: clears the ban so the person may rejoin public groups or use invites again.
create or replace function public.raye2_unban_group_member(p_group_id uuid, p_user_id uuid)
returns void language plpgsql security definer set search_path = ''
as $fn$
declare v_actor_role text; v_target_status text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode = '42501'; end if;
  select role into v_actor_role from public.raye2_group_members
    where group_id = p_group_id and user_id = auth.uid() and status = 'active';
  if v_actor_role is null or v_actor_role not in ('owner','admin','moderator') then
    raise exception 'insufficient group moderation permissions' using errcode = '42501';
  end if;
  select status into v_target_status from public.raye2_group_members
    where group_id = p_group_id and user_id = p_user_id for update;
  if v_target_status is null then raise exception 'member not found' using errcode = 'P0002'; end if;
  if v_target_status <> 'banned' then raise exception 'member is not banned' using errcode = '22023'; end if;
  update public.raye2_group_members
    set status = 'removed', restricted_at = null
    where group_id = p_group_id and user_id = p_user_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_member_unbanned','group_member',p_user_id::text,'Member ban lifted by group moderation',jsonb_build_object('group_id',p_group_id));
end;
$fn$;
revoke all on function public.raye2_unban_group_member(uuid,uuid) from public, anon;
grant execute on function public.raye2_unban_group_member(uuid,uuid) to authenticated;

-- 3. Managers can list the group's banned members with their profiles.
create or replace function public.raye2_get_group_bans(p_group_id uuid, p_limit integer default 100)
returns table (
  user_id uuid,
  role text,
  restricted_at timestamptz,
  handle text,
  display_name text,
  avatar_url text
)
language sql
stable
security definer
set search_path = ''
as $fn$
  with bounded as (
    select least(greatest(coalesce(p_limit, 100), 1), 200) as lim
  ),
  allowed as (
    select p_group_id as group_id
    where public.raye2_is_group_manager(p_group_id)
  )
  select m.user_id,
         m.role,
         m.restricted_at,
         mp.handle,
         mp.display_name,
         mp.avatar_url
  from public.raye2_group_members m
  cross join bounded b
  join allowed a on a.group_id = m.group_id
  left join public.member_profiles mp on mp.user_id = m.user_id
  where m.status = 'banned'
  order by m.restricted_at desc nulls last
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_get_group_bans(uuid,integer) from public, anon;
grant execute on function public.raye2_get_group_bans(uuid,integer) to authenticated;

notify pgrst, 'reload schema';

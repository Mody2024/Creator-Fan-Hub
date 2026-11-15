-- Raye2 Wave 6: group lifecycle — leave, ownership transfer and archive.
--
-- Plan Wave 6 requires the group lifecycle (public/private groups, permissions, invites) to be complete.
-- Members could join, be approved and be removed, but there was no way to leave a group, no ownership transfer
-- (the owner guard forbade any owner_id change) and no archive/reactivate path. Archived groups already stop
-- accepting messages through the message insert policy, which requires the group status to be 'active'.

-- 1. Allow the guard to permit an owner change only inside the transfer function (transaction-scoped flag).
create or replace function public.raye2_guard_group_owner()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.owner_id is distinct from old.owner_id
     and coalesce(current_setting('raye2.allow_owner_change', true), '') <> 'on' then
    raise exception 'group ownership cannot be changed through this operation' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_guard_group_owner() from public,anon,authenticated;

-- 2. Leave a group (owners must transfer ownership first). Removes the membership row; the existing sync trigger
--    removes the conversation membership too.
create or replace function public.raye2_leave_group(p_group_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select role into v_role from public.raye2_group_members
    where group_id=p_group_id and user_id=auth.uid() and status='active';
  if v_role is null then raise exception 'not a member of this group' using errcode='P0002'; end if;
  if v_role='owner' then raise exception 'transfer ownership before leaving' using errcode='42501'; end if;
  delete from public.raye2_group_members where group_id=p_group_id and user_id=auth.uid();
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_member_left','group',p_group_id::text,'Member left the group','{}'::jsonb);
end;
$$;
revoke all on function public.raye2_leave_group(uuid) from public,anon;
grant execute on function public.raye2_leave_group(uuid) to authenticated;

-- 3. Transfer ownership to an active member. The outgoing owner becomes an admin so the group always has an owner.
create or replace function public.raye2_transfer_group_ownership(p_group_id uuid, p_new_owner uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_owner uuid; v_new_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select owner_id into v_owner from public.raye2_groups where id=p_group_id and status in ('active','read_only');
  if v_owner is null then raise exception 'group not found' using errcode='P0002'; end if;
  if v_owner <> auth.uid() then raise exception 'only the owner can transfer ownership' using errcode='42501'; end if;
  if p_new_owner is null or p_new_owner = auth.uid() then raise exception 'choose another member' using errcode='22023'; end if;
  select role into v_new_role from public.raye2_group_members
    where group_id=p_group_id and user_id=p_new_owner and status='active';
  if v_new_role is null then raise exception 'the new owner must be an active member' using errcode='22023'; end if;
  perform set_config('raye2.allow_owner_change','on',true);
  update public.raye2_groups set owner_id=p_new_owner, updated_at=now() where id=p_group_id;
  update public.raye2_group_members set role='owner' where group_id=p_group_id and user_id=p_new_owner;
  update public.raye2_group_members set role='admin' where group_id=p_group_id and user_id=auth.uid();
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_ownership_transferred','group',p_group_id::text,'Ownership transferred',
         jsonb_build_object('new_owner',p_new_owner));
end;
$$;
revoke all on function public.raye2_transfer_group_ownership(uuid,uuid) from public,anon;
grant execute on function public.raye2_transfer_group_ownership(uuid,uuid) to authenticated;

-- 4. Archive / reactivate / set read-only. Owner only. Archived groups stop accepting messages (insert policy).
create or replace function public.raye2_set_group_status(p_group_id uuid, p_status text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_owner uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_status not in ('active','read_only','archived') then raise exception 'invalid group status' using errcode='22023'; end if;
  select owner_id into v_owner from public.raye2_groups where id=p_group_id;
  if v_owner is null then raise exception 'group not found' using errcode='P0002'; end if;
  if v_owner <> auth.uid() then raise exception 'only the owner can change the group status' using errcode='42501'; end if;
  update public.raye2_groups set status=p_status, updated_at=now() where id=p_group_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_status_changed','group',p_group_id::text,'Group status changed',
         jsonb_build_object('status',p_status));
end;
$$;
revoke all on function public.raye2_set_group_status(uuid,text) from public,anon;
grant execute on function public.raye2_set_group_status(uuid,text) to authenticated;

-- Raye2 Phase B: invite lifecycle, private join requests, safe member moderation and Shared Memories actions.
create table if not exists public.raye2_group_join_requests (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.raye2_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  note text not null default '' check (char_length(note) <= 500),
  status text not null default 'pending' check (status in ('pending','approved','declined','cancelled')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists raye2_one_pending_join_request
  on public.raye2_group_join_requests(group_id,user_id) where status='pending';
create index if not exists raye2_join_requests_manager_idx
  on public.raye2_group_join_requests(group_id,status,created_at desc);
create unique index if not exists raye2_shared_memory_source_unique
  on public.raye2_shared_memories(group_id,source_message_id)
  where group_id is not null and source_message_id is not null;

create or replace function public.raye2_revoke_group_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_group_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select group_id into v_group_id from public.raye2_group_invites where id=p_invite_id;
  if v_group_id is null or not public.raye2_is_group_manager(v_group_id) then
    raise exception 'group manager access required' using errcode='42501';
  end if;
  update public.raye2_group_invites set revoked_at=coalesce(revoked_at,now()) where id=p_invite_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_invite_revoked','group_invite',p_invite_id::text,'Invite revoked',jsonb_build_object('group_id',v_group_id));
end;
$$;
revoke all on function public.raye2_revoke_group_invite(uuid) from public,anon;
grant execute on function public.raye2_revoke_group_invite(uuid) to authenticated;

create or replace function public.raye2_request_group_join(p_group_id uuid,p_note text default '')
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if char_length(coalesce(p_note,''))>500 then raise exception 'request note is too long' using errcode='22023'; end if;
  if not exists(select 1 from public.raye2_groups where id=p_group_id and visibility='private' and status='active') then
    raise exception 'private group is unavailable' using errcode='P0002';
  end if;
  if public.raye2_is_group_member(p_group_id) then raise exception 'already a group member' using errcode='22023'; end if;
  insert into public.raye2_group_join_requests(group_id,user_id,note,status)
  values(p_group_id,auth.uid(),coalesce(p_note,''),'pending')
  on conflict(group_id,user_id) where status='pending'
  do update set note=excluded.note,updated_at=now()
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raye2_request_group_join(uuid,text) from public,anon;
grant execute on function public.raye2_request_group_join(uuid,text) to authenticated;

create or replace function public.raye2_review_group_join_request(p_request_id uuid,p_decision text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_request public.raye2_group_join_requests%rowtype;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_decision not in ('approved','declined') then raise exception 'invalid decision' using errcode='22023'; end if;
  select * into v_request from public.raye2_group_join_requests where id=p_request_id for update;
  if not found or not public.raye2_is_group_manager(v_request.group_id) then
    raise exception 'group manager access required' using errcode='42501';
  end if;
  if v_request.status<>'pending' then raise exception 'request is no longer pending' using errcode='22023'; end if;
  if p_decision='approved' then
    insert into public.raye2_group_members(group_id,user_id,role,status)
    values(v_request.group_id,v_request.user_id,'member','active')
    on conflict(group_id,user_id) do update set status='active'
    where public.raye2_group_members.status<>'banned';
    if not found then raise exception 'member is restricted from this group' using errcode='42501'; end if;
  end if;
  update public.raye2_group_join_requests set status=p_decision,reviewed_by=auth.uid(),reviewed_at=now(),updated_at=now()
  where id=p_request_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_join_request_'||p_decision,'group_join_request',p_request_id::text,'Join request reviewed',jsonb_build_object('group_id',v_request.group_id,'user_id',v_request.user_id));
end;
$$;
revoke all on function public.raye2_review_group_join_request(uuid,text) from public,anon;
grant execute on function public.raye2_review_group_join_request(uuid,text) to authenticated;

create or replace function public.raye2_set_group_member_role(p_group_id uuid,p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor_role text;v_target_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select role into v_actor_role from public.raye2_group_members
    where group_id=p_group_id and user_id=auth.uid() and status='active';
  select role into v_target_role from public.raye2_group_members
    where group_id=p_group_id and user_id=p_user_id and status='active' for update;
  if v_actor_role is null or v_target_role is null then raise exception 'active group membership required' using errcode='42501'; end if;
  if v_target_role='owner' or p_user_id=auth.uid() then raise exception 'owner and self roles cannot be changed here' using errcode='42501'; end if;
  if p_role not in ('admin','moderator','member')
    or (v_actor_role='admin' and (v_target_role='admin' or p_role='admin'))
    or (v_actor_role='moderator' and (v_target_role<>'member' or p_role<>'member'))
    or v_actor_role not in ('owner','admin','moderator') then
    raise exception 'insufficient group role permissions' using errcode='42501';
  end if;
  update public.raye2_group_members set role=p_role where group_id=p_group_id and user_id=p_user_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_member_role_changed','group_member',p_user_id::text,'Group role updated',jsonb_build_object('group_id',p_group_id,'from',v_target_role,'to',p_role));
end;
$$;
revoke all on function public.raye2_set_group_member_role(uuid,uuid,text) from public,anon;
grant execute on function public.raye2_set_group_member_role(uuid,uuid,text) to authenticated;

create or replace function public.raye2_remove_group_member(p_group_id uuid,p_user_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_actor_role text;v_target_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select role into v_actor_role from public.raye2_group_members
    where group_id=p_group_id and user_id=auth.uid() and status='active';
  select role into v_target_role from public.raye2_group_members
    where group_id=p_group_id and user_id=p_user_id and status='active' for update;
  if v_actor_role is null or v_target_role is null or p_user_id=auth.uid() or v_target_role='owner'
    or v_actor_role not in ('owner','admin','moderator')
    or (v_actor_role='admin' and v_target_role in ('owner','admin'))
    or (v_actor_role='moderator' and v_target_role<>'member') then
    raise exception 'insufficient group moderation permissions' using errcode='42501';
  end if;
  update public.raye2_group_members set status='removed' where group_id=p_group_id and user_id=p_user_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_member_removed','group_member',p_user_id::text,'Member removed by group moderation',jsonb_build_object('group_id',p_group_id,'role',v_target_role));
end;
$$;
revoke all on function public.raye2_remove_group_member(uuid,uuid) from public,anon;
grant execute on function public.raye2_remove_group_member(uuid,uuid) to authenticated;

create or replace function public.raye2_save_shared_memory(p_group_id uuid,p_message_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_message public.raye2_messages%rowtype;v_memory uuid;
begin
  if auth.uid() is null or not public.raye2_is_group_member(p_group_id) then
    raise exception 'group membership required' using errcode='42501';
  end if;
  select m.* into v_message from public.raye2_messages m
    join public.raye2_conversations c on c.id=m.conversation_id
    where m.id=p_message_id and c.group_id=p_group_id and m.deleted_at is null
      and (m.expires_at is null or m.expires_at>now());
  if not found then raise exception 'message is unavailable' using errcode='P0002'; end if;
  insert into public.raye2_shared_memories(group_id,created_by,source_message_id,memory_type,title,content,retention_mode)
  values(p_group_id,auth.uid(),p_message_id,'message',left(v_message.body,160),
    jsonb_build_object('body',v_message.body,'sender_id',v_message.sender_id,'created_at',v_message.created_at),'group_lifetime')
  on conflict(group_id,source_message_id) where group_id is not null and source_message_id is not null
  do update set updated_at=now()
  returning id into v_memory;
  return v_memory;
end;
$$;
revoke all on function public.raye2_save_shared_memory(uuid,uuid) from public,anon;
grant execute on function public.raye2_save_shared_memory(uuid,uuid) to authenticated;

alter table public.raye2_group_join_requests enable row level security;
revoke all on public.raye2_group_join_requests from anon,authenticated;
grant select on public.raye2_group_join_requests to authenticated;
create policy "Raye2 users and managers read join requests" on public.raye2_group_join_requests for select to authenticated
using (user_id=(select auth.uid()) or public.raye2_is_group_manager(group_id));
revoke insert,update,delete on public.raye2_group_join_requests from anon,authenticated;

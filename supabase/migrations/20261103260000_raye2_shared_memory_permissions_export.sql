-- Raye2 Shared Memories: per-group contribution/export policy and safe JSON export.
create table if not exists public.raye2_group_memory_settings (
  group_id uuid primary key references public.raye2_groups(id) on delete cascade,
  contribution_policy text not null default 'all_members'
    check (contribution_policy in ('all_members','managers_only')),
  export_policy text not null default 'all_members'
    check (export_policy in ('all_members','managers_only','disabled')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

alter table public.raye2_group_memory_settings enable row level security;
revoke all on public.raye2_group_memory_settings from anon,authenticated;
grant select on public.raye2_group_memory_settings to authenticated;
create policy "Raye2 members read memory collection settings"
  on public.raye2_group_memory_settings for select to authenticated
  using (public.raye2_is_group_member(group_id));

create or replace function public.raye2_set_group_memory_settings(
  p_group_id uuid,p_contribution_policy text,p_export_policy text
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.raye2_is_group_manager(p_group_id) then
    raise exception 'group manager access required' using errcode='42501';
  end if;
  if p_contribution_policy not in ('all_members','managers_only')
    or p_export_policy not in ('all_members','managers_only','disabled') then
    raise exception 'invalid Shared Memories permissions' using errcode='22023';
  end if;
  insert into public.raye2_group_memory_settings(group_id,contribution_policy,export_policy,updated_by,updated_at)
  values(p_group_id,p_contribution_policy,p_export_policy,auth.uid(),now())
  on conflict(group_id) do update set
    contribution_policy=excluded.contribution_policy,
    export_policy=excluded.export_policy,
    updated_by=auth.uid(),
    updated_at=now();
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_memory_permissions_updated','group',p_group_id::text,
    'Shared Memories permissions updated',
    jsonb_build_object('contribution_policy',p_contribution_policy,'export_policy',p_export_policy));
end;
$$;
revoke all on function public.raye2_set_group_memory_settings(uuid,text,text) from public,anon;
grant execute on function public.raye2_set_group_memory_settings(uuid,text,text) to authenticated;

create or replace function public.raye2_export_shared_memories(p_group_id uuid)
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_policy text;
  v_result jsonb;
begin
  if auth.uid() is null or not public.raye2_is_group_member(p_group_id) then
    raise exception 'group membership required' using errcode='42501';
  end if;
  select coalesce(s.export_policy,'all_members') into v_policy
  from public.raye2_group_memory_settings s where s.group_id=p_group_id;
  v_policy:=coalesce(v_policy,'all_members');
  if v_policy='disabled' or (v_policy='managers_only' and not public.raye2_is_group_manager(p_group_id)) then
    raise exception 'Shared Memories export is restricted' using errcode='42501';
  end if;
  select jsonb_build_object(
    'format','raye2-shared-memories',
    'version',1,
    'exported_at',now(),
    'group',jsonb_build_object('id',g.id,'name',g.name,'visibility',g.visibility),
    'memories',coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',m.id,'created_by',m.created_by,'memory_type',m.memory_type,
        'title',m.title,'caption',m.caption,'content',m.content,
        'retention_mode',m.retention_mode,'expires_at',m.expires_at,
        'pinned',m.pinned,'created_at',m.created_at
      ) order by m.pinned desc,m.created_at asc)
      from public.raye2_shared_memories m
      where m.group_id=p_group_id and (m.expires_at is null or m.expires_at>now())
    ),'[]'::jsonb)
  ) into v_result
  from public.raye2_groups g where g.id=p_group_id and g.status in ('active','read_only');
  if v_result is null then raise exception 'group is unavailable' using errcode='P0002'; end if;
  return v_result;
end;
$$;
revoke all on function public.raye2_export_shared_memories(uuid) from public,anon;
grant execute on function public.raye2_export_shared_memories(uuid) to authenticated;

drop policy if exists "Raye2 members contribute memories" on public.raye2_shared_memories;
create policy "Raye2 members contribute memories"
  on public.raye2_shared_memories for insert to authenticated
  with check (
    created_by=(select auth.uid()) and group_id is not null
    and public.raye2_is_group_member(group_id)
    and (
      coalesce((select s.contribution_policy from public.raye2_group_memory_settings s where s.group_id=raye2_shared_memories.group_id),'all_members')='all_members'
      or public.raye2_is_group_manager(group_id)
    )
  );

drop policy if exists "Raye2 contributors edit memories" on public.raye2_shared_memories;
create policy "Raye2 contributors edit memories"
  on public.raye2_shared_memories for update to authenticated
  using (
    (created_by=(select auth.uid()) and group_id is not null
      and public.raye2_is_group_member(group_id)
      and coalesce((select s.contribution_policy from public.raye2_group_memory_settings s where s.group_id=raye2_shared_memories.group_id),'all_members')='all_members')
    or public.raye2_is_group_manager(group_id)
  )
  with check (
    group_id is not null and public.raye2_is_group_member(group_id)
    and (created_by=(select auth.uid()) or public.raye2_is_group_manager(group_id))
  );

drop policy if exists "Raye2 contributors delete memories" on public.raye2_shared_memories;
create policy "Raye2 contributors delete memories"
  on public.raye2_shared_memories for delete to authenticated
  using (
    (created_by=(select auth.uid()) and group_id is not null
      and public.raye2_is_group_member(group_id)
      and coalesce((select s.contribution_policy from public.raye2_group_memory_settings s where s.group_id=raye2_shared_memories.group_id),'all_members')='all_members')
    or public.raye2_is_group_manager(group_id)
  );

-- Enforce contribution policy inside the SECURITY DEFINER save path too.
create or replace function public.raye2_save_shared_memory(p_group_id uuid,p_message_id uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_message public.raye2_messages%rowtype;v_memory uuid;v_policy text;
begin
  if auth.uid() is null or not public.raye2_is_group_member(p_group_id) then
    raise exception 'group membership required' using errcode='42501';
  end if;
  select coalesce(s.contribution_policy,'all_members') into v_policy
    from public.raye2_group_memory_settings s where s.group_id=p_group_id;
  v_policy:=coalesce(v_policy,'all_members');
  if v_policy='managers_only' and not public.raye2_is_group_manager(p_group_id) then
    raise exception 'Shared Memories contributions are restricted' using errcode='42501';
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

create or replace function public.raye2_guard_shared_memory_identity()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.group_id is distinct from old.group_id
    or new.created_by is distinct from old.created_by
    or new.source_message_id is distinct from old.source_message_id then
    raise exception 'Shared Memory ownership and group are immutable' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_guard_shared_memory_identity() from public,anon,authenticated;
drop trigger if exists raye2_shared_memories_guard_identity on public.raye2_shared_memories;
create trigger raye2_shared_memories_guard_identity before update on public.raye2_shared_memories
for each row execute function public.raye2_guard_shared_memory_identity();

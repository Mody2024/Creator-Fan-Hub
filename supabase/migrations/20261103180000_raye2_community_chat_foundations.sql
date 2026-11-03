-- Raye2 Phase A: private community, messaging, platform rules and retention foundations.
-- All user-facing limits remain proposed until an owner activates them in Admin.
create extension if not exists pgcrypto;

create table if not exists public.raye2_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9][a-z0-9-]{1,59}$'),
  description text not null default '' check (char_length(description) <= 1000),
  visibility text not null default 'private' check (visibility in ('public','private')),
  status text not null default 'active' check (status in ('active','read_only','archived','expired')),
  owner_id uuid not null references auth.users(id) on delete restrict,
  image_url text,
  rules text not null default '' check (char_length(rules) <= 3000),
  topics text[] not null default '{}',
  conversation_id uuid,
  expires_at timestamptz,
  last_activity_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.raye2_conversations (
  id uuid primary key default gen_random_uuid(),
  conversation_type text not null check (conversation_type in ('direct','group')),
  group_id uuid references public.raye2_groups(id) on delete cascade,
  created_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((conversation_type='direct' and group_id is null) or (conversation_type='group' and group_id is not null))
);
alter table public.raye2_groups
  add constraint raye2_groups_conversation_fk
  foreign key (conversation_id) references public.raye2_conversations(id) on delete set null;
create unique index if not exists raye2_group_conversation_unique
  on public.raye2_conversations(group_id) where group_id is not null;

create table if not exists public.raye2_group_members (
  group_id uuid not null references public.raye2_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('owner','admin','moderator','member')),
  status text not null default 'active' check (status in ('active','pending','removed','banned')),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz,
  primary key (group_id,user_id)
);
create index if not exists raye2_group_members_user_idx on public.raye2_group_members(user_id,joined_at desc);
create index if not exists raye2_groups_discovery_idx on public.raye2_groups(visibility,status,created_at desc);

create table if not exists public.raye2_conversation_members (
  conversation_id uuid not null references public.raye2_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  last_read_at timestamptz,
  muted_until timestamptz,
  archived_at timestamptz,
  primary key (conversation_id,user_id)
);
create index if not exists raye2_conversation_members_user_idx
  on public.raye2_conversation_members(user_id,conversation_id);

create table if not exists public.raye2_group_invites (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.raye2_groups(id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null references auth.users(id) on delete restrict,
  max_uses integer check (max_uses is null or max_uses > 0),
  uses integer not null default 0 check (uses >= 0),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check (expires_at > created_at),
  check (max_uses is null or uses <= max_uses)
);
create index if not exists raye2_group_invites_group_idx on public.raye2_group_invites(group_id,expires_at desc);

create table if not exists public.raye2_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.raye2_conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 5000),
  parent_message_id uuid references public.raye2_messages(id) on delete set null,
  attachment jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id,conversation_id),
  check (char_length(btrim(body)) > 0 or attachment is not null)
);
create index if not exists raye2_messages_conversation_idx on public.raye2_messages(conversation_id,created_at desc);
create index if not exists raye2_messages_expiry_idx on public.raye2_messages(expires_at) where expires_at is not null;
create index if not exists raye2_messages_sender_idx on public.raye2_messages(sender_id,created_at desc);

create table if not exists public.raye2_message_reactions (
  message_id uuid not null references public.raye2_messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction_key text not null check (reaction_key ~ '^[a-z0-9_-]{1,40}$'),
  created_at timestamptz not null default now(),
  primary key (message_id,user_id,reaction_key)
);
create index if not exists raye2_message_reactions_message_idx on public.raye2_message_reactions(message_id);

create table if not exists public.raye2_message_bookmarks (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references public.raye2_messages(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (message_id is not null or saved_content <> '{}'::jsonb)
);
create unique index if not exists raye2_message_bookmarks_message_user_unique
  on public.raye2_message_bookmarks(message_id,user_id) where message_id is not null;
create index if not exists raye2_message_bookmarks_user_idx
  on public.raye2_message_bookmarks(user_id,created_at desc);

create table if not exists public.raye2_shared_memories (
  id uuid primary key default gen_random_uuid(),
  group_id uuid references public.raye2_groups(id) on delete set null,
  created_by uuid not null references auth.users(id) on delete restrict,
  source_message_id uuid references public.raye2_messages(id) on delete set null,
  memory_type text not null check (memory_type in ('message','photo','event','link','highlight')),
  title text not null default '' check (char_length(title) <= 160),
  caption text not null default '' check (char_length(caption) <= 2000),
  content jsonb not null default '{}'::jsonb,
  retention_mode text not null default 'group_lifetime' check (retention_mode in ('temporary','group_lifetime','preserved')),
  expires_at timestamptz,
  pinned boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists raye2_shared_memories_group_idx on public.raye2_shared_memories(group_id,pinned desc,created_at desc);
create index if not exists raye2_shared_memories_expiry_idx on public.raye2_shared_memories(expires_at) where expires_at is not null;

create table if not exists public.raye2_platform_rules (
  rule_key text primary key check (rule_key ~ '^[a-z][a-z0-9_.-]{1,100}$'),
  category text not null check (category in ('roles','content','chat','groups','voice','recording','watch_together','retention','storage','safety')),
  rule_value jsonb not null,
  status text not null default 'proposed' check (status in ('proposed','active','disabled')),
  description text not null default '',
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

insert into public.raye2_platform_rules(rule_key,category,rule_value,status,description) values
 ('groups.members.default','groups','50'::jsonb,'proposed','Suggested initial group member cap; validate against measured capacity before activation.'),
 ('groups.created.normal_user.monthly','groups','5'::jsonb,'proposed','Suggested initial group creation cap.'),
 ('chat.message.max_characters','chat','5000'::jsonb,'proposed','Suggested maximum message length.'),
 ('chat.dm.new_conversations.daily','chat','100'::jsonb,'proposed','Suggested daily new direct-conversation cap.'),
 ('voice.message.max_seconds','voice','180'::jsonb,'proposed','Suggested voice-message duration.'),
 ('voice.private_call.max_participants','voice','2'::jsonb,'proposed','Private calls are one-to-one.'),
 ('voice.group_room.max_participants','voice','10'::jsonb,'proposed','Suggested group-room cap; validate provider capacity.'),
 ('voice.group_room.max_duration_seconds','voice','10800'::jsonb,'proposed','Suggested group voice session duration.'),
 ('recording.enabled','recording','false'::jsonb,'proposed','Recording is off by default and requires active consent from every participant.'),
 ('recording.retention_days','recording','7'::jsonb,'proposed','Suggested retention; never activates recording by itself.'),
 ('watch_together.participants.max','watch_together','10'::jsonb,'proposed','Suggested participant cap.'),
 ('watch_together.queue.max_items','watch_together','50'::jsonb,'proposed','Suggested queue cap.')
on conflict (rule_key) do nothing;

create table if not exists public.raye2_retention_policies (
  category text primary key check (category in (
    'direct_messages','group_messages','inactive_groups','voice_rooms','voice_recordings',
    'voice_messages','chat_attachments','watch_sessions','temporary_uploads','failed_encodes',
    'moments','minis','shared_memories'
  )),
  retention_days integer check (retention_days is null or retention_days >= 1),
  warning_days integer not null default 3 check (warning_days >= 0),
  expiry_action text not null default 'delete' check (expiry_action in ('archive','delete')),
  enabled boolean not null default false,
  preserve_shared_memories boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);
insert into public.raye2_retention_policies(category) values
 ('direct_messages'),('group_messages'),('inactive_groups'),('voice_rooms'),('voice_recordings'),
 ('voice_messages'),('chat_attachments'),('watch_sessions'),('temporary_uploads'),('failed_encodes'),
 ('moments'),('minis'),('shared_memories')
on conflict (category) do nothing;

create table if not exists public.raye2_cleanup_jobs (
  id uuid primary key default gen_random_uuid(),
  requested_by uuid not null references auth.users(id) on delete restrict,
  status text not null default 'preview' check (status in ('preview','queued','running','completed','failed','cancelled')),
  scope jsonb not null,
  preserve_chat_history boolean not null default true,
  preserve_shared_memories boolean not null default true,
  estimated_items bigint,
  estimated_bytes bigint,
  result jsonb not null default '{}'::jsonb,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists raye2_cleanup_jobs_recent_idx on public.raye2_cleanup_jobs(created_at desc,status);

create table if not exists public.raye2_admin_audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  target_type text not null,
  target_id text,
  reason text not null default '',
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists raye2_admin_audit_recent_idx on public.raye2_admin_audit_log(created_at desc);

create table if not exists public.raye2_storage_usage (
  owner_id uuid references auth.users(id) on delete cascade,
  group_id uuid references public.raye2_groups(id) on delete cascade,
  storage_class text not null check (storage_class in ('chat_attachment','voice_message','recording','shared_memory','temporary','other')),
  object_count bigint not null default 0 check (object_count >= 0),
  bytes_used bigint not null default 0 check (bytes_used >= 0),
  measured_at timestamptz not null default now(),
  id uuid primary key default gen_random_uuid(),
  check (owner_id is not null or group_id is not null)
);

create or replace function public.raye2_is_platform_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists (
    select 1 from public.creator_admins a
    where a.user_id=(select auth.uid()) and a.active=true and a.role in ('owner','admin')
  );
$$;
create or replace function public.raye2_is_group_member(p_group_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.raye2_group_members m
    where m.group_id=p_group_id and m.user_id=(select auth.uid()) and m.status='active'
  );
$$;
create or replace function public.raye2_is_group_manager(p_group_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.raye2_group_members m
    where m.group_id=p_group_id and m.user_id=(select auth.uid())
      and m.status='active' and m.role in ('owner','admin','moderator')
  );
$$;
create or replace function public.raye2_is_conversation_member(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select (select auth.uid()) is not null and exists (
    select 1 from public.raye2_conversation_members m
    join public.raye2_conversations c on c.id=m.conversation_id
    left join public.raye2_groups g on g.id=c.group_id
    where m.conversation_id=p_conversation_id and m.user_id=(select auth.uid())
      and c.status='active'
      and (c.group_id is null or g.status in ('active','read_only'))
  );
$$;
revoke all on function public.raye2_is_platform_admin() from public,anon;
revoke all on function public.raye2_is_group_member(uuid) from public,anon;
revoke all on function public.raye2_is_group_manager(uuid) from public,anon;
revoke all on function public.raye2_is_conversation_member(uuid) from public,anon;
grant execute on function public.raye2_is_platform_admin() to authenticated;
grant execute on function public.raye2_is_group_member(uuid) to authenticated;
grant execute on function public.raye2_is_group_manager(uuid) to authenticated;
grant execute on function public.raye2_is_conversation_member(uuid) to authenticated;

create or replace function public.raye2_sync_group_conversation_member()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_conversation uuid;
begin
  select conversation_id into v_conversation from public.raye2_groups where id=coalesce(new.group_id,old.group_id);
  if v_conversation is not null then
    if tg_op='DELETE' or (tg_op='UPDATE' and new.status<>'active') then
      delete from public.raye2_conversation_members where conversation_id=v_conversation and user_id=old.user_id;
    else
      insert into public.raye2_conversation_members(conversation_id,user_id)
      values(v_conversation,new.user_id) on conflict do nothing;
    end if;
  end if;
  if tg_op='DELETE' then return old; end if;
  return new;
end;
$$;
revoke all on function public.raye2_sync_group_conversation_member() from public,anon,authenticated;
grant execute on function public.raye2_sync_group_conversation_member() to postgres;
drop trigger if exists raye2_group_members_sync_conversation on public.raye2_group_members;
create trigger raye2_group_members_sync_conversation
after insert or update of status or delete on public.raye2_group_members
for each row execute function public.raye2_sync_group_conversation_member();

create or replace function public.raye2_create_group(
  p_name text,p_slug text,p_visibility text default 'private',p_description text default ''
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_group uuid;v_conversation uuid;v_slug text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if char_length(btrim(p_name)) not between 2 and 80 then raise exception 'group name must be 2-80 characters' using errcode='22023'; end if;
  v_slug=lower(btrim(p_slug));
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,59}$' then raise exception 'invalid group slug' using errcode='22023'; end if;
  if p_visibility not in ('public','private') then raise exception 'invalid group visibility' using errcode='22023'; end if;
  insert into public.raye2_groups(name,slug,visibility,description,owner_id)
  values(btrim(p_name),v_slug,p_visibility,coalesce(p_description,''),auth.uid())
  returning id into v_group;
  insert into public.raye2_conversations(conversation_type,group_id,created_by)
  values('group',v_group,auth.uid()) returning id into v_conversation;
  update public.raye2_groups set conversation_id=v_conversation where id=v_group;
  insert into public.raye2_group_members(group_id,user_id,role,status)
  values(v_group,auth.uid(),'owner','active');
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'group_created','group',v_group::text,'Group created',jsonb_build_object('visibility',p_visibility));
  return v_group;
end;
$$;
revoke all on function public.raye2_create_group(text,text,text,text) from public,anon;
grant execute on function public.raye2_create_group(text,text,text,text) to authenticated;

create or replace function public.raye2_create_direct_conversation(p_other_user uuid)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_a text;v_b text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_other_user is null or p_other_user=auth.uid() then raise exception 'choose another account' using errcode='22023'; end if;
  if not exists(select 1 from auth.users where id=p_other_user) then raise exception 'account not found' using errcode='P0002'; end if;
  if exists(select 1 from public.member_blocks b where
    (b.blocker_id=auth.uid() and b.blocked_id=p_other_user) or
    (b.blocker_id=p_other_user and b.blocked_id=auth.uid())) then
    raise exception 'conversation is unavailable' using errcode='42501';
  end if;
  v_a=least(auth.uid()::text,p_other_user::text);v_b=greatest(auth.uid()::text,p_other_user::text);
  perform pg_advisory_xact_lock(hashtextextended(v_a||':'||v_b,0));
  select c.id into v_id
  from public.raye2_conversations c
  join public.raye2_conversation_members a on a.conversation_id=c.id and a.user_id=auth.uid()
  join public.raye2_conversation_members b on b.conversation_id=c.id and b.user_id=p_other_user
  where c.conversation_type='direct' and c.status='active'
    and (select count(*) from public.raye2_conversation_members x where x.conversation_id=c.id)=2
  limit 1;
  if v_id is not null then return v_id; end if;
  insert into public.raye2_conversations(conversation_type,created_by)
  values('direct',auth.uid()) returning id into v_id;
  insert into public.raye2_conversation_members(conversation_id,user_id)
  values(v_id,auth.uid()),(v_id,p_other_user);
  return v_id;
end;
$$;
revoke all on function public.raye2_create_direct_conversation(uuid) from public,anon;
grant execute on function public.raye2_create_direct_conversation(uuid) to authenticated;

create or replace function public.raye2_join_public_group(p_group_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  insert into public.raye2_group_members(group_id,user_id,role,status)
  select id,auth.uid(),'member','active' from public.raye2_groups
  where id=p_group_id and visibility='public' and status='active'
  on conflict(group_id,user_id) do update set status='active'
    where public.raye2_group_members.status<>'banned';
  if not found then raise exception 'public group is unavailable' using errcode='P0002'; end if;
end;
$$;
revoke all on function public.raye2_join_public_group(uuid) from public,anon;
grant execute on function public.raye2_join_public_group(uuid) to authenticated;

create or replace function public.raye2_create_group_invite(
  p_group_id uuid,p_token text,p_expires_at timestamptz,p_max_uses integer default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.raye2_is_group_manager(p_group_id) then
    raise exception 'group manager access required' using errcode='42501';
  end if;
  if length(p_token)<32 or length(p_token)>256 then raise exception 'invalid invite token' using errcode='22023'; end if;
  if p_expires_at<=now() or p_expires_at>now()+interval '90 days' then raise exception 'invite expiry must be within 90 days' using errcode='22023'; end if;
  if p_max_uses is not null and p_max_uses not between 1 and 10000 then raise exception 'invalid invite use limit' using errcode='22023'; end if;
  insert into public.raye2_group_invites(group_id,token_hash,created_by,expires_at,max_uses)
  values(p_group_id,encode(extensions.digest(p_token,'sha256'),'hex'),auth.uid(),p_expires_at,p_max_uses)
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raye2_create_group_invite(uuid,text,timestamptz,integer) from public,anon;
grant execute on function public.raye2_create_group_invite(uuid,text,timestamptz,integer) to authenticated;

create or replace function public.raye2_join_group_invite(p_token text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_group uuid;v_invite public.raye2_group_invites%rowtype;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select * into v_invite from public.raye2_group_invites
  where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
    and revoked_at is null and expires_at>now()
    and (max_uses is null or uses<max_uses)
  for update;
  if not found then raise exception 'invite is invalid, expired or exhausted' using errcode='22023'; end if;
  if exists(select 1 from public.member_blocks b join public.raye2_groups g on g.id=v_invite.group_id
    where (b.blocker_id=auth.uid() and b.blocked_id=g.owner_id) or
          (b.blocker_id=g.owner_id and b.blocked_id=auth.uid())) then
    raise exception 'group is unavailable' using errcode='42501';
  end if;
  insert into public.raye2_group_members(group_id,user_id,role,status)
  values(v_invite.group_id,auth.uid(),'member','active')
  on conflict(group_id,user_id) do update set status='active'
    where public.raye2_group_members.status<>'banned';
  if not found then raise exception 'group membership is unavailable' using errcode='42501'; end if;
  update public.raye2_group_invites set uses=uses+1 where id=v_invite.id;
  return v_invite.group_id;
end;
$$;
revoke all on function public.raye2_join_group_invite(text) from public,anon;
grant execute on function public.raye2_join_group_invite(text) to authenticated;

create or replace function public.raye2_set_platform_rule(
  p_rule_key text,p_category text,p_value jsonb,p_status text,p_description text,p_reason text
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'platform admin access required' using errcode='42501';
  end if;
  if p_rule_key !~ '^[a-z][a-z0-9_.-]{1,100}$' or p_category not in
    ('roles','content','chat','groups','voice','recording','watch_together','retention','storage','safety')
    or p_status not in ('proposed','active','disabled') then
    raise exception 'invalid platform rule' using errcode='22023';
  end if;
  if octet_length(p_value::text)>8192 or char_length(coalesce(p_description,''))>500
    or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'invalid rule payload or audit reason' using errcode='22023';
  end if;
  insert into public.raye2_platform_rules(rule_key,category,rule_value,status,description,updated_by,updated_at)
  values(p_rule_key,p_category,p_value,p_status,coalesce(p_description,''),auth.uid(),now())
  on conflict(rule_key) do update set category=excluded.category,rule_value=excluded.rule_value,
    status=excluded.status,description=excluded.description,updated_by=auth.uid(),updated_at=now();
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'platform_rule_updated','platform_rule',p_rule_key,btrim(p_reason),
    jsonb_build_object('category',p_category,'status',p_status));
end;
$$;
revoke all on function public.raye2_set_platform_rule(text,text,jsonb,text,text,text) from public,anon;
grant execute on function public.raye2_set_platform_rule(text,text,jsonb,text,text,text) to authenticated;

create or replace function public.raye2_set_retention_policy(
  p_category text,p_retention_days integer,p_warning_days integer,p_expiry_action text,
  p_enabled boolean,p_preserve_shared_memories boolean,p_reason text
)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'platform admin access required' using errcode='42501';
  end if;
  if p_category not in ('direct_messages','group_messages','inactive_groups','voice_rooms','voice_recordings',
    'voice_messages','chat_attachments','watch_sessions','temporary_uploads','failed_encodes','moments','minis','shared_memories')
    or (p_retention_days is not null and p_retention_days not between 1 and 3650)
    or p_warning_days not between 0 and 365
    or p_expiry_action not in ('archive','delete')
    or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'invalid retention policy' using errcode='22023';
  end if;
  update public.raye2_retention_policies set retention_days=p_retention_days,
    warning_days=p_warning_days,expiry_action=p_expiry_action,enabled=p_enabled,
    preserve_shared_memories=p_preserve_shared_memories,updated_by=auth.uid(),updated_at=now()
  where category=p_category;
  if not found then raise exception 'retention category not found' using errcode='P0002'; end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'retention_policy_updated','retention_policy',p_category,btrim(p_reason),
    jsonb_build_object('enabled',p_enabled,'expiry_action',p_expiry_action,
      'preserve_shared_memories',p_preserve_shared_memories));
end;
$$;
revoke all on function public.raye2_set_retention_policy(text,integer,integer,text,boolean,boolean,text) from public,anon;
grant execute on function public.raye2_set_retention_policy(text,integer,integer,text,boolean,boolean,text) to authenticated;

create or replace function public.raye2_create_cleanup_preview(
  p_scope jsonb,p_preserve_chat_history boolean,p_preserve_shared_memories boolean,p_reason text
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
  if auth.uid() is null or not public.raye2_is_platform_admin() then
    raise exception 'platform admin access required' using errcode='42501';
  end if;
  if jsonb_typeof(p_scope)<>'array' or jsonb_array_length(p_scope)=0 or octet_length(p_scope::text)>4096
    or char_length(btrim(coalesce(p_reason,''))) not between 3 and 500 then
    raise exception 'cleanup scope and reason are required' using errcode='22023';
  end if;
  insert into public.raye2_cleanup_jobs(requested_by,status,scope,preserve_chat_history,preserve_shared_memories,reason)
  values(auth.uid(),'preview',p_scope,p_preserve_chat_history,p_preserve_shared_memories,btrim(p_reason))
  returning id into v_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'cleanup_preview_created','cleanup_job',v_id::text,btrim(p_reason),
    jsonb_build_object('scope',p_scope,'preserve_chat_history',p_preserve_chat_history,
      'preserve_shared_memories',p_preserve_shared_memories));
  return v_id;
end;
$$;
revoke all on function public.raye2_create_cleanup_preview(jsonb,boolean,boolean,text) from public,anon;
grant execute on function public.raye2_create_cleanup_preview(jsonb,boolean,boolean,text) to authenticated;

create or replace function public.raye2_prevent_audit_mutation()
returns trigger language plpgsql set search_path=''
as $$
begin
  raise exception 'Raye2 audit records are append-only' using errcode='42501';
end;
$$;
revoke all on function public.raye2_prevent_audit_mutation() from public,anon,authenticated;
drop trigger if exists raye2_admin_audit_no_mutation on public.raye2_admin_audit_log;
create trigger raye2_admin_audit_no_mutation before update or delete on public.raye2_admin_audit_log
for each row execute function public.raye2_prevent_audit_mutation();

create or replace function public.raye2_touch_updated_at()
returns trigger language plpgsql set search_path=''
as $$ begin new.updated_at=now(); return new; end; $$;
revoke all on function public.raye2_touch_updated_at() from public,anon,authenticated;
drop trigger if exists raye2_groups_touch_updated_at on public.raye2_groups;
create trigger raye2_groups_touch_updated_at before update on public.raye2_groups for each row execute function public.raye2_touch_updated_at();
drop trigger if exists raye2_conversations_touch_updated_at on public.raye2_conversations;
create trigger raye2_conversations_touch_updated_at before update on public.raye2_conversations for each row execute function public.raye2_touch_updated_at();
drop trigger if exists raye2_memories_touch_updated_at on public.raye2_shared_memories;
create trigger raye2_memories_touch_updated_at before update on public.raye2_shared_memories for each row execute function public.raye2_touch_updated_at();

alter table public.raye2_groups enable row level security;
alter table public.raye2_conversations enable row level security;
alter table public.raye2_group_members enable row level security;
alter table public.raye2_conversation_members enable row level security;
alter table public.raye2_group_invites enable row level security;
alter table public.raye2_messages enable row level security;
alter table public.raye2_message_reactions enable row level security;
alter table public.raye2_message_bookmarks enable row level security;
alter table public.raye2_shared_memories enable row level security;
alter table public.raye2_platform_rules enable row level security;
alter table public.raye2_retention_policies enable row level security;
alter table public.raye2_cleanup_jobs enable row level security;
alter table public.raye2_admin_audit_log enable row level security;
alter table public.raye2_storage_usage enable row level security;

revoke all on public.raye2_groups,public.raye2_conversations,public.raye2_group_members,
 public.raye2_conversation_members,public.raye2_group_invites,public.raye2_messages,
 public.raye2_message_reactions,public.raye2_message_bookmarks,public.raye2_shared_memories,
 public.raye2_platform_rules,public.raye2_retention_policies,public.raye2_cleanup_jobs,
 public.raye2_admin_audit_log,public.raye2_storage_usage from anon,authenticated;

grant select on public.raye2_groups,public.raye2_group_members,public.raye2_conversations,
 public.raye2_conversation_members,public.raye2_messages,public.raye2_message_reactions,
 public.raye2_shared_memories to authenticated;
grant insert,update,delete on public.raye2_messages,public.raye2_message_reactions,
 public.raye2_shared_memories to authenticated;
grant select,delete on public.raye2_message_bookmarks to authenticated;
grant select on public.raye2_platform_rules,public.raye2_retention_policies,
 public.raye2_cleanup_jobs,public.raye2_admin_audit_log,public.raye2_storage_usage to authenticated;

create policy "Raye2 visible groups" on public.raye2_groups for select to authenticated
using (visibility='public' and status in ('active','read_only')
  or public.raye2_is_group_member(id) or public.raye2_is_platform_admin());
create or replace function public.raye2_guard_group_owner()
returns trigger language plpgsql set search_path=''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'group ownership cannot be changed through this operation' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_guard_group_owner() from public,anon,authenticated;
drop trigger if exists raye2_groups_guard_owner on public.raye2_groups;
create trigger raye2_groups_guard_owner before update on public.raye2_groups
for each row execute function public.raye2_guard_group_owner();

create policy "Raye2 group managers update groups" on public.raye2_groups for update to authenticated
using (public.raye2_is_group_manager(id))
with check (public.raye2_is_group_manager(id));

create policy "Raye2 group membership visible to members" on public.raye2_group_members for select to authenticated
using (user_id=(select auth.uid()) or public.raye2_is_group_member(group_id) or public.raye2_is_group_manager(group_id));
create policy "Raye2 group managers manage membership" on public.raye2_group_members for update to authenticated
using (public.raye2_is_group_manager(group_id))
with check (public.raye2_is_group_manager(group_id));
create policy "Raye2 users leave groups" on public.raye2_group_members for delete to authenticated
using (user_id=(select auth.uid()) and role<>'owner');

create policy "Raye2 conversation members read conversations" on public.raye2_conversations for select to authenticated
using (public.raye2_is_conversation_member(id) or public.raye2_is_platform_admin());
create policy "Raye2 conversation members read roster" on public.raye2_conversation_members for select to authenticated
using (user_id=(select auth.uid()) or public.raye2_is_conversation_member(conversation_id));
create policy "Raye2 conversation members read messages" on public.raye2_messages for select to authenticated
using (public.raye2_is_conversation_member(conversation_id) and deleted_at is null
  and (expires_at is null or expires_at>now()));
create policy "Raye2 members send messages" on public.raye2_messages for insert to authenticated
with check (
  sender_id=(select auth.uid())
  and public.raye2_is_conversation_member(conversation_id)
  and exists(select 1 from public.raye2_conversations c where c.id=conversation_id and c.status='active'
    and (c.group_id is null or exists(select 1 from public.raye2_groups g where g.id=c.group_id and g.status='active')))
);
create or replace function public.raye2_guard_message_update()
returns trigger language plpgsql set search_path=''
as $$
begin
  if old.sender_id is distinct from (select auth.uid())
    or new.sender_id is distinct from old.sender_id
    or new.conversation_id is distinct from old.conversation_id
    or new.created_at is distinct from old.created_at then
    raise exception 'message identity and conversation are immutable' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_guard_message_update() from public,anon,authenticated;
drop trigger if exists raye2_messages_guard_update on public.raye2_messages;
create trigger raye2_messages_guard_update before update on public.raye2_messages
for each row execute function public.raye2_guard_message_update();

create policy "Raye2 authors edit messages" on public.raye2_messages for update to authenticated
using (sender_id=(select auth.uid()) and deleted_at is null and created_at>now()-interval '15 minutes')
with check (sender_id=(select auth.uid()) and public.raye2_is_conversation_member(conversation_id)
  and created_at>now()-interval '15 minutes');
create policy "Raye2 authors delete messages" on public.raye2_messages for delete to authenticated
using (sender_id=(select auth.uid()));

create policy "Raye2 reactions visible to conversation members" on public.raye2_message_reactions for select to authenticated
using (exists(select 1 from public.raye2_messages m where m.id=message_id and public.raye2_is_conversation_member(m.conversation_id)));
create policy "Raye2 members add own reactions" on public.raye2_message_reactions for insert to authenticated
with check (user_id=(select auth.uid()) and exists(select 1 from public.raye2_messages m where m.id=message_id and public.raye2_is_conversation_member(m.conversation_id)));
create policy "Raye2 members remove own reactions" on public.raye2_message_reactions for delete to authenticated
using (user_id=(select auth.uid()));

create policy "Raye2 members read personal bookmarks" on public.raye2_message_bookmarks for select to authenticated
using (user_id=(select auth.uid()));
create policy "Raye2 members delete personal bookmarks" on public.raye2_message_bookmarks for delete to authenticated
using (user_id=(select auth.uid()));

create or replace function public.raye2_bookmark_message(p_message_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_snapshot jsonb;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select jsonb_build_object(
    'body',m.body,'sender_id',m.sender_id,'created_at',m.created_at
  ) into v_snapshot
  from public.raye2_messages m
  where m.id=p_message_id and m.deleted_at is null
    and (m.expires_at is null or m.expires_at>now())
    and public.raye2_is_conversation_member(m.conversation_id);
  if not found then raise exception 'message is unavailable' using errcode='P0002'; end if;
  insert into public.raye2_message_bookmarks(message_id,user_id,saved_content)
  values(p_message_id,auth.uid(),v_snapshot)
  on conflict(message_id,user_id) where message_id is not null
  do update set saved_content=excluded.saved_content;
end;
$$;
revoke all on function public.raye2_bookmark_message(uuid) from public,anon;
grant execute on function public.raye2_bookmark_message(uuid) to authenticated;

create policy "Raye2 group members read shared memories" on public.raye2_shared_memories for select to authenticated
using (created_by=(select auth.uid()) or (group_id is not null and public.raye2_is_group_member(group_id)));
create policy "Raye2 members contribute memories" on public.raye2_shared_memories for insert to authenticated
with check (created_by=(select auth.uid()) and public.raye2_is_group_member(group_id));
create policy "Raye2 contributors edit memories" on public.raye2_shared_memories for update to authenticated
using (created_by=(select auth.uid()) or public.raye2_is_group_manager(group_id))
with check (
  (group_id is not null and public.raye2_is_group_member(group_id) and
    (created_by=(select auth.uid()) or public.raye2_is_group_manager(group_id)))
  or (group_id is null and created_by=(select auth.uid()) and retention_mode='preserved')
);
create policy "Raye2 contributors delete memories" on public.raye2_shared_memories for delete to authenticated
using (created_by=(select auth.uid()) or public.raye2_is_group_manager(group_id));

create policy "Raye2 platform admins read rules" on public.raye2_platform_rules for select to authenticated
using (public.raye2_is_platform_admin());
create policy "Raye2 platform admins read retention" on public.raye2_retention_policies for select to authenticated
using (public.raye2_is_platform_admin());
create policy "Raye2 platform admins read cleanup jobs" on public.raye2_cleanup_jobs for select to authenticated
using (public.raye2_is_platform_admin());
create policy "Raye2 platform admins read audit log" on public.raye2_admin_audit_log for select to authenticated
using (public.raye2_is_platform_admin());
create policy "Raye2 platform admins read storage usage" on public.raye2_storage_usage for select to authenticated
using (public.raye2_is_platform_admin());

-- Only guarded RPCs can create groups, conversations, memberships, invites or cleanup requests.
revoke insert,update,delete on public.raye2_groups,public.raye2_conversations,public.raye2_group_members,
 public.raye2_conversation_members,public.raye2_group_invites,public.raye2_cleanup_jobs,
 public.raye2_platform_rules,public.raye2_retention_policies,public.raye2_admin_audit_log,
 public.raye2_storage_usage from anon,authenticated;
revoke update,delete on public.raye2_admin_audit_log from anon,authenticated;

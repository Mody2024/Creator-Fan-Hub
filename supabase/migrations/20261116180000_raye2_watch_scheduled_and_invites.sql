-- Raye2 Wave 7: Watch Together scheduled sessions and private invitation links.
--
-- Plan 4 lists two remaining Watch Together items: "Private invitation links and scheduled sessions". The
-- synchronization core, queue, voting, host moderation, control requests, reactions and presence already exist,
-- but:
--   * a session could only be created to start immediately, with no future start time and no discovery of an
--     upcoming session before it begins;
--   * a private session could only be joined by conversation/group members or an explicit invitee row, with no
--     shareable token link, and the token link was not recorded in the audit log.
-- This migration adds scheduled starts and owner-managed private invitation links. Additive; `main` unchanged.

-- 1. Optional scheduled start. NULL keeps today's behaviour (the session starts as soon as it is created).
alter table public.raye2_watch_sessions
  add column if not exists scheduled_for timestamptz;
do $$
begin
  if not exists (select 1 from pg_constraint where conname='raye2_watch_sessions_scheduled_check') then
    alter table public.raye2_watch_sessions
      add constraint raye2_watch_sessions_scheduled_check
      check (scheduled_for is null or (scheduled_for > created_at - interval '1 minute' and scheduled_for < created_at + interval '90 days'));
  end if;
end;
$$;
create index if not exists raye2_watch_sessions_scheduled_idx
  on public.raye2_watch_sessions(status,scheduled_for) where scheduled_for is not null;

-- The single source of truth for "has this session started?". A future scheduled session is not yet joinable and
-- not yet in the active-session list, but it remains visible to members so they can see it is coming up.
create or replace function public.raye2_watch_session_started(p_session_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.raye2_watch_sessions s
    where s.id=p_session_id and s.status='active'
      and (s.scheduled_for is null or s.scheduled_for<=now())
      and s.expires_at>now()
  );
$$;
revoke all on function public.raye2_watch_session_started(uuid) from public,anon;
grant execute on function public.raye2_watch_session_started(uuid) to authenticated;

-- 2. Private invitation links: same token-hash model as group invites. The plaintext token is only ever known to
--    the creator (returned to the caller) and the invitee (in the URL); the database stores only its sha256.
create table if not exists public.raye2_watch_session_invites (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.raye2_watch_sessions(id) on delete cascade,
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
create index if not exists raye2_watch_session_invites_session_idx
  on public.raye2_watch_session_invites(session_id,expires_at desc);

alter table public.raye2_watch_session_invites enable row level security;
revoke all on public.raye2_watch_session_invites from anon,authenticated;
grant select on public.raye2_watch_session_invites to authenticated;
create policy "Raye2 watch session invites visible to session members"
  on public.raye2_watch_session_invites for select to authenticated
  using (public.raye2_can_access_watch_session(session_id));

-- 3. Host/moderator creates a private invitation link for a session. Mirrors raye2_create_group_invite: the token
--    must be high-entropy, the expiry is bounded to 90 days and creation is recorded in the audit log.
create or replace function public.raye2_create_watch_session_invite(
  p_session_id uuid,p_token text,p_expires_at timestamptz,p_max_uses integer default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  v_role:=public.raye2_watch_role(p_session_id);
  if v_role is null or v_role not in ('host','moderator') then
    raise exception 'watch host control permission required' using errcode='42501';
  end if;
  if p_token is null or length(p_token)<32 or length(p_token)>256 then
    raise exception 'invalid invite token' using errcode='22023';
  end if;
  if p_expires_at is null or p_expires_at<=now() or p_expires_at>now()+interval '90 days' then
    raise exception 'invite expiry must be within 90 days' using errcode='22023';
  end if;
  if p_max_uses is not null and p_max_uses not between 1 and 10000 then
    raise exception 'invalid invite use limit' using errcode='22023';
  end if;
  insert into public.raye2_watch_session_invites(session_id,token_hash,created_by,expires_at,max_uses)
    values(p_session_id,encode(extensions.digest(p_token,'sha256'),'hex'),auth.uid(),p_expires_at,p_max_uses)
    returning id into v_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values(auth.uid(),'watch_invite_created','watch_invite',v_id::text,'Watch invite created',
      jsonb_build_object('session_id',p_session_id,'expires_at',p_expires_at,'max_uses',p_max_uses));
  return v_id;
end;
$$;
revoke all on function public.raye2_create_watch_session_invite(uuid,text,timestamptz,integer) from public,anon;
grant execute on function public.raye2_create_watch_session_invite(uuid,text,timestamptz,integer) to authenticated;

-- 4. Host/moderator revokes an invitation link so it can no longer be redeemed.
create or replace function public.raye2_revoke_watch_session_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_session uuid;v_role text;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  select i.session_id into v_session from public.raye2_watch_session_invites i where i.id=p_invite_id;
  if v_session is null then raise exception 'invite unavailable' using errcode='P0002'; end if;
  v_role:=public.raye2_watch_role(v_session);
  if v_role is null or v_role not in ('host','moderator') then
    raise exception 'watch host control permission required' using errcode='42501';
  end if;
  update public.raye2_watch_session_invites set revoked_at=coalesce(revoked_at,now()) where id=p_invite_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
    values(auth.uid(),'watch_invite_revoked','watch_invite',p_invite_id::text,'Watch invite revoked',
      jsonb_build_object('session_id',v_session));
end;
$$;
revoke all on function public.raye2_revoke_watch_session_invite(uuid) from public,anon;
grant execute on function public.raye2_revoke_watch_session_invite(uuid) to authenticated;

-- 5. Redeem an invitation link. The caller is added as a joined participant (or re-joined if they had left). The
--    redemption is atomic against the use counter and the expiry window, and refuses a full session.
create or replace function public.raye2_join_watch_session_invite(p_token text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_invite public.raye2_watch_session_invites%rowtype;
  v_session public.raye2_watch_sessions%rowtype;
  v_count integer;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_token is null or length(p_token)<32 or length(p_token)>256 then
    raise exception 'invalid invite token' using errcode='22023';
  end if;
  select * into v_invite from public.raye2_watch_session_invites i
    where i.token_hash=encode(extensions.digest(p_token,'sha256'),'hex') for update;
  if not found then raise exception 'invite unavailable' using errcode='P0002'; end if;
  if v_invite.revoked_at is not null or v_invite.expires_at<=now() then
    raise exception 'invite expired or revoked' using errcode='42501';
  end if;
  if v_invite.max_uses is not null and v_invite.uses>=v_invite.max_uses then
    raise exception 'invite usage limit reached' using errcode='54000';
  end if;
  select * into v_session from public.raye2_watch_sessions s
    where s.id=v_invite.session_id and s.status='active' and s.expires_at>now() for update;
  if not found then raise exception 'watch session unavailable' using errcode='P0002'; end if;
  if not public.raye2_watch_session_started(v_session.id) then
    raise exception 'this watch session has not started yet' using errcode='55000';
  end if;
  select count(*) into v_count from public.raye2_watch_participants p
    where p.session_id=v_session.id and p.status='joined' and p.user_id<>auth.uid();
  if v_count>=v_session.max_participants then raise exception 'watch session is full' using errcode='54000'; end if;
  update public.raye2_watch_session_invites set uses=uses+1 where id=v_invite.id;
  insert into public.raye2_watch_participants(session_id,user_id,role,status,joined_at,last_seen_at)
    values(v_session.id,auth.uid(),'participant','joined',now(),now())
    on conflict(session_id,user_id) do update set status='joined',joined_at=now(),last_seen_at=now();
  return v_session.id;
end;
$$;
revoke all on function public.raye2_join_watch_session_invite(text) from public,anon;
grant execute on function public.raye2_join_watch_session_invite(text) to authenticated;

-- 6. Re-create session creation with an optional scheduled start and a public/private invitation requirement.
--    The parameter list gains p_scheduled_for; the previous signature is dropped so the client always calls one.
drop function if exists public.raye2_create_watch_session(uuid,text,text,text,uuid,text,integer);
create or replace function public.raye2_create_watch_session(
  p_conversation_id uuid,p_title text,p_visibility text,
  p_source_kind text,p_source_media_id uuid,p_external_url text,
  p_max_participants integer default null,p_scheduled_for timestamptz default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare
  v_conversation public.raye2_conversations%rowtype;
  v_group public.raye2_groups%rowtype;
  v_session uuid;
  v_item uuid;
  v_enabled boolean:=false;
  v_public_enabled boolean:=false;
  v_max integer:=10;
  v_duration integer:=10800;
  v_title text:=coalesce(nullif(btrim(p_title),''),'Watch Together');
  v_start timestamptz:=p_scheduled_for;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_visibility not in ('private','public') or char_length(v_title)>100 then
    raise exception 'invalid watch session settings' using errcode='22023';
  end if;
  if v_start is not null and (v_start<=now() or v_start>now()+interval '90 days') then
    raise exception 'scheduled start must be within 90 days' using errcode='22023';
  end if;
  select * into v_conversation from public.raye2_conversations c
    where c.id=p_conversation_id and c.status='active';
  if not found or not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'active conversation membership required' using errcode='42501';
  end if;
  if v_conversation.group_id is not null then
    select * into v_group from public.raye2_groups g
      where g.id=v_conversation.group_id and g.status='active';
    if not found then raise exception 'active group required' using errcode='42501'; end if;
  elsif p_visibility='public' then
    raise exception 'direct-conversation watch sessions must be private' using errcode='22023';
  end if;
  if p_visibility='public' and v_group.visibility<>'public' then
    raise exception 'public watch sessions require a public group' using errcode='42501';
  end if;
  select coalesce((r.rule_value #>> '{}')::boolean,false) into v_enabled
    from public.raye2_platform_rules r where r.rule_key='watch.enabled' and r.status='active';
  if not coalesce(v_enabled,false) then raise exception 'Watch Together is not enabled by the platform owner' using errcode='42501'; end if;
  if p_visibility='public' then
    select coalesce((r.rule_value #>> '{}')::boolean,false) into v_public_enabled
      from public.raye2_platform_rules r where r.rule_key='watch.public_sessions.enabled' and r.status='active';
    if not coalesce(v_public_enabled,false) then raise exception 'public watch sessions are disabled' using errcode='42501'; end if;
  end if;
  if not public.raye2_validate_watch_source(p_source_kind,p_source_media_id,p_external_url) then
    raise exception 'video source is not eligible for Watch Together' using errcode='22023';
  end if;
  select (r.rule_value #>> '{}')::integer into v_max from public.raye2_platform_rules r
    where r.rule_key='watch.max_participants' and r.status='active';
  select (r.rule_value #>> '{}')::integer into v_duration from public.raye2_platform_rules r
    where r.rule_key='watch.session.max_duration_seconds' and r.status='active';
  v_max:=greatest(2,least(coalesce(p_max_participants,v_max,10),coalesce(v_max,10),50));
  v_duration:=greatest(300,least(coalesce(v_duration,10800),43200));
  insert into public.raye2_watch_sessions(conversation_id,group_id,created_by,title,visibility,max_participants,expires_at,scheduled_for)
    values(p_conversation_id,v_conversation.group_id,auth.uid(),v_title,p_visibility,v_max,
      coalesce(v_start,now())+make_interval(secs=>v_duration),v_start)
    returning id into v_session;
  insert into public.raye2_watch_participants(session_id,user_id,role,status,joined_at,last_seen_at)
    values(v_session,auth.uid(),'host','joined',now(),now());
  insert into public.raye2_watch_queue(session_id,source_kind,source_media_id,external_url,title,added_by,sort_order,status)
    values(v_session,p_source_kind,p_source_media_id,p_external_url,v_title,auth.uid(),0,'playing')
    returning id into v_item;
  update public.raye2_watch_sessions set current_queue_item_id=v_item where id=v_session;
  return v_session;
end;
$$;
revoke all on function public.raye2_create_watch_session(uuid,text,text,text,uuid,text,integer,timestamptz) from public,anon;
grant execute on function public.raye2_create_watch_session(uuid,text,text,text,uuid,text,integer,timestamptz) to authenticated;

-- 7. Guard joining so a not-yet-started scheduled session cannot be entered early. The account-restriction check
--    from the restriction-enforcement migration is preserved; invitation links are redeemed through the dedicated
--    RPC above rather than by joining directly.
create or replace function public.raye2_join_watch_session_guarded(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if public.raye2_has_active_restriction(auth.uid(), 'watch') then
    raise exception 'your account is restricted from watch together' using errcode='42501';
  end if;
  if not public.raye2_watch_session_started(p_session_id) then
    raise exception 'this watch session has not started yet' using errcode='55000';
  end if;
  perform public.raye2_join_watch_session(p_session_id);
end;
$$;
revoke all on function public.raye2_join_watch_session_guarded(uuid) from public,anon;
grant execute on function public.raye2_join_watch_session_guarded(uuid) to authenticated;

-- 8. Deliver invitation changes to the session room so an open panel reflects a revocation immediately.
do $$
begin
  if exists (select 1 from pg_publication where pubname='supabase_realtime' and not puballtables) then
    if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime'
      and schemaname='public' and tablename='raye2_watch_session_invites') then
      execute 'alter publication supabase_realtime add table public.raye2_watch_session_invites';
    end if;
  end if;
end;
$$;

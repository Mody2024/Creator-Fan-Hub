-- Raye2 Wave 8: enforce rules-engine quotas, cooldowns and caps.
--
-- Plan 10.1 requires roles, quotas, cooldowns and caps to be enforced, not just configured. The
-- rules engine stores the limits but several are not applied: group creation, group membership and
-- group chat message length are unrestricted, and new direct conversations have no daily cap.
-- Voice and Watch Together already read their rules; this migration closes the remaining gaps.

-- 1. A single guarded reader so callers never parse jsonb by hand.
create or replace function public.raye2_rule_int(p_key text, p_default integer)
returns integer language sql stable security definer set search_path=''
as $$
  select coalesce(
    (select nullif(r.rule_value #>> '{}', '')::integer
       from public.raye2_platform_rules r
      where r.rule_key = p_key and r.status = 'active'),
    p_default);
$$;
revoke all on function public.raye2_rule_int(text,integer) from public, anon;
grant execute on function public.raye2_rule_int(text,integer) to authenticated;

-- 2. Activate the existing caps so they take effect; they were only proposed.
update public.raye2_platform_rules set status = 'active', updated_at = now()
 where rule_key in ('groups.created.normal_user.monthly','groups.members.default','chat.message.max_characters','chat.dm.new_conversations.daily')
   and status = 'proposed';

-- 3. Group creation is capped per rolling 30 days.
create or replace function public.raye2_create_group(
  p_name text,p_slug text,p_visibility text default 'private',p_description text default ''
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_group uuid;v_conversation uuid;v_slug text;v_limit integer;v_count integer;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if char_length(btrim(p_name)) not between 2 and 80 then raise exception 'group name must be 2-80 characters' using errcode='22023'; end if;
  v_slug=lower(btrim(p_slug));
  if v_slug !~ '^[a-z0-9][a-z0-9-]{1,59}$' then raise exception 'invalid group slug' using errcode='22023'; end if;
  if p_visibility not in ('public','private') then raise exception 'invalid group visibility' using errcode='22023'; end if;
  v_limit := public.raye2_rule_int('groups.created.normal_user.monthly', 5);
  select count(*) into v_count from public.raye2_groups
   where owner_id = auth.uid() and created_at > now() - interval '30 days';
  if v_count >= v_limit then raise exception 'monthly group creation limit reached' using errcode='42501'; end if;
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

-- 4. Group membership respects the member cap. New joins fail once the group is full; existing
--    members may still re-activate and no new membership row is created at the cap.
create or replace function public.raye2_enforce_group_member_limit()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_limit integer; v_count integer; v_existing text;
begin
  select status into v_existing from public.raye2_group_members
   where group_id = new.group_id and user_id = new.user_id;
  if v_existing is not null then
    return new;
  end if;
  v_limit := public.raye2_rule_int('groups.members.default', 50);
  select count(*) into v_count from public.raye2_group_members
   where group_id = new.group_id and status = 'active';
  if v_count >= v_limit then
    raise exception 'group member limit reached' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_enforce_group_member_limit() from public,anon,authenticated;
drop trigger if exists raye2_group_members_limit on public.raye2_group_members;
create trigger raye2_group_members_limit before insert on public.raye2_group_members
for each row execute function public.raye2_enforce_group_member_limit();

-- 5. Group chat messages respect the configured character cap. Direct messages keep the column
--    limit so a later rule change cannot break one-to-one chat.
create or replace function public.raye2_enforce_message_length()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_limit integer; v_group uuid; v_type text;
begin
  select c.conversation_type, c.group_id into v_type, v_group
   from public.raye2_conversations c where c.id = new.conversation_id;
  if v_type = 'group' then
    v_limit := public.raye2_rule_int('chat.message.max_characters', 5000);
    if char_length(new.body) > v_limit then
      raise exception 'message exceeds the group character limit' using errcode='22023';
    end if;
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_enforce_message_length() from public,anon,authenticated;
drop trigger if exists raye2_messages_length on public.raye2_messages;
create trigger raye2_messages_length before insert on public.raye2_messages
for each row execute function public.raye2_enforce_message_length();

-- 6. New direct conversations are capped per rolling 24 hours. The current flow creates a message
--    request first; the cap applies when a brand new request is about to be created.
create or replace function public.raye2_create_direct_conversation(p_other_user uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_request_id uuid; v_a text; v_b text; v_allow boolean; v_limit integer; v_count integer;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_other_user is null or p_other_user=auth.uid() then raise exception 'choose another account' using errcode='22023'; end if;
  if not exists(select 1 from auth.users where id=p_other_user) then raise exception 'account not found' using errcode='P0002'; end if;
  if exists(select 1 from public.member_blocks b where
    (b.blocker_id=auth.uid() and b.blocked_id=p_other_user) or
    (b.blocker_id=p_other_user and b.blocked_id=auth.uid())) then
    raise exception 'conversation is unavailable' using errcode='42501';
  end if;
  v_a=least(auth.uid()::text,p_other_user::text); v_b=greatest(auth.uid()::text,p_other_user::text);
  perform pg_advisory_xact_lock(hashtextextended(v_a||':'||v_b,0));
  select c.id into v_id from public.raye2_conversations c
    join public.raye2_conversation_members a on a.conversation_id=c.id and a.user_id=auth.uid()
    join public.raye2_conversation_members b on b.conversation_id=c.id and b.user_id=p_other_user
    where c.conversation_type='direct' and c.status='active'
      and (select count(*) from public.raye2_conversation_members x where x.conversation_id=c.id)=2
    limit 1;
  if v_id is not null then return jsonb_build_object('status','conversation','conversation_id',v_id); end if;
  select id into v_request_id from public.raye2_message_requests
    where sender_id=p_other_user and recipient_id=auth.uid() and status='pending' limit 1;
  if v_request_id is not null then return jsonb_build_object('status','incoming_request','request_id',v_request_id); end if;
  select allow_message_requests into v_allow from public.raye2_contact_preferences where user_id=p_other_user;
  if coalesce(v_allow,true)=false then raise exception 'account is not accepting new message requests' using errcode='42501'; end if;
  select id into v_request_id from public.raye2_message_requests
    where sender_id=auth.uid() and recipient_id=p_other_user and status='pending' limit 1;
  if v_request_id is null then
    v_limit := public.raye2_rule_int('chat.dm.new_conversations.daily', 100);
    select count(*) into v_count from public.raye2_message_requests
      where sender_id=auth.uid() and created_at > now() - interval '24 hours';
    if v_count >= v_limit then raise exception 'daily new conversation limit reached' using errcode='42501'; end if;
    insert into public.raye2_message_requests(sender_id,recipient_id)
    values(auth.uid(),p_other_user) returning id into v_request_id;
  end if;
  return jsonb_build_object('status','request_sent','request_id',v_request_id);
end;
$$;
revoke all on function public.raye2_create_direct_conversation(uuid) from public,anon;
grant execute on function public.raye2_create_direct_conversation(uuid) to authenticated;

-- 7. Visibility surface: which rules are active, readable by any signed-in member.
create or replace function public.raye2_list_active_rules()
returns table (rule_key text, category text, rule_value jsonb, description text)
language sql stable security definer set search_path=''
as $$
  select r.rule_key, r.category, r.rule_value, r.description
  from public.raye2_platform_rules r
  where r.status = 'active'
  order by r.category asc, r.rule_key asc;
$$;
revoke all on function public.raye2_list_active_rules() from public, anon;
grant execute on function public.raye2_list_active_rules() to authenticated;

notify pgrst, 'reload schema';

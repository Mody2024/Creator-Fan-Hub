-- Raye2 Wave 8: moderation actions, enforcement and appeals.
--
-- Plan 10.3 requires warning, timeout, rate reduction, feature restriction, suspension, ban and
-- appeal/review, with every admin action auditable and appropriately permissioned. Only report
-- resolution existed; there was no way to act on an account and no appeal path.

-- 1. Account restrictions applied by moderators.
create table if not exists public.raye2_member_restrictions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action in ('warning','timeout','rate_reduction','feature_restriction','suspension','ban')),
  feature text check (feature in ('comment','post','message','voice','watch')),
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  issued_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','lifted','expired')),
  lifted_by uuid references auth.users(id) on delete set null,
  lifted_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists raye2_member_restrictions_user_idx on public.raye2_member_restrictions(user_id,status);
create index if not exists raye2_member_restrictions_active_idx on public.raye2_member_restrictions(action,status,expires_at);
alter table public.raye2_member_restrictions enable row level security;
revoke all on public.raye2_member_restrictions from anon,authenticated;

-- 2. Appeals against a restriction.
create table if not exists public.raye2_moderation_appeals (
  id uuid primary key default gen_random_uuid(),
  restriction_id uuid not null references public.raye2_member_restrictions(id) on delete cascade,
  appellant_id uuid not null references auth.users(id) on delete cascade,
  message text not null check (char_length(btrim(message)) between 10 and 1000),
  status text not null default 'open' check (status in ('open','granted','denied')),
  reviewed_by uuid references auth.users(id) on delete set null,
  review_note text not null default '' check (char_length(review_note) <= 500),
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists raye2_moderation_appeals_status_idx on public.raye2_moderation_appeals(status,created_at);
alter table public.raye2_moderation_appeals enable row level security;
revoke all on public.raye2_moderation_appeals from anon,authenticated;

-- 3. Effective-restriction helper. Expired rows are treated as inactive without a write.
create or replace function public.raye2_has_active_restriction(p_user_id uuid, p_feature text default null)
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.raye2_member_restrictions r
    where r.user_id = p_user_id and r.status = 'active'
      and (r.expires_at is null or r.expires_at > now())
      and (
        r.action in ('suspension','ban')
        or (p_feature is not null and (r.feature is null or r.feature = p_feature))
      )
  );
$$;
revoke all on function public.raye2_has_active_restriction(uuid,text) from public,anon;
grant execute on function public.raye2_has_active_restriction(uuid,text) to authenticated;

-- 4. Apply a restriction. Moderators and platform admins only.
create or replace function public.raye2_apply_member_restriction(
  p_user_id uuid,
  p_action text,
  p_feature text,
  p_reason text,
  p_expires_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode='42501';
  end if;
  if p_action not in ('warning','timeout','rate_reduction','feature_restriction','suspension','ban') then
    raise exception 'invalid moderation action' using errcode='22023';
  end if;
  if p_feature is not null and p_feature not in ('comment','post','message','voice','watch') then
    raise exception 'invalid feature' using errcode='22023';
  end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  if p_action in ('timeout','feature_restriction','suspension') and (p_expires_at is null or p_expires_at <= now()) then
    raise exception 'this action requires a future expiry' using errcode='22023';
  end if;
  if p_action = 'feature_restriction' and p_feature is null then
    raise exception 'a feature is required for a feature restriction' using errcode='22023';
  end if;
  if not exists(select 1 from auth.users u where u.id = p_user_id) then raise exception 'account not found' using errcode='P0002'; end if;
  if exists(select 1 from public.creator_admins a where a.user_id = p_user_id and a.active = true and a.role in ('owner','admin'))
    and not public.raye2_is_platform_admin() then
    raise exception 'cannot restrict a platform administrator' using errcode='42501';
  end if;
  insert into public.raye2_member_restrictions(user_id,action,feature,reason,issued_by,expires_at)
  values(p_user_id,p_action,p_feature,v_reason,auth.uid(),p_expires_at)
  returning id into v_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'moderation_'||p_action,'member',p_user_id::text,v_reason,
    jsonb_build_object('restriction_id',v_id,'feature',p_feature,'expires_at',p_expires_at));
  return v_id;
end;
$$;
revoke all on function public.raye2_apply_member_restriction(uuid,text,text,text,timestamptz) from public,anon;
grant execute on function public.raye2_apply_member_restriction(uuid,text,text,text,timestamptz) to authenticated;

-- 5. Lift a restriction. Moderators and platform admins only.
create or replace function public.raye2_lift_member_restriction(p_restriction_id uuid, p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user uuid; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode='42501';
  end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  select user_id into v_user from public.raye2_member_restrictions where id = p_restriction_id and status = 'active';
  if v_user is null then raise exception 'active restriction not found' using errcode='P0002'; end if;
  update public.raye2_member_restrictions set status = 'lifted', lifted_by = auth.uid(), lifted_at = now()
   where id = p_restriction_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'moderation_lifted','member',v_user::text,v_reason,jsonb_build_object('restriction_id',p_restriction_id));
end;
$$;
revoke all on function public.raye2_lift_member_restriction(uuid,text) from public,anon;
grant execute on function public.raye2_lift_member_restriction(uuid,text) to authenticated;

-- 6. Active restriction list for the moderation workspace.
create or replace function public.raye2_list_active_restrictions(p_limit integer default 40)
returns table (restriction_id uuid, user_id uuid, handle text, action text, feature text, reason text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode='42501';
  end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit,40),1),100) as lim)
    select r.id, r.user_id, mp.handle, r.action, r.feature, r.reason, r.expires_at, r.created_at
    from public.raye2_member_restrictions r
    cross join bounded b
    left join public.member_profiles mp on mp.user_id = r.user_id
    where r.status = 'active' and (r.expires_at is null or r.expires_at > now())
    order by r.created_at desc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_list_active_restrictions(integer) from public,anon;
grant execute on function public.raye2_list_active_restrictions(integer) to authenticated;

-- 7. Enforcement: a restricted member cannot post, comment or send messages.
create or replace function public.raye2_enforce_restrictions()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_feature text;
begin
  v_feature := case tg_table_name
    when 'community_posts' then 'post'
    when 'community_comments' then 'comment'
    when 'raye2_messages' then 'message'
    else null end;
  if v_feature is not null and public.raye2_has_active_restriction(new.author_id, v_feature) then
    raise exception 'your account is restricted from this action' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_enforce_restrictions() from public,anon,authenticated;
drop trigger if exists raye2_posts_restriction_guard on public.community_posts;
create trigger raye2_posts_restriction_guard before insert on public.community_posts
for each row execute function public.raye2_enforce_restrictions();
drop trigger if exists raye2_comments_restriction_guard on public.community_comments;
create trigger raye2_comments_restriction_guard before insert on public.community_comments
for each row execute function public.raye2_enforce_restrictions();
drop trigger if exists raye2_messages_restriction_guard on public.raye2_messages;
create trigger raye2_messages_restriction_guard before insert on public.raye2_messages
for each row execute function public.raye2_enforce_restrictions();

-- 8. A member may appeal their own restriction.
create or replace function public.raye2_submit_moderation_appeal(p_restriction_id uuid, p_message text)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_owner uuid; v_msg text := btrim(coalesce(p_message,''));
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if char_length(v_msg) not between 10 and 1000 then raise exception 'appeal message must be 10-1000 characters' using errcode='22023'; end if;
  select user_id into v_owner from public.raye2_member_restrictions where id = p_restriction_id and status = 'active';
  if v_owner is null then raise exception 'active restriction not found' using errcode='P0002'; end if;
  if v_owner <> auth.uid() then raise exception 'you can only appeal your own restriction' using errcode='42501'; end if;
  if exists(select 1 from public.raye2_moderation_appeals where restriction_id = p_restriction_id and status = 'open') then
    raise exception 'an appeal is already open for this restriction' using errcode='23505';
  end if;
  insert into public.raye2_moderation_appeals(restriction_id,appellant_id,message)
  values(p_restriction_id,auth.uid(),v_msg) returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.raye2_submit_moderation_appeal(uuid,text) from public,anon;
grant execute on function public.raye2_submit_moderation_appeal(uuid,text) to authenticated;

-- 9. Appeal queue for moderators.
create or replace function public.raye2_get_appeal_queue(p_limit integer default 40, p_status text default 'open')
returns table (appeal_id uuid, restriction_id uuid, appellant_id uuid, handle text, message text, restriction_action text, status text, created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode='42501';
  end if;
  if p_status not in ('open','granted','denied') then raise exception 'invalid status' using errcode='22023'; end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit,40),1),100) as lim)
    select a.id, a.restriction_id, a.appellant_id, mp.handle, a.message, r.action, a.status, a.created_at
    from public.raye2_moderation_appeals a
    cross join bounded b
    join public.raye2_member_restrictions r on r.id = a.restriction_id
    left join public.member_profiles mp on mp.user_id = a.appellant_id
    where a.status = p_status
    order by a.created_at asc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_get_appeal_queue(integer,text) from public,anon;
grant execute on function public.raye2_get_appeal_queue(integer,text) to authenticated;

-- 10. Review an appeal. Granting lifts the underlying restriction.
create or replace function public.raye2_review_moderation_appeal(p_appeal_id uuid, p_decision text, p_note text default '')
returns void language plpgsql security definer set search_path=''
as $$
declare v_appeal public.raye2_moderation_appeals%rowtype; v_note text := btrim(coalesce(p_note,''));
begin
  if not (private.can_moderate_community() or public.raye2_is_platform_admin()) then
    raise exception 'moderator access required' using errcode='42501';
  end if;
  if p_decision not in ('granted','denied') then raise exception 'invalid decision' using errcode='22023'; end if;
  if char_length(v_note) > 500 then raise exception 'note too long' using errcode='22023'; end if;
  select * into v_appeal from public.raye2_moderation_appeals where id = p_appeal_id for update;
  if not found or v_appeal.status <> 'open' then raise exception 'appeal unavailable' using errcode='P0002'; end if;
  update public.raye2_moderation_appeals set status = p_decision, reviewed_by = auth.uid(), review_note = v_note, reviewed_at = now()
   where id = p_appeal_id;
  if p_decision = 'granted' then
    update public.raye2_member_restrictions set status = 'lifted', lifted_by = auth.uid(), lifted_at = now()
     where id = v_appeal.restriction_id and status = 'active';
  end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'appeal_'||p_decision,'moderation_appeal',p_appeal_id::text,v_note,
    jsonb_build_object('restriction_id',v_appeal.restriction_id,'appellant_id',v_appeal.appellant_id));
end;
$$;
revoke all on function public.raye2_review_moderation_appeal(uuid,text,text) from public,anon;
grant execute on function public.raye2_review_moderation_appeal(uuid,text,text) to authenticated;

notify pgrst, 'reload schema';

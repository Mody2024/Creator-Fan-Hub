-- Raye2 Wave 2: temporary role grants, account-specific overrides and audit.
--
-- Plan 2.2 requires temporary role grants with expiry dates, account-specific overrides and a complete
-- audit trail. Role changes were permanent (creator_admins had no expiry) and there was no way to grant a
-- specific account an extra capability, so any elevated access had to be made permanent.

-- 1. Temporary role grants: creator_admins gains an optional expiry. Existing rows stay permanent.
alter table public.creator_admins add column if not exists expires_at timestamptz;
alter table public.creator_admins add column if not exists granted_by uuid references auth.users(id) on delete set null;
alter table public.creator_admins add column if not exists reason text not null default '';

-- Role checks now honour expiry, so a temporary grant loses access automatically without a write.
create or replace function public.has_creator_role(p_roles text[])
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.creator_admins a
    where a.user_id = (select auth.uid())
      and a.active = true
      and a.role = any(p_roles)
      and (a.expires_at is null or a.expires_at > now())
  );
$$;
revoke all on function public.has_creator_role(text[]) from public;
grant execute on function public.has_creator_role(text[]) to authenticated;

create or replace function public.is_creator_owner()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.creator_admins a
    where a.user_id = (select auth.uid())
      and a.active = true and a.role = 'owner'
      and (a.expires_at is null or a.expires_at > now())
  );
$$;
revoke all on function public.is_creator_owner() from public,anon;
grant execute on function public.is_creator_owner() to authenticated;

create or replace function public.raye2_is_platform_admin()
returns boolean language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.creator_admins a
    where a.user_id = (select auth.uid())
      and a.active = true and a.role in ('owner','admin')
      and (a.expires_at is null or a.expires_at > now())
  );
$$;
revoke all on function public.raye2_is_platform_admin() from public,anon;
grant execute on function public.raye2_is_platform_admin() to authenticated;

drop policy if exists "Creator can read own active access" on public.creator_admins;
create policy "Creator can read own active access"
  on public.creator_admins for select to authenticated
  using (user_id = (select auth.uid()) and active = true and (expires_at is null or expires_at > now()));

-- 2. Team listing now exposes the expiry and the grant provenance.
drop function if exists public.get_creator_team();
create or replace function public.get_creator_team()
returns table(user_id uuid,email text,role text,active boolean,expires_at timestamptz,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
  return query
    select a.user_id, u.email::text, a.role, a.active, a.expires_at, a.created_at
    from public.creator_admins a join auth.users u on u.id = a.user_id
    order by a.created_at;
end;
$$;
revoke all on function public.get_creator_team() from public,anon;
grant execute on function public.get_creator_team() to authenticated;

-- 3. Role change now accepts an optional expiry (temporary grant). Drop the old 2-arg signature first so
--    there is exactly one function; the existing 2-argument callers keep working via the default.
drop function if exists public.set_creator_admin_role(uuid,text);
create or replace function public.set_creator_admin_role(p_user_id uuid, p_role text, p_expires_at timestamptz default null)
returns void language plpgsql security definer set search_path=''
as $$
declare v_old text;
begin
  if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
  if p_role not in ('admin','editor','moderator','analyst') then raise exception 'owner role cannot be assigned through this action' using errcode='22023'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'a temporary grant must expire in the future' using errcode='22023'; end if;
  select role into v_old from public.creator_admins where user_id = p_user_id for update;
  if v_old is null or v_old = 'owner' then raise exception 'owner accounts cannot be changed here' using errcode='42501'; end if;
  update public.creator_admins set role = p_role, expires_at = p_expires_at, granted_by = auth.uid() where user_id = p_user_id;
  insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
  values(auth.uid(),'role_changed','creator_admin',p_user_id::text,
    jsonb_build_object('from',v_old,'to',p_role,'expires_at',p_expires_at,'temporary',p_expires_at is not null));
end;
$$;
revoke all on function public.set_creator_admin_role(uuid,text,timestamptz) from public,anon;
grant execute on function public.set_creator_admin_role(uuid,text,timestamptz) to authenticated;

create or replace function public.set_creator_admin_expiry(p_user_id uuid, p_expires_at timestamptz)
returns void language plpgsql security definer set search_path=''
as $$
declare v_role text;
begin
  if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'an expiry must be in the future' using errcode='22023'; end if;
  select role into v_role from public.creator_admins where user_id = p_user_id for update;
  if v_role is null or v_role = 'owner' then raise exception 'owner accounts cannot be changed here' using errcode='42501'; end if;
  update public.creator_admins set expires_at = p_expires_at where user_id = p_user_id;
  insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
  values(auth.uid(),'role_expiry_changed','creator_admin',p_user_id::text,
    jsonb_build_object('expires_at',p_expires_at,'temporary',p_expires_at is not null));
end;
$$;
revoke all on function public.set_creator_admin_expiry(uuid,timestamptz) from public,anon;
grant execute on function public.set_creator_admin_expiry(uuid,timestamptz) to authenticated;

-- 4. Account-specific capability overrides: a bounded value granted to one account, optionally expiring.
create table if not exists public.raye2_capability_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  capability text not null check (capability ~ '^[a-z][a-z0-9_.]{1,60}$'),
  value jsonb not null,
  reason text not null check (char_length(btrim(reason)) between 3 and 500),
  issued_by uuid not null references auth.users(id) on delete restrict,
  expires_at timestamptz,
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now()
);
create index if not exists raye2_capability_overrides_user_idx on public.raye2_capability_overrides(user_id,capability,status);
alter table public.raye2_capability_overrides enable row level security;
revoke all on public.raye2_capability_overrides from anon,authenticated;

-- Resolver: the effective override value for an account+capability, or null when none applies.
create or replace function public.raye2_effective_capability(p_user_id uuid, p_capability text)
returns jsonb language sql stable security definer set search_path=''
as $$
  select o.value
  from public.raye2_capability_overrides o
  where o.user_id = p_user_id and o.capability = p_capability
    and o.status = 'active' and (o.expires_at is null or o.expires_at > now())
  order by o.created_at desc
  limit 1;
$$;
revoke all on function public.raye2_effective_capability(uuid,text) from public,anon;
grant execute on function public.raye2_effective_capability(uuid,text) to authenticated;

create or replace function public.raye2_set_capability_override(
  p_user_id uuid,
  p_capability text,
  p_value jsonb,
  p_reason text,
  p_expires_at timestamptz default null
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.raye2_is_platform_admin() then raise exception 'administrator access required' using errcode='42501'; end if;
  if p_capability is null or p_capability !~ '^[a-z][a-z0-9_.]{1,60}$' then raise exception 'invalid capability name' using errcode='22023'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  if p_expires_at is not null and p_expires_at <= now() then raise exception 'an expiry must be in the future' using errcode='22023'; end if;
  if not exists(select 1 from auth.users u where u.id = p_user_id) then raise exception 'account not found' using errcode='P0002'; end if;
  insert into public.raye2_capability_overrides(user_id,capability,value,reason,issued_by,expires_at)
  values(p_user_id,p_capability,p_value,v_reason,auth.uid(),p_expires_at)
  returning id into v_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'capability_override_set','member',p_user_id::text,v_reason,
    jsonb_build_object('override_id',v_id,'capability',p_capability,'value',p_value,'expires_at',p_expires_at));
  return v_id;
end;
$$;
revoke all on function public.raye2_set_capability_override(uuid,text,jsonb,text,timestamptz) from public,anon;
grant execute on function public.raye2_set_capability_override(uuid,text,jsonb,text,timestamptz) to authenticated;

create or replace function public.raye2_revoke_capability_override(p_override_id uuid, p_reason text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_user uuid; v_cap text; v_reason text := btrim(coalesce(p_reason,''));
begin
  if not public.raye2_is_platform_admin() then raise exception 'administrator access required' using errcode='42501'; end if;
  if char_length(v_reason) not between 3 and 500 then raise exception 'a reason is required' using errcode='22023'; end if;
  select user_id, capability into v_user, v_cap from public.raye2_capability_overrides
    where id = p_override_id and status = 'active' for update;
  if v_user is null then raise exception 'active override not found' using errcode='P0002'; end if;
  update public.raye2_capability_overrides set status = 'revoked' where id = p_override_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'capability_override_revoked','member',v_user::text,v_reason,
    jsonb_build_object('override_id',p_override_id,'capability',v_cap));
end;
$$;
revoke all on function public.raye2_revoke_capability_override(uuid,text) from public,anon;
grant execute on function public.raye2_revoke_capability_override(uuid,text) to authenticated;

create or replace function public.raye2_list_capability_overrides(p_user_id uuid)
returns table (id uuid, capability text, value jsonb, reason text, expires_at timestamptz, created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then raise exception 'administrator access required' using errcode='42501'; end if;
  return query
    select o.id, o.capability, o.value, o.reason, o.expires_at, o.created_at
    from public.raye2_capability_overrides o
    where o.user_id = p_user_id and o.status = 'active'
      and (o.expires_at is null or o.expires_at > now())
    order by o.created_at desc;
end;
$$;
revoke all on function public.raye2_list_capability_overrides(uuid) from public,anon;
grant execute on function public.raye2_list_capability_overrides(uuid) to authenticated;

-- A member can see overrides applied to their own account.
create or replace function public.raye2_get_my_capability_overrides()
returns table (id uuid, capability text, value jsonb, reason text, expires_at timestamptz, created_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select o.id, o.capability, o.value, o.reason, o.expires_at, o.created_at
  from public.raye2_capability_overrides o
  where o.user_id = (select auth.uid()) and o.status = 'active'
    and (o.expires_at is null or o.expires_at > now())
  order by o.created_at desc;
$$;
revoke all on function public.raye2_get_my_capability_overrides() from public,anon;
grant execute on function public.raye2_get_my_capability_overrides() to authenticated;

notify pgrst, 'reload schema';

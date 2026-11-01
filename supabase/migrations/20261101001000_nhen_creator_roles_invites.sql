-- NHEN Studio multi-admin roles and one-time verified-email invitations.
alter table public.creator_admins
 add column if not exists role text not null default 'editor'
 check(role in ('owner','admin','editor','moderator','analyst'));

do $$
begin
 if not exists(select 1 from public.creator_admins where active=true and role='owner') then
  update public.creator_admins set role='owner'
  where user_id=(select user_id from public.creator_admins where active=true order by created_at asc limit 1);
 end if;
end $$;

create table if not exists public.creator_invites(
 id uuid primary key default gen_random_uuid(),
 email text not null,
 role text not null check(role in ('admin','editor','moderator','analyst')),
 token_hash text not null unique,
 created_by uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz,
 check(email=lower(email)),
 check(expires_at>created_at)
);
create index if not exists creator_invites_email_idx on public.creator_invites(email,expires_at desc);
alter table public.creator_invites enable row level security;
revoke all on public.creator_invites from anon,authenticated;

create or replace function public.is_creator_owner()
returns boolean language sql stable security definer set search_path=''
as $$
 select exists(select 1 from public.creator_admins a where a.user_id=(select auth.uid()) and a.active=true and a.role='owner');
$$;
revoke all on function public.is_creator_owner() from public,anon;
grant execute on function public.is_creator_owner() to authenticated;

create or replace function public.get_creator_team()
returns table(user_id uuid,email text,role text,active boolean,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
 return query select a.user_id,u.email::text,a.role,a.active,a.created_at from public.creator_admins a join auth.users u on u.id=a.user_id order by a.created_at;
end;
$$;
revoke all on function public.get_creator_team() from public,anon;
grant execute on function public.get_creator_team() to authenticated;

create or replace function public.create_creator_invite(p_email text,p_role text,p_token text)
returns table(invite_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_exp timestamptz;v_email text;
begin
 if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
 v_email=lower(btrim(p_email));
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 then raise exception 'valid email required' using errcode='22023'; end if;
 if p_role not in ('admin','editor','moderator','analyst') then raise exception 'unsupported invite role' using errcode='22023'; end if;
 if length(p_token)<32 or length(p_token)>256 then raise exception 'invalid invite token' using errcode='22023'; end if;
 if exists(select 1 from public.creator_admins a join auth.users u on u.id=a.user_id where lower(u.email)=v_email and a.active=true) then raise exception 'this email already has active creator access' using errcode='23505'; end if;
 insert into public.creator_invites(email,role,token_hash,created_by)
 values(v_email,p_role,encode(extensions.digest(p_token,'sha256'),'hex'),auth.uid())
 returning id,creator_invites.expires_at into v_id,v_exp;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),'invite_created','creator_invite',v_id::text,jsonb_build_object('email',v_email,'role',p_role));
 return query select v_id,v_exp;
end;
$$;
revoke all on function public.create_creator_invite(text,text,text) from public,anon;
grant execute on function public.create_creator_invite(text,text,text) to authenticated;

create or replace function public.accept_creator_invite(p_token text)
returns table(role text)
language plpgsql security definer set search_path=''
as $$
declare v_user auth.users%rowtype;v_invite public.creator_invites%rowtype;
begin
 if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
 select * into v_user from auth.users where id=auth.uid();
 if v_user.email is null or v_user.email_confirmed_at is null then raise exception 'verify your email before accepting this invitation' using errcode='42501'; end if;
 select * into v_invite from public.creator_invites
 where token_hash=encode(extensions.digest(p_token,'sha256'),'hex')
 and email=lower(v_user.email) and accepted_at is null and expires_at>now()
 for update;
 if not found then raise exception 'invitation is invalid, expired, already used, or belongs to another email' using errcode='22023'; end if;
 if exists(select 1 from public.creator_admins where user_id=auth.uid() and active=true) then raise exception 'creator access already exists for this account' using errcode='23505'; end if;
 insert into public.creator_admins(user_id,active,role) values(auth.uid(),true,v_invite.role);
 update public.creator_invites set accepted_at=now() where id=v_invite.id;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),'invite_accepted','creator_invite',v_invite.id::text,jsonb_build_object('role',v_invite.role));
 return query select v_invite.role;
end;
$$;
revoke all on function public.accept_creator_invite(text) from public,anon;
grant execute on function public.accept_creator_invite(text) to authenticated;

create or replace function public.set_creator_admin_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_old text;
begin
 if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
 if p_role not in ('admin','editor','moderator','analyst') then raise exception 'owner role cannot be assigned through this action' using errcode='22023'; end if;
 select role into v_old from public.creator_admins where user_id=p_user_id for update;
 if v_old is null or v_old='owner' then raise exception 'owner accounts cannot be changed here' using errcode='42501'; end if;
 update public.creator_admins set role=p_role where user_id=p_user_id;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),'role_changed','creator_admin',p_user_id::text,jsonb_build_object('from',v_old,'to',p_role));
end;
$$;
revoke all on function public.set_creator_admin_role(uuid,text) from public,anon;
grant execute on function public.set_creator_admin_role(uuid,text) to authenticated;

create or replace function public.set_creator_admin_active(p_user_id uuid,p_active boolean)
returns void language plpgsql security definer set search_path=''
as $$
declare v_role text;
begin
 if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
 if p_user_id=auth.uid() then raise exception 'you cannot change your own access here' using errcode='42501'; end if;
 select role into v_role from public.creator_admins where user_id=p_user_id for update;
 if v_role is null then raise exception 'creator account not found' using errcode='P0002'; end if;
 if not p_active and v_role='owner' and (select count(*) from public.creator_admins where active=true and role='owner')<=1 then
  raise exception 'the last active owner cannot be deactivated' using errcode='42501';
 end if;
 update public.creator_admins set active=p_active where user_id=p_user_id;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),case when p_active then 'admin_reactivated' else 'admin_deactivated' end,'creator_admin',p_user_id::text,jsonb_build_object('role',v_role));
end;
$$;
revoke all on function public.set_creator_admin_active(uuid,boolean) from public,anon;
grant execute on function public.set_creator_admin_active(uuid,boolean) to authenticated;

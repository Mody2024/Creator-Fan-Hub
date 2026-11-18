-- Add a first-class Creator role for assigned video publishers.
alter table public.creator_admins drop constraint if exists creator_admins_role_check;
alter table public.creator_admins add constraint creator_admins_role_check
  check (role in ('owner','admin','creator','editor','moderator','analyst'));

alter table public.creator_invites drop constraint if exists creator_invites_role_check;
alter table public.creator_invites add constraint creator_invites_role_check
  check (role in ('admin','creator','editor','moderator','analyst'));

create or replace function public.create_creator_invite(p_email text,p_role text,p_token text)
returns table(invite_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;v_exp timestamptz;v_email text;
begin
 if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
 v_email=lower(btrim(p_email));
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\\.[^[:space:]@]+$' or length(v_email)>254 then raise exception 'valid email required' using errcode='22023'; end if;
 if p_role not in ('admin','creator','editor','moderator','analyst') then raise exception 'unsupported invite role' using errcode='22023'; end if;
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

create or replace function public.set_creator_admin_role(p_user_id uuid,p_role text)
returns void language plpgsql security definer set search_path=''
as $$
declare v_old text;
begin
 if auth.uid() is null or not public.is_creator_owner() then raise exception 'owner access required' using errcode='42501'; end if;
 if p_role not in ('admin','creator','editor','moderator','analyst') then raise exception 'owner role cannot be assigned through this action' using errcode='22023'; end if;
 select role into v_old from public.creator_admins where user_id=p_user_id for update;
 if v_old is null or v_old='owner' then raise exception 'owner accounts cannot be changed here' using errcode='42501'; end if;
 update public.creator_admins set role=p_role where user_id=p_user_id;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),'role_changed','creator_admin',p_user_id::text,jsonb_build_object('from',v_old,'to',p_role));
end;
$$;
revoke all on function public.set_creator_admin_role(uuid,text) from public,anon;
grant execute on function public.set_creator_admin_role(uuid,text) to authenticated;

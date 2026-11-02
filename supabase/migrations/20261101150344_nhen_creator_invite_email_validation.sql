-- Validate and normalize invitation email addresses before persisting them.
-- The later rate-limit migration retains this validation and adds concurrency
-- protection and a per-owner daily invitation limit.
create or replace function public.create_creator_invite(p_email text,p_role text,p_token text)
returns table(invite_id uuid,expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_exp timestamptz; v_email text;
begin
 if auth.uid() is null or not public.is_creator_owner() then
  raise exception 'owner access required' using errcode='42501';
 end if;
 v_email=lower(btrim(p_email));
 if v_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or length(v_email)>254 then
  raise exception 'valid email required' using errcode='22023';
 end if;
 if p_role not in ('admin','editor','moderator','analyst') then
  raise exception 'unsupported invite role' using errcode='22023';
 end if;
 if p_token is null or length(p_token)<32 or length(p_token)>256 or p_token !~ '^[A-Za-z0-9_-]+$' then
  raise exception 'invalid invite token' using errcode='22023';
 end if;
 insert into public.creator_invites(email,role,token_hash,created_by)
 values(v_email,p_role,encode(extensions.digest(p_token,'sha256'),'hex'),auth.uid())
 returning id,creator_invites.expires_at into v_id,v_exp;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),'invite_created','creator_invite',v_id::text,
        jsonb_build_object('email',v_email,'role',p_role));
 return query select v_id,v_exp;
end;
$$;
revoke all on function public.create_creator_invite(text,text,text) from public,anon;
grant execute on function public.create_creator_invite(text,text,text) to authenticated;

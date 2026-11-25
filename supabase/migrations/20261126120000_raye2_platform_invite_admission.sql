-- Raye2 Launch 1.0: platform-level invite-only admission.
-- Group invites are separate and do not grant permission to create a platform account.

create table if not exists public.raye2_platform_invites (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  email text,
  max_uses integer not null default 1 check (max_uses between 1 and 100),
  uses integer not null default 0 check (uses >= 0 and uses <= max_uses),
  expires_at timestamptz not null,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  constraint raye2_platform_invite_expiry check (expires_at > created_at)
);

create index if not exists raye2_platform_invites_active_idx
  on public.raye2_platform_invites(expires_at, created_at desc)
  where revoked_at is null;

alter table public.raye2_platform_invites enable row level security;
revoke all on public.raye2_platform_invites from anon, authenticated;

create or replace function public.raye2_create_platform_invite(
  p_token text,
  p_email text default null,
  p_expires_at timestamptz default (now() + interval '7 days'),
  p_max_uses integer default 1
)
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_email text := nullif(lower(btrim(coalesce(p_email,''))),'');
begin
  if not public.raye2_is_super_admin() then
    raise exception 'owner access required' using errcode='42501';
  end if;
  if p_token is null or p_token !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid invite token' using errcode='22023';
  end if;
  if v_email is not null and v_email !~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$' then
    raise exception 'invalid invite email' using errcode='22023';
  end if;
  if p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '30 days' then
    raise exception 'invite expiry must be within 30 days' using errcode='22023';
  end if;
  if p_max_uses is null or p_max_uses not between 1 and 100 then
    raise exception 'invite use limit must be between 1 and 100' using errcode='22023';
  end if;
  insert into public.raye2_platform_invites(token_hash,email,max_uses,expires_at,created_by)
  values(encode(extensions.digest(p_token,'sha256'),'hex'),v_email,p_max_uses,p_expires_at,auth.uid())
  returning id into v_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'platform_invite_created','platform_invite',v_id::text,'Platform invitation created',
    jsonb_build_object('email',v_email,'expires_at',p_expires_at,'max_uses',p_max_uses));
  return v_id;
end;
$$;
revoke all on function public.raye2_create_platform_invite(text,text,timestamptz,integer) from public,anon;
grant execute on function public.raye2_create_platform_invite(text,text,timestamptz,integer) to authenticated;

create or replace function public.raye2_list_platform_invites()
returns table(id uuid,email text,max_uses integer,uses integer,expires_at timestamptz,created_at timestamptz,revoked_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
  if not public.raye2_is_platform_admin() then
    raise exception 'administrator access required' using errcode='42501';
  end if;
  return query
    select i.id,i.email,i.max_uses,i.uses,i.expires_at,i.created_at,i.revoked_at
    from public.raye2_platform_invites i
    order by i.created_at desc limit 100;
end;
$$;
revoke all on function public.raye2_list_platform_invites() from public,anon;
grant execute on function public.raye2_list_platform_invites() to authenticated;

create or replace function public.raye2_revoke_platform_invite(p_invite_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
declare v_email text;
begin
  if not public.raye2_is_super_admin() then
    raise exception 'owner access required' using errcode='42501';
  end if;
  update public.raye2_platform_invites
    set revoked_at=coalesce(revoked_at,now())
    where id=p_invite_id and revoked_at is null
    returning email into v_email;
  if not found then raise exception 'active invitation not found' using errcode='P0002'; end if;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'platform_invite_revoked','platform_invite',p_invite_id::text,'Platform invitation revoked',
    jsonb_build_object('email',v_email));
end;
$$;
revoke all on function public.raye2_revoke_platform_invite(uuid) from public,anon;
grant execute on function public.raye2_revoke_platform_invite(uuid) to authenticated;

-- Configure this Postgres function as the Supabase Auth "Before User Created" hook.
-- Auth invokes it before auth.users insertion; any failure rolls back both consumption and signup.
create or replace function public.raye2_before_user_created(event jsonb)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_token text := event->'user'->'raw_user_meta_data'->>'raye2_access_invite';
  v_email text := lower(btrim(coalesce(event->'user'->>'email','')));
  v_invite public.raye2_platform_invites%rowtype;
begin
  if v_token is null or v_token !~ '^[0-9a-f]{64}$' then
    return jsonb_build_object('error',jsonb_build_object(
      'http_code',403,'message','A valid Raye2 invitation is required to create an account.'
    ));
  end if;

  select * into v_invite
  from public.raye2_platform_invites
  where token_hash=encode(extensions.digest(v_token,'sha256'),'hex')
  for update;

  if not found
    or v_invite.revoked_at is not null
    or v_invite.expires_at <= now()
    or v_invite.uses >= v_invite.max_uses
    or (v_invite.email is not null and v_invite.email <> v_email) then
    return jsonb_build_object('error',jsonb_build_object(
      'http_code',403,'message','This Raye2 invitation is invalid, expired, revoked, or already used.'
    ));
  end if;

  update public.raye2_platform_invites set uses=uses+1 where id=v_invite.id;
  return '{}'::jsonb;
end;
$$;
revoke all on function public.raye2_before_user_created(jsonb) from public,anon,authenticated;
-- Supabase provides this role. Local migration validation may use a plain PostgreSQL
-- instance without Supabase's managed roles, so guard the grant for that environment.
do 'begin
  if exists (select 1 from pg_roles where rolname = ''supabase_auth_admin'') then
    execute ''grant execute on function public.raye2_before_user_created(jsonb) to supabase_auth_admin'';
  end if;
end';

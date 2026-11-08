-- Raye2 creator rewards engine. Points are recognition credits, not cash or payout claims.
create table if not exists public.raye2_creator_reward_rules (
  code text primary key check (code ~ '^[a-z0-9][a-z0-9_-]{1,59}$'),
  title text not null check (length(trim(title)) between 2 and 100),
  description text not null default '' check (length(description) <= 500),
  points integer not null check (points between 1 and 1000000),
  enabled boolean not null default true,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now()
);

create table if not exists public.raye2_creator_reward_ledger (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  reward_code text not null references public.raye2_creator_reward_rules(code) on delete restrict,
  points integer not null check (points between 1 and 1000000),
  status text not null default 'awarded' check (status in ('awarded','revoked')),
  source_ref text,
  note text not null default '' check (length(note) <= 500),
  granted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  unique (creator_id,reward_code,source_ref)
);

create index if not exists raye2_creator_reward_ledger_creator_idx
  on public.raye2_creator_reward_ledger(creator_id,created_at desc);
create index if not exists raye2_creator_reward_ledger_status_idx
  on public.raye2_creator_reward_ledger(status,created_at desc);

alter table public.raye2_creator_reward_rules enable row level security;
alter table public.raye2_creator_reward_ledger enable row level security;
revoke all on public.raye2_creator_reward_rules,public.raye2_creator_reward_ledger from public,anon,authenticated;
grant select on public.raye2_creator_reward_rules to authenticated;
grant select on public.raye2_creator_reward_ledger to authenticated;

drop policy if exists "Creators can read enabled reward rules" on public.raye2_creator_reward_rules;
create policy "Creators can read enabled reward rules" on public.raye2_creator_reward_rules
 for select to authenticated using (
  enabled or exists(select 1 from public.creator_admins ca
   where ca.user_id=(select auth.uid()) and ca.active=true and ca.role in ('owner','admin'))
);

drop policy if exists "Creators can read own reward ledger" on public.raye2_creator_reward_ledger;
create policy "Creators can read own reward ledger" on public.raye2_creator_reward_ledger
 for select to authenticated using (
  creator_id=(select auth.uid()) or exists(select 1 from public.creator_admins ca
   where ca.user_id=(select auth.uid()) and ca.active=true and ca.role in ('owner','admin'))
);

create or replace function public.raye2_creator_reward_summary()
returns table(total_points bigint,earned_awards bigint,revoked_awards bigint,available_rules bigint)
language sql stable security definer set search_path=''
as $$
 select
  coalesce(sum(case when l.status='awarded' then l.points else -l.points end),0)::bigint,
  count(*) filter(where l.status='awarded')::bigint,
  count(*) filter(where l.status='revoked')::bigint,
  (select count(*) from public.raye2_creator_reward_rules r where r.enabled)::bigint
 from public.raye2_creator_reward_ledger l
 where l.creator_id=(select auth.uid())
   and exists(select 1 from public.creator_admins ca where ca.user_id=(select auth.uid()) and ca.active=true and ca.role in ('owner','admin','creator','editor','analyst'))
$$;

create or replace function public.raye2_admin_upsert_creator_reward_rule(
 p_code text,p_title text,p_description text,p_points integer,p_enabled boolean default true
) returns void language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.creator_admins ca where ca.user_id=(select auth.uid()) and ca.active=true and ca.role in ('owner','admin')) then
  raise exception 'owner or admin access required' using errcode='42501';
 end if;
 if p_code !~ '^[a-z0-9][a-z0-9_-]{1,59}$' or length(trim(p_title)) not between 2 and 100
  or p_points not between 1 and 1000000 or length(coalesce(p_description,''))>500 then
  raise exception 'invalid reward rule values' using errcode='22023';
 end if;
 insert into public.raye2_creator_reward_rules(code,title,description,points,enabled,updated_by,updated_at)
 values(p_code,trim(p_title),coalesce(p_description,''),p_points,coalesce(p_enabled,true),(select auth.uid()),now())
 on conflict(code) do update set title=excluded.title,description=excluded.description,points=excluded.points,
  enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
end;
$$;

create or replace function public.raye2_admin_grant_creator_reward(
 p_creator_id uuid,p_reward_code text,p_source_ref text default null,p_note text default ''
) returns uuid language plpgsql security definer set search_path=''
as $$
declare v_points integer; v_id uuid;
begin
 if not exists(select 1 from public.creator_admins ca where ca.user_id=(select auth.uid()) and ca.active=true and ca.role in ('owner','admin')) then
  raise exception 'owner or admin access required' using errcode='42501';
 end if;
 if p_creator_id is null or length(coalesce(p_note,''))>500 or length(coalesce(p_source_ref,''))>160 then
  raise exception 'invalid reward grant values' using errcode='22023';
 end if;
 if not exists(select 1 from public.creator_admins ca where ca.user_id=p_creator_id and ca.active=true and ca.role in ('creator','editor')) then
  raise exception 'target must be an active creator or editor' using errcode='22023';
 end if;
 select points into v_points from public.raye2_creator_reward_rules where code=p_reward_code and enabled=true;
 if v_points is null then raise exception 'reward rule is missing or disabled' using errcode='22023'; end if;
 insert into public.raye2_creator_reward_ledger(creator_id,reward_code,points,source_ref,note,granted_by)
 values(p_creator_id,p_reward_code,v_points,nullif(p_source_ref,''),coalesce(p_note,''),(select auth.uid()))
 on conflict(creator_id,reward_code,source_ref) do nothing
 returning id into v_id;
 if v_id is null then
  select id into v_id from public.raye2_creator_reward_ledger
   where creator_id=p_creator_id and reward_code=p_reward_code and source_ref is not distinct from nullif(p_source_ref,'');
 end if;
 return v_id;
end;
$$;

create or replace function public.raye2_admin_revoke_creator_reward(p_reward_id uuid,p_note text default '')
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if not exists(select 1 from public.creator_admins ca where ca.user_id=(select auth.uid()) and ca.active=true and ca.role in ('owner','admin')) then
  raise exception 'owner or admin access required' using errcode='42501';
 end if;
 if length(coalesce(p_note,''))>500 then raise exception 'note too long' using errcode='22023'; end if;
 update public.raye2_creator_reward_ledger set status='revoked',revoked_at=now(),revoked_by=(select auth.uid()),
  note=case when p_note='' then note else p_note end
 where id=p_reward_id and status='awarded';
 get diagnostics v_count=row_count;
 return v_count=1;
end;
$$;

revoke all on function public.raye2_creator_reward_summary() from public,anon;
grant execute on function public.raye2_creator_reward_summary() to authenticated;
revoke all on function public.raye2_admin_upsert_creator_reward_rule(text,text,text,integer,boolean) from public,anon,authenticated;
grant execute on function public.raye2_admin_upsert_creator_reward_rule(text,text,text,integer,boolean) to authenticated;
revoke all on function public.raye2_admin_grant_creator_reward(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.raye2_admin_grant_creator_reward(uuid,text,text,text) to authenticated;
revoke all on function public.raye2_admin_revoke_creator_reward(uuid,text) from public,anon,authenticated;
grant execute on function public.raye2_admin_revoke_creator_reward(uuid,text) to authenticated;

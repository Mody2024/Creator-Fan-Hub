-- Raye2 Wave 2/9: account self-service and data rights.
--
-- Accounts had no self-service lifecycle: no deactivation, no deletion request, no data export, and no
-- user preferences. Plan 2 (accounts) and 9 (data rights) require these. Deletion follows the platform
-- pattern used elsewhere: the account is marked logically first, and physical purge is queued as a
-- durable background job at the end of a grace period, so the user can still cancel.

insert into public.raye2_platform_rules(rule_key,category,rule_value,status,description) values
 ('account.deletion_grace_days','safety','30'::jsonb,'active','Grace period in days before a requested account deletion is purged.')
on conflict (rule_key) do nothing;

create table if not exists public.raye2_account_lifecycle (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'active' check (state in ('active','deactivated','deletion_requested')),
  scheduled_purge_at timestamptz,
  reason text not null default '' check (char_length(reason) <= 500),
  updated_at timestamptz not null default now()
);
alter table public.raye2_account_lifecycle enable row level security;
drop policy if exists "Members read their own lifecycle" on public.raye2_account_lifecycle;
create policy "Members read their own lifecycle" on public.raye2_account_lifecycle for select to authenticated
using (user_id = (select auth.uid()));
revoke all on public.raye2_account_lifecycle from anon, authenticated;
grant select on public.raye2_account_lifecycle to authenticated;

create table if not exists public.raye2_user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  locale text not null default 'en' check (locale in ('en','ar')),
  reduced_motion boolean not null default false,
  email_notifications boolean not null default true,
  push_notifications boolean not null default true,
  updated_at timestamptz not null default now()
);
alter table public.raye2_user_preferences enable row level security;
drop policy if exists "Members read their own preferences" on public.raye2_user_preferences;
create policy "Members read their own preferences" on public.raye2_user_preferences for select to authenticated
using (user_id = (select auth.uid()));
revoke all on public.raye2_user_preferences from anon, authenticated;
grant select on public.raye2_user_preferences to authenticated;

-- 1. Current state for the caller.
create or replace function public.raye2_get_account_lifecycle()
returns table (state text, scheduled_purge_at timestamptz, reason text, updated_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select coalesce(l.state,'active'), l.scheduled_purge_at, coalesce(l.reason,''), coalesce(l.updated_at, now())
  from (select auth.uid() as uid) u
  left join public.raye2_account_lifecycle l on l.user_id = u.uid
  where u.uid is not null;
$$;
revoke all on function public.raye2_get_account_lifecycle() from public,anon;
grant execute on function public.raye2_get_account_lifecycle() to authenticated;

-- 2. Deactivation: reversible and immediate.
create or replace function public.raye2_deactivate_account(p_reason text default '')
returns text language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  insert into public.raye2_account_lifecycle(user_id,state,scheduled_purge_at,reason,updated_at)
  values(v_uid,'deactivated',null,coalesce(p_reason,''),now())
  on conflict (user_id) do update set state='deactivated', scheduled_purge_at=null, reason=excluded.reason, updated_at=now();
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(v_uid,'account_deactivated','account',v_uid::text,coalesce(p_reason,''),'{}'::jsonb);
  return 'deactivated';
end;
$$;
revoke all on function public.raye2_deactivate_account(text) from public,anon;
grant execute on function public.raye2_deactivate_account(text) to authenticated;

-- 3. Reactivation: cancels deactivation or a pending deletion.
create or replace function public.raye2_reactivate_account()
returns text language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_state text;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  select state into v_state from public.raye2_account_lifecycle where user_id = v_uid;
  update public.raye2_account_lifecycle set state='active', scheduled_purge_at=null, reason='', updated_at=now() where user_id = v_uid;
  -- Cancel a queued purge if one exists.
  update public.raye2_background_jobs set status='cancelled', updated_at=now()
   where idempotency_key = 'account_purge:'||v_uid::text and status in ('queued','running','failed');
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(v_uid,'account_reactivated','account',v_uid::text,'',jsonb_build_object('previous_state',coalesce(v_state,'active')));
  return 'active';
end;
$$;
revoke all on function public.raye2_reactivate_account() from public,anon;
grant execute on function public.raye2_reactivate_account() to authenticated;

-- 4. Deletion request: logical first, physical purge queued at the end of the grace period.
create or replace function public.raye2_request_account_deletion(p_reason text default '')
returns table (state text, scheduled_purge_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_days integer; v_purge timestamptz;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  v_days := public.raye2_rule_int('account.deletion_grace_days', 30);
  v_purge := now() + make_interval(days => v_days);
  insert into public.raye2_account_lifecycle(user_id,state,scheduled_purge_at,reason,updated_at)
  values(v_uid,'deletion_requested',v_purge,coalesce(p_reason,''),now())
  on conflict (user_id) do update set state='deletion_requested', scheduled_purge_at=v_purge, reason=excluded.reason, updated_at=now();
  insert into public.raye2_background_jobs(kind,payload,run_at,idempotency_key,created_by)
  select 'account.purge', jsonb_build_object('user_id',v_uid), v_purge, 'account_purge:'||v_uid::text, v_uid
  where not exists (select 1 from public.raye2_background_jobs j where j.idempotency_key = 'account_purge:'||v_uid::text and j.status in ('queued','running'));
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(v_uid,'account_deletion_requested','account',v_uid::text,coalesce(p_reason,''),jsonb_build_object('grace_days',v_days));
  return query select 'deletion_requested'::text, v_purge;
end;
$$;
revoke all on function public.raye2_request_account_deletion(text) from public,anon;
grant execute on function public.raye2_request_account_deletion(text) to authenticated;

-- 5. Data export request: queued for a trusted worker; nothing is fabricated here.
create or replace function public.raye2_request_data_export()
returns uuid language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_job uuid;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  insert into public.raye2_background_jobs(kind,payload,run_at,idempotency_key,created_by)
  values('account.export', jsonb_build_object('user_id',v_uid), now(), 'account_export:'||v_uid::text||':'||to_char(now(),'YYYYMMDDHH24MISS'), v_uid)
  returning id into v_job;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(v_uid,'account_export_requested','account',v_uid::text,'',jsonb_build_object('job_id',v_job));
  return v_job;
end;
$$;
revoke all on function public.raye2_request_data_export() from public,anon;
grant execute on function public.raye2_request_data_export() to authenticated;

create or replace function public.raye2_get_my_data_exports(p_limit integer default 10)
returns table (job_id uuid, status text, created_at timestamptz)
language sql stable security definer set search_path=''
as $$
  select j.id, j.status, j.created_at
  from public.raye2_background_jobs j
  where j.kind='account.export' and j.created_by = (select auth.uid())
  order by j.created_at desc
  limit least(greatest(coalesce(p_limit,10),1),50);
$$;
revoke all on function public.raye2_get_my_data_exports(integer) from public,anon;
grant execute on function public.raye2_get_my_data_exports(integer) to authenticated;

-- 6. Preferences.
create or replace function public.raye2_get_my_preferences()
returns table (locale text, reduced_motion boolean, email_notifications boolean, push_notifications boolean)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  insert into public.raye2_user_preferences(user_id) values(v_uid) on conflict (user_id) do nothing;
  return query select p.locale, p.reduced_motion, p.email_notifications, p.push_notifications
    from public.raye2_user_preferences p where p.user_id = v_uid;
end;
$$;
revoke all on function public.raye2_get_my_preferences() from public,anon;
grant execute on function public.raye2_get_my_preferences() to authenticated;

create or replace function public.raye2_set_my_preferences(
  p_locale text default null,
  p_reduced_motion boolean default null,
  p_email_notifications boolean default null,
  p_push_notifications boolean default null
)
returns table (locale text, reduced_motion boolean, email_notifications boolean, push_notifications boolean)
language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_locale is not null and p_locale not in ('en','ar') then
    raise exception 'unsupported locale' using errcode='22023';
  end if;
  insert into public.raye2_user_preferences(user_id) values(v_uid) on conflict (user_id) do nothing;
  update public.raye2_user_preferences p set
    locale = coalesce(p_locale, p.locale),
    reduced_motion = coalesce(p_reduced_motion, p.reduced_motion),
    email_notifications = coalesce(p_email_notifications, p.email_notifications),
    push_notifications = coalesce(p_push_notifications, p.push_notifications),
    updated_at = now()
  where p.user_id = v_uid;
  return query select p.locale, p.reduced_motion, p.email_notifications, p.push_notifications
    from public.raye2_user_preferences p where p.user_id = v_uid;
end;
$$;
revoke all on function public.raye2_set_my_preferences(text,boolean,boolean,boolean) from public,anon;
grant execute on function public.raye2_set_my_preferences(text,boolean,boolean,boolean) to authenticated;

notify pgrst, 'reload schema';

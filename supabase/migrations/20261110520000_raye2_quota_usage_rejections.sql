-- Raye2 Wave 8: quota usage and rejected-attempt tracking.
--
-- Plan 10.2 requires the admin dashboards to show "quotas: usage by role/account and rejected
-- attempts". The rules engine enforces caps but nothing surfaced current usage, and rejected
-- attempts vanished because the enforcement functions raise (rolling back any log they would write).
-- This migration exposes authoritative usage and a verified rejection log.

-- 1. Rejected-attempt log. Rows are only ever written by raye2_record_quota_rejection, which
--    re-checks that the caller genuinely meets or exceeds the cap before recording.
create table if not exists public.raye2_quota_rejections (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  rule_key text not null references public.raye2_platform_rules(rule_key) on delete cascade,
  reason text not null default '' check (char_length(reason) <= 200),
  created_at timestamptz not null default now()
);
create index if not exists raye2_quota_rejections_rule_idx on public.raye2_quota_rejections(rule_key,created_at desc);
create index if not exists raye2_quota_rejections_user_idx on public.raye2_quota_rejections(user_id,created_at desc);
alter table public.raye2_quota_rejections enable row level security;
revoke all on public.raye2_quota_rejections from anon,authenticated;

-- 2. Authoritative usage for a quota rule. Only the rules with a queryable source are reported;
--    others return null so the dashboard never invents numbers it cannot collect.
create or replace function public.raye2_quota_used(p_rule_key text, p_user_id uuid)
returns integer language sql stable set search_path=''
as $$
  select case p_rule_key
    when 'groups.created.normal_user.monthly' then
      (select count(*)::integer from public.raye2_groups g
        where g.owner_id = p_user_id and g.created_at > now() - interval '30 days')
    when 'chat.dm.new_conversations.daily' then
      (select count(*)::integer from public.raye2_message_requests m
        where m.sender_id = p_user_id and m.created_at > now() - interval '24 hours')
    else null
  end;
$$;
revoke all on function public.raye2_quota_used(text,uuid) from public,anon,authenticated;

-- 3. Caller's quota usage against each active quota rule.
create or replace function public.raye2_get_quota_usage()
returns table (rule_key text, category text, limit_value integer, used integer, remaining integer)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  return query
    select r.rule_key, r.category, public.raye2_rule_int(r.rule_key, 0),
           coalesce(public.raye2_quota_used(r.rule_key, auth.uid()), 0),
           greatest(0, public.raye2_rule_int(r.rule_key, 0) - coalesce(public.raye2_quota_used(r.rule_key, auth.uid()), 0))
    from public.raye2_platform_rules r
    where r.status = 'active' and public.raye2_quota_used(r.rule_key, auth.uid()) is not null
    order by r.rule_key;
end;
$fn$;
revoke all on function public.raye2_get_quota_usage() from public,anon;
grant execute on function public.raye2_get_quota_usage() to authenticated;

-- 4. Record a rejected attempt. The server verifies the caller is genuinely at or over the cap for
--    the named rule, so the log cannot be padded with fake rejections.
create or replace function public.raye2_record_quota_rejection(p_rule_key text, p_reason text default '')
returns void language plpgsql security definer set search_path=''
as $$
declare v_limit integer; v_used integer; v_reason text := btrim(coalesce(p_reason,''));
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not exists(select 1 from public.raye2_platform_rules where rule_key = p_rule_key and status = 'active') then
    raise exception 'unknown quota rule' using errcode='22023';
  end if;
  if char_length(v_reason) > 200 then raise exception 'reason too long' using errcode='22023'; end if;
  v_used := public.raye2_quota_used(p_rule_key, auth.uid());
  v_limit := public.raye2_rule_int(p_rule_key, 0);
  if v_used is null or v_limit <= 0 or v_used < v_limit then
    raise exception 'no quota was exceeded for this rule' using errcode='22023';
  end if;
  insert into public.raye2_quota_rejections(user_id, rule_key, reason) values (auth.uid(), p_rule_key, v_reason);
end;
$$;
revoke all on function public.raye2_record_quota_rejection(text,text) from public,anon;
grant execute on function public.raye2_record_quota_rejection(text,text) to authenticated;

-- 5. Platform-admin quota overview: usage and rejected attempts by rule.
create or replace function public.raye2_get_quota_overview(p_limit integer default 50)
returns table (rule_key text, category text, limit_value integer, rejections bigint, distinct_users bigint, last_rejected timestamptz)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit,50),1),200) as lim)
    select r.rule_key, r.category, public.raye2_rule_int(r.rule_key, 0),
           (select count(*) from public.raye2_quota_rejections q where q.rule_key = r.rule_key),
           (select count(distinct q.user_id) from public.raye2_quota_rejections q where q.rule_key = r.rule_key),
           (select max(q.created_at) from public.raye2_quota_rejections q where q.rule_key = r.rule_key)
    from public.raye2_platform_rules r
    cross join bounded b
    -- raye2_quota_used returns null for rules without a queryable source, so this keeps the
    -- overview to measurable quotas only.
    where r.status = 'active' and public.raye2_quota_used(r.rule_key, '00000000-0000-0000-0000-000000000000') is not null
    order by r.rule_key
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_get_quota_overview(integer) from public,anon;
grant execute on function public.raye2_get_quota_overview(integer) to authenticated;

notify pgrst, 'reload schema';

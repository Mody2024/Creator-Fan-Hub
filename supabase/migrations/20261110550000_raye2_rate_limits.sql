-- Raye2 Wave 9: server-side rate limiting and anti-spam.
--
-- Plan 10.3 and 13.11 require anti-spam and rate limits enforced server-side (a client counter is
-- not enforcement). Group creation, membership, message length and new direct conversations already
-- have caps, but high-frequency actions (posting, commenting, messaging, reporting) had none.

-- 1. Fixed-window counters, keyed by account, action and window start.
create table if not exists public.raye2_rate_limit_counters (
  user_id uuid not null references auth.users(id) on delete cascade,
  action text not null check (action ~ '^[a-z][a-z0-9_.-]{1,60}$'),
  window_start timestamptz not null,
  count integer not null default 0 check (count >= 0),
  primary key (user_id, action, window_start)
);
create index if not exists raye2_rate_limit_counters_window_idx on public.raye2_rate_limit_counters(action, window_start);
alter table public.raye2_rate_limit_counters enable row level security;
revoke all on public.raye2_rate_limit_counters from anon,authenticated;

-- 2. Configurable limits in the rules engine. Active so they enforce; admins may tune or disable
--    (a non-positive value disables the limit).
insert into public.raye2_platform_rules(rule_key,category,rule_value,status,description) values
 ('rate.community.post.hourly','content','20'::jsonb,'active','Maximum community posts per rolling hour.'),
 ('rate.community.comment.hourly','content','60'::jsonb,'active','Maximum community comments per rolling hour.'),
 ('rate.chat.message.hourly','chat','300'::jsonb,'active','Maximum chat messages per rolling hour.'),
 ('rate.safety.report.hourly','safety','20'::jsonb,'active','Maximum safety reports per rolling hour.')
on conflict (rule_key) do nothing;

-- 3. Atomic counter check. Increments the current window and raises once the cap is exceeded. The
--    caller must be signed in; system and service-role writes skip the limit.
create or replace function public.raye2_rate_limit(p_action text, p_rule_key text, p_default integer, p_window_seconds integer)
returns void language plpgsql security definer set search_path=''
as $$
declare v_limit integer; v_count integer; v_window timestamptz;
begin
  if auth.uid() is null then return; end if;
  if p_window_seconds is null or p_window_seconds < 1 then raise exception 'invalid window' using errcode='22023'; end if;
  v_limit := public.raye2_rule_int(p_rule_key, p_default);
  if v_limit <= 0 then return; end if;
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into public.raye2_rate_limit_counters(user_id,action,window_start,count)
  values(auth.uid(),p_action,v_window,1)
  on conflict (user_id,action,window_start) do update set count = public.raye2_rate_limit_counters.count + 1
  returning count into v_count;
  if v_count > v_limit then
    raise exception 'rate limit exceeded for %', p_action using errcode='42501';
  end if;
end;
$$;
revoke all on function public.raye2_rate_limit(text,text,integer,integer) from public,anon;
grant execute on function public.raye2_rate_limit(text,text,integer,integer) to authenticated;

-- 4. Apply the limits to high-frequency inserts.
create or replace function public.raye2_enforce_rate_limit()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_action text; v_rule text; v_default integer;
begin
  if auth.uid() is null then return new; end if;
  case tg_table_name
    when 'community_posts' then v_action := 'community.post'; v_rule := 'rate.community.post.hourly'; v_default := 20;
    when 'community_comments' then v_action := 'community.comment'; v_rule := 'rate.community.comment.hourly'; v_default := 60;
    when 'raye2_messages' then v_action := 'chat.message'; v_rule := 'rate.chat.message.hourly'; v_default := 300;
    when 'raye2_safety_reports' then v_action := 'safety.report'; v_rule := 'rate.safety.report.hourly'; v_default := 20;
    else return new;
  end case;
  perform public.raye2_rate_limit(v_action, v_rule, v_default, 3600);
  return new;
end;
$$;
revoke all on function public.raye2_enforce_rate_limit() from public,anon,authenticated;
drop trigger if exists raye2_posts_rate_limit on public.community_posts;
create trigger raye2_posts_rate_limit before insert on public.community_posts
for each row execute function public.raye2_enforce_rate_limit();
drop trigger if exists raye2_comments_rate_limit on public.community_comments;
create trigger raye2_comments_rate_limit before insert on public.community_comments
for each row execute function public.raye2_enforce_rate_limit();
drop trigger if exists raye2_messages_rate_limit on public.raye2_messages;
create trigger raye2_messages_rate_limit before insert on public.raye2_messages
for each row execute function public.raye2_enforce_rate_limit();
drop trigger if exists raye2_safety_reports_rate_limit on public.raye2_safety_reports;
create trigger raye2_safety_reports_rate_limit before insert on public.raye2_safety_reports
for each row execute function public.raye2_enforce_rate_limit();

-- 5. Caller's own usage for the current window.
create or replace function public.raye2_get_rate_limit_usage()
returns table (action text, rule_key text, limit_value integer, used integer)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  return query
    select m.action, m.rule_key, public.raye2_rule_int(m.rule_key, m.default_limit),
           coalesce((select c.count from public.raye2_rate_limit_counters c
                      where c.user_id = auth.uid() and c.action = m.action
                        and c.window_start = to_timestamp(floor(extract(epoch from now()) / 3600) * 3600)), 0)
    from (values
      ('community.post','rate.community.post.hourly',20),
      ('community.comment','rate.community.comment.hourly',60),
      ('chat.message','rate.chat.message.hourly',300),
      ('safety.report','rate.safety.report.hourly',20)
    ) as m(action, rule_key, default_limit);
end;
$fn$;
revoke all on function public.raye2_get_rate_limit_usage() from public,anon;
grant execute on function public.raye2_get_rate_limit_usage() to authenticated;

-- 6. Platform-admin overview: busiest actions in the current window.
create or replace function public.raye2_get_rate_limit_stats(p_limit integer default 50)
returns table (action text, window_start timestamptz, accounts bigint, total bigint, peak integer)
language plpgsql stable security definer set search_path=''
as $fn$
begin
  if not public.raye2_is_platform_admin() then raise exception 'platform admin access required' using errcode='42501'; end if;
  return query
    with bounded as (select least(greatest(coalesce(p_limit,50),1),200) as lim)
    select c.action, c.window_start, count(distinct c.user_id), sum(c.count)::bigint, max(c.count)
    from public.raye2_rate_limit_counters c
    cross join bounded b
    where c.window_start >= now() - interval '2 hours'
    group by c.action, c.window_start
    order by sum(c.count) desc
    limit (select lim from bounded);
end;
$fn$;
revoke all on function public.raye2_get_rate_limit_stats(integer) from public,anon;
grant execute on function public.raye2_get_rate_limit_stats(integer) to authenticated;

notify pgrst, 'reload schema';

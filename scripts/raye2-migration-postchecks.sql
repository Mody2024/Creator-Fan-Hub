-- Invariants asserted after every migration has applied on a real PostgreSQL server.
-- Run by scripts/raye2-migration-check.mjs. Any failed assertion raises and fails the check.

do $$
declare
  v_offenders text;
begin
  -- Every application table in the public schema must have row level security on.
  select string_agg(c.relname, ', ' order by c.relname) into v_offenders
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity;
  if v_offenders is not null then
    raise exception 'public tables without row level security: %', v_offenders;
  end if;

  -- Every SECURITY DEFINER function must pin search_path to prevent hijacking.
  select string_agg(p.proname, ', ' order by p.proname) into v_offenders
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname in ('public', 'private')
    and p.prosecdef
    and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'));
  if v_offenders is not null then
    raise exception 'security definer functions without a pinned search_path: %', v_offenders;
  end if;
end $$;

do $$
declare
  v_ok boolean;
begin
  -- Batch 9: disappearing messages and group slow mode columns/constraints exist.
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'raye2_conversations' and column_name = 'disappearing_seconds'
  ) into v_ok;
  if not v_ok then raise exception 'raye2_conversations.disappearing_seconds is missing'; end if;

  -- Batch 10: chat polls tables exist and are RLS locked.
  select exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'raye2_message_polls' and c.relrowsecurity) into v_ok;
  if not v_ok then raise exception 'raye2_message_polls is missing or lacks row level security'; end if;

  -- Batch 11: group profile editor and moderation log exist and are RLS locked.
  select exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'raye2_update_group_profile') into v_ok;
  if not v_ok then raise exception 'raye2_update_group_profile is missing'; end if;
  select exists (select 1 from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = 'raye2_group_moderation_log' and c.relrowsecurity) into v_ok;
  if not v_ok then raise exception 'raye2_group_moderation_log is missing or lacks row level security'; end if;

  -- Storage control plane: the service-only commit path is not reachable by anon or authenticated.
  if has_function_privilege('anon', 'public.raye2_commit_storage_object(uuid,text,text,bigint,text,text,text,text,uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.raye2_commit_storage_object(uuid,text,text,bigint,text,text,text,text,uuid)', 'execute')
    or has_function_privilege('anon', 'public.raye2_reserve_storage(uuid,text,text,text,bigint,text,integer)', 'execute') then
    raise exception 'storage reservation RPCs must be service-role only';
  end if;
end $$;

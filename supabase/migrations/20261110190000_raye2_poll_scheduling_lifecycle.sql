-- Raye2 Wave 5 polls depth: a full creator poll lifecycle.
--
-- Gaps closed here:
--   * The schema and status check already allowed a 'scheduled' poll, but no RPC could
--     move a draft into 'scheduled', so a creator had to be online at open time.
--   * A draft poll could not be corrected (title/description/options/dates) or removed.
--   * Nothing opened a scheduled poll when its start time arrived.
--
-- All mutations are guarded SECURITY DEFINER RPCs pinned to an empty search_path. The
-- lazy auto-open promoter is callable by anon/authenticated so the public vote page can
-- self-heal without pg_cron, while still respecting the one-open-poll invariant.

-- Correct the contents of a poll that has not opened yet.
create or replace function public.raye2_update_creator_poll(
  p_poll_id uuid,
  p_title text,
  p_description text,
  p_options jsonb,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns table (updated boolean, result_code text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_option jsonb;
  v_label text;
  v_position integer := 0;
  v_count integer;
begin
  if (select auth.uid()) is null or not public.can_edit_creator_content() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  if p_poll_id is null then
    raise exception 'poll id is required' using errcode = '22023';
  end if;
  select status into v_status from public.polls where id = p_poll_id for update;
  if not found then
    return query select false, 'not_found'::text;
    return;
  end if;
  if v_status not in ('draft','scheduled') then
    return query select false, 'not_editable'::text;
    return;
  end if;
  if exists (select 1 from public.poll_votes where poll_id = p_poll_id) then
    return query select false, 'already_voted'::text;
    return;
  end if;
  if length(btrim(coalesce(p_title,''))) not between 4 and 160
     or length(btrim(coalesce(p_description,''))) > 1000
     or jsonb_typeof(p_options) <> 'array'
     or jsonb_array_length(p_options) not between 2 and 8
     or (p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at) then
    raise exception 'invalid poll configuration' using errcode = '22023';
  end if;
  for v_option in select value from jsonb_array_elements(p_options)
  loop
    v_label := btrim(coalesce(v_option #>> '{}',''));
    if length(v_label) not between 1 and 180 then
      raise exception 'each option must contain 1-180 characters' using errcode = '22023';
    end if;
    if exists (select 1 from jsonb_array_elements(p_options) e where lower(btrim(e.value #>> '{}')) = lower(v_label) and e.value <> v_option) then
      raise exception 'poll options must be unique' using errcode = '22023';
    end if;
  end loop;
  update public.polls
  set title = btrim(p_title),
      description = btrim(coalesce(p_description,'')),
      starts_at = p_starts_at,
      ends_at = p_ends_at
  where id = p_poll_id;
  delete from public.poll_options where poll_id = p_poll_id;
  for v_option in select value from jsonb_array_elements(p_options)
  loop
    insert into public.poll_options(poll_id, label, position)
    values (p_poll_id, btrim(v_option #>> '{}'), v_position);
    v_position := v_position + 1;
  end loop;
  insert into public.admin_audit_log(actor_id, action, resource_type, resource_id, details)
  values ((select auth.uid()), 'poll.updated', 'poll', p_poll_id::text, jsonb_build_object('option_count', v_position));
  return query select true, 'updated'::text;
end;
$fn$;
revoke all on function public.raye2_update_creator_poll(uuid,text,text,jsonb,timestamptz,timestamptz) from public, anon;
grant execute on function public.raye2_update_creator_poll(uuid,text,text,jsonb,timestamptz,timestamptz) to authenticated;

-- Stage a draft to open automatically at a future time.
create or replace function public.raye2_schedule_creator_poll(p_poll_id uuid, p_starts_at timestamptz)
returns table (scheduled boolean, result_code text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_ends timestamptz;
  v_previous text;
begin
  if (select auth.uid()) is null or not public.can_edit_creator_content() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  if p_poll_id is null or p_starts_at is null then
    raise exception 'poll id and start time are required' using errcode = '22023';
  end if;
  if p_starts_at <= now() then
    raise exception 'scheduled time must be in the future' using errcode = '22023';
  end if;
  select status, ends_at into v_status, v_ends from public.polls where id = p_poll_id for update;
  if not found then
    return query select false, 'not_found'::text;
    return;
  end if;
  if v_status not in ('draft','scheduled') then
    return query select false, 'not_schedulable'::text;
    return;
  end if;
  if (select count(*) from public.poll_options where poll_id = p_poll_id) < 2 then
    raise exception 'poll requires at least two options' using errcode = '22023';
  end if;
  if v_ends is not null and v_ends <= p_starts_at then
    raise exception 'the closing time must be later than the opening time' using errcode = '22023';
  end if;
  v_previous := v_status;
  update public.polls set status = 'scheduled', starts_at = p_starts_at where id = p_poll_id;
  insert into public.admin_audit_log(actor_id, action, resource_type, resource_id, details)
  values ((select auth.uid()), 'poll.scheduled', 'poll', p_poll_id::text, jsonb_build_object('from', v_previous, 'starts_at', p_starts_at));
  return query select true, 'scheduled'::text;
end;
$fn$;
revoke all on function public.raye2_schedule_creator_poll(uuid,timestamptz) from public, anon;
grant execute on function public.raye2_schedule_creator_poll(uuid,timestamptz) to authenticated;

-- Remove a poll that has not opened and has no votes. Options cascade away.
create or replace function public.raye2_delete_creator_poll(p_poll_id uuid)
returns table (deleted boolean, result_code text)
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_status text;
  v_count integer;
begin
  if (select auth.uid()) is null or not public.can_edit_creator_content() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  if p_poll_id is null then
    raise exception 'poll id is required' using errcode = '22023';
  end if;
  select status into v_status from public.polls where id = p_poll_id for update;
  if not found then
    return query select false, 'not_found'::text;
    return;
  end if;
  if v_status not in ('draft','scheduled') then
    return query select false, 'not_deletable'::text;
    return;
  end if;
  if exists (select 1 from public.poll_votes where poll_id = p_poll_id) then
    return query select false, 'already_voted'::text;
    return;
  end if;
  delete from public.polls where id = p_poll_id;
  get diagnostics v_count = row_count;
  insert into public.admin_audit_log(actor_id, action, resource_type, resource_id, details)
  values ((select auth.uid()), 'poll.deleted', 'poll', p_poll_id::text, jsonb_build_object('from', v_status));
  return query select v_count = 1, 'deleted'::text;
end;
$fn$;
revoke all on function public.raye2_delete_creator_poll(uuid) from public, anon;
grant execute on function public.raye2_delete_creator_poll(uuid) to authenticated;

-- Promote a due scheduled poll to open. Respects the one-open-poll invariant: at most
-- one due poll opens per call, and only when no other poll is already open.
create or replace function public.raye2_open_due_polls()
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_opened integer := 0;
begin
  if exists (select 1 from public.polls where status = 'open') then
    return 0;
  end if;
  with due as (
    update public.polls p
    set status = 'open'
    where p.id = (
      select p2.id from public.polls p2
      where p2.status = 'scheduled'
        and p2.starts_at is not null
        and p2.starts_at <= now()
        and (p2.ends_at is null or p2.ends_at > now())
        and (select count(*) from public.poll_options o where o.poll_id = p2.id) >= 2
      order by p2.starts_at asc
      limit 1
    )
    returning 1
  )
  select count(*) into v_opened from due;
  return v_opened;
end;
$fn$;
revoke all on function public.raye2_open_due_polls() from public;
grant execute on function public.raye2_open_due_polls() to anon, authenticated;
notify pgrst, 'reload schema';

-- Raye2 events RSVP: members can mark themselves going to a published event, and the
-- public calendar can show attendance counts.
--
-- This is additive: the events table already exists with public read policies. This
-- migration adds the RSVP table, its policies and the RPCs the UI uses.

create table if not exists public.event_rsvps (
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'going' check (status in ('going','interested')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (event_id, user_id)
);
create index if not exists event_rsvps_event_idx on public.event_rsvps(event_id, status);

alter table public.event_rsvps enable row level security;

-- Aggregate attendance is public; individual rows are only readable by their owner.
grant select, insert, update, delete on public.event_rsvps to authenticated;

drop policy if exists "Members read own rsvp" on public.event_rsvps;
create policy "Members read own rsvp"
on public.event_rsvps for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Members create own rsvp" on public.event_rsvps;
create policy "Members create own rsvp"
on public.event_rsvps for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (select 1 from public.events e where e.id = event_id and e.status in ('published','completed'))
);

drop policy if exists "Members update own rsvp" on public.event_rsvps;
create policy "Members update own rsvp"
on public.event_rsvps for update to authenticated
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "Members remove own rsvp" on public.event_rsvps;
create policy "Members remove own rsvp"
on public.event_rsvps for delete to authenticated
using (user_id = (select auth.uid()));

-- Public calendar feed: published/completed events with attendance counts and, when the
-- caller is authenticated, whether they are going.
create or replace function public.raye2_get_public_events(p_limit integer default 24)
returns table (
  id uuid,
  title text,
  description text,
  starts_at timestamptz,
  ends_at timestamptz,
  status text,
  going_count integer,
  my_rsvp boolean
)
language plpgsql
security definer
set search_path = ''
as $fn$
#variable_conflict use_column
declare
  v_limit integer := least(greatest(coalesce(p_limit, 24), 1), 60);
  v_me uuid := (select auth.uid());
begin
  return query
    select e.id, e.title, e.description, e.starts_at, e.ends_at, e.status,
      coalesce(r.going_count, 0)::integer as going_count,
      coalesce(r.mine, false) as my_rsvp
    from public.events e
    left join (
      select event_id,
        count(*) filter (where status = 'going') as going_count,
        bool_or(user_id = v_me and status = 'going') as mine
      from public.event_rsvps
      group by event_id
    ) r on r.event_id = e.id
    where e.status in ('published', 'completed')
    order by (e.starts_at is null), e.starts_at asc, e.created_at desc
    limit v_limit;
end;
$fn$;
revoke all on function public.raye2_get_public_events(integer) from public;
grant execute on function public.raye2_get_public_events(integer) to anon, authenticated;

-- Set (or update) the caller's RSVP. Returns the event's going count after the change.
create or replace function public.raye2_set_event_rsvp(p_event_id uuid, p_status text default 'going')
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_count integer;
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_status not in ('going', 'interested') then
    raise exception 'invalid rsvp status' using errcode = '22023';
  end if;
  if p_event_id is null or not exists (
    select 1 from public.events where id = p_event_id and status in ('published', 'completed')
  ) then
    raise exception 'event not available' using errcode = '22023';
  end if;

  insert into public.event_rsvps(event_id, user_id, status)
  values (p_event_id, v_me, p_status)
  on conflict (event_id, user_id) do update set status = excluded.status, updated_at = now();

  select count(*)::integer into v_count
  from public.event_rsvps where event_id = p_event_id and status = 'going';
  return v_count;
end;
$fn$;
revoke all on function public.raye2_set_event_rsvp(uuid,text) from public, anon;
grant execute on function public.raye2_set_event_rsvp(uuid,text) to authenticated;

-- Clear the caller's RSVP. Returns the event's going count after the change.
create or replace function public.raye2_clear_event_rsvp(p_event_id uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $fn$
declare
  v_me uuid := (select auth.uid());
  v_count integer;
begin
  if v_me is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;
  if p_event_id is null then
    raise exception 'invalid event' using errcode = '22023';
  end if;

  delete from public.event_rsvps where event_id = p_event_id and user_id = v_me;

  select count(*)::integer into v_count
  from public.event_rsvps where event_id = p_event_id and status = 'going';
  return v_count;
end;
$fn$;
revoke all on function public.raye2_clear_event_rsvp(uuid) from public, anon;
grant execute on function public.raye2_clear_event_rsvp(uuid) to authenticated;

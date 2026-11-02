-- Fail closed for public community features when the published config is missing.
-- A missing primary snapshot must never silently enable voting or expose community content.
create or replace function public.get_public_approved_ideas()
returns table (idea_id uuid, display_name text, idea_title text, idea_body text, submitted_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, i.display_name, i.title, i.body, i.submitted_at
  from public.ideas i
  where i.status in ('approved', 'featured')
    and exists (
      select 1
      from public.published_site_config c
      where c.config_key = 'primary'
        and not coalesce(c.maintenance_mode, false)
        and coalesce((c.published #>> '{featureFlags,ideas}')::boolean, true)
    )
  order by case when i.status = 'featured' then 0 else 1 end, i.submitted_at desc
  limit 30;
$$;
revoke all on function public.get_public_approved_ideas() from public;
grant execute on function public.get_public_approved_ideas() to anon, authenticated;

create or replace function public.get_public_poll_results()
returns table (
  poll_id uuid,
  poll_title text,
  poll_description text,
  poll_status text,
  poll_ends_at timestamptz,
  option_id uuid,
  option_label text,
  option_position integer,
  vote_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.title, p.description, p.status, p.ends_at,
         o.id, o.label, o.position,
         case when p.status = 'closed' then count(v.id)::bigint else 0::bigint end
  from public.polls p
  join public.poll_options o on o.poll_id = p.id
  left join public.poll_votes v on v.poll_id = p.id and v.option_id = o.id
  where p.status in ('open','closed')
    and (p.status = 'closed' or p.starts_at is null or p.starts_at <= now())
    and (p.status = 'closed' or p.ends_at is null or p.ends_at > now())
    and exists (
      select 1
      from public.published_site_config c
      where c.config_key = 'primary'
        and not coalesce(c.maintenance_mode, false)
        and coalesce((c.published #>> '{featureFlags,polls}')::boolean, true)
    )
  group by p.id, p.title, p.description, p.status, p.ends_at, o.id, o.label, o.position
  order by case when p.status = 'open' then 0 else 1 end, p.ends_at desc nulls last, p.created_at desc, o.position asc;
$$;
revoke all on function public.get_public_poll_results() from public;
grant execute on function public.get_public_poll_results() to anon, authenticated;

create or replace function public.cast_public_poll_vote(
  p_poll_id uuid,
  p_option_id uuid,
  p_voter_token text
)
returns table (accepted boolean, result_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hash text;
  v_inserted integer;
begin
  if p_poll_id is null or p_option_id is null
     or p_voter_token is null
     or length(p_voter_token) < 32
     or length(p_voter_token) > 160
     or p_voter_token !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'invalid vote request' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.published_site_config c
    where c.config_key = 'primary'
      and not coalesce(c.maintenance_mode, false)
      and coalesce((c.published #>> '{featureFlags,polls}')::boolean, true)
  ) then
    return query select false, 'polls_unavailable'::text;
    return;
  end if;

  if not exists (
    select 1 from public.polls p
    where p.id = p_poll_id
      and p.status = 'open'
      and (p.starts_at is null or p.starts_at <= now())
      and (p.ends_at is null or p.ends_at > now())
  ) then
    return query select false, 'poll_closed'::text;
    return;
  end if;

  if not exists (
    select 1 from public.poll_options o
    where o.id = p_option_id and o.poll_id = p_poll_id
  ) then
    raise exception 'option does not belong to poll' using errcode = '22023';
  end if;

  v_hash := encode(extensions.digest(convert_to(p_voter_token, 'UTF8'), 'sha256'), 'hex');

  insert into public.poll_votes (poll_id, option_id, voter_token_hash)
  values (p_poll_id, p_option_id, v_hash)
  on conflict (poll_id, voter_token_hash) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return query select true, 'vote_recorded'::text;
  else
    return query select false, 'already_voted'::text;
  end if;
end;
$$;
revoke all on function public.cast_public_poll_vote(uuid, uuid, text) from public;
grant execute on function public.cast_public_poll_vote(uuid, uuid, text) to anon, authenticated;

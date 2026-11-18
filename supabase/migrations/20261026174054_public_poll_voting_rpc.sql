-- Public voting: one vote per poll per browser-generated anonymous token.
-- The server hashes the token; raw tokens are never stored. This is abuse friction,
-- not proof of one vote per real person (tokens can be reset on a device).
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

  if exists (
    select 1 from public.published_site_config c
    where c.config_key = 'primary'
      and (
        coalesce(c.maintenance_mode, false)
        or coalesce((c.published #>> '{featureFlags,polls}')::boolean, true) = false
      )
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

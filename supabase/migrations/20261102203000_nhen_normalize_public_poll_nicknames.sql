-- Normalize fan-provided display names at the database boundary.
-- This keeps public voter labels readable regardless of client implementation.
create or replace function public.cast_public_poll_vote(
  p_poll_id uuid,
  p_option_id uuid,
  p_display_name text,
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
  v_name text := regexp_replace(btrim(coalesce(p_display_name, '')), '[[:space:]]+', ' ', 'g');
begin
  if p_poll_id is null or p_option_id is null
     or length(v_name) not between 1 and 32
     or v_name ~ '[[:cntrl:]]'
     or p_voter_token is null
     or length(p_voter_token) < 32
     or length(p_voter_token) > 160
     or p_voter_token !~ '^[A-Za-z0-9_-]+$' then
    raise exception 'Please enter a nickname (1–32 characters) and try again.' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.published_site_config c
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

  insert into public.poll_votes (poll_id, option_id, voter_token_hash, voter_display_name)
  values (p_poll_id, p_option_id, v_hash, v_name)
  on conflict (poll_id, voter_token_hash) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    return query select true, 'vote_recorded'::text;
  else
    return query select false, 'already_voted'::text;
  end if;
end;
$$;

revoke all on function public.cast_public_poll_vote(uuid, uuid, text, text) from public;
grant execute on function public.cast_public_poll_vote(uuid, uuid, text, text) to anon, authenticated;
notify pgrst, 'reload schema';

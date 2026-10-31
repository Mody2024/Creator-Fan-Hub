-- Open polls remain discoverable for voting, but open tallies stay hidden.
-- Closed polls expose final aggregates. Missing/disabled config fails closed.
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
      select 1 from public.published_site_config c
      where c.config_key = 'primary'
        and not coalesce(c.maintenance_mode, false)
        and coalesce((c.published #>> '{featureFlags,polls}')::boolean, true)
    )
  group by p.id, p.title, p.description, p.status, p.ends_at, o.id, o.label, o.position
  order by case when p.status = 'open' then 0 else 1 end,
           p.ends_at desc nulls last, p.created_at desc, o.position asc;
$$;
revoke all on function public.get_public_poll_results() from public;
grant execute on function public.get_public_poll_results() to anon, authenticated;

-- Add a bounded creator-only voter list for poll review.
-- The later role-based permissions migration upgrades this guard to the
-- can_view_creator_workspace capability without changing the result contract.
create or replace function public.get_creator_poll_voters(
  p_poll_id uuid,
  p_limit integer default 100
)
returns table(display_name text, option_label text, voted_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null or not public.can_view_creator_workspace() then
    raise exception 'creator access required' using errcode='42501';
  end if;
  if p_poll_id is null then
    raise exception 'poll id required' using errcode='22023';
  end if;
  if not exists(select 1 from public.polls p where p.id=p_poll_id) then
    raise exception 'poll not found' using errcode='P0002';
  end if;
  return query
    select v.voter_display_name,o.label,v.created_at
    from public.poll_votes v
    join public.poll_options o on o.id=v.option_id and o.poll_id=v.poll_id
    where v.poll_id=p_poll_id
    order by v.created_at desc
    limit least(greatest(coalesce(p_limit,100),1),200);
end;
$$;
revoke all on function public.get_creator_poll_voters(uuid,integer) from public,anon;
grant execute on function public.get_creator_poll_voters(uuid,integer) to authenticated;

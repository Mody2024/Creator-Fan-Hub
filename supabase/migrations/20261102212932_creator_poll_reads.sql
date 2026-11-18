-- Creator-only reads for poll drafts and their options. Public table policies
-- intentionally expose only open/closed polls, so the dashboard must use guarded RPCs.
create or replace function public.get_creator_polls(p_limit integer default 50)
returns table (
  poll_id uuid,
  title text,
  description text,
  status text,
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode='42501';
  end if;
  return query select p.id,p.title,p.description,p.status,p.starts_at,p.ends_at,p.created_at
    from public.polls p
    order by p.created_at desc
    limit least(greatest(coalesce(p_limit,50),1),100);
end;
$$;

create or replace function public.get_creator_poll_options(p_poll_ids uuid[])
returns table (id uuid,poll_id uuid,label text,option_position integer)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode='42501';
  end if;
  if coalesce(array_length(p_poll_ids,1),0)>100 then
    raise exception 'too many poll ids' using errcode='22023';
  end if;
  return query select o.id,o.poll_id,o.label,o.position
    from public.poll_options o
    where o.poll_id=any(coalesce(p_poll_ids,'{}'::uuid[]))
    order by o.poll_id,o.position;
end;
$$;
revoke all on function public.get_creator_polls(integer) from public,anon;
revoke all on function public.get_creator_poll_options(uuid[]) from public,anon;
grant execute on function public.get_creator_polls(integer) to authenticated;
grant execute on function public.get_creator_poll_options(uuid[]) to authenticated;

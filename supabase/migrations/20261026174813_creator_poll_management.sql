-- Creator-only poll authoring and state transitions.
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
  group by p.id, p.title, p.description, p.status, p.ends_at, o.id, o.label, o.position
  order by case when p.status = 'open' then 0 else 1 end, p.ends_at desc nulls last, p.created_at desc, o.position asc;
$$;
revoke all on function public.get_public_poll_results() from public;
grant execute on function public.get_public_poll_results() to anon, authenticated;

create or replace function public.create_creator_poll(
  p_title text,
  p_description text,
  p_options jsonb,
  p_starts_at timestamptz default null,
  p_ends_at timestamptz default null
)
returns table (created boolean, result_code text, new_poll_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll_id uuid;
  v_option jsonb;
  v_label text;
  v_position integer := 0;
  v_count integer;
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode='42501';
  end if;
  if length(btrim(coalesce(p_title,''))) not between 4 and 160
     or length(btrim(coalesce(p_description,''))) > 1000
     or jsonb_typeof(p_options) <> 'array'
     or jsonb_array_length(p_options) not between 2 and 8
     or (select count(distinct lower(btrim(value #>> '{}'))) from jsonb_array_elements(p_options)) <> jsonb_array_length(p_options)
     or (p_starts_at is not null and p_ends_at is not null and p_ends_at <= p_starts_at) then
    raise exception 'invalid poll configuration' using errcode='22023';
  end if;
  for v_option in select value from jsonb_array_elements(p_options)
  loop
    v_label := btrim(coalesce(v_option #>> '{}',''));
    if length(v_label) not between 1 and 180 then
      raise exception 'each option must contain 1–180 characters' using errcode='22023';
    end if;
    if exists(select 1 from jsonb_array_elements(p_options) e where lower(btrim(e.value #>> '{}'))=lower(v_label) and e.value <> v_option) then
      raise exception 'poll options must be unique' using errcode='22023';
    end if;
  end loop;
  insert into public.polls(title,description,status,starts_at,ends_at,created_by)
  values(btrim(p_title),btrim(coalesce(p_description,'')),'draft',p_starts_at,p_ends_at,auth.uid())
  returning id into v_poll_id;
  for v_option in select value from jsonb_array_elements(p_options)
  loop
    insert into public.poll_options(poll_id,label,position)
    values(v_poll_id,btrim(v_option #>> '{}'),v_position);
    v_position := v_position + 1;
  end loop;
  insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
  values(auth.uid(),'poll.created','poll',v_poll_id::text,jsonb_build_object('option_count',v_position));
  return query select true,'created'::text,v_poll_id;
end;
$$;

create or replace function public.set_creator_poll_status(p_poll_id uuid,p_new_status text)
returns table (updated boolean,result_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer; v_previous text;
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode='42501';
  end if;
  if p_new_status not in ('open','closed','archived') then
    raise exception 'invalid poll status' using errcode='22023';
  end if;
  select status into v_previous from public.polls where id=p_poll_id for update;
  if not found then return query select false,'not_found'::text; return; end if;
  if p_new_status='open' then
    if (select count(*) from public.poll_options where poll_id=p_poll_id)<2 then
      raise exception 'poll requires at least two options' using errcode='22023';
    end if;
    if exists(select 1 from public.polls where status='open' and id<>p_poll_id) then
      return query select false,'another_poll_open'::text; return;
    end if;
    if exists(select 1 from public.polls where id=p_poll_id and starts_at is not null and starts_at>now()) then
      return query select false,'not_started'::text; return;
    end if;
    if exists(select 1 from public.polls where id=p_poll_id and ends_at is not null and ends_at<=now()) then
      return query select false,'expired'::text; return;
    end if;
  end if;
  update public.polls set status=p_new_status where id=p_poll_id and status in ('draft','scheduled','open','closed','archived');
  get diagnostics v_count=row_count;
  insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
  values(auth.uid(),'poll.status_changed','poll',p_poll_id::text,jsonb_build_object('from',v_previous,'to',p_new_status));
  return query select v_count=1,'updated'::text;
end;
$$;
revoke all on function public.create_creator_poll(text,text,jsonb,timestamptz,timestamptz) from public,anon;
revoke all on function public.set_creator_poll_status(uuid,text) from public,anon;
grant execute on function public.create_creator_poll(text,text,jsonb,timestamptz,timestamptz) to authenticated;
grant execute on function public.set_creator_poll_status(uuid,text) to authenticated;

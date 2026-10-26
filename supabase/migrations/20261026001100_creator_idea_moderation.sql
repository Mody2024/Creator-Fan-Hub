-- Creator-only moderation queue and status transition. Public clients cannot query
-- pending idea rows directly; these functions return only what each workflow needs.
create or replace function public.get_creator_idea_queue(p_limit integer default 50)
returns table (
  idea_id uuid,
  display_name text,
  idea_title text,
  idea_body text,
  idea_status text,
  submitted_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  return query
    select i.id, i.display_name, i.title, i.body, i.status, i.submitted_at
    from public.ideas i
    where i.status in ('pending','approved','rejected','featured','archived')
    order by case when i.status='pending' then 0 else 1 end, i.submitted_at desc
    limit least(greatest(coalesce(p_limit,50),1),100);
end;
$$;
revoke all on function public.get_creator_idea_queue(integer) from public, anon;
grant execute on function public.get_creator_idea_queue(integer) to authenticated;

create or replace function public.moderate_public_idea(p_idea_id uuid, p_new_status text)
returns table (updated boolean, result_code text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode = '42501';
  end if;
  if p_idea_id is null or p_new_status not in ('approved','rejected','featured','archived') then
    raise exception 'invalid moderation action' using errcode = '22023';
  end if;
  update public.ideas
    set status = p_new_status, reviewed_at = now(), reviewed_by = auth.uid()
    where id = p_idea_id and status in ('pending','approved','rejected','featured','archived');
  get diagnostics v_count = row_count;
  if v_count = 0 then
    return query select false, 'not_found'::text;
    return;
  end if;
  insert into public.admin_audit_log(actor_id, action, resource_type, resource_id, details)
  values (auth.uid(), 'idea.moderated', 'idea', p_idea_id::text, jsonb_build_object('new_status',p_new_status));
  return query select true, 'updated'::text;
end;
$$;
revoke all on function public.moderate_public_idea(uuid,text) from public, anon;
grant execute on function public.moderate_public_idea(uuid,text) to authenticated;

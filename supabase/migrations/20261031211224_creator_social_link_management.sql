-- Add owner-only deletion and atomic ordering for creator social links.
create or replace function public.delete_creator_social_link(p_link_id uuid)
returns table(deleted boolean,result_code text)
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer;
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode='42501';
  end if;
  delete from public.social_links where id=p_link_id;
  get diagnostics v_count=row_count;
  if v_count=0 then
    return query select false,'not_found'::text;
    return;
  end if;
  insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
  values(auth.uid(),'social_link.deleted','social_link',p_link_id::text,'{}'::jsonb);
  return query select true,'deleted'::text;
end;
$$;

create or replace function public.reorder_creator_social_links(p_link_ids uuid[])
returns table(reordered boolean,result_code text)
language plpgsql
security definer
set search_path=''
as $$
declare v_count integer; v_distinct integer; v_total integer;
begin
  if auth.uid() is null or not public.is_active_creator() then
    raise exception 'creator access required' using errcode='42501';
  end if;
  if p_link_ids is null or cardinality(p_link_ids)>200 then
    raise exception 'invalid social link order' using errcode='22023';
  end if;
  select count(*),count(distinct x.id) into v_count,v_distinct
  from unnest(p_link_ids) as x(id);
  if v_count<>v_distinct then
    raise exception 'duplicate social link id' using errcode='22023';
  end if;
  select count(*) into v_total from public.social_links;
  if v_total<>v_count or exists (
    select 1 from public.social_links s where not (s.id=any(p_link_ids))
  ) then
    return query select false,'stale_order'::text;
    return;
  end if;
  update public.social_links s
  set position=ordered.ordinality::integer-1
  from unnest(p_link_ids) with ordinality as ordered(id,ordinality)
  where s.id=ordered.id;
  insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
  values(auth.uid(),'social_links.reordered','social_link',null,jsonb_build_object('count',v_count));
  return query select true,'reordered'::text;
end;
$$;

revoke all on function public.delete_creator_social_link(uuid) from public,anon;
revoke all on function public.reorder_creator_social_links(uuid[]) from public,anon;
grant execute on function public.delete_creator_social_link(uuid) to authenticated;
grant execute on function public.reorder_creator_social_links(uuid[]) to authenticated;

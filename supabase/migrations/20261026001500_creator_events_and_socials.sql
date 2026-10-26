-- Guarded creator workflows for event and social-link publishing.
create or replace function public.get_creator_events(p_limit integer default 50)
returns table(event_id uuid,title text,description text,starts_at timestamptz,ends_at timestamptz,status text,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_active_creator() then raise exception 'creator access required' using errcode='42501'; end if;
 return query select e.id,e.title,e.description,e.starts_at,e.ends_at,e.status,e.created_at from public.events e order by e.starts_at desc nulls last,e.created_at desc limit least(greatest(coalesce(p_limit,50),1),100);
end; $$;

create or replace function public.save_creator_event(p_event_id uuid,p_title text,p_description text,p_starts_at timestamptz,p_ends_at timestamptz)
returns table(saved boolean,result_code text,event_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid;
begin
 if auth.uid() is null or not public.is_active_creator() then raise exception 'creator access required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_title,''))) not between 3 and 160 or length(coalesce(p_description,''))>1200 or (p_ends_at is not null and p_starts_at is not null and p_ends_at<=p_starts_at) then raise exception 'invalid event configuration' using errcode='22023'; end if;
 if p_event_id is null then
  insert into public.events(title,description,starts_at,ends_at,status) values(btrim(p_title),btrim(coalesce(p_description,'')),p_starts_at,p_ends_at,'draft') returning id into v_id;
 else
  update public.events set title=btrim(p_title),description=btrim(coalesce(p_description,'')),starts_at=p_starts_at,ends_at=p_ends_at where id=p_event_id returning id into v_id;
  if v_id is null then return query select false,'not_found'::text,null::uuid; return; end if;
 end if;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details) values(auth.uid(),case when p_event_id is null then 'event.created' else 'event.updated' end,'event',v_id::text,jsonb_build_object('title',btrim(p_title)));
 return query select true,'saved'::text,v_id;
end; $$;

create or replace function public.set_creator_event_status(p_event_id uuid,p_status text)
returns table(updated boolean,result_code text)
language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
 if auth.uid() is null or not public.is_active_creator() then raise exception 'creator access required' using errcode='42501'; end if;
 if p_status not in ('published','cancelled','completed','draft') then raise exception 'invalid event status' using errcode='22023'; end if;
 update public.events set status=p_status where id=p_event_id;
 get diagnostics v_count=row_count;
 if v_count=0 then return query select false,'not_found'::text; return; end if;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details) values(auth.uid(),'event.status_changed','event',p_event_id::text,jsonb_build_object('status',p_status));
 return query select true,'updated'::text;
end; $$;

create or replace function public.get_creator_social_links(p_limit integer default 100)
returns table(link_id uuid,label text,url text,platform text,position integer,is_published boolean)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_active_creator() then raise exception 'creator access required' using errcode='42501'; end if;
 return query select s.id,s.label,s.url,s.platform,s.position,s.is_published from public.social_links s order by s.position,s.label limit least(greatest(coalesce(p_limit,100),1),200);
end; $$;

create or replace function public.save_creator_social_link(p_link_id uuid,p_label text,p_url text,p_platform text,p_position integer,p_is_published boolean)
returns table(saved boolean,result_code text,link_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_platform text:=lower(coalesce(p_platform,'custom'));
begin
 if auth.uid() is null or not public.is_active_creator() then raise exception 'creator access required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_label,''))) not between 1 and 80 or length(coalesce(p_url,''))>2048 or p_url !~* '^https?://' or v_platform not in ('youtube','kick','tiktok','instagram','facebook','twitch','discord','x','other','custom') or p_position not between 0 and 999 then raise exception 'invalid social link' using errcode='22023'; end if;
 if p_link_id is null then
  insert into public.social_links(label,url,platform,position,is_published) values(btrim(p_label),p_url,v_platform,p_position,coalesce(p_is_published,false)) returning id into v_id;
 else
  update public.social_links set label=btrim(p_label),url=p_url,platform=v_platform,position=p_position,is_published=coalesce(p_is_published,false) where id=p_link_id returning id into v_id;
  if v_id is null then return query select false,'not_found'::text,null::uuid; return; end if;
 end if;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details) values(auth.uid(),case when p_link_id is null then 'social_link.created' else 'social_link.updated' end,'social_link',v_id::text,jsonb_build_object('platform',v_platform,'published',coalesce(p_is_published,false)));
 return query select true,'saved'::text,v_id;
end; $$;

revoke all on function public.get_creator_events(integer) from public,anon;
revoke all on function public.save_creator_event(uuid,text,text,timestamptz,timestamptz) from public,anon;
revoke all on function public.set_creator_event_status(uuid,text) from public,anon;
revoke all on function public.get_creator_social_links(integer) from public,anon;
revoke all on function public.save_creator_social_link(uuid,text,text,text,integer,boolean) from public,anon;
grant execute on function public.get_creator_events(integer) to authenticated;
grant execute on function public.save_creator_event(uuid,text,text,timestamptz,timestamptz) to authenticated;
grant execute on function public.set_creator_event_status(uuid,text) to authenticated;
grant execute on function public.get_creator_social_links(integer) to authenticated;
grant execute on function public.save_creator_social_link(uuid,text,text,text,integer,boolean) to authenticated;

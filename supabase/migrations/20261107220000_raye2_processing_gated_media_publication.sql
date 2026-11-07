-- Raye2: server-authoritative media publication gate.
-- Native files cannot become public until the trusted processing worker marks
-- the owner-bound asset ready. YouTube remains an external hosted source.
create or replace function public.save_creator_media(
 p_media_id uuid,
 p_title text,
 p_media_type text,
 p_source_url text,
 p_storage_path text,
 p_alt_text text,
 p_metadata jsonb,
 p_is_published boolean
)
returns table(saved boolean,result_code text,media_id uuid)
language plpgsql
security definer
set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_id uuid;
 v_bucket text;
 v_media public.media_items%rowtype;
 v_is_youtube boolean:=p_media_type='youtube';
begin
 if v_user is null or not exists(
  select 1 from public.creator_admins a
  where a.user_id=v_user and a.active=true
 ) then
  raise exception 'creator access required' using errcode='42501';
 end if;

 if length(btrim(coalesce(p_title,''))) not between 1 and 120
  or length(coalesce(p_alt_text,''))>500
  or p_media_type not in ('youtube','video','image','audio','sprite','model3d')
  or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object'
  or length(coalesce(p_storage_path,''))>500 then
  raise exception 'invalid media metadata' using errcode='22023';
 end if;

 if v_is_youtube then
  if p_storage_path is not null
   or p_source_url !~* '^https://www\.youtube\.com/watch\?v=[A-Za-z0-9_-]{11}$' then
   raise exception 'invalid YouTube source' using errcode='22023';
  end if;
 else
  if p_source_url is not null
   or p_storage_path !~ '^creator-media-(private|public)/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$' then
   raise exception 'invalid native media storage path' using errcode='22023';
  end if;
  if split_part(p_storage_path,'/',2)<>v_user::text then
   raise exception 'media path must belong to the current creator' using errcode='42501';
  end if;
  v_bucket:=split_part(p_storage_path,'/',1);
  if (coalesce(p_is_published,false) and v_bucket<>'creator-media-public')
   or (not coalesce(p_is_published,false) and v_bucket<>'creator-media-private') then
   raise exception 'storage visibility does not match publication state' using errcode='22023';
  end if;
 end if;

 if p_media_id is null then
  if coalesce(p_is_published,false) then
   raise exception 'new media must be saved as a private draft before publication' using errcode='22023';
  end if;
  insert into public.media_items(
   owner_id,title,media_type,source_url,storage_path,alt_text,metadata,is_published
  ) values(
   v_user,btrim(p_title),p_media_type,p_source_url,p_storage_path,
   btrim(coalesce(p_alt_text,'')),coalesce(p_metadata,'{}'::jsonb),false
  ) returning id into v_id;
 else
  select * into v_media from public.media_items m
  where m.id=p_media_id and m.owner_id=v_user
  for update;
  if not found then
   return query select false,'not_found_or_not_owned'::text,null::uuid;
   return;
  end if;
  if coalesce(p_is_published,false) and not v_is_youtube
   and v_media.processing_status is distinct from 'ready' then
   raise exception 'native media must finish processing before publication' using errcode='22023';
  end if;
  update public.media_items set
   title=btrim(p_title),
   media_type=p_media_type,
   source_url=p_source_url,
   storage_path=p_storage_path,
   alt_text=btrim(coalesce(p_alt_text,'')),
   metadata=coalesce(p_metadata,'{}'::jsonb),
   is_published=coalesce(p_is_published,false)
  where id=p_media_id and owner_id=v_user
  returning id into v_id;
 end if;

 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(
  v_user,
  case when p_media_id is null then 'media.created' else 'media.updated' end,
  'media',v_id::text,
  jsonb_build_object('type',p_media_type,'published',coalesce(p_is_published,false))
 );
 return query select true,'saved'::text,v_id;
end;
$$;

revoke all on function public.save_creator_media(uuid,text,text,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_creator_media(uuid,text,text,text,text,text,jsonb,boolean) to authenticated;

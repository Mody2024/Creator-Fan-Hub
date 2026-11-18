-- Creator media library: private drafts and separately published public assets.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('creator-media-private','creator-media-private',false,52428800,array['image/jpeg','image/png','image/webp','image/gif','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg'])
on conflict (id) do update set public=false,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values
 ('creator-media-public','creator-media-public',true,52428800,array['image/jpeg','image/png','image/webp','image/gif','image/svg+xml','video/mp4','video/webm','audio/mpeg','audio/mp4','audio/wav','audio/ogg'])
on conflict (id) do update set public=true,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Creators manage private media objects" on storage.objects;
create policy "Creators manage private media objects" on storage.objects
for all to authenticated
using (bucket_id='creator-media-private' and exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true))
with check (bucket_id='creator-media-private' and exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true));

drop policy if exists "Creators manage public media objects" on storage.objects;
create policy "Creators manage public media objects" on storage.objects
for all to authenticated
using (bucket_id='creator-media-public' and exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true))
with check (bucket_id='creator-media-public' and exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true));

drop policy if exists "Anyone can read published media objects" on storage.objects;
create policy "Anyone can read published media objects" on storage.objects
for select to anon,authenticated using (bucket_id='creator-media-public');

create or replace function public.get_creator_media(p_limit integer default 100)
returns table(media_id uuid,title text,media_type text,source_url text,storage_path text,alt_text text,metadata jsonb,is_published boolean,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true) then
  raise exception 'creator access required' using errcode='42501';
 end if;
 return query select m.id,m.title,m.media_type,m.source_url,m.storage_path,m.alt_text,m.metadata,m.is_published,m.created_at
 from public.media_items m order by m.created_at desc limit least(greatest(coalesce(p_limit,100),1),200);
end; $$;

create or replace function public.save_creator_media(p_media_id uuid,p_title text,p_media_type text,p_source_url text,p_storage_path text,p_alt_text text,p_metadata jsonb,p_is_published boolean)
returns table(saved boolean,result_code text,media_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_bucket text;
begin
 if auth.uid() is null or not exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true) then
  raise exception 'creator access required' using errcode='42501';
 end if;
 if length(btrim(coalesce(p_title,''))) not between 1 and 120
 or length(coalesce(p_alt_text,''))>500
 or p_media_type not in ('video','image','audio','sprite','model3d')
 or length(coalesce(p_storage_path,''))>500
 or p_storage_path !~ '^(creator-media-private|creator-media-public)/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$'
 or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb)) <> 'object' then
  raise exception 'invalid media metadata' using errcode='22023';
 end if;
 v_bucket:=split_part(p_storage_path,'/',1);
 if (coalesce(p_is_published,false) and v_bucket<>'creator-media-public') or (not coalesce(p_is_published,false) and v_bucket<>'creator-media-private') then
  raise exception 'storage visibility does not match publication state' using errcode='22023';
 end if;
 if p_source_url is not null and p_source_url !~* '^https?://' then raise exception 'invalid media URL' using errcode='22023'; end if;
 if p_media_id is null then
  insert into public.media_items(title,media_type,source_url,storage_path,alt_text,metadata,is_published)
  values(btrim(p_title),p_media_type,p_source_url,p_storage_path,btrim(coalesce(p_alt_text,'')),coalesce(p_metadata,'{}'::jsonb),coalesce(p_is_published,false)) returning id into v_id;
 else
  update public.media_items set title=btrim(p_title),media_type=p_media_type,source_url=p_source_url,storage_path=p_storage_path,alt_text=btrim(coalesce(p_alt_text,'')),metadata=coalesce(p_metadata,'{}'::jsonb),is_published=coalesce(p_is_published,false)
  where id=p_media_id returning id into v_id;
  if v_id is null then return query select false,'not_found'::text,null::uuid; return; end if;
 end if;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),case when p_media_id is null then 'media.created' else 'media.updated' end,'media',v_id::text,jsonb_build_object('type',p_media_type,'published',coalesce(p_is_published,false)));
 return query select true,'saved'::text,v_id;
end; $$;

revoke all on function public.get_creator_media(integer) from public,anon,authenticated;
revoke all on function public.save_creator_media(uuid,text,text,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.get_creator_media(integer) to authenticated;
grant execute on function public.save_creator_media(uuid,text,text,text,text,text,jsonb,boolean) to authenticated;

create or replace function public.delete_creator_media(p_media_id uuid)
returns table(deleted boolean,result_code text,storage_path text)
language plpgsql security definer set search_path=''
as $$
declare v_path text;
begin
 if auth.uid() is null or not public.is_active_creator() then raise exception 'creator access required' using errcode='42501'; end if;
 select m.storage_path into v_path from public.media_items m where m.id=p_media_id and m.is_published=false and m.storage_path like 'creator-media-private/%';
 if v_path is null then return query select false,'not_found_or_published'::text,null::text; return; end if;
 delete from public.media_items where id=p_media_id;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),'media.deleted','media',p_media_id::text,jsonb_build_object('storage_path',v_path));
 return query select true,'deleted'::text,v_path;
end; $$;
revoke all on function public.delete_creator_media(uuid) from public,anon,authenticated;
grant execute on function public.delete_creator_media(uuid) to authenticated;


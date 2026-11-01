-- Secure YouTube sources in NHEN creator media.
create or replace function public.save_creator_media(
 p_media_id uuid,p_title text,p_media_type text,p_source_url text,p_storage_path text,p_alt_text text,p_metadata jsonb,p_is_published boolean
) returns table(saved boolean,result_code text,media_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_bucket text; v_video_id text;
begin
 if auth.uid() is null or not public.is_nhen_video_publisher() then raise exception 'video publisher access required' using errcode='42501'; end if;
 if length(btrim(coalesce(p_title,''))) not between 1 and 120 or length(coalesce(p_alt_text,''))>500
   or p_media_type not in ('youtube','video','image','audio','sprite') or length(coalesce(p_storage_path,''))>500
   or jsonb_typeof(coalesce(p_metadata,'{}'::jsonb))<>'object' then raise exception 'invalid media metadata' using errcode='22023'; end if;
 if p_media_type='youtube' then
   if p_storage_path is not null or p_source_url !~ '^https://www[.]youtube[.]com/watch[?]v=[A-Za-z0-9_-]{11}$' then raise exception 'invalid YouTube source' using errcode='22023'; end if;
   v_video_id:=substring(p_source_url from '[?]v=([A-Za-z0-9_-]{11})$');
 else
   if p_storage_path is null or p_storage_path !~ '^(creator-media-private|creator-media-public)/[a-zA-Z0-9_-]+/[a-zA-Z0-9_.-]+$' then raise exception 'valid media storage path required' using errcode='22023'; end if;
   v_bucket:=split_part(p_storage_path,'/',1);
   if split_part(p_storage_path,'/',2)<>auth.uid()::text then raise exception 'media path must belong to the current creator' using errcode='42501'; end if;
   if (coalesce(p_is_published,false) and v_bucket<>'creator-media-public') or (not coalesce(p_is_published,false) and v_bucket<>'creator-media-private') then raise exception 'storage visibility does not match publication state' using errcode='22023'; end if;
   if p_source_url is not null and p_source_url !~* '^https?://' then raise exception 'invalid media URL' using errcode='22023'; end if;
 end if;
 if p_media_id is null then
   insert into public.media_items(owner_id,title,media_type,source_url,storage_path,alt_text,metadata,is_published,provider,asset_key,playback_kind,processing_status)
   values(auth.uid(),btrim(p_title),p_media_type,p_source_url,p_storage_path,btrim(coalesce(p_alt_text,'')),coalesce(p_metadata,'{}'::jsonb),coalesce(p_is_published,false),
    case when p_media_type='youtube' then 'youtube' else 'supabase' end,case when p_media_type='youtube' then v_video_id else p_storage_path end,
    case when p_media_type='youtube' then 'youtube_embed' else 'file' end,'ready') returning id into v_id;
 else
   update public.media_items set title=btrim(p_title),media_type=p_media_type,source_url=p_source_url,storage_path=p_storage_path,alt_text=btrim(coalesce(p_alt_text,'')),
    metadata=coalesce(p_metadata,'{}'::jsonb),is_published=coalesce(p_is_published,false),provider=case when p_media_type='youtube' then 'youtube' else 'supabase' end,
    asset_key=case when p_media_type='youtube' then v_video_id else p_storage_path end,playback_kind=case when p_media_type='youtube' then 'youtube_embed' else 'file' end,processing_status='ready'
   where id=p_media_id and owner_id=auth.uid() returning id into v_id;
   if v_id is null then return query select false,'not_found'::text,null::uuid; return; end if;
 end if;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),case when p_media_id is null then 'media.created' else 'media.updated' end,'media',v_id::text,jsonb_build_object('type',p_media_type,'published',coalesce(p_is_published,false)));
 return query select true,'saved'::text,v_id;
end;
$$;

create or replace function public.delete_creator_media(p_media_id uuid)
returns table(deleted boolean,result_code text,storage_path text)
language plpgsql security definer set search_path=''
as $$
declare v_path text; v_type text;
begin
 if auth.uid() is null or not public.can_edit_creator_content() then raise exception 'creator access required' using errcode='42501'; end if;
 select m.storage_path,m.media_type into v_path,v_type from public.media_items m where m.id=p_media_id and m.owner_id=auth.uid() and m.is_published=false
  and ((m.media_type='youtube' and m.storage_path is null and m.provider='youtube') or m.storage_path like 'creator-media-private/%');
 if not found then return query select false,'not_found_or_not_owned_or_published'::text,null::text; return; end if;
 delete from public.media_items where id=p_media_id and owner_id=auth.uid();
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details) values(auth.uid(),'media.deleted','media',p_media_id::text,jsonb_build_object('media_type',v_type,'storage_path',v_path));
 return query select true,'deleted'::text,v_path;
end;
$$;
revoke all on function public.save_creator_media(uuid,text,text,text,text,text,jsonb,boolean) from public,anon;
grant execute on function public.save_creator_media(uuid,text,text,text,text,text,jsonb,boolean) to authenticated;
revoke all on function public.delete_creator_media(uuid) from public,anon;
grant execute on function public.delete_creator_media(uuid) to authenticated;

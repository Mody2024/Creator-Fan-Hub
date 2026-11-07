-- Atomic database publication + thumbnail pointer update.
-- The Storage objects are copied by the creator client first; this RPC binds the
-- new thumbnail pointer in the same database transaction as the media change.
create or replace function public.save_creator_media_with_thumbnail(
 p_media_id uuid,
 p_title text,
 p_media_type text,
 p_source_url text,
 p_storage_path text,
 p_alt_text text,
 p_metadata jsonb,
 p_is_published boolean,
 p_thumbnail_path text default null
) returns table(saved boolean,result_code text,media_id uuid)
language plpgsql
security definer
set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_result record;
 v_media public.media_items%rowtype;
 v_bucket text;
 v_object text;
begin
 select * into v_result from public.save_creator_media(
  p_media_id,p_title,p_media_type,p_source_url,p_storage_path,
  p_alt_text,p_metadata,p_is_published
 );
 if not coalesce(v_result.saved,false) then
  return query select false,v_result.result_code::text,v_result.media_id::uuid;
  return;
 end if;

 if p_thumbnail_path is not null then
  if char_length(p_thumbnail_path)>500
   or p_thumbnail_path !~ '^creator-media-(private|public)/[0-9a-fA-F-]{36}/thumbnails/[0-9a-fA-F-]{36}-[A-Za-z0-9_-]{8,80}\\.webp$' then
   raise exception 'invalid managed thumbnail path' using errcode='22023';
  end if;

  v_bucket:=split_part(p_thumbnail_path,'/',1);
  v_object:=substring(p_thumbnail_path from char_length(v_bucket)+2);
  if split_part(v_object,'/',1)<>v_user::text
   or split_part(v_object,'/',3) not like v_result.media_id::text||'-%' then
   raise exception 'thumbnail must belong to this creator and media item' using errcode='42501';
  end if;

  select * into v_media from public.media_items m
  where m.id=v_result.media_id and m.owner_id=v_user
  for update;
  if not found then
   raise exception 'media ownership changed during publication' using errcode='42501';
  end if;

  if (v_media.is_published and v_bucket<>'creator-media-public')
   or (not v_media.is_published and v_bucket<>'creator-media-private') then
   raise exception 'thumbnail visibility must match media publication' using errcode='22023';
  end if;

  if not exists(select 1 from storage.objects o where o.bucket_id=v_bucket and o.name=v_object) then
   raise exception 'thumbnail object does not exist in managed storage' using errcode='22023';
  end if;

  update public.media_items set thumbnail_path=p_thumbnail_path
  where id=v_result.media_id and owner_id=v_user;
 end if;

 return query select true,v_result.result_code::text,v_result.media_id::uuid;
end;
$$;

revoke all on function public.save_creator_media_with_thumbnail(uuid,text,text,text,text,text,jsonb,boolean,text) from public,anon;
grant execute on function public.save_creator_media_with_thumbnail(uuid,text,text,text,text,text,jsonb,boolean,text) to authenticated;

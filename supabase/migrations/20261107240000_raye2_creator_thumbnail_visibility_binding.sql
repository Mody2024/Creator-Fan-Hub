-- Keep worker-generated thumbnail pointers in sync with creator publication.
-- The caller can only point their own media item at an existing managed object
-- in the visibility bucket matching the media item's publication state.
create or replace function public.set_creator_media_thumbnail_path(
 p_media_id uuid,
 p_thumbnail_path text
) returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_media public.media_items%rowtype;
 v_bucket text;
 v_object text;
 v_rows integer;
begin
 if v_user is null or not exists(
  select 1 from public.creator_admins a
  where a.user_id=v_user and a.active=true
 ) then
  raise exception 'creator access required' using errcode='42501';
 end if;

 select * into v_media from public.media_items m
 where m.id=p_media_id and m.owner_id=v_user
 for update;
 if not found then
  return false;
 end if;

 if p_thumbnail_path is null then
  update public.media_items set thumbnail_path=null
  where id=p_media_id and owner_id=v_user;
  return true;
 end if;

 if char_length(p_thumbnail_path)>500
  or p_thumbnail_path !~ '^creator-media-(private|public)/[0-9a-fA-F-]{36}/thumbnails/[0-9a-fA-F-]{36}-[A-Za-z0-9_-]{8,80}\.webp$' then
  raise exception 'invalid managed thumbnail path' using errcode='22023';
 end if;

 v_bucket:=split_part(p_thumbnail_path,'/',1);
 v_object:=substring(p_thumbnail_path from char_length(v_bucket)+2);
 if split_part(v_object,'/',1)<>v_user::text
  or split_part(v_object,'/',3) not like p_media_id::text||'-%' then
  raise exception 'thumbnail must belong to this creator and media item' using errcode='42501';
 end if;

 if (v_media.is_published and v_bucket<>'creator-media-public')
  or (not v_media.is_published and v_bucket<>'creator-media-private') then
  raise exception 'thumbnail visibility must match media publication' using errcode='22023';
 end if;

 if not exists(
  select 1 from storage.objects o
  where o.bucket_id=v_bucket and o.name=v_object
 ) then
  raise exception 'thumbnail object does not exist in managed storage' using errcode='22023';
 end if;

 update public.media_items set thumbnail_path=p_thumbnail_path
 where id=p_media_id and owner_id=v_user;
 get diagnostics v_rows=row_count;
 return v_rows=1;
end;
$$;

revoke all on function public.set_creator_media_thumbnail_path(uuid,text) from public,anon;
grant execute on function public.set_creator_media_thumbnail_path(uuid,text) to authenticated;

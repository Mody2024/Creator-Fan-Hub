-- Keep provider-neutral asset metadata populated for every creator media save.
create or replace function public.sync_nhen_creator_media_asset_metadata()
returns trigger
language plpgsql
set search_path=''
as $$
begin
 if new.media_type='youtube' then
  new.provider:='youtube';
  new.playback_kind:='youtube_embed';
  new.processing_status:='ready';
  new.asset_key:=coalesce(new.asset_key,new.source_url);
  new.size_bytes:=null;
  new.mime_type:=null;
 else
  new.provider:=coalesce(new.provider,'supabase');
  new.playback_kind:=coalesce(new.playback_kind,'file');
  new.processing_status:=coalesce(new.processing_status,'ready');
  new.asset_key:=coalesce(new.asset_key,new.storage_path);
  if coalesce(new.metadata->>'size','') ~ '^[0-9]+$' then
   new.size_bytes:=(new.metadata->>'size')::bigint;
  end if;
  if nullif(new.metadata->>'mimeType','') is not null then
   new.mime_type:=new.metadata->>'mimeType';
  end if;
 end if;
 return new;
end;
$$;
drop trigger if exists sync_nhen_creator_media_asset_metadata on public.media_items;
create trigger sync_nhen_creator_media_asset_metadata
before insert or update of media_type,source_url,storage_path,metadata
on public.media_items
for each row execute function public.sync_nhen_creator_media_asset_metadata();

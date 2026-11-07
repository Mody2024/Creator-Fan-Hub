-- Raye2 media processing lifecycle foundation.
-- Supabase Storage remains the free-tier origin; this migration does not
-- pretend that upload completion equals transcoding or playback readiness.
alter table public.media_items
 add column if not exists processing_attempts integer not null default 0,
 add column if not exists processing_error text,
 add column if not exists processing_updated_at timestamptz not null default now(),
 add column if not exists processing_completed_at timestamptz;

alter table public.media_items
 drop constraint if exists media_items_processing_attempts_check,
 add constraint media_items_processing_attempts_check check(processing_attempts between 0 and 20),
 drop constraint if exists media_items_processing_error_check,
 add constraint media_items_processing_error_check check(processing_error is null or char_length(processing_error)<=1000);

create or replace function public.sync_nhen_creator_media_asset_metadata()
returns trigger language plpgsql set search_path='' as $$
begin
 if new.media_type='youtube' then
  new.provider:='youtube';
  new.playback_kind:='youtube_embed';
  new.processing_status:='ready';
  new.asset_key:=coalesce(new.asset_key,new.source_url);
  new.size_bytes:=null;
  new.mime_type:=null;
  new.processing_error:=null;
  new.processing_completed_at:=coalesce(new.processing_completed_at,now());
 else
  new.provider:=coalesce(new.provider,'supabase');
  new.playback_kind:=coalesce(new.playback_kind,'file');
  -- A newly attached or replaced storage object is uploaded, never assumed ready.
  if tg_op='INSERT' or new.storage_path is distinct from old.storage_path then
   new.processing_status:='uploaded';
   new.processing_attempts:=0;
   new.processing_error:=null;
   new.processing_completed_at:=null;
  else
   new.processing_status:=coalesce(new.processing_status,'uploaded');
  end if;
  new.asset_key:=coalesce(new.asset_key,new.storage_path);
  if coalesce(new.metadata->>'size','') ~ '^[0-9]+$' then
   new.size_bytes:=(new.metadata->>'size')::bigint;
  end if;
  if nullif(new.metadata->>'mimeType','') is not null then
   new.mime_type:=new.metadata->>'mimeType';
  end if;
 end if;
 new.processing_updated_at:=now();
 return new;
end;
$$;

drop trigger if exists sync_nhen_creator_media_asset_metadata on public.media_items;
create trigger sync_nhen_creator_media_asset_metadata
before insert or update of media_type,source_url,storage_path,metadata
on public.media_items for each row
execute function public.sync_nhen_creator_media_asset_metadata();

create or replace function public.get_creator_media_processing_status(p_media_ids uuid[])
returns table(media_id uuid,provider text,playback_kind text,processing_status text,
 processing_attempts integer,processing_error text,processing_updated_at timestamptz,
 processing_completed_at timestamptz,size_bytes bigint,mime_type text,checksum_sha256 text)
language plpgsql stable security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(
  select 1 from public.creator_admins a
  where a.user_id=auth.uid() and a.active=true
 ) then
  raise exception 'creator access required' using errcode='42501';
 end if;
 if coalesce(cardinality(p_media_ids),0)>200 then
  raise exception 'too many media ids' using errcode='22023';
 end if;
 return query
 select m.id,m.provider,m.playback_kind,m.processing_status,m.processing_attempts,
  m.processing_error,m.processing_updated_at,m.processing_completed_at,
  m.size_bytes,m.mime_type,m.checksum_sha256
 from public.media_items m
 where m.owner_id=auth.uid() and m.id=any(coalesce(p_media_ids,'{}'::uuid[]))
 order by m.created_at desc;
end;
$$;
revoke all on function public.get_creator_media_processing_status(uuid[]) from public,anon;
grant execute on function public.get_creator_media_processing_status(uuid[]) to authenticated;

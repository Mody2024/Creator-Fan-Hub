-- Bind every stored adaptive playlist pointer to the exact media owner and publication bucket.
create or replace function public.enforce_raye2_media_hls_pointer()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  v_path text;
  v_bucket text;
  v_object text;
  v_owner text;
  v_stream_root text;
begin
  v_path:=new.metadata #>> '{processing,hls,masterPath}';
  if v_path is null then
    return new;
  end if;

  if char_length(v_path)>500
    or v_path !~ '^creator-media-(private|public)/[0-9a-fA-F-]{36}/streams/[0-9a-fA-F-]{36}-[0-9a-fA-F-]{36}/master/master\.m3u8$' then
    raise exception 'invalid managed adaptive playlist path' using errcode='22023';
  end if;

  v_bucket:=split_part(v_path,'/',1);
  v_owner:=split_part(v_path,'/',2);
  v_stream_root:=split_part(v_path,'/',4);
  v_object:=substring(v_path from char_length(v_bucket)+2);

  if v_owner<>new.owner_id::text
    or split_part(v_stream_root,'-',1)<>new.id::text then
    raise exception 'adaptive playlist must belong to this creator and media item' using errcode='42501';
  end if;

  if (new.is_published and v_bucket<>'creator-media-public')
    or (not new.is_published and v_bucket<>'creator-media-private') then
    raise exception 'adaptive playlist visibility must match media publication' using errcode='22023';
  end if;

  if not exists(select 1 from storage.objects o where o.bucket_id=v_bucket and o.name=v_object) then
    raise exception 'adaptive master playlist does not exist in managed storage' using errcode='22023';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_raye2_media_hls_pointer() from public,anon,authenticated;
drop trigger if exists enforce_raye2_media_hls_pointer on public.media_items;
create trigger enforce_raye2_media_hls_pointer
before insert or update of metadata,storage_path,is_published,owner_id
on public.media_items
for each row execute function public.enforce_raye2_media_hls_pointer();

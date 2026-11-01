-- NHEN platform hardening: publisher-only official uploads and shareable video moments.
create or replace function public.is_nhen_video_publisher()
returns boolean
language sql stable security definer set search_path=''
as $$
  select exists(
    select 1 from public.creator_admins a
    where a.user_id=auth.uid() and a.active=true
      and a.role in ('owner','admin','creator')
  );
$$;
revoke all on function public.is_nhen_video_publisher() from public,anon;
grant execute on function public.is_nhen_video_publisher() to authenticated;

-- Official media storage is not available to ordinary members, editors, analysts or moderators.
drop policy if exists "Creators manage private media objects" on storage.objects;
create policy "NHEN publishers manage private media objects" on storage.objects
for all to authenticated
using(bucket_id='creator-media-private'
  and public.is_nhen_video_publisher()
  and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='creator-media-private'
  and public.is_nhen_video_publisher()
  and (storage.foldername(name))[1]=(select auth.uid())::text);

drop policy if exists "Creators manage public media objects" on storage.objects;
create policy "NHEN publishers manage public media objects" on storage.objects
for all to authenticated
using(bucket_id='creator-media-public'
  and public.is_nhen_video_publisher()
  and (storage.foldername(name))[1]=(select auth.uid())::text)
with check(bucket_id='creator-media-public'
  and public.is_nhen_video_publisher()
  and (storage.foldername(name))[1]=(select auth.uid())::text);

-- Replace legacy media RPCs that previously treated every active workspace role as an uploader.
create or replace function public.get_creator_media(p_limit integer default 100)
returns table(media_id uuid,title text,media_type text,source_url text,storage_path text,alt_text text,metadata jsonb,is_published boolean,created_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_nhen_video_publisher() then
  raise exception 'video publisher access required' using errcode='42501';
 end if;
 return query
 select m.id,m.title,m.media_type,m.source_url,m.storage_path,m.alt_text,m.metadata,m.is_published,m.created_at
 from public.media_items m
 where m.owner_id=auth.uid()
 order by m.created_at desc
 limit least(greatest(coalesce(p_limit,100),1),200);
end;
$$;
revoke all on function public.get_creator_media(integer) from public,anon,authenticated;
grant execute on function public.get_creator_media(integer) to authenticated;

create or replace function public.save_creator_media(p_media_id uuid,p_title text,p_media_type text,p_source_url text,p_storage_path text,p_alt_text text,p_metadata jsonb,p_is_published boolean)
returns table(saved boolean,result_code text,media_id uuid)
language plpgsql security definer set search_path=''
as $$
declare v_id uuid; v_bucket text;
begin
 if auth.uid() is null or not public.is_nhen_video_publisher() then
  raise exception 'video publisher access required' using errcode='42501';
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
 if split_part(p_storage_path,'/',2)<>auth.uid()::text then
  raise exception 'media path must belong to the current creator' using errcode='42501';
 end if;
 if (coalesce(p_is_published,false) and v_bucket<>'creator-media-public') or (not coalesce(p_is_published,false) and v_bucket<>'creator-media-private') then
  raise exception 'storage visibility does not match publication state' using errcode='22023';
 end if;
 if p_source_url is not null and p_source_url !~* '^https?://' then
  raise exception 'invalid media URL' using errcode='22023';
 end if;
 if p_media_id is null then
  insert into public.media_items(owner_id,title,media_type,source_url,storage_path,alt_text,metadata,is_published)
  values(auth.uid(),btrim(p_title),p_media_type,p_source_url,p_storage_path,btrim(coalesce(p_alt_text,'')),coalesce(p_metadata,'{}'::jsonb),coalesce(p_is_published,false))
  returning id into v_id;
 else
  update public.media_items set title=btrim(p_title),media_type=p_media_type,source_url=p_source_url,
    storage_path=p_storage_path,alt_text=btrim(coalesce(p_alt_text,'')),metadata=coalesce(p_metadata,'{}'::jsonb),
    is_published=coalesce(p_is_published,false)
  where id=p_media_id and owner_id=auth.uid()
  returning id into v_id;
  if v_id is null then return query select false,'not_found'::text,null::uuid; return; end if;
 end if;
 insert into public.admin_audit_log(actor_id,action,resource_type,resource_id,details)
 values(auth.uid(),case when p_media_id is null then 'media.created' else 'media.updated' end,'media',v_id::text,
 jsonb_build_object('type',p_media_type,'published',coalesce(p_is_published,false)));
 return query select true,'saved'::text,v_id;
end;
$$;
revoke all on function public.save_creator_media(uuid,text,text,text,text,text,jsonb,boolean) from public,anon,authenticated;
grant execute on function public.save_creator_media(uuid,text,text,text,text,text,jsonb,boolean) to authenticated;

drop policy if exists "Creators manage video metadata" on public.video_catalog;
create policy "NHEN publishers manage video metadata" on public.video_catalog for all to authenticated
using(public.is_nhen_video_publisher()) with check(public.is_nhen_video_publisher());
drop policy if exists "Creators manage playlists" on public.video_playlists;
create policy "NHEN publishers manage playlists" on public.video_playlists for all to authenticated
using(public.is_nhen_video_publisher()) with check(public.is_nhen_video_publisher());
drop policy if exists "Creators manage playlist items" on public.video_playlist_items;
create policy "NHEN publishers manage playlist items" on public.video_playlist_items for all to authenticated
using(public.is_nhen_video_publisher()) with check(public.is_nhen_video_publisher());

-- Community posts can quote a time range from an already-published NHEN video.
alter table public.community_posts
 add column if not exists moment_start_seconds integer,
 add column if not exists moment_end_seconds integer;
alter table public.community_posts drop constraint if exists community_posts_moment_range_check;
alter table public.community_posts add constraint community_posts_moment_range_check
 check (
   (moment_start_seconds is null and moment_end_seconds is null)
   or (linked_video_id is not null and moment_start_seconds is not null
       and moment_end_seconds is not null and moment_start_seconds>=0
       and moment_end_seconds>moment_start_seconds
       and moment_end_seconds-moment_start_seconds<=180)
 );

drop policy if exists "Members publish community posts instantly" on public.community_posts;
create policy "Members publish community posts instantly" on public.community_posts
for insert to authenticated
with check (
 author_id=(select auth.uid()) and post_type='member' and status='published' and pinned=false
 and (
   linked_video_id is null
   or exists(
     select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id
     where v.media_id=linked_video_id and v.published_at is not null and m.is_published=true
       and (moment_end_seconds is null or v.duration_seconds is null or moment_end_seconds<=v.duration_seconds)
   )
 )
);

-- Only official publishers can create official community announcements.
drop policy if exists "Creators moderate posts" on public.community_posts;
create policy "NHEN staff moderate community posts" on public.community_posts
for all to authenticated using(public.is_active_creator()) with check(public.is_active_creator());

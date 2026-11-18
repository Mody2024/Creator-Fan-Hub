-- Raye2: make the native video catalog lifecycle owner-scoped and atomic.
-- Official publishers may manage only media assets they own. A catalog entry
-- cannot become public until its underlying media object is already published.
create or replace function public.save_raye2_video_catalog(
 p_media_id uuid,
 p_slug text,
 p_description text default '',
 p_category text default 'Other',
 p_tags text[] default '{}',
 p_duration_seconds integer default null,
 p_featured boolean default false,
 p_allow_comments boolean default true,
 p_publish boolean default false
) returns table(saved boolean,result_code text,media_id uuid,published_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_published_at timestamptz;
 v_media public.media_items%rowtype;
begin
 if v_user is null or not public.is_nhen_video_publisher() then
  raise exception 'video publisher access required' using errcode='42501';
 end if;

 if p_media_id is null
   or coalesce(p_slug,'') !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
   or char_length(p_slug) not between 3 and 120
   or char_length(coalesce(p_description,''))>5000
   or char_length(coalesce(p_category,'')) not between 1 and 40
   or coalesce(cardinality(p_tags),0)>12
   or exists(select 1 from unnest(coalesce(p_tags,'{}'::text[])) t where char_length(t)>40)
   or (p_duration_seconds is not null and p_duration_seconds not between 1 and 86400) then
  raise exception 'invalid video catalog details' using errcode='22023';
 end if;

 select * into v_media from public.media_items m
 where m.id=p_media_id and m.owner_id=v_user
   and m.media_type in ('video','youtube');
 if not found then
  return query select false,'media_not_owned_or_not_video'::text,p_media_id,null::timestamptz;
  return;
 end if;

 if coalesce(p_publish,false) and not v_media.is_published then
  raise exception 'publish the media asset before publishing its watch page' using errcode='22023';
 end if;

 v_published_at:=case when coalesce(p_publish,false)
   then coalesce((select v.published_at from public.video_catalog v where v.media_id=p_media_id),now())
   else null end;

 insert into public.video_catalog(
  media_id,slug,description,category,tags,duration_seconds,featured,
  allow_comments,published_at,updated_at
 ) values (
  p_media_id,lower(p_slug),coalesce(p_description,''),p_category,
  coalesce(p_tags,'{}'::text[]),p_duration_seconds,coalesce(p_featured,false),
  coalesce(p_allow_comments,true),v_published_at,now()
 )
 on conflict(media_id) do update set
  slug=excluded.slug,
  description=excluded.description,
  category=excluded.category,
  tags=excluded.tags,
  duration_seconds=excluded.duration_seconds,
  featured=excluded.featured,
  allow_comments=excluded.allow_comments,
  published_at=excluded.published_at,
  updated_at=now();

 return query select true,'saved'::text,p_media_id,v_published_at;
end;
$$;

revoke all on function public.save_raye2_video_catalog(uuid,text,text,text,text[],integer,boolean,boolean,boolean) from public,anon;
grant execute on function public.save_raye2_video_catalog(uuid,text,text,text,text[],integer,boolean,boolean,boolean) to authenticated;

-- Defense in depth for any remaining direct catalog writes: ownership must
-- match the media row, not merely the caller's global publisher role.
drop policy if exists "NHEN publishers manage video metadata" on public.video_catalog;
drop policy if exists "Creators manage video metadata" on public.video_catalog;
create policy "Publishers manage only owned video metadata" on public.video_catalog
for all to authenticated
using (
 public.is_nhen_video_publisher()
 and exists(select 1 from public.media_items m where m.id=video_catalog.media_id and m.owner_id=(select auth.uid()))
)
with check (
 public.is_nhen_video_publisher()
 and exists(select 1 from public.media_items m where m.id=video_catalog.media_id and m.owner_id=(select auth.uid()))
);

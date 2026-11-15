-- Raye2 Wave 4: scheduled watch-page publication (plan 4.3).
--
-- Plan 4.3 asks for "scheduled release if enabled" among the publication states of long videos. Watch pages
-- could only be private drafts or live immediately. This adds an optional future go-live time: the watch page
-- stays private until a maintenance sweep promotes it. The same processing/visibility gates that guard
-- immediate publishing also guard scheduling, so a draft can never be queued to go live unprocessed.

-- 1. A watch page may hold a scheduled go-live time only while it is still a draft.
alter table public.video_catalog add column if not exists publish_at timestamptz;
alter table public.video_catalog drop constraint if exists video_catalog_schedule_check;
alter table public.video_catalog add constraint video_catalog_schedule_check
  check (publish_at is null or published_at is null);
create index if not exists video_catalog_publish_at_idx
  on public.video_catalog(publish_at) where publish_at is not null and published_at is null;

-- 2. Promote every due scheduled watch page. Idempotent and safe to call from a read path.
create or replace function public.raye2_publish_due_videos()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_count integer;
begin
  with due as (
    update public.video_catalog
       set published_at = now(), publish_at = null, updated_at = now()
     where published_at is null and publish_at is not null and publish_at <= now()
    returning 1
  )
  select count(*) into v_count from due;
  return v_count;
end;
$$;
revoke all on function public.raye2_publish_due_videos() from public;
grant execute on function public.raye2_publish_due_videos() to anon, authenticated;

-- 3. Extend the owner-scoped save RPC with an optional schedule. The parameter is appended so existing
--    positional callers keep working.
create or replace function public.save_raye2_video_catalog(
 p_media_id uuid,
 p_slug text,
 p_description text default '',
 p_category text default 'Other',
 p_tags text[] default '{}',
 p_duration_seconds integer default null,
 p_featured boolean default false,
 p_allow_comments boolean default true,
 p_publish boolean default false,
 p_publish_at timestamptz default null
) returns table(saved boolean,result_code text,media_id uuid,published_at timestamptz)
language plpgsql
security definer
set search_path=''
as $$
declare
 v_user uuid:=auth.uid();
 v_published_at timestamptz;
 v_publish_at timestamptz;
 v_result text;
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

 if p_publish_at is not null and coalesce(p_publish,false) then
  raise exception 'a watch page cannot be published and scheduled at the same time' using errcode='22023';
 end if;
 if p_publish_at is not null and p_publish_at <= now() then
  raise exception 'a scheduled go-live time must be in the future' using errcode='22023';
 end if;

 select * into v_media from public.media_items m
 where m.id=p_media_id and m.owner_id=v_user
   and m.media_type in ('video','youtube');
 if not found then
  return query select false,'media_not_owned_or_not_video'::text,p_media_id,null::timestamptz;
  return;
 end if;

 -- Both immediate publishing and scheduling make the page go public, so both require the same gates.
 if (coalesce(p_publish,false) or p_publish_at is not null) and v_media.media_type<>'youtube'
   and v_media.processing_status is distinct from 'ready' then
  raise exception 'native video must finish trusted media processing before its watch page can be published' using errcode='22023';
 end if;

 if (coalesce(p_publish,false) or p_publish_at is not null) and not v_media.is_published then
  raise exception 'publish the media asset before publishing its watch page' using errcode='22023';
 end if;

 if p_publish_at is not null then
  v_published_at:=null;
  v_publish_at:=p_publish_at;
  v_result:='scheduled';
 else
  v_publish_at:=null;
  v_published_at:=case when coalesce(p_publish,false)
    then coalesce((select v.published_at from public.video_catalog v where v.media_id=p_media_id),now())
    else null end;
  v_result:='saved';
 end if;

 insert into public.video_catalog(
  media_id,slug,description,category,tags,duration_seconds,featured,
  allow_comments,published_at,publish_at,updated_at
 ) values (
  p_media_id,lower(p_slug),coalesce(p_description,''),p_category,
  coalesce(p_tags,'{}'::text[]),p_duration_seconds,coalesce(p_featured,false),
  coalesce(p_allow_comments,true),v_published_at,v_publish_at,now()
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
  publish_at=excluded.publish_at,
  updated_at=now();

 return query select true,v_result,p_media_id,v_published_at;
end;
$$;
revoke all on function public.save_raye2_video_catalog(uuid,text,text,text,text[],integer,boolean,boolean,boolean,timestamptz) from public,anon;
grant execute on function public.save_raye2_video_catalog(uuid,text,text,text,text[],integer,boolean,boolean,boolean,timestamptz) to authenticated;

-- 4. Fold the scheduled promotion into the shared maintenance runner.
create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_minis integer := -1; v_moments integer := -1; v_clips integer := -1; v_videos integer := -1;
begin
  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  begin v_clips := public.raye2_expire_community_clips(); exception when others then v_clips := -1; end;
  begin v_videos := public.raye2_publish_due_videos(); exception when others then v_videos := -1; end;
  return jsonb_build_object('minis_expired', v_minis, 'moments_expired', v_moments, 'clips_expired', v_clips, 'scheduled_videos_published', v_videos, 'ran_at', now());
end;
$$;
revoke all on function public.raye2_run_maintenance() from public;
grant execute on function public.raye2_run_maintenance() to anon, authenticated;

notify pgrst, 'reload schema';

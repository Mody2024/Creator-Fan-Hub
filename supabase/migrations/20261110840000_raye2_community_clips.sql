-- Raye2 Wave 3/5: community clips (plan 13.5).
--
-- Mini's are the creator/ordinary-upload short format. Community clips are a distinct flow: an ordinary fan
-- selects an allowed portion of an already-published eligible Raye2 video/stream and publishes it as their own
-- contribution with their own caption and Raye2 interactions. Clips must follow source permissions, clip-length
-- rules, attribution, privacy, takedown, reporting and Admin policy, and a source creator/Admin must be able to
-- disable clipping for a source.

-- 1. Rules category + policy rules (admin-configurable within technical limits).
alter table public.raye2_platform_rules drop constraint if exists raye2_platform_rules_category_check;
alter table public.raye2_platform_rules add constraint raye2_platform_rules_category_check
  check (category in ('roles','content','chat','groups','voice','recording','watch','watch_together','retention','storage','safety','minis','moments','live','ads','clips'));

insert into public.raye2_platform_rules(rule_key, category, rule_value, status, description) values
  ('clips.max_duration_seconds', 'clips', '30'::jsonb, 'active', 'Maximum community clip duration in seconds (technical ceiling 60).'),
  ('clips.ordinary.daily_limit', 'clips', '5'::jsonb, 'active', 'Community clips an ordinary account may publish per day.'),
  ('clips.lifetime_days', 'clips', '30'::jsonb, 'active', 'Community clip lifetime in days before access expires and cleanup is queued.')
on conflict (rule_key) do nothing;

-- 2. Source creators can disable clipping for their own published media.
alter table public.media_items add column if not exists allow_clipping boolean not null default true;

-- 3. Community clips table. The clip is an independent uploaded asset; source attribution is preserved even
--    if the source is later deleted, so the clip survives its own allowed lifetime.
create table if not exists public.raye2_community_clips (
  id uuid primary key default gen_random_uuid(),
  clipper_id uuid not null references auth.users(id) on delete cascade,
  source_media_id uuid references public.media_items(id) on delete set null,
  source_owner_id uuid references auth.users(id) on delete set null,
  source_title text not null default '' check (char_length(source_title) <= 200),
  attribution_text text not null check (char_length(btrim(attribution_text)) between 2 and 240),
  title text not null check (char_length(btrim(title)) between 1 and 100),
  caption text not null default '' check (char_length(caption) <= 500),
  storage_path text not null unique,
  duration_seconds integer not null check (duration_seconds between 1 and 60),
  clip_start_seconds integer check (clip_start_seconds is null or clip_start_seconds >= 0),
  clip_end_seconds integer check (clip_end_seconds is null or clip_end_seconds > 0),
  visibility text not null default 'public' check (visibility in ('public','unlisted')),
  status text not null default 'published' check (status in ('published','expired','removed')),
  removed_by uuid references auth.users(id) on delete set null,
  removed_reason text not null default '' check (char_length(removed_reason) <= 240),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint raye2_community_clips_path_owner check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+[.](mp4|webm)$'),
  check (clip_start_seconds is null or clip_end_seconds is null or clip_end_seconds > clip_start_seconds)
);
create index if not exists raye2_community_clips_feed_idx on public.raye2_community_clips(status, created_at desc);
create index if not exists raye2_community_clips_clipper_idx on public.raye2_community_clips(clipper_id, created_at desc);
create index if not exists raye2_community_clips_source_idx on public.raye2_community_clips(source_media_id);

-- 4. Public storage bucket for clip assets, owner-scoped writes (mirrors Mini's).
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('raye2-clips','raye2-clips',true,52428800,array['video/mp4','video/webm'])
on conflict (id) do nothing;
drop policy if exists "Members upload own Raye2 clips" on storage.objects;
create policy "Members upload own Raye2 clips" on storage.objects for insert to authenticated
  with check (bucket_id='raye2-clips' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Public read Raye2 clips" on storage.objects;
create policy "Public read Raye2 clips" on storage.objects for select to anon, authenticated
  using (bucket_id='raye2-clips');
drop policy if exists "Members update own Raye2 clips" on storage.objects;
create policy "Members update own Raye2 clips" on storage.objects for update to authenticated
  using (bucket_id='raye2-clips' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check (bucket_id='raye2-clips' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Members delete own Raye2 clips" on storage.objects;
create policy "Members delete own Raye2 clips" on storage.objects for delete to authenticated
  using (bucket_id='raye2-clips' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- 5. Row-level security: live clips are public; clippers, source creators and moderators see more.
alter table public.raye2_community_clips enable row level security;
revoke all on public.raye2_community_clips from anon, authenticated;
grant select on public.raye2_community_clips to anon, authenticated;
grant insert, update, delete on public.raye2_community_clips to authenticated;
drop policy if exists "Live Raye2 community clips are public" on public.raye2_community_clips;
create policy "Live Raye2 community clips are public" on public.raye2_community_clips for select to anon, authenticated
  using (
    (status='published' and visibility='public' and expires_at > now()
      and coalesce((select m.allow_clipping from public.media_items m where m.id=source_media_id), true))
    or clipper_id=(select auth.uid()) or source_owner_id=(select auth.uid()) or private.can_moderate_community()
  );
drop policy if exists "Members publish own Raye2 community clips" on public.raye2_community_clips;
create policy "Members publish own Raye2 community clips" on public.raye2_community_clips for insert to authenticated
  with check (clipper_id=(select auth.uid()) and status='published' and split_part(storage_path,'/',1)=(select auth.uid())::text);
drop policy if exists "Owners manage Raye2 community clips" on public.raye2_community_clips;
create policy "Owners manage Raye2 community clips" on public.raye2_community_clips for update to authenticated
  using (clipper_id=(select auth.uid()) or source_owner_id=(select auth.uid()) or private.can_moderate_community())
  with check ((clipper_id=(select auth.uid()) and split_part(storage_path,'/',1)=(select auth.uid())::text) or private.can_moderate_community() or source_owner_id=(select auth.uid()));
drop policy if exists "Moderators delete Raye2 community clips" on public.raye2_community_clips;
create policy "Moderators delete Raye2 community clips" on public.raye2_community_clips for delete to authenticated
  using (clipper_id=(select auth.uid()) or private.can_moderate_community());

-- 6. Source creators and admins can enable or disable clipping for their own published media.
create or replace function public.raye2_set_source_clipping(p_media_id uuid, p_allow boolean)
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_owner uuid;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  select m.owner_id into v_owner from public.media_items m where m.id=p_media_id;
  if v_owner is null then raise exception 'media not found' using errcode='P0002'; end if;
  if v_owner <> v_uid and not public.raye2_is_platform_admin() then
    raise exception 'only the source owner or an admin can change clipping' using errcode='42501';
  end if;
  update public.media_items set allow_clipping=coalesce(p_allow,true) where id=p_media_id;
  -- Disabling clipping hides and removes existing clips of this source.
  if not coalesce(p_allow,true) then
    update public.raye2_community_clips set status='removed', removed_by=v_uid, removed_reason='source clipping disabled'
     where source_media_id=p_media_id and status='published';
  end if;
  return true;
end;
$$;
revoke all on function public.raye2_set_source_clipping(uuid,boolean) from public, anon;
grant execute on function public.raye2_set_source_clipping(uuid,boolean) to authenticated;

-- 7. Publish a community clip. Low-friction by default: no manual pre-approval, but source permissions,
--    length rules, attribution and rate limits are enforced server-side.
create or replace function public.raye2_publish_community_clip(
  p_title text,
  p_caption text,
  p_storage_path text,
  p_duration_seconds integer,
  p_source_media_id uuid,
  p_clip_start_seconds integer default null,
  p_clip_end_seconds integer default null,
  p_visibility text default 'public'
)
returns table (id uuid, expires_at timestamptz, attribution_text text)
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_max integer; v_days integer; v_daily integer; v_id uuid; v_expires timestamptz;
  v_src_owner uuid; v_src_type text; v_src_published boolean; v_src_allow boolean;
  v_src_title text; v_src_duration integer; v_owner_name text; v_attribution text; v_duration integer;
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if char_length(btrim(coalesce(p_title,''))) < 1 or char_length(p_title) > 100 then
    raise exception 'title must be 1-100 characters' using errcode='22023';
  end if;
  if char_length(coalesce(p_caption,'')) > 500 then raise exception 'caption is too long' using errcode='22023'; end if;
  if p_visibility not in ('public','unlisted') then raise exception 'invalid visibility' using errcode='22023'; end if;
  if p_storage_path is null or p_storage_path !~ ('^' || v_uid::text || '/[A-Za-z0-9_-]+[.](mp4|webm)$') then
    raise exception 'invalid storage path' using errcode='22023';
  end if;
  if p_source_media_id is null then raise exception 'a source video is required' using errcode='22023'; end if;

  -- The source must be an eligible, published, currently-viewable Raye2 video.
  select m.owner_id, m.media_type, m.is_published, m.allow_clipping, m.title
    into v_src_owner, v_src_type, v_src_published, v_src_allow, v_src_title
  from public.media_items m where m.id=p_source_media_id;
  if v_src_owner is null then raise exception 'source video not found' using errcode='P0002'; end if;
  if v_src_type not in ('video','youtube') or v_src_published is distinct from true then
    raise exception 'clips can only be made from a published Raye2 video' using errcode='22023';
  end if;
  if not public.raye2_can_view_video(p_source_media_id) then
    raise exception 'source video is not available' using errcode='42501';
  end if;
  if v_src_allow is distinct from true then
    raise exception 'clipping is disabled for this source' using errcode='42501';
  end if;

  select v.duration_seconds into v_src_duration from public.video_catalog v where v.media_id=p_source_media_id;

  v_max := least(60, greatest(1, public.raye2_rule_int('clips.max_duration_seconds', 30)));
  if p_clip_start_seconds is not null or p_clip_end_seconds is not null then
    if p_clip_start_seconds is null or p_clip_end_seconds is null then
      raise exception 'clip start and end must be provided together' using errcode='22023';
    end if;
    if p_clip_start_seconds < 0 or p_clip_end_seconds <= p_clip_start_seconds then
      raise exception 'invalid clip range' using errcode='22023';
    end if;
    if v_src_duration is not null and p_clip_end_seconds > v_src_duration then
      raise exception 'clip range is outside the source duration' using errcode='22023';
    end if;
    v_duration := p_clip_end_seconds - p_clip_start_seconds;
  else
    v_duration := p_duration_seconds;
  end if;
  if v_duration is null or v_duration < 1 or v_duration > v_max then
    raise exception 'clip duration must be between 1 and % seconds', v_max using errcode='22023';
  end if;

  v_daily := greatest(1, public.raye2_rule_int('clips.ordinary.daily_limit', 5));
  if (select count(*) from public.raye2_community_clips c where c.clipper_id = v_uid and c.created_at > now() - interval '1 day') >= v_daily then
    raise exception 'daily community clip limit reached (% per day)', v_daily using errcode='53100';
  end if;

  select coalesce(mp.display_name, mp.handle, 'A Raye2 creator') into v_owner_name
    from public.member_profiles mp where mp.user_id = v_src_owner;
  v_attribution := left(btrim(coalesce(v_owner_name,'A Raye2 creator')) || ' · ' || coalesce(nullif(btrim(v_src_title),''),'Raye2 video'), 240);

  v_days := greatest(1, public.raye2_rule_int('clips.lifetime_days', 30));
  v_expires := now() + (v_days || ' days')::interval;

  insert into public.raye2_community_clips(
    clipper_id, source_media_id, source_owner_id, source_title, attribution_text,
    title, caption, storage_path, duration_seconds, clip_start_seconds, clip_end_seconds, visibility, status, expires_at)
  values (
    v_uid, p_source_media_id, v_src_owner, coalesce(v_src_title,''), v_attribution,
    btrim(p_title), coalesce(p_caption,''), p_storage_path, v_duration,
    p_clip_start_seconds, p_clip_end_seconds, p_visibility, 'published', v_expires)
  returning raye2_community_clips.id into v_id;

  return query select v_id, v_expires, v_attribution;
end;
$$;
revoke all on function public.raye2_publish_community_clip(text,text,text,integer,uuid,integer,integer,text) from public, anon;
grant execute on function public.raye2_publish_community_clip(text,text,text,integer,uuid,integer,integer,text) to authenticated;

-- 8. Remove a clip (source creator or admin). Records who and why; keeps the row for audit.
create or replace function public.raye2_remove_community_clip(p_clip_id uuid, p_reason text default '')
returns boolean language plpgsql security definer set search_path=''
as $$
declare v_uid uuid := auth.uid(); v_source uuid; v_reason text := btrim(coalesce(p_reason,''));
begin
  if v_uid is null then raise exception 'sign in required' using errcode='42501'; end if;
  if char_length(v_reason) > 240 then raise exception 'reason is too long' using errcode='22023'; end if;
  select c.source_owner_id into v_source from public.raye2_community_clips c where c.id=p_clip_id;
  if v_source is null and not exists(select 1 from public.raye2_community_clips c where c.id=p_clip_id) then
    raise exception 'clip not found' using errcode='P0002';
  end if;
  if v_source is distinct from v_uid and not public.raye2_is_platform_admin() then
    raise exception 'only the source owner or an admin can remove a clip' using errcode='42501';
  end if;
  update public.raye2_community_clips set status='removed', removed_by=v_uid, removed_reason=v_reason where id=p_clip_id;
  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(v_uid,'community_clip_removed','community_clip',p_clip_id::text,v_reason,'{}'::jsonb);
  return true;
end;
$$;
revoke all on function public.raye2_remove_community_clip(uuid,text) from public, anon;
grant execute on function public.raye2_remove_community_clip(uuid,text) to authenticated;

-- 9. Expire clips past their lifetime (queue cleanup); never removes before expiry.
create or replace function public.raye2_expire_community_clips()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_expired integer := 0;
begin
  with due as (
    update public.raye2_community_clips set status='expired'
    where status='published' and expires_at <= now()
    returning 1
  )
  select count(*) into v_expired from due;
  return v_expired;
end;
$$;
revoke all on function public.raye2_expire_community_clips() from public;
grant execute on function public.raye2_expire_community_clips() to anon, authenticated;

-- 10. Public community-clip feed with clipper and source attribution; only live, source-permitted clips.
create or replace function public.raye2_list_community_clips(p_limit integer default 40)
returns table (
  id uuid, title text, caption text, storage_path text, duration_seconds integer, created_at timestamptz, expires_at timestamptz,
  attribution_text text, source_media_id uuid, source_slug text, source_title text,
  clipper_handle text, clipper_display_name text, clipper_avatar_url text
)
language sql stable security definer set search_path=''
as $fn$
  with bounded as (select least(greatest(coalesce(p_limit, 40), 1), 100) as lim)
  select c.id, c.title, c.caption, c.storage_path, c.duration_seconds, c.created_at, c.expires_at,
         c.attribution_text, c.source_media_id, vc.slug, c.source_title,
         mp.handle, mp.display_name, mp.avatar_url
  from public.raye2_community_clips c
  cross join bounded b
  left join public.member_profiles mp on mp.user_id = c.clipper_id
  left join public.video_catalog vc on vc.media_id = c.source_media_id
  where c.status='published' and c.visibility='public' and c.expires_at > now()
    and coalesce((select m.allow_clipping from public.media_items m where m.id=c.source_media_id), true)
    and not public.is_member_blocked(c.clipper_id)
  order by c.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_community_clips(integer) from public;
grant execute on function public.raye2_list_community_clips(integer) to anon, authenticated;

-- 11. Reporting: community clips are reportable like other community content.
alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('post','comment','profile','community_clip'));

-- 12. Fold clip expiry into the maintenance runner (preserving the existing keys and adding the clip job).
create or replace function public.raye2_run_maintenance()
returns jsonb language plpgsql security definer set search_path=''
as $$
declare v_minis integer := -1; v_moments integer := -1; v_clips integer := -1;
begin
  begin v_minis := public.raye2_expire_minis(); exception when others then v_minis := -1; end;
  begin v_moments := public.raye2_expire_moments(); exception when others then v_moments := -1; end;
  begin v_clips := public.raye2_expire_community_clips(); exception when others then v_clips := -1; end;
  return jsonb_build_object('minis_expired', v_minis, 'moments_expired', v_moments, 'clips_expired', v_clips, 'ran_at', now());
end;
$$;
revoke all on function public.raye2_run_maintenance() from public;
grant execute on function public.raye2_run_maintenance() to anon, authenticated;

notify pgrst, 'reload schema';

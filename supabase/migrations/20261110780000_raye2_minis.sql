-- Raye2 Wave 3/4: Mini's (short-form clips).
--
-- Plan 4.4 defines Mini's: short clips (planned max 15s, admin-configurable), available to ordinary users
-- (planned cap 3/day) and creator roles (monthly quotas), with a planned 30-day lifetime after which access
-- expires and cleanup is queued. Only the retention category and quota columns existed; there was no table,
-- no publish path and no feed.
--
-- Also fixes a real bug found here: raye2_creator_usage returned NULL for every metric except
-- long_videos_per_month, so the stream, Mini's and Moments quota checks in raye2_assert_creator_action were
-- silently dead (they guard on "v_used is not null"). Streams and Mini's are now counted from real tables.

-- 1. Platform rules (admin-configurable within technical limits).
alter table public.raye2_platform_rules drop constraint if exists raye2_platform_rules_category_check;
alter table public.raye2_platform_rules add constraint raye2_platform_rules_category_check
  check (category in ('roles','content','chat','groups','voice','recording','watch','watch_together','retention','storage','safety','minis','moments','live'));

insert into public.raye2_platform_rules(rule_key, category, rule_value, status, description) values
  ('minis.ordinary.daily_limit', 'minis', '3'::jsonb, 'active', 'Ordinary-user Mini''s per day.'),
  ('minis.max_duration_seconds', 'minis', '15'::jsonb, 'active', 'Maximum Mini duration in seconds (technical ceiling 60).'),
  ('minis.lifetime_days', 'minis', '30'::jsonb, 'active', 'Mini lifetime in days before access expires and cleanup is queued.')
on conflict (rule_key) do nothing;

-- 2. Mini's table.
create table if not exists public.raye2_minis (
  id uuid primary key default gen_random_uuid(),
  author_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 100),
  caption text not null default '' check (char_length(caption) <= 500),
  storage_path text not null unique,
  duration_seconds integer not null check (duration_seconds between 1 and 60),
  visibility text not null default 'public' check (visibility in ('public','unlisted')),
  status text not null default 'published' check (status in ('published','expired','removed')),
  source_media_id uuid references public.media_items(id) on delete set null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint raye2_minis_path_owner check (storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+[.](mp4|webm)$')
);
create index if not exists raye2_minis_feed_idx on public.raye2_minis(status, created_at desc);
create index if not exists raye2_minis_author_idx on public.raye2_minis(author_id, created_at desc);

-- 3. Public storage bucket for Mini clips, owner-scoped writes (mirrors community Shorts).
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('raye2-minis','raye2-minis',true,52428800,array['video/mp4','video/webm'])
on conflict (id) do nothing;

drop policy if exists "Members upload own Raye2 Mini's" on storage.objects;
create policy "Members upload own Raye2 Mini's" on storage.objects for insert to authenticated
  with check (bucket_id='raye2-minis' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Public read Raye2 Mini's" on storage.objects;
create policy "Public read Raye2 Mini's" on storage.objects for select to anon, authenticated
  using (bucket_id='raye2-minis');
drop policy if exists "Members update own Raye2 Mini's" on storage.objects;
create policy "Members update own Raye2 Mini's" on storage.objects for update to authenticated
  using (bucket_id='raye2-minis' and (storage.foldername(name))[1]=(select auth.uid())::text)
  with check (bucket_id='raye2-minis' and (storage.foldername(name))[1]=(select auth.uid())::text);
drop policy if exists "Members delete own Raye2 Mini's" on storage.objects;
create policy "Members delete own Raye2 Mini's" on storage.objects for delete to authenticated
  using (bucket_id='raye2-minis' and (storage.foldername(name))[1]=(select auth.uid())::text);

-- 4. Row-level security: live Mini's are public; authors and moderators see their own/removed.
alter table public.raye2_minis enable row level security;
revoke all on public.raye2_minis from anon, authenticated;
grant select on public.raye2_minis to anon, authenticated;
grant insert, update, delete on public.raye2_minis to authenticated;
drop policy if exists "Live Raye2 Mini's are public" on public.raye2_minis;
create policy "Live Raye2 Mini's are public" on public.raye2_minis for select to anon, authenticated
  using ((status='published' and visibility='public' and expires_at > now()) or author_id=(select auth.uid()) or private.can_moderate_community());
drop policy if exists "Members publish own Raye2 Mini's" on public.raye2_minis;
create policy "Members publish own Raye2 Mini's" on public.raye2_minis for insert to authenticated
  with check (author_id=(select auth.uid()) and status='published' and split_part(storage_path,'/',1)=(select auth.uid())::text);
drop policy if exists "Members manage own Raye2 Mini's" on public.raye2_minis;
create policy "Members manage own Raye2 Mini's" on public.raye2_minis for update to authenticated
  using (author_id=(select auth.uid()) or private.can_moderate_community())
  with check ((author_id=(select auth.uid()) and split_part(storage_path,'/',1)=(select auth.uid())::text) or private.can_moderate_community());
drop policy if exists "Moderators delete Raye2 Mini's" on public.raye2_minis;
create policy "Moderators delete Raye2 Mini's" on public.raye2_minis for delete to authenticated
  using (author_id=(select auth.uid()) or private.can_moderate_community());

-- 5. Fix usage counting: streams and Mini's are now measured from real tables.
create or replace function public.raye2_creator_usage(p_user_id uuid, p_metric text)
returns integer language sql stable security definer set search_path=''
as $$
  select case p_metric
    when 'long_videos_per_month' then
      (select count(*)::integer from public.media_items m
        where m.owner_id = p_user_id and m.media_type in ('video','youtube')
          and m.created_at > now() - interval '30 days')
    when 'streams_per_month' then
      (select count(*)::integer from public.raye2_live_streams s
        where s.streamer_id = p_user_id and s.started_at > now() - interval '30 days')
    when 'minis_per_month' then
      (select count(*)::integer from public.raye2_minis mn
        where mn.author_id = p_user_id and mn.created_at > now() - interval '30 days')
    else null
  end;
$$;
revoke all on function public.raye2_creator_usage(uuid,text) from public, anon;
grant execute on function public.raye2_creator_usage(uuid,text) to service_role;

-- 6. Publish a Mini: role/quota enforced server-side (ordinary users get a daily cap).
create or replace function public.raye2_publish_mini(
  p_title text,
  p_caption text,
  p_storage_path text,
  p_duration_seconds integer,
  p_source_media_id uuid default null,
  p_visibility text default 'public'
)
returns table (id uuid, expires_at timestamptz)
language plpgsql security definer set search_path=''
as $$
declare
  v_uid uuid := auth.uid();
  v_tier text; v_max integer; v_days integer; v_daily integer; v_id uuid; v_expires timestamptz;
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

  v_max := least(60, greatest(1, public.raye2_rule_int('minis.max_duration_seconds', 15)));
  if p_duration_seconds is null or p_duration_seconds < 1 or p_duration_seconds > v_max then
    raise exception 'Mini duration must be between 1 and % seconds', v_max using errcode='22023';
  end if;
  if p_source_media_id is not null and not exists (select 1 from public.media_items m where m.id = p_source_media_id) then
    raise exception 'source video not found' using errcode='P0002';
  end if;

  v_tier := public.raye2_creator_tier(v_uid);
  if v_tier = 'none' then
    v_daily := greatest(1, public.raye2_rule_int('minis.ordinary.daily_limit', 3));
    if (select count(*) from public.raye2_minis mn where mn.author_id = v_uid and mn.created_at > now() - interval '1 day') >= v_daily then
      raise exception 'daily Mini''s limit reached (% per day)', v_daily using errcode='53100';
    end if;
  else
    perform public.raye2_assert_creator_action('publish_mini');
  end if;

  v_days := greatest(1, public.raye2_rule_int('minis.lifetime_days', 30));
  v_expires := now() + (v_days || ' days')::interval;

  insert into public.raye2_minis(author_id, title, caption, storage_path, duration_seconds, visibility, status, source_media_id, expires_at)
  values (v_uid, btrim(p_title), coalesce(p_caption,''), p_storage_path, p_duration_seconds, p_visibility, 'published', p_source_media_id, v_expires)
  returning raye2_minis.id into v_id;

  return query select v_id, v_expires;
end;
$$;
revoke all on function public.raye2_publish_mini(text,text,text,integer,uuid,text) from public, anon;
grant execute on function public.raye2_publish_mini(text,text,text,integer,uuid,text) to authenticated;

-- 7. Expire Mini's past their lifetime (queue cleanup); never removes before expiry.
create or replace function public.raye2_expire_minis()
returns integer language plpgsql security definer set search_path=''
as $$
declare v_expired integer := 0;
begin
  with due as (
    update public.raye2_minis set status='expired'
    where status='published' and expires_at <= now()
    returning 1
  )
  select count(*) into v_expired from due;
  return v_expired;
end;
$$;
revoke all on function public.raye2_expire_minis() from public;
grant execute on function public.raye2_expire_minis() to anon, authenticated;

-- 8. Public Mini feed with author attribution; only live Mini's.
create or replace function public.raye2_list_minis(p_limit integer default 40)
returns table (
  id uuid, title text, caption text, storage_path text, duration_seconds integer, created_at timestamptz, expires_at timestamptz,
  author_handle text, author_display_name text, author_avatar_url text
)
language sql stable security definer set search_path=''
as $fn$
  with bounded as (select least(greatest(coalesce(p_limit, 40), 1), 100) as lim)
  select mn.id, mn.title, mn.caption, mn.storage_path, mn.duration_seconds, mn.created_at, mn.expires_at,
         mp.handle, mp.display_name, mp.avatar_url
  from public.raye2_minis mn
  cross join bounded b
  left join public.member_profiles mp on mp.user_id = mn.author_id
  where mn.status='published' and mn.visibility='public' and mn.expires_at > now()
    and not public.is_member_blocked(mn.author_id)
  order by mn.created_at desc
  limit (select lim from bounded);
$fn$;
revoke all on function public.raye2_list_minis(integer) from public;
grant execute on function public.raye2_list_minis(integer) to anon, authenticated;

notify pgrst, 'reload schema';

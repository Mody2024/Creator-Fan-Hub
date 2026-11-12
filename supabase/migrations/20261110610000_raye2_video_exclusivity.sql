-- Raye2 Wave 3/4: long-video exclusivity and user-selected expiry.
--
-- Plan 4/13.4 require creator exclusivity (up to 7 days, subject to Admin policy) and a user-selected
-- availability expiry (up to 14 days). The watch catalog had neither: every published video was visible
-- to everyone. This adds both and tightens the catalog SELECT policy so an exclusive or expired video is
-- not readable by ordinary viewers. Access is enforced in the database, not the client.

-- 1. Tunable caps.
insert into public.raye2_platform_rules(rule_key,category,rule_value,status,description) values
 ('video.exclusive_max_days','content','7'::jsonb,'active','Maximum creator exclusivity window in days.'),
 ('video.expiry_max_days','content','14'::jsonb,'active','Maximum user-selected availability window in days.')
on conflict (rule_key) do nothing;

-- 2. Catalog columns. Null means "not exclusive" / "no expiry".
alter table public.video_catalog add column if not exists exclusive_until timestamptz;
alter table public.video_catalog add column if not exists available_until timestamptz;
create index if not exists video_catalog_exclusive_idx on public.video_catalog(exclusive_until) where exclusive_until is not null;
create index if not exists video_catalog_available_idx on public.video_catalog(available_until) where available_until is not null;

-- 3. Access decision. Owner and platform admins always; others only when published, media is published,
--    not expired, and not currently exclusive.
create or replace function public.raye2_video_accessible(p_media_id uuid, p_uid uuid)
returns boolean language sql stable security definer set search_path=''
as $$
  with v as (select * from public.video_catalog where media_id = p_media_id),
       m as (select * from public.media_items where id = p_media_id)
  select coalesce(
    (select m.owner_id = p_uid from m)
    or exists(select 1 from public.creator_admins a where a.user_id = p_uid and a.active = true and a.role in ('owner','admin'))
    or (
      (select v.published_at is not null from v)
      and (select m.is_published and m.media_type in ('video','youtube') from m)
      and (select v.available_until is null or v.available_until > now() from v)
      and (select v.exclusive_until is null or v.exclusive_until <= now() from v)
    ), false);
$$;
revoke all on function public.raye2_video_accessible(uuid,uuid) from public,anon,authenticated;
grant execute on function public.raye2_video_accessible(uuid,uuid) to service_role;

-- Viewer-scoped wrapper safe to expose (uses auth.uid()).
create or replace function public.raye2_can_view_video(p_media_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select public.raye2_video_accessible(p_media_id, (select auth.uid())); $$;
revoke all on function public.raye2_can_view_video(uuid) from public;
grant execute on function public.raye2_can_view_video(uuid) to anon, authenticated;

-- 4. Enforce it on the catalog read path.
drop policy if exists "Published videos are visible" on public.video_catalog;
drop policy if exists "Accessible videos are visible" on public.video_catalog;
create policy "Accessible videos are visible" on public.video_catalog for select to anon,authenticated
using (public.raye2_can_view_video(media_id));

-- 5. Owner/admin set exclusivity and expiry. Capped by policy; exceeding a cap is rejected.
create or replace function public.raye2_set_video_exclusivity(
  p_media_id uuid,
  p_exclusive_days integer default 0,
  p_available_days integer default 0
)
returns table (exclusive_until timestamptz, available_until timestamptz)
language plpgsql security definer set search_path=''
as $$
declare
  v_owner uuid; v_published timestamptz; v_excl_max integer; v_avail_max integer;
  v_excl timestamptz; v_avail timestamptz; v_admin boolean;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if p_exclusive_days is null or p_available_days is null or p_exclusive_days < 0 or p_available_days < 0 then
    raise exception 'days must be zero or greater' using errcode='22023';
  end if;

  select m.owner_id into v_owner from public.media_items m where m.id = p_media_id;
  if v_owner is null then raise exception 'media not found' using errcode='P0002'; end if;
  v_admin := public.raye2_is_platform_admin();
  if not (v_owner = auth.uid() or v_admin) then
    raise exception 'only the owner can set exclusivity for this video' using errcode='42501';
  end if;

  select v.published_at into v_published from public.video_catalog v where v.media_id = p_media_id;
  if v_published is null then raise exception 'publish the video before setting exclusivity' using errcode='22023'; end if;

  v_excl_max := public.raye2_rule_int('video.exclusive_max_days', 7);
  v_avail_max := public.raye2_rule_int('video.expiry_max_days', 14);
  if p_exclusive_days > v_excl_max then
    raise exception 'exclusive window exceeds the maximum of % days', v_excl_max using errcode='22023';
  end if;
  if p_available_days > v_avail_max then
    raise exception 'availability window exceeds the maximum of % days', v_avail_max using errcode='22023';
  end if;

  v_excl := case when p_exclusive_days > 0 then now() + make_interval(days => p_exclusive_days) else null end;
  v_avail := case when p_available_days > 0 then now() + make_interval(days => p_available_days) else null end;

  update public.video_catalog set exclusive_until = v_excl, available_until = v_avail, updated_at = now()
   where media_id = p_media_id;

  insert into public.raye2_admin_audit_log(actor_id,action,target_type,target_id,reason,details)
  values(auth.uid(),'video_exclusivity_set','video_catalog',p_media_id::text,'',
         jsonb_build_object('exclusive_days',p_exclusive_days,'available_days',p_available_days));
  return query select v_excl, v_avail;
end;
$$;
revoke all on function public.raye2_set_video_exclusivity(uuid,integer,integer) from public,anon;
grant execute on function public.raye2_set_video_exclusivity(uuid,integer,integer) to authenticated;

-- 6. Owner's published videos with their exclusivity/expiry, for the studio.
create or replace function public.raye2_get_my_video_exclusivity(p_limit integer default 50)
returns table (media_id uuid, slug text, title text, published_at timestamptz, exclusive_until timestamptz, available_until timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  return query
    select v.media_id, v.slug, m.title, v.published_at, v.exclusive_until, v.available_until
    from public.video_catalog v
    join public.media_items m on m.id = v.media_id
    where m.owner_id = auth.uid() and v.published_at is not null
    order by v.published_at desc
    limit least(greatest(coalesce(p_limit,50),1),100);
end;
$$;
revoke all on function public.raye2_get_my_video_exclusivity(integer) from public,anon;
grant execute on function public.raye2_get_my_video_exclusivity(integer) to authenticated;

notify pgrst, 'reload schema';

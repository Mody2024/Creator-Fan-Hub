-- Raye2 Wave 3: community clip reporting and ownership in the feed.
--
-- Plan 13.5 requires community clips to support report and remove/takedown behavior. The content_reports
-- constraint already allows a 'community_clip' target, but the reporting RPC only accepted post/comment/profile,
-- so clip reports were rejected. The feed RPC also omitted the clipper and source-owner ids, so the UI could not
-- offer the owner-only remove action.

-- 1. Allow reporting community clips (existence-checked) alongside the existing target types.
create or replace function public.raye2_report_community_content(
  p_target_type text,
  p_target_id text,
  p_reason text,
  p_details text default ''
)
returns uuid
language plpgsql security definer set search_path = ''
as $fn$
declare v_id uuid; v_reason text := btrim(coalesce(p_reason, '')); v_details text := btrim(coalesce(p_details, ''));
begin
  if (select auth.uid()) is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if p_target_type not in ('post','comment','profile','community_clip') then raise exception 'invalid target type' using errcode = '22023'; end if;
  if v_reason not in ('spam','harassment','hate','impersonation','copyright','other') then raise exception 'invalid reason' using errcode = '22023'; end if;
  if char_length(v_details) > 500 then raise exception 'details too long' using errcode = '22023'; end if;
  if p_target_type = 'post' and not exists (select 1 from public.community_posts p where p.id::text = p_target_id) then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  if p_target_type = 'comment' and not exists (select 1 from public.community_comments c where c.id::text = p_target_id) then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  if p_target_type = 'community_clip' and not exists (select 1 from public.raye2_community_clips c where c.id::text = p_target_id) then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  insert into public.content_reports(reporter_id, target_type, target_id, reason, details)
  values ((select auth.uid()), p_target_type, p_target_id, v_reason, v_details)
  returning id into v_id;
  return v_id;
end;
$fn$;
revoke all on function public.raye2_report_community_content(text,text,text,text) from public, anon;
grant execute on function public.raye2_report_community_content(text,text,text,text) to authenticated;

-- 2. Expose clip ownership so the feed can offer owner-only remove.
drop function if exists public.raye2_list_community_clips(integer);
create or replace function public.raye2_list_community_clips(p_limit integer default 40)
returns table (
  id uuid, title text, caption text, storage_path text, duration_seconds integer, created_at timestamptz, expires_at timestamptz,
  attribution_text text, source_media_id uuid, source_slug text, source_title text,
  clipper_handle text, clipper_display_name text, clipper_avatar_url text,
  clipper_id uuid, source_owner_id uuid
)
language sql stable security definer set search_path=''
as $fn$
  with bounded as (select least(greatest(coalesce(p_limit, 40), 1), 100) as lim)
  select c.id, c.title, c.caption, c.storage_path, c.duration_seconds, c.created_at, c.expires_at,
         c.attribution_text, c.source_media_id, vc.slug, c.source_title,
         mp.handle, mp.display_name, mp.avatar_url,
         c.clipper_id, c.source_owner_id
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

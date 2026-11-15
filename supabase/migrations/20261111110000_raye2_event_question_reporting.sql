-- Raye2 Wave 5/8: restore event-question reporting (regression fix).
--
-- The event Q&A migration (20261110860000) added 'event_question' to content_reports and to the reporting RPC.
-- Two later migrations (20261110890000 community clips, 20261111000000 Mini's) each dropped and recreated
-- content_reports_target_type_check and redefined raye2_report_community_content with their own target list,
-- silently dropping 'event_question' again. Reporting an event question therefore failed after those
-- migrations ran. This restores event_question alongside every other supported target.

alter table public.content_reports drop constraint if exists content_reports_target_type_check;
alter table public.content_reports add constraint content_reports_target_type_check
  check (target_type in ('post','comment','profile','community_clip','mini','event_question'));

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
  if p_target_type not in ('post','comment','profile','community_clip','mini','event_question') then raise exception 'invalid target type' using errcode = '22023'; end if;
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
  if p_target_type = 'mini' and not exists (select 1 from public.raye2_minis m where m.id::text = p_target_id) then
    raise exception 'target not found' using errcode = 'P0002';
  end if;
  if p_target_type = 'event_question' and not exists (select 1 from public.event_qa q where q.id::text = p_target_id) then
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

notify pgrst, 'reload schema';

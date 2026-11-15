-- Raye2 Wave 2/8: close the restriction-enforcement gaps.
--
-- Plan 2.2 requires permissions to be checked server-side for every protected action; hiding a button is
-- not authorization. Wave 8 added account restrictions (comment/post/message/voice/watch), but two
-- problems remained:
--   1. The 'voice' and 'watch' restriction features were never enforced anywhere.
--   2. A restricted member had no way to see their own restrictions (only moderators could list them),
--      so they could not know why an action failed or submit an appeal.

-- 1. Enforce the 'voice' feature on joining a voice session. This is a thin wrapper over the existing
--    join function so the voice logic stays in one place; it only adds the server-side restriction check.
create or replace function public.raye2_join_voice_session_guarded(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if public.raye2_has_active_restriction(auth.uid(), 'voice') then
    raise exception 'your account is restricted from voice' using errcode='42501';
  end if;
  perform public.raye2_join_voice_session(p_session_id);
end;
$$;
revoke all on function public.raye2_join_voice_session_guarded(uuid) from public,anon;
grant execute on function public.raye2_join_voice_session_guarded(uuid) to authenticated;

-- 2. Enforce the 'watch' feature on joining a watch-together session.
create or replace function public.raye2_join_watch_session_guarded(p_session_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if public.raye2_has_active_restriction(auth.uid(), 'watch') then
    raise exception 'your account is restricted from watch together' using errcode='42501';
  end if;
  perform public.raye2_join_watch_session(p_session_id);
end;
$$;
revoke all on function public.raye2_join_watch_session_guarded(uuid) from public,anon;
grant execute on function public.raye2_join_watch_session_guarded(uuid) to authenticated;

-- 3. Enforce the 'comment' feature on native video comments (the community-comment trigger covers the
--    community table only).
create or replace function public.raye2_enforce_video_comment_restriction()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if public.raye2_has_active_restriction(new.author_id, 'comment') then
    raise exception 'your account is restricted from this action' using errcode='42501';
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_enforce_video_comment_restriction() from public,anon,authenticated;
drop trigger if exists raye2_video_comments_restriction_guard on public.video_comments;
create trigger raye2_video_comments_restriction_guard before insert on public.video_comments
for each row execute function public.raye2_enforce_video_comment_restriction();

-- 4. A restricted member can see their own restrictions (so they understand failures and can appeal).
create or replace function public.raye2_get_my_restrictions()
returns table (id uuid, action text, feature text, reason text, expires_at timestamptz, created_at timestamptz, appeal_status text)
language sql stable security definer set search_path=''
as $$
  select r.id, r.action, r.feature, r.reason, r.expires_at, r.created_at,
         (select a.status from public.raye2_moderation_appeals a
           where a.restriction_id = r.id and a.appellant_id = r.user_id
           order by a.created_at desc limit 1)
  from public.raye2_member_restrictions r
  where r.user_id = (select auth.uid())
    and r.status = 'active'
    and (r.expires_at is null or r.expires_at > now())
  order by r.created_at desc;
$$;
revoke all on function public.raye2_get_my_restrictions() from public,anon;
grant execute on function public.raye2_get_my_restrictions() to authenticated;

notify pgrst, 'reload schema';

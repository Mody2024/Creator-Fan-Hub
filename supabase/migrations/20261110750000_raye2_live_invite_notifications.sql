-- Raye2 Wave 5/6/9 notification depth: live-start and group join-request notifications.
--
-- Plan 9 requires in-app notifications for live starts and group invitations. Group invitations here are
-- token-based and have no recorded invitee, so the real group events are a manager being told about a join
-- request and the requester being told the decision. This adds all three types plus a follower broadcast
-- when a streamer goes live (public streams only, capped per stream so a large following cannot flood the
-- notification table). Every helper is best-effort: it never raises, so a notification failure cannot roll
-- back the action that triggered it.

-- 1. Allow the new notification types and target types.
alter table public.member_notifications drop constraint if exists member_notifications_notification_type_check;
alter table public.member_notifications add constraint member_notifications_notification_type_check
  check (notification_type in ('follow','community_reaction','community_comment','video_reaction','video_comment','video_comment_reply','video_comment_reaction','community_short_comment_reply','community_short_comment_reaction','community_comment_reply','community_comment_reaction','community_poll_vote','community_announcement','event_reminder','mention','group_join_request','group_join_decision','live_start'));

alter table public.member_notifications drop constraint if exists member_notifications_target_type_check;
alter table public.member_notifications add constraint member_notifications_target_type_check
  check (target_type in ('profile','post','video','event','group','stream'));

-- 2. Live-start helper: notify recent followers of a public stream, capped per stream.
create or replace function public.raye2_notify_live_start(p_stream_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_streamer uuid; v_visibility text; v_title text; v_cap integer; v_sent integer := 0;
begin
  begin
    select s.streamer_id, s.visibility, s.title into v_streamer, v_visibility, v_title
    from public.raye2_live_streams s where s.id = p_stream_id;
    if v_streamer is null or v_visibility <> 'public' then return 0; end if;
    if exists (select 1 from public.member_notifications n
               where n.notification_type = 'live_start' and n.target_type = 'stream' and n.target_id = p_stream_id) then
      return 0;
    end if;
    v_cap := greatest(1, least(public.raye2_rule_int('live.notify.max_recipients', 500), 5000));
    insert into public.member_notifications(recipient_id, actor_id, notification_type, target_type, target_id, message)
    select f.follower_id, v_streamer, 'live_start', 'stream', p_stream_id, 'is live now'
    from public.member_follows f
    where f.followed_id = v_streamer
      and f.follower_id <> v_streamer
      and not exists (
        select 1 from public.member_blocks b
        where (b.blocker_id = f.follower_id and b.blocked_id = v_streamer)
           or (b.blocker_id = v_streamer and b.blocked_id = f.follower_id))
    order by f.created_at desc
    limit v_cap;
    get diagnostics v_sent = row_count;
  exception when others then
    return 0;
  end;
  return v_sent;
end;
$$;
revoke all on function public.raye2_notify_live_start(uuid) from public, anon;
grant execute on function public.raye2_notify_live_start(uuid) to authenticated;

create or replace function public.raye2_notify_live_start_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status = 'live' and new.visibility = 'public'
     and (tg_op = 'INSERT' or old.status is distinct from 'live') then
    perform public.raye2_notify_live_start(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_notify_live_start_trigger() from public, anon, authenticated;
grant execute on function public.raye2_notify_live_start_trigger() to postgres;
drop trigger if exists raye2_live_start_notification on public.raye2_live_streams;
create trigger raye2_live_start_notification after insert or update of status on public.raye2_live_streams
for each row execute function public.raye2_notify_live_start_trigger();

-- 3. Group join-request helpers. Invitations are token-based and have no recorded invitee, so the real
--    notification events are a manager being told about a new request and the requester being told the
--    decision. Both are best-effort and never raise.
create or replace function public.raye2_notify_group_join_request(p_request_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_group uuid; v_user uuid; v_sent integer := 0;
begin
  begin
    select r.group_id, r.user_id into v_group, v_user
    from public.raye2_group_join_requests r where r.id = p_request_id;
    if v_group is null then return 0; end if;
    insert into public.member_notifications(recipient_id, actor_id, notification_type, target_type, target_id, message)
    select m.user_id, v_user, 'group_join_request', 'group', v_group, 'requested to join your group'
    from public.raye2_group_members m
    where m.group_id = v_group and m.status = 'active' and m.role in ('owner','admin','moderator')
      and m.user_id <> v_user
      and not exists (
        select 1 from public.member_blocks b
        where (b.blocker_id = m.user_id and b.blocked_id = v_user)
           or (b.blocker_id = v_user and b.blocked_id = m.user_id))
      and not exists (
        select 1 from public.member_notifications n
        where n.recipient_id = m.user_id and n.actor_id = v_user and n.notification_type = 'group_join_request'
          and n.target_type = 'group' and n.target_id = v_group and n.read_at is null);
    get diagnostics v_sent = row_count;
  exception when others then
    return 0;
  end;
  return v_sent;
end;
$$;
revoke all on function public.raye2_notify_group_join_request(uuid) from public, anon;
grant execute on function public.raye2_notify_group_join_request(uuid) to authenticated;

create or replace function public.raye2_notify_group_join_request_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status = 'pending' then
    perform public.raye2_notify_group_join_request(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_notify_group_join_request_trigger() from public, anon, authenticated;
grant execute on function public.raye2_notify_group_join_request_trigger() to postgres;
drop trigger if exists raye2_group_join_request_notification on public.raye2_group_join_requests;
create trigger raye2_group_join_request_notification after insert or update of note on public.raye2_group_join_requests
for each row execute function public.raye2_notify_group_join_request_trigger();

create or replace function public.raye2_notify_group_join_decision(p_request_id uuid)
returns integer language plpgsql security definer set search_path=''
as $$
declare v_group uuid; v_user uuid; v_status text; v_reviewer uuid; v_sent integer := 0;
begin
  begin
    select r.group_id, r.user_id, r.status, r.reviewed_by into v_group, v_user, v_status, v_reviewer
    from public.raye2_group_join_requests r where r.id = p_request_id;
    if v_group is null or v_status not in ('approved','declined') then return 0; end if;
    insert into public.member_notifications(recipient_id, actor_id, notification_type, target_type, target_id, message)
    values (v_user, v_reviewer, 'group_join_decision', 'group', v_group,
            case when v_status = 'approved' then 'approved your group request' else 'declined your group request' end)
    on conflict do nothing;
    get diagnostics v_sent = row_count;
  exception when others then
    return 0;
  end;
  return v_sent;
end;
$$;
revoke all on function public.raye2_notify_group_join_decision(uuid) from public, anon;
grant execute on function public.raye2_notify_group_join_decision(uuid) to authenticated;

create or replace function public.raye2_notify_group_join_decision_trigger()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status in ('approved','declined') and old.status is distinct from new.status then
    perform public.raye2_notify_group_join_decision(new.id);
  end if;
  return new;
end;
$$;
revoke all on function public.raye2_notify_group_join_decision_trigger() from public, anon, authenticated;
grant execute on function public.raye2_notify_group_join_decision_trigger() to postgres;
drop trigger if exists raye2_group_join_decision_notification on public.raye2_group_join_requests;
create trigger raye2_group_join_decision_notification after update of status on public.raye2_group_join_requests
for each row execute function public.raye2_notify_group_join_decision_trigger();

notify pgrst, 'reload schema';

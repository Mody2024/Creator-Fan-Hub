-- Raye2 Wave 3 / plan 13.3: share a whole video or a timestamp moment into DMs and groups.
--
-- Plan 13.3 requires sharing "a whole video, timestamp/moment, or an eligible clip into DMs, groups,
-- communities and Watch Together". Community sharing existed; chat sharing did not — the watch page could
-- only copy a link. This adds a guarded RPC that posts a structured video link into a conversation the sender
-- belongs to, and a listing of the sender's shareable conversations.

-- 1. The conversations the viewer may share into: active direct or group conversations they are a member of.
create or replace function public.raye2_list_shareable_conversations(p_limit integer default 40)
returns table (conversation_id uuid, conversation_type text, group_id uuid, title text, member_count bigint)
language sql stable security definer set search_path=''
as $$
  select c.id, c.conversation_type, c.group_id,
         coalesce(g.name, '') as title,
         (select count(*) from public.raye2_conversation_members m2 where m2.conversation_id = c.id) as member_count
  from public.raye2_conversation_members m
  join public.raye2_conversations c on c.id = m.conversation_id
  left join public.raye2_groups g on g.id = c.group_id
  where m.user_id = (select auth.uid())
    and c.status = 'active'
    and (c.group_id is null or g.status in ('active','read_only'))
  order by c.updated_at desc
  limit greatest(1, least(coalesce(p_limit,40), 100));
$$;
revoke all on function public.raye2_list_shareable_conversations(integer) from public,anon;
grant execute on function public.raye2_list_shareable_conversations(integer) to authenticated;

-- 2. Share a published video (optionally at a timestamp) into a conversation the sender belongs to.
--    The body is server-derived so the client cannot forge a link to an unavailable video.
create or replace function public.raye2_share_video_to_chat(p_conversation_id uuid, p_video_slug text, p_start_seconds integer default null)
returns table (message_id uuid, result_code text)
language plpgsql security definer set search_path=''
as $$
declare
  v_media_id uuid;
  v_title text;
  v_seconds integer;
  v_link text;
  v_body text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'not a member of this conversation' using errcode='42501';
  end if;
  if p_video_slug is null or char_length(btrim(p_video_slug)) not between 1 and 200 then
    raise exception 'a video is required' using errcode='22023';
  end if;
  select vc.media_id, mi.title into v_media_id, v_title
    from public.video_catalog vc
    join public.media_items mi on mi.id = vc.media_id
    where vc.slug = btrim(p_video_slug) and vc.published_at is not null
      and public.raye2_can_view_video(vc.media_id);
  if v_media_id is null then raise exception 'video not found' using errcode='P0002'; end if;
  if p_start_seconds is not null and (p_start_seconds < 0 or p_start_seconds > 86400) then
    raise exception 'invalid timestamp' using errcode='22023';
  end if;
  v_seconds := case when p_start_seconds is not null and p_start_seconds > 0 then p_start_seconds else null end;
  v_link := '/watch/' || btrim(p_video_slug) || case when v_seconds is not null then '?t=' || v_seconds else '' end;
  v_body := left(coalesce(v_title,'') || ' · ' || v_link, 5000);
  insert into public.raye2_messages(conversation_id, sender_id, body,
      attachment)
    values (p_conversation_id, auth.uid(), v_body,
      jsonb_build_object('kind','video_share','slug',btrim(p_video_slug),'start_seconds',v_seconds,'title',coalesce(v_title,'')))
    returning id into v_id;
  return query select v_id, 'shared'::text;
end;
$$;
revoke all on function public.raye2_share_video_to_chat(uuid,text,integer) from public,anon;
grant execute on function public.raye2_share_video_to_chat(uuid,text,integer) to authenticated;

notify pgrst, 'reload schema';

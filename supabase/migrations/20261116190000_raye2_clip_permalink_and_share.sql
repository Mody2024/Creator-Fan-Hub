-- Raye2 Wave 3/5: community clip permalinks and share-to-chat (plan 13.5).
--
-- Plan 13.5 requires clip "trim/preview, caption, attribution, visibility, share, report and remove/takedown"
-- behaviour, and that "clips shared into communities or chats must remain subject to source and clip
-- permissions". Publish/report/remove existed and the feed resolved source slugs, but:
--   * a clip had no canonical address, so it could not be linked or shared;
--   * there was no guarded way to post a clip into a chat conversation, and the existing video-share RPC only
--     accepts published videos, so it could not carry a clip.
-- This adds a single-clip fetch (permission-checked at read time) and a guarded clip-share RPC. Additive.

-- 1. Fetch one clip for its canonical permalink. Unlisted clips are viewable by anyone holding the link; a
--    removed, expired or source-disabled clip is only visible to its clipper, the source owner or a moderator.
--    Permissions are re-evaluated here, so a link never grants access to a clip that is no longer allowed.
create or replace function public.raye2_get_community_clip(p_clip_id uuid)
returns table (
  id uuid, title text, caption text, storage_path text, duration_seconds integer,
  created_at timestamptz, expires_at timestamptz, visibility text, status text,
  attribution_text text, source_media_id uuid, source_slug text, source_title text,
  clipper_id uuid, clipper_handle text, clipper_display_name text, clipper_avatar_url text,
  source_owner_id uuid
)
language sql stable security definer set search_path=''
as $fn$
  select c.id, c.title, c.caption, c.storage_path, c.duration_seconds,
         c.created_at, c.expires_at, c.visibility, c.status,
         c.attribution_text, c.source_media_id, vc.slug, c.source_title,
         c.clipper_id, mp.handle, mp.display_name, mp.avatar_url,
         c.source_owner_id
  from public.raye2_community_clips c
  left join public.member_profiles mp on mp.user_id = c.clipper_id
  left join public.video_catalog vc on vc.media_id = c.source_media_id
  where c.id = p_clip_id
    and (
      (c.status='published' and c.expires_at > now()
        and coalesce((select m.allow_clipping from public.media_items m where m.id=c.source_media_id), true)
        and not public.is_member_blocked(c.clipper_id))
      or c.clipper_id = (select auth.uid())
      or c.source_owner_id = (select auth.uid())
      or private.can_moderate_community()
    );
$fn$;
revoke all on function public.raye2_get_community_clip(uuid) from public;
grant execute on function public.raye2_get_community_clip(uuid) to anon, authenticated;

-- 2. Share a live clip into a conversation the sender belongs to. The link and title are server-derived so the
--    client cannot forge a link to a clip that is not currently viewable, and the same source/clip permission
--    rules that gate the permalink gate the share.
create or replace function public.raye2_share_clip_to_chat(p_conversation_id uuid, p_clip_id uuid)
returns table (message_id uuid, result_code text)
language plpgsql security definer set search_path=''
as $$
declare
  v_title text;
  v_link text;
  v_body text;
  v_id uuid;
begin
  if auth.uid() is null then raise exception 'sign in required' using errcode='42501'; end if;
  if not public.raye2_is_conversation_member(p_conversation_id) then
    raise exception 'not a member of this conversation' using errcode='42501';
  end if;
  select c.title into v_title
    from public.raye2_community_clips c
    where c.id = p_clip_id
      and c.status='published' and c.expires_at > now()
      and coalesce((select m.allow_clipping from public.media_items m where m.id=c.source_media_id), true)
      and not public.is_member_blocked(c.clipper_id);
  if v_title is null then raise exception 'clip is not available to share' using errcode='P0002'; end if;
  v_link := '/clips/' || p_clip_id::text;
  v_body := left(coalesce(v_title,'') || ' · ' || v_link, 5000);
  insert into public.raye2_messages(conversation_id, sender_id, body, attachment)
    values (p_conversation_id, auth.uid(), v_body,
      jsonb_build_object('kind','clip_share','clip_id',p_clip_id,'title',coalesce(v_title,'')))
    returning id into v_id;
  return query select v_id, 'shared'::text;
end;
$$;
revoke all on function public.raye2_share_clip_to_chat(uuid,uuid) from public,anon;
grant execute on function public.raye2_share_clip_to_chat(uuid,uuid) to authenticated;

notify pgrst, 'reload schema';

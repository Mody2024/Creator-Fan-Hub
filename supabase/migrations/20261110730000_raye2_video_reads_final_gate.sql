-- Raye2 Wave 3/9: last video reads that still ignored exclusivity and expiry.
--
-- Three remaining public readers resolved a video by publication alone: the reaction-count aggregate
-- (leaked counts for exclusive/expired videos), video-view recording (accepted views for a video the
-- caller may not watch, polluting analytics), and the comment parent-visibility helper (let a reply be
-- created under a comment on a video the caller may not watch). Recreated with the same viewer-scoped
-- raye2_can_view_video gate. Signatures and return types are unchanged.

create or replace function public.get_video_reaction_counts(p_media_ids uuid[])
returns table(media_id uuid,reaction_count bigint)
language plpgsql stable security definer set search_path=''
as $$
begin
 if coalesce(cardinality(p_media_ids),0)>100 then raise exception 'maximum 100 media ids per request' using errcode='22023'; end if;
 return query select r.media_id,count(*)::bigint
 from public.video_reactions r
 join public.video_catalog v on v.media_id=r.media_id
 join public.media_items m on m.id=v.media_id
 where r.media_id=any(coalesce(p_media_ids,'{}'::uuid[]))
  and v.published_at is not null and m.is_published=true
  and public.raye2_can_view_video(v.media_id)
 group by r.media_id;
end;
$$;
revoke all on function public.get_video_reaction_counts(uuid[]) from public;
revoke all on function public.get_video_reaction_counts(uuid[]) from anon;
grant execute on function public.get_video_reaction_counts(uuid[]) to anon, authenticated;

create or replace function public.record_video_view(p_media_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if auth.uid() is null then return; end if;
 if not exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=p_media_id and v.published_at is not null and m.is_published=true and public.raye2_can_view_video(v.media_id)) then
  return;
 end if;
 insert into public.video_views(media_id,viewer_id) values(p_media_id,auth.uid())
 on conflict(media_id,viewer_id) where viewer_id is not null do nothing;
end;
$$;
revoke all on function public.record_video_view(uuid) from public;
grant execute on function public.record_video_view(uuid) to anon,authenticated;

create or replace function public.raye2_video_comment_parent_visible(p_parent_id uuid)
returns boolean language sql stable security definer set search_path=''
as $$ select exists(select 1 from public.video_comments c where c.id = p_parent_id and c.status = 'published' and not public.is_member_blocked(c.author_id) and public.raye2_can_view_video(c.media_id)); $$;
revoke all on function public.raye2_video_comment_parent_visible(uuid) from public,anon;
grant execute on function public.raye2_video_comment_parent_visible(uuid) to anon,authenticated;

notify pgrst, 'reload schema';

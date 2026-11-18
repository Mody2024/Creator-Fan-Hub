-- Bound public aggregate RPC input to prevent oversized UUID-array scans.
-- These functions reveal only counts for already-published content.
create or replace function public.get_community_reaction_counts(p_post_ids uuid[])
returns table(post_id uuid,reaction_count bigint)
language plpgsql stable security definer set search_path=''
as $$
begin
 if coalesce(cardinality(p_post_ids),0)>100 then raise exception 'maximum 100 post ids per request' using errcode='22023'; end if;
 return query select r.post_id,count(*)::bigint
 from public.community_reactions r join public.community_posts p on p.id=r.post_id
 where r.post_id=any(coalesce(p_post_ids,'{}'::uuid[])) and p.status='published'
 group by r.post_id;
end;
$$;

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
 group by r.media_id;
end;
$$;

-- These are intentionally public aggregate endpoints; grant only the roles
-- that consume the published reaction counts.
revoke all on function public.get_community_reaction_counts(uuid[]) from public;
revoke all on function public.get_community_reaction_counts(uuid[]) from anon;
grant execute on function public.get_community_reaction_counts(uuid[]) to anon, authenticated;

revoke all on function public.get_video_reaction_counts(uuid[]) from public;
revoke all on function public.get_video_reaction_counts(uuid[]) from anon;
grant execute on function public.get_video_reaction_counts(uuid[]) to anon, authenticated;

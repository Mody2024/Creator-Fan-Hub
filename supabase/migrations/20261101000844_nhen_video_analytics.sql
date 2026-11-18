-- Creator-only NHEN Watch analytics. Aggregates never expose viewer identities.
create or replace function public.get_creator_video_analytics()
returns table(media_id uuid,title text,view_count bigint,reaction_count bigint,comment_count bigint,published_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null or not public.is_active_creator() then
  raise exception 'creator access required' using errcode='42501';
 end if;
 return query
 select v.media_id,m.title,
  (select count(*) from public.video_views vv where vv.media_id=v.media_id),
  (select count(*) from public.video_reactions vr where vr.media_id=v.media_id),
  (select count(*) from public.video_comments vc where vc.media_id=v.media_id and vc.status='published'),
  v.published_at
 from public.video_catalog v
 join public.media_items m on m.id=v.media_id
 order by v.published_at desc nulls last,m.created_at desc;
end;
$$;
revoke all on function public.get_creator_video_analytics() from public,anon;
grant execute on function public.get_creator_video_analytics() to authenticated;

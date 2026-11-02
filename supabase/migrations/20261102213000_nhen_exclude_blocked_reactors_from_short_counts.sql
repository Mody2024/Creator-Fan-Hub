-- Existing reactions from subsequently blocked members should not contribute to public totals.
create or replace function public.get_community_short_reaction_counts(p_short_ids uuid[])
returns table(short_id uuid,reaction text,reaction_count bigint)
language plpgsql
stable
security definer
set search_path=''
as $$
begin
 if coalesce(cardinality(p_short_ids),0)>100 then
  raise exception 'too many short IDs' using errcode='22023';
 end if;
 return query
 select r.short_id,r.reaction,count(*)::bigint
 from public.community_short_reactions r
 join public.community_short_videos s on s.id=r.short_id
 where r.short_id=any(coalesce(p_short_ids,'{}'::uuid[]))
  and s.status='published'
  and not public.is_member_blocked(s.author_id)
  and not public.is_member_blocked(r.user_id)
 group by r.short_id,r.reaction;
end;
$$;
revoke all on function public.get_community_short_reaction_counts(uuid[]) from public;
grant execute on function public.get_community_short_reaction_counts(uuid[]) to anon,authenticated;
notify pgrst,'reload schema';

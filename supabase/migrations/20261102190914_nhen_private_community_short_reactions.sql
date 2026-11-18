-- Public visitors receive aggregate counts only; individual member reactions stay private.
drop policy if exists "Public read reactions on visible community shorts" on public.community_short_reactions;
create policy "Members read their own community short reactions"
on public.community_short_reactions for select to authenticated
using(
 user_id=(select auth.uid())
 and not public.is_member_blocked((select auth.uid()))
 and exists(
  select 1 from public.community_short_videos s
  where s.id=short_id and s.status='published'
   and not public.is_member_blocked(s.author_id)
 )
);
revoke select on public.community_short_reactions from anon;
grant select on public.community_short_reactions to authenticated;

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
 group by r.short_id,r.reaction;
end;
$$;
revoke all on function public.get_community_short_reaction_counts(uuid[]) from public;
grant execute on function public.get_community_short_reaction_counts(uuid[]) to anon,authenticated;
notify pgrst,'reload schema';

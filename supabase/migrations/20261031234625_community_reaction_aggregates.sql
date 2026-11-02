-- Keep member identities private in reaction data; expose only aggregate counts.
drop policy if exists "Reactions visible on published posts" on public.community_reactions;
create policy "Members see own reactions"
on public.community_reactions for select to authenticated
using(user_id=(select auth.uid()) or public.is_active_creator());

create or replace function public.get_community_reaction_counts(p_post_ids uuid[])
returns table(post_id uuid,reaction_count bigint)
language sql stable security definer set search_path=''
as $$
  select r.post_id,count(*)::bigint
  from public.community_reactions r
  join public.community_posts p on p.id=r.post_id
  where r.post_id=any(p_post_ids) and p.status='published'
  group by r.post_id;
$$;
revoke all on function public.get_community_reaction_counts(uuid[]) from public;
grant execute on function public.get_community_reaction_counts(uuid[]) to anon,authenticated;

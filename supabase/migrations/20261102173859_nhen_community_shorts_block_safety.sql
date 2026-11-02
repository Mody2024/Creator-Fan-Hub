-- Apply the same member-blocking safeguards to community Shorts as to other NHEN surfaces.
drop policy if exists "Public read reactions on published community shorts" on public.community_short_reactions;
create policy "Public read reactions on visible community shorts"
on public.community_short_reactions for select to anon,authenticated
using(
 exists(
  select 1 from public.community_short_videos s
  where s.id=short_id and s.status='published'
   and not public.is_member_blocked(s.author_id)
 )
);

drop policy if exists "Members react to published community shorts" on public.community_short_reactions;
create policy "Members react to visible community shorts"
on public.community_short_reactions for insert to authenticated
with check(
 user_id=(select auth.uid())
 and not public.is_member_blocked((select auth.uid()))
 and exists(
  select 1 from public.community_short_videos s
  where s.id=short_id and s.status='published'
   and not public.is_member_blocked(s.author_id)
 )
);

drop policy if exists "Members update their own community short reaction" on public.community_short_reactions;
create policy "Members update their own visible community short reaction"
on public.community_short_reactions for update to authenticated
using(
 user_id=(select auth.uid())
 and not public.is_member_blocked((select auth.uid()))
 and exists(
  select 1 from public.community_short_videos s
  where s.id=short_id and s.status='published'
   and not public.is_member_blocked(s.author_id)
 )
)
with check(
 user_id=(select auth.uid())
 and not public.is_member_blocked((select auth.uid()))
 and exists(
  select 1 from public.community_short_videos s
  where s.id=short_id and s.status='published'
   and not public.is_member_blocked(s.author_id)
 )
);

drop policy if exists "Published comments visible on community shorts" on public.community_short_comments;
create policy "Published comments visible on community shorts"
on public.community_short_comments for select to anon,authenticated
using(
 (
  status='published'
  and not public.is_member_blocked(author_id)
  and exists(
   select 1 from public.community_short_videos s
   where s.id=short_id and s.status='published'
    and not public.is_member_blocked(s.author_id)
  )
 )
 or author_id=(select auth.uid())
 or private.can_moderate_community()
);

drop policy if exists "Members submit moderated community short comments" on public.community_short_comments;
create policy "Members submit moderated community short comments"
on public.community_short_comments for insert to authenticated
with check(
 author_id=(select auth.uid())
 and not public.is_member_blocked((select auth.uid()))
 and status='pending'
 and exists(
  select 1 from public.community_short_videos s
  where s.id=short_id and s.status='published'
   and not public.is_member_blocked(s.author_id)
 )
);

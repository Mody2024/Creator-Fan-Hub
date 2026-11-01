-- NHEN Community: publish normal member posts and comments immediately.
-- Moderation remains available through reports and authorized moderator tools.
alter table public.community_posts alter column status set default 'published';
alter table public.community_comments alter column status set default 'published';

drop policy if exists "Members submit moderated posts" on public.community_posts;
drop policy if exists "Members publish community posts instantly" on public.community_posts;
create policy "Members publish community posts instantly"
on public.community_posts for insert to authenticated
with check (
  author_id = (select auth.uid())
  and post_type = 'member'
  and status = 'published'
  and pinned = false
);

drop policy if exists "Members submit moderated comments" on public.community_comments;
drop policy if exists "Members publish comments instantly" on public.community_comments;
create policy "Members publish comments instantly"
on public.community_comments for insert to authenticated
with check (
  author_id = (select auth.uid())
  and status = 'published'
  and exists (
    select 1 from public.community_posts p
    where p.id = post_id and p.status = 'published'
  )
);

-- Keep the existing four reactions while adding NHEN-native reaction identities.
alter table public.community_reactions
  drop constraint if exists community_reactions_reaction_check;
alter table public.community_reactions
  add constraint community_reactions_reaction_check
  check (reaction in ('like','love','insightful','funny','spark','hype','respect','curious'));


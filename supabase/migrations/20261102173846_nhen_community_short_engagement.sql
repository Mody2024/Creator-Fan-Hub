-- NHEN community Shorts engagement: native reactions and creator-moderated comments.
create table if not exists public.community_short_reactions (
 short_id uuid not null references public.community_short_videos(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 reaction text not null check(reaction in ('spark','orbit','legend','laugh','mindblown','support')),
 created_at timestamptz not null default now(),
 primary key(short_id,user_id)
);
create index if not exists community_short_reactions_feed_idx on public.community_short_reactions(short_id,reaction);
alter table public.community_short_reactions enable row level security;
revoke all on public.community_short_reactions from anon,authenticated;
grant select on public.community_short_reactions to anon,authenticated;
grant insert,update,delete on public.community_short_reactions to authenticated;
create policy "Public read reactions on published community shorts"
on public.community_short_reactions for select to anon,authenticated
using(exists(select 1 from public.community_short_videos s where s.id=short_id and s.status='published'));
create policy "Members react to published community shorts"
on public.community_short_reactions for insert to authenticated
with check(user_id=(select auth.uid()) and exists(select 1 from public.community_short_videos s where s.id=short_id and s.status='published'));
create policy "Members update their own community short reaction"
on public.community_short_reactions for update to authenticated
using(user_id=(select auth.uid()) and exists(select 1 from public.community_short_videos s where s.id=short_id and s.status='published'))
with check(user_id=(select auth.uid()) and exists(select 1 from public.community_short_videos s where s.id=short_id and s.status='published'));
create policy "Members remove their own community short reaction"
on public.community_short_reactions for delete to authenticated
using(user_id=(select auth.uid()));

create table if not exists public.community_short_comments (
 id uuid primary key default gen_random_uuid(),
 short_id uuid not null references public.community_short_videos(id) on delete cascade,
 author_id uuid not null references auth.users(id) on delete cascade,
 body text not null check(char_length(btrim(body)) between 1 and 1000),
 status text not null default 'pending' check(status in ('pending','published','rejected','removed')),
 created_at timestamptz not null default now()
);
create index if not exists community_short_comments_feed_idx on public.community_short_comments(short_id,status,created_at desc);
create index if not exists community_short_comments_author_idx on public.community_short_comments(author_id,created_at desc);
alter table public.community_short_comments enable row level security;
revoke all on public.community_short_comments from anon,authenticated;
grant select on public.community_short_comments to anon,authenticated;
grant insert,update,delete on public.community_short_comments to authenticated;
create policy "Published comments visible on community shorts"
on public.community_short_comments for select to anon,authenticated
using(status='published' or author_id=(select auth.uid()) or private.can_moderate_community());
create policy "Members submit moderated community short comments"
on public.community_short_comments for insert to authenticated
with check(
 author_id=(select auth.uid())
 and status='pending'
 and exists(select 1 from public.community_short_videos s where s.id=short_id and s.status='published')
);
create policy "Moderators manage community short comments"
on public.community_short_comments for update to authenticated
using(private.can_moderate_community())
with check(private.can_moderate_community());
create policy "Authors or moderators remove community short comments"
on public.community_short_comments for delete to authenticated
using(author_id=(select auth.uid()) or private.can_moderate_community());

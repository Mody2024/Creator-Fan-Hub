-- Member saved posts: private per-user bookmarks.
create table if not exists public.community_bookmarks(
 post_id uuid not null references public.community_posts(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 primary key(post_id,user_id)
);
alter table public.community_bookmarks enable row level security;
revoke all on public.community_bookmarks from anon,authenticated;
grant select,insert,delete on public.community_bookmarks to authenticated;
create policy "Members see own saved posts" on public.community_bookmarks for select to authenticated using(user_id=(select auth.uid()));
create policy "Members save published posts" on public.community_bookmarks for insert to authenticated
with check(user_id=(select auth.uid()) and exists(select 1 from public.community_posts p where p.id=post_id and p.status='published'));
create policy "Members unsave own posts" on public.community_bookmarks for delete to authenticated using(user_id=(select auth.uid()));

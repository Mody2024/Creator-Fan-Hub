-- NHEN Watch v1: structured video publishing metadata, playlists and viewer interactions.
create table if not exists public.video_catalog (
  media_id uuid primary key references public.media_items(id) on delete cascade,
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 3 and 120),
  description text not null default '' check (char_length(description)<=5000),
  category text not null default 'Other' check (char_length(category) between 1 and 40),
  tags text[] not null default '{}' check (cardinality(tags)<=12),
  thumbnail_media_id uuid references public.media_items(id) on delete set null,
  duration_seconds integer check (duration_seconds is null or duration_seconds between 1 and 86400),
  featured boolean not null default false,
  allow_comments boolean not null default true,
  published_at timestamptz,
  updated_at timestamptz not null default now()
);
create index if not exists video_catalog_published_idx on public.video_catalog(published_at desc) where published_at is not null;
create index if not exists video_catalog_category_idx on public.video_catalog(category,published_at desc);

create table if not exists public.video_playlists (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description)<=1000),
  is_published boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.video_playlist_items (
  playlist_id uuid not null references public.video_playlists(id) on delete cascade,
  media_id uuid not null references public.video_catalog(media_id) on delete cascade,
  position integer not null default 0,
  added_at timestamptz not null default now(),
  primary key(playlist_id,media_id),
  unique(playlist_id,position)
);

create table if not exists public.video_comments (
  id uuid primary key default gen_random_uuid(),
  media_id uuid not null references public.video_catalog(media_id) on delete cascade,
  author_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1500),
  status text not null default 'pending' check (status in ('pending','published','rejected','removed')),
  created_at timestamptz not null default now()
);
create index if not exists video_comments_feed_idx on public.video_comments(media_id,status,created_at desc);
create table if not exists public.video_reactions (
  media_id uuid not null references public.video_catalog(media_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null default 'like' check (reaction in ('like','love','insightful')),
  created_at timestamptz not null default now(),
  primary key(media_id,user_id)
);
create table if not exists public.video_bookmarks (
  media_id uuid not null references public.video_catalog(media_id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key(media_id,user_id)
);
create table if not exists public.video_views (
  id bigint generated always as identity primary key,
  media_id uuid not null references public.video_catalog(media_id) on delete cascade,
  viewer_id uuid references auth.users(id) on delete set null,
  viewed_at timestamptz not null default now()
);
create index if not exists video_views_media_idx on public.video_views(media_id,viewed_at desc);

alter table public.video_catalog enable row level security;
alter table public.video_playlists enable row level security;
alter table public.video_playlist_items enable row level security;
alter table public.video_comments enable row level security;
alter table public.video_reactions enable row level security;
alter table public.video_bookmarks enable row level security;
alter table public.video_views enable row level security;

revoke all on public.video_catalog,public.video_playlists,public.video_playlist_items,public.video_comments,public.video_reactions,public.video_bookmarks,public.video_views from anon,authenticated;
grant select on public.video_catalog,public.video_playlists,public.video_playlist_items,public.video_comments,public.video_reactions to anon,authenticated;
grant insert,update,delete on public.video_catalog,public.video_playlists,public.video_playlist_items to authenticated;
grant insert,update,delete on public.video_comments to authenticated;
grant insert,delete on public.video_reactions,public.video_bookmarks to authenticated;
grant insert on public.video_views to anon,authenticated;
grant select,delete on public.video_bookmarks to authenticated;

create policy "Published videos are visible" on public.video_catalog for select to anon,authenticated
using (published_at is not null and exists(select 1 from public.media_items m where m.id=media_id and m.is_published=true and m.media_type in ('video','youtube')) or public.is_active_creator());
create policy "Creators manage video metadata" on public.video_catalog for all to authenticated
using (public.is_active_creator()) with check (public.is_active_creator());
create policy "Published playlists visible" on public.video_playlists for select to anon,authenticated using(is_published or public.is_active_creator());
create policy "Creators manage playlists" on public.video_playlists for all to authenticated using(public.is_active_creator()) with check(public.is_active_creator());
create policy "Items in published playlists visible" on public.video_playlist_items for select to anon,authenticated
using(exists(select 1 from public.video_playlists p where p.id=playlist_id and p.is_published) or public.is_active_creator());
create policy "Creators manage playlist items" on public.video_playlist_items for all to authenticated using(public.is_active_creator()) with check(public.is_active_creator());

create policy "Published video comments visible" on public.video_comments for select to anon,authenticated
using(status='published' and exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=video_comments.media_id and v.published_at is not null and m.is_published=true) or author_id=(select auth.uid()) or public.is_active_creator());
create policy "Members submit video comments" on public.video_comments for insert to authenticated
with check(author_id=(select auth.uid()) and status='pending' and exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=video_comments.media_id and v.published_at is not null and v.allow_comments=true and m.is_published=true));
create policy "Members edit own pending video comments" on public.video_comments for update to authenticated
using(author_id=(select auth.uid()) and status='pending') with check(author_id=(select auth.uid()) and status='pending');
create policy "Creators moderate video comments" on public.video_comments for all to authenticated using(public.is_active_creator()) with check(public.is_active_creator());

create policy "Video reactions visible" on public.video_reactions for select to anon,authenticated
using(exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=video_reactions.media_id and v.published_at is not null and m.is_published=true));
create policy "Members react to published videos" on public.video_reactions for insert to authenticated
with check(user_id=(select auth.uid()) and exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=video_reactions.media_id and v.published_at is not null and m.is_published=true));
create policy "Members remove video reactions" on public.video_reactions for delete to authenticated using(user_id=(select auth.uid()));

create policy "Members see own bookmarks" on public.video_bookmarks for select to authenticated using(user_id=(select auth.uid()));
create policy "Members bookmark published videos" on public.video_bookmarks for insert to authenticated
with check(user_id=(select auth.uid()) and exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=video_bookmarks.media_id and v.published_at is not null and m.is_published=true));
create policy "Members remove own bookmarks" on public.video_bookmarks for delete to authenticated using(user_id=(select auth.uid()));

create policy "Anyone may record a video view" on public.video_views for insert to anon,authenticated
with check(exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=video_views.media_id and v.published_at is not null and m.is_published=true));
create policy "Creators inspect video views" on public.video_views for select to authenticated using(public.is_active_creator());

create or replace function public.record_video_view(p_media_id uuid)
returns void language plpgsql security definer set search_path=''
as $$
begin
 if not exists(select 1 from public.video_catalog v join public.media_items m on m.id=v.media_id where v.media_id=p_media_id and v.published_at is not null and m.is_published=true) then
  return;
 end if;
 insert into public.video_views(media_id,viewer_id) values(p_media_id,auth.uid());
end;
$$;
revoke all on function public.record_video_view(uuid) from public;
grant execute on function public.record_video_view(uuid) to anon,authenticated;

create or replace function public.get_video_reaction_counts(p_media_ids uuid[])
returns table(media_id uuid,reaction_count bigint)
language sql stable security definer set search_path=''
as $$
 select r.media_id,count(*) from public.video_reactions r
 join public.video_catalog v on v.media_id=r.media_id
 join public.media_items m on m.id=v.media_id
 where r.media_id=any(p_media_ids) and v.published_at is not null and m.is_published=true
 group by r.media_id;
$$;
revoke all on function public.get_video_reaction_counts(uuid[]) from public;
grant execute on function public.get_video_reaction_counts(uuid[]) to anon,authenticated;

-- NHEN member-created vertical videos: separate from official creator publishing.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('nhen-community-shorts','nhen-community-shorts',true,52428800,array['video/mp4','video/webm'])
on conflict(id) do update set public=true,file_size_limit=52428800,allowed_mime_types=excluded.allowed_mime_types;
create table if not exists public.community_short_videos(
 id uuid primary key default gen_random_uuid(),
 author_id uuid not null references auth.users(id) on delete cascade,
 title text not null check(char_length(btrim(title)) between 1 and 100),
 caption text not null default '' check(char_length(caption)<=500),
 storage_path text not null unique,
 duration_seconds integer not null check(duration_seconds between 1 and 180),
 status text not null default 'published' check(status in ('published','removed')),
 created_at timestamptz not null default now(),
 constraint community_short_path_owner check(storage_path ~ '^[0-9a-f-]{36}/[A-Za-z0-9_-]+[.](mp4|webm)$')
);
create index if not exists community_short_feed_idx on public.community_short_videos(status,created_at desc);
create index if not exists community_short_author_idx on public.community_short_videos(author_id,created_at desc);
alter table public.community_short_videos enable row level security;
revoke all on public.community_short_videos from anon,authenticated;
grant select on public.community_short_videos to anon,authenticated;
grant insert,update,delete on public.community_short_videos to authenticated;
create policy "Published community shorts are public" on public.community_short_videos for select to anon,authenticated using(status='published' or author_id=(select auth.uid()) or private.can_moderate_community());
create policy "Members publish own community shorts instantly" on public.community_short_videos for insert to authenticated with check(author_id=(select auth.uid()) and status='published' and split_part(storage_path,'/',1)=(select auth.uid())::text);
create policy "Members manage own community shorts" on public.community_short_videos for update to authenticated using(author_id=(select auth.uid()) or private.can_moderate_community()) with check((author_id=(select auth.uid()) and split_part(storage_path,'/',1)=(select auth.uid())::text) or private.can_moderate_community());
create policy "Moderators delete community shorts" on public.community_short_videos for delete to authenticated using(author_id=(select auth.uid()) or private.can_moderate_community());
create policy "Members upload own NHEN community shorts" on storage.objects for insert to authenticated with check(bucket_id='nhen-community-shorts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Public read NHEN community shorts" on storage.objects for select to anon,authenticated using(bucket_id='nhen-community-shorts');
create policy "Members update own NHEN community shorts" on storage.objects for update to authenticated using(bucket_id='nhen-community-shorts' and (storage.foldername(name))[1]=(select auth.uid())::text) with check(bucket_id='nhen-community-shorts' and (storage.foldername(name))[1]=(select auth.uid())::text);
create policy "Members delete own NHEN community shorts" on storage.objects for delete to authenticated using(bucket_id='nhen-community-shorts' and (storage.foldername(name))[1]=(select auth.uid())::text);

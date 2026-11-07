-- Raye2: playlists belong to one publisher and cannot reference another creator's media.
alter table public.video_playlists
 add column if not exists owner_id uuid references auth.users(id) on delete cascade;

-- Safely backfill only playlists whose current items all belong to one creator.
with playlist_owners as (
 select i.playlist_id,min(m.owner_id::text)::uuid as owner_id
 from public.video_playlist_items i
 join public.media_items m on m.id=i.media_id
 group by i.playlist_id
 having count(distinct m.owner_id)=1 and bool_and(m.owner_id is not null)
)
update public.video_playlists p
set owner_id=o.owner_id
from playlist_owners o
where p.id=o.playlist_id and p.owner_id is null;

create index if not exists video_playlists_owner_updated_idx
 on public.video_playlists(owner_id,updated_at desc);

drop policy if exists "Published playlists visible" on public.video_playlists;
drop policy if exists "Creators manage playlists" on public.video_playlists;
drop policy if exists "NHEN publishers manage playlists" on public.video_playlists;
create policy "Owners read their playlists and public playlists"
on public.video_playlists for select to anon,authenticated
using(is_published or owner_id=(select auth.uid()));

create policy "Publishers manage only their playlists"
on public.video_playlists for insert to authenticated
with check(public.is_nhen_video_publisher() and owner_id=(select auth.uid()));

create policy "Publishers update only their playlists"
on public.video_playlists for update to authenticated
using(public.is_nhen_video_publisher() and owner_id=(select auth.uid()))
with check(public.is_nhen_video_publisher() and owner_id=(select auth.uid()));

create policy "Publishers delete only their playlists"
on public.video_playlists for delete to authenticated
using(public.is_nhen_video_publisher() and owner_id=(select auth.uid()));

drop policy if exists "Published playlists visible" on public.video_playlists;
drop policy if exists "Items in published playlists visible" on public.video_playlist_items;
drop policy if exists "Creators manage playlist items" on public.video_playlist_items;
drop policy if exists "NHEN publishers manage playlist items" on public.video_playlist_items;

create policy "Items in public or owned playlists visible"
on public.video_playlist_items for select to anon,authenticated
using(exists(
 select 1 from public.video_playlists p
 where p.id=playlist_id and (p.is_published or p.owner_id=(select auth.uid()))
));

create policy "Publishers add only owned media to owned playlists"
on public.video_playlist_items for insert to authenticated
with check(
 public.is_nhen_video_publisher()
 and exists(select 1 from public.video_playlists p where p.id=playlist_id and p.owner_id=(select auth.uid()))
 and exists(select 1 from public.media_items m where m.id=media_id and m.owner_id=(select auth.uid()) and m.media_type in ('video','youtube'))
);

create policy "Publishers update only owned playlist items"
on public.video_playlist_items for update to authenticated
using(exists(select 1 from public.video_playlists p where p.id=playlist_id and p.owner_id=(select auth.uid())))
with check(
 exists(select 1 from public.video_playlists p where p.id=playlist_id and p.owner_id=(select auth.uid()))
 and exists(select 1 from public.media_items m where m.id=media_id and m.owner_id=(select auth.uid()))
);

create policy "Publishers remove only owned playlist items"
on public.video_playlist_items for delete to authenticated
using(exists(select 1 from public.video_playlists p where p.id=playlist_id and p.owner_id=(select auth.uid())));

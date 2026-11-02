-- Scope creator media mutations to the uploader's own storage folder.
drop policy if exists "Creators manage private media objects" on storage.objects;
create policy "Creators manage private media objects" on storage.objects
for all to authenticated
using (
 bucket_id='creator-media-private'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true)
)
with check (
 bucket_id='creator-media-private'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true)
);

drop policy if exists "Creators manage public media objects" on storage.objects;
create policy "Creators manage public media objects" on storage.objects
for all to authenticated
using (
 bucket_id='creator-media-public'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true)
)
with check (
 bucket_id='creator-media-public'
 and (storage.foldername(name))[1]=(select auth.uid())::text
 and exists(select 1 from public.creator_admins a where a.user_id=auth.uid() and a.active=true)
);

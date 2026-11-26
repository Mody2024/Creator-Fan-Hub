-- Private, conversation-scoped Raye2 chat attachments.
-- Every upload consumes the same per-user and platform storage reservation as other managed media.
create or replace function public.raye2_managed_buckets()
returns text[] language sql immutable set search_path=''
as $$ select array[
  'creator-media-private','creator-media-public','nhen-community-shorts',
  'raye2-community-shorts','raye2-minis','raye2-clips','raye2-chat-attachments'
]::text[] $$;
revoke all on function public.raye2_managed_buckets() from public, anon;
grant execute on function public.raye2_managed_buckets() to authenticated, service_role;

alter table public.nhen_media_upload_reservations
  drop constraint if exists nhen_media_upload_reservations_bucket_id_check;
alter table public.nhen_media_upload_reservations
  add constraint nhen_media_upload_reservations_bucket_id_check
  check (bucket_id in (
    'creator-media-private','creator-media-public','nhen-community-shorts',
    'raye2-community-shorts','raye2-minis','raye2-clips','raye2-chat-attachments'
  ));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'raye2-chat-attachments','raye2-chat-attachments',false,52428800,
  array[
    'image/jpeg','image/png','image/webp','image/gif',
    'application/pdf','text/plain','application/zip',
    'audio/webm','audio/ogg','audio/mpeg','audio/mp4','application/octet-stream',
    'video/mp4','video/webm'
  ]
)
on conflict(id) do update set
  public=false,
  file_size_limit=52428800,
  allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists "Raye2 conversation members read chat attachments" on storage.objects;
create policy "Raye2 conversation members read chat attachments"
on storage.objects for select to authenticated
using (
  bucket_id='raye2-chat-attachments'
  and exists (
    select 1 from public.raye2_conversations c
    where c.id::text=(storage.foldername(name))[1]
      and public.raye2_is_conversation_member(c.id)
  )
);

drop policy if exists "Raye2 conversation members upload own chat attachments" on storage.objects;
create policy "Raye2 conversation members upload own chat attachments"
on storage.objects for insert to authenticated
with check (
  bucket_id='raye2-chat-attachments'
  and (storage.foldername(name))[2]=(select auth.uid())::text
  and exists (
    select 1 from public.raye2_conversations c
    where c.id::text=(storage.foldername(name))[1]
      and public.raye2_is_conversation_member(c.id)
  )
);

drop policy if exists "Raye2 owners delete own chat attachments" on storage.objects;
create policy "Raye2 owners delete own chat attachments"
on storage.objects for delete to authenticated
using (
  bucket_id='raye2-chat-attachments'
  and owner_id=(select auth.uid())::text
  and exists (
    select 1 from public.raye2_conversations c
    where c.id::text=(storage.foldername(name))[1]
      and public.raye2_is_conversation_member(c.id)
  )
);

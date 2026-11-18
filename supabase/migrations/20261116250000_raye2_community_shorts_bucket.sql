-- Raye2 community shorts upload to the `raye2-community-shorts` bucket, and both the canonical
-- `raye2_managed_buckets()` set and the upload-reservation bucket constraint allow it, but no
-- earlier migration ever created the bucket. Uploads therefore failed with "bucket not found".
-- Provision it idempotently, mirroring the legacy `nhen-community-shorts` bucket definition.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values('raye2-community-shorts','raye2-community-shorts',true,52428800,
  array['video/mp4','video/webm','video/quicktime'])
on conflict(id) do update set
  public = true,
  file_size_limit = 52428800,
  allowed_mime_types = excluded.allowed_mime_types;

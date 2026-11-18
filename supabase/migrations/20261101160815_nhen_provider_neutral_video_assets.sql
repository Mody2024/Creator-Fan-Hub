-- Provider-neutral video source metadata for NHEN.
-- Existing media paths remain valid; this migration does not change bucket limits.

alter table public.media_items
  add column if not exists provider text not null default 'supabase',
  add column if not exists asset_key text,
  add column if not exists playback_kind text not null default 'file',
  add column if not exists processing_status text not null default 'ready',
  add column if not exists size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists checksum_sha256 text;

update public.media_items
set provider = case when media_type = 'youtube' then 'youtube' else 'supabase' end,
    playback_kind = case when media_type = 'youtube' then 'youtube_embed' else 'file' end,
    asset_key = coalesce(asset_key, case when media_type = 'youtube' then source_url else storage_path end)
where asset_key is null
   or (media_type = 'youtube' and (provider <> 'youtube' or playback_kind <> 'youtube_embed'));

alter table public.media_items
  drop constraint if exists media_items_provider_check,
  add constraint media_items_provider_check
    check (provider in ('supabase','youtube','external')),
  drop constraint if exists media_items_playback_kind_check,
  add constraint media_items_playback_kind_check
    check (playback_kind in ('file','youtube_embed','hls','dash','external_url')),
  drop constraint if exists media_items_processing_status_check,
  add constraint media_items_processing_status_check
    check (processing_status in ('pending','uploading','uploaded','processing','ready','failed','deleted')),
  drop constraint if exists media_items_size_bytes_check,
  add constraint media_items_size_bytes_check
    check (size_bytes is null or size_bytes >= 0),
  drop constraint if exists media_items_checksum_sha256_check,
  add constraint media_items_checksum_sha256_check
    check (checksum_sha256 is null or checksum_sha256 ~ '^[a-fA-F0-9]{64}$');

create index if not exists media_items_provider_status_idx
  on public.media_items(provider, processing_status, created_at desc);

alter table public.community_short_videos
  add column if not exists provider text not null default 'supabase',
  add column if not exists asset_key text,
  add column if not exists playback_kind text not null default 'file',
  add column if not exists processing_status text not null default 'ready',
  add column if not exists size_bytes bigint,
  add column if not exists mime_type text,
  add column if not exists checksum_sha256 text;

update public.community_short_videos
set asset_key = coalesce(asset_key, storage_path),
    processing_status = case when status = 'removed' then 'deleted' else processing_status end
where asset_key is null or (status = 'removed' and processing_status <> 'deleted');

alter table public.community_short_videos
  drop constraint if exists community_short_videos_provider_check,
  add constraint community_short_videos_provider_check
    check (provider in ('supabase','youtube','external')),
  drop constraint if exists community_short_videos_playback_kind_check,
  add constraint community_short_videos_playback_kind_check
    check (playback_kind in ('file','youtube_embed','hls','dash','external_url')),
  drop constraint if exists community_short_videos_processing_status_check,
  add constraint community_short_videos_processing_status_check
    check (processing_status in ('pending','uploading','uploaded','processing','ready','failed','deleted')),
  drop constraint if exists community_short_videos_size_bytes_check,
  add constraint community_short_videos_size_bytes_check
    check (size_bytes is null or size_bytes >= 0),
  drop constraint if exists community_short_videos_checksum_sha256_check,
  add constraint community_short_videos_checksum_sha256_check
    check (checksum_sha256 is null or checksum_sha256 ~ '^[a-fA-F0-9]{64}$');

create index if not exists community_short_provider_status_idx
  on public.community_short_videos(provider, processing_status, created_at desc);

# NHEN video infrastructure — strict $0 plan

Status: strict free-only architecture approved; YouTube source workflow and storage quota reservations implemented on `development`.
Repository branch: `development`.
Production remains untouched.

## Non-negotiable cost rule

NHEN must not depend on a paid service, paid plan, paid add-on, or automatic overage. The product may accept repeated uploads, but it cannot promise unlimited bytes, playback, bandwidth, or concurrent viewers on free infrastructure. When a free quota is reached, uploads/processing must pause safely and explain why; no provider may silently become a paid dependency.

## Current verified baseline

- Supabase project: `Creator-Fan-Hub`, region `eu-central-1`, active and healthy.
- Supabase Free allowance currently lists 1 GB file storage, 5 GB cached egress and 5 GB uncached egress (10 GB combined).
- Existing `creator-media-private` and `creator-media-public` buckets each cap an individual file at 50 MiB.
- Existing `nhen-community-shorts` bucket caps an individual file at 50 MiB and accepts MP4/WebM.
- Community shorts are currently limited to 180 seconds in the database.
- Official creator video metadata is in `video_catalog`; the actual source file is currently stored via `media_items.storage_path`.
- Watch pages, reactions, bookmarks, comments, and creator publishing metadata are already separate from the upload UI.
- Current verified Storage usage query returned 0 objects / 0 bytes at the time of audit.
- A database reservation system now enforces a conservative 750 MiB application storage ceiling across all Supabase Storage buckets. It reserves expected upload bytes before creator/community uploads and expires abandoned reservations after one hour.
- A `storage.objects` insert trigger now enforces an active reservation matching the authenticated owner, target NHEN bucket and exact declared file size. This closes the direct-upload path that could otherwise bypass the application's pre-upload reservation RPC.
- Creator media and community Nhenbits now use TUS resumable uploads in 6 MiB chunks with retry backoff and visible progress. A stable owner-scoped object key plus browser-persisted upload session lets the same selected file resume after an interruption or page reload. Reservation IDs can be renewed for a matching in-progress upload.
- Creator Media now shows a storage-health audit: current usage, expired reservation cleanup, and the count/size of media objects older than 24 hours that have no matching media record. It never deletes those objects automatically.
- Community Nhenbit deletion now backs up the video before removal and restores it if the database row deletion fails, reducing the chance of a broken post after a partial failure.
- Creator and community media records now persist byte size, MIME type, provider identity, asset key and playback kind, making future quota reports and provider migrations more reliable.
- The previously applied reservation-renewal and storage-health migrations are now mirrored in `supabase/migrations/` so the repository can reproduce the live database state.

These are per-file and project quotas, not a promise of unlimited total storage.

## Strict-$0 target architecture

### A. Supabase Free is the only required backend

Use the existing project for:
- Authentication, member/creator roles, permissions and moderation.
- Video metadata, descriptions, tags, thumbnails references, playlists, visibility and status.
- Comments, reactions, bookmarks, follows, notifications and analytics.
- Upload records, quota accounting and resumable-upload session metadata.

Do not route video playback through database queries or store video bytes in Postgres.

### B. Two media paths

1. **Official long-form videos:** use YouTube-hosted videos embedded in NHEN Watch when an official creator chooses that path. NHEN stores the video ID/embed metadata and owns the watch-page experience, descriptions, comments, reactions and discovery. YouTube hosts and delivers the actual video. This avoids spending NHEN's small Supabase storage/egress quota on large official videos. Availability, account eligibility, YouTube policies and external playback remain dependencies.
2. **NHENbits/community uploads:** continue using the existing Supabase Storage bucket within the Free plan. Keep strict per-file limits, MIME validation, owner-scoped paths, moderation and the implemented global 750 MiB project-storage reservation gate. When the storage safety ceiling is reached, new uploads are rejected before transfer.

Supabase Free is intentionally the default because it does not require introducing a pay-as-you-go storage account. It is a small launch tier, not an unlimited video CDN.

### C. Future provider adapter (not enabled yet)

Provider identity is now stored in `media_items` and `community_short_videos`, allowing a future provider to be added without rewriting the watch product:
- `provider`: `supabase`, `youtube`, or a future approved provider.
- `asset_key`: provider-native object/video identifier, not a public URL.
- `playback_kind`: `file`, `hls`, `dash`, or `youtube_embed`.
- `processing_status`: `pending`, `processing`, `ready`, `failed`.
- `duration_seconds`, `size_bytes`, `mime_type`, and `checksum` where known.

Do not add Cloudflare R2 as an active dependency in strict-$0 mode. R2 currently includes 10 GB-month and request allowances with free internet egress, but usage beyond those allowances is billed. It is only a future opt-in if a hard, verified budget guard and account-level spending controls can guarantee no overage. Cloudflare Stream is excluded because video storage and delivery are paid usage.

## Upload and playback rules

- Uploads must be authenticated and authorized by the existing creator/member role model.
- Generate opaque owner-scoped object keys; never trust a client-supplied storage path.
- Validate MIME type, extension, actual file size and duration server-side where possible.
- Use TUS resumable/chunked transfer only where the selected provider supports it on the free tier. Current Supabase uploads use 6 MiB chunks, retry delays, a stable object key and a browser-persisted session fingerprint.
- Write metadata only after upload initiation; mark an asset ready only after successful completion/verification.
- Failed or abandoned uploads must be cleanable without deleting unrelated assets.
- Public playback must use provider-aware URLs; do not assume every source is a Supabase Storage path.
- Keep official creator uploads separate from member community shorts.
- No browser-visible service-role keys or provider secrets.

## Quota guard

The implemented storage guard sums object sizes from `storage.objects` across the project and adds active upload reservations under an advisory transaction lock. It rejects new reservations above 750 MiB and a database trigger additionally rejects direct Storage object inserts without a matching active reservation. Used, reserved and available bytes are exposed to the Creator Media Library. Reservations are owner-scoped, expire after one hour and are released after the upload flow completes.

Important limitations: this is an application-level storage safety ceiling, not Supabase billing telemetry. It protects the two NHEN upload flows wired to it (creator media and community Nhenbits); any future Storage upload route must also reserve capacity. Egress/bandwidth is not yet hard-capped because browser video delivery cannot be reliably inferred from database view counts. Review actual Supabase egress in the dashboard and keep playback traffic conservative.

## Implementation phases

### Phase 1 — safe $0 baseline — implemented
- Document the provider-neutral model and strict cost rule.
- Preserve current Supabase buckets and their 50 MiB per-file caps.
- Keep community shorts at the current 3-minute limit.
- Add YouTube-hosted official source creation, private/public state, deletion and provider-aware playback. NHEN owns the watch-page metadata and community features; YouTube delivers the video bytes.
- Add the 750 MiB project storage reservation gate and Creator Media Library capacity indicator. Never fall back to a paid service.

### Phase 2 — upload reliability — partially implemented
- Add provider and processing-state metadata to existing media records.
- Add expiring reservations, renewal for matching retry sessions, and a hard application storage stop for creator media and community Nhenbits.
- Use TUS resumable uploads for creator media and community Nhenbits, with 6 MiB chunks, retry backoff, progress feedback and stable session identity across reloads.
- Show storage usage/available capacity in the Creator Media Library.
- Remaining: an explicit admin-reviewed orphan cleanup action, egress monitoring, and end-to-end tests that deliberately interrupt a real upload and verify quota exhaustion.

### Phase 3 — playback quality
- Add thumbnails/posters, metadata probing, browser-compatible MP4 validation and optional multiple renditions only if a free local/browser workflow is viable.
- Prefer native MP4 playback for current self-hosted files; do not promise HLS transcoding on Supabase Free.
- Add pagination, lazy loading and playback preloading controls to reduce unnecessary egress.

### Phase 4 — live-ready data model
- Design live session records separately from stored video assets.
- A future live provider must be proven free at the expected storage, viewer and delivery levels before activation.
- Until then, live streaming is not advertised as available. YouTube-hosted live embeds may be evaluated separately, subject to account eligibility and platform policies.

## Acceptance gates before production

- Confirm Supabase plan and actual Storage/Egress usage in the dashboard.
- Test upload, interruption, retry, failed upload cleanup, deletion and owner isolation.
- Confirm TUS retry recovery in a real browser session using the same file and verify expired reservations are renewed safely.
- Review storage-health orphan candidates manually before adding any destructive cleanup capability.
- Test that a full quota stops uploads without data corruption or a paid fallback.
- Test official YouTube embed records alongside native MP4 playback.
- Verify storage reservations and capacity errors for creator and community uploads.
- Verify creator-only publishing and community-member permissions independently.
- Run application checks, security review and mobile playback tests.
- Keep all changes on `development`; do not promote to production without explicit owner approval.

## Provider references checked 2026-11-01

- Supabase Free plan and quotas: https://supabase.com/pricing
- Supabase Storage bandwidth: https://supabase.com/docs/guides/storage/serving/bandwidth
- Cloudflare R2 free allowance and paid overage rates: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Stream paid storage/delivery model: https://developers.cloudflare.com/stream/pricing/

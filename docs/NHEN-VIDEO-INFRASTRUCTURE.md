# NHEN video infrastructure — strict $0 plan

Status: architecture decision approved; strict free-only operation.
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
2. **NHENbits/community uploads:** continue using the existing Supabase Storage bucket within the Free plan. Keep strict per-file limits, MIME validation, owner-scoped paths, moderation and a global project quota gate. When the storage or egress budget approaches its safe ceiling, pause new uploads and show a clear capacity message.

Supabase Free is intentionally the default because it does not require introducing a pay-as-you-go storage account. It is a small launch tier, not an unlimited video CDN.

### C. Future provider adapter (not enabled yet)

Keep provider identity explicit in media metadata so a future provider can be added without rewriting the watch product:
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
- Use resumable/chunked transfer only where the selected provider supports it on the free tier.
- Write metadata only after upload initiation; mark an asset ready only after successful completion/verification.
- Failed or abandoned uploads must be cleanable without deleting unrelated assets.
- Public playback must use provider-aware URLs; do not assume every source is a Supabase Storage path.
- Keep official creator uploads separate from member community shorts.
- No browser-visible service-role keys or provider secrets.

## Quota guard

Track total stored bytes, upload count, bytes uploaded per month, estimated egress and request counts. Use conservative application thresholds below provider limits and stop accepting uploads before the project reaches the plan cap. Show the remaining capacity in the Creator Panel.

Important: application-side counters are a safety layer, not authoritative provider billing telemetry. Until provider usage can be checked reliably, keep a conservative manual operating cap and review Supabase usage before raising it.

## Implementation phases

### Phase 1 — safe $0 baseline
- Document the provider-neutral model and strict cost rule.
- Preserve current Supabase buckets and their 50 MiB per-file caps.
- Keep community shorts at the current 3-minute limit until the storage and delivery path is validated.
- Use YouTube embeds for official long-form videos rather than increasing Supabase video traffic.
- Add user-facing capacity errors; never fall back to a paid service.

### Phase 2 — upload reliability
- Add upload state tracking: `created`, `uploading`, `uploaded`, `processing`, `ready`, `failed`, `deleted`.
- Add cleanup for abandoned upload records/objects.
- Add a Creator Panel storage/egress usage indicator and conservative quota stop.
- Verify owner isolation, moderator removal, and cleanup behavior.

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
- Test that a full quota stops uploads without data corruption or a paid fallback.
- Test official YouTube embed records alongside native MP4 playback.
- Verify creator-only publishing and community-member permissions independently.
- Run application checks, security review and mobile playback tests.
- Keep all changes on `development`; do not promote to production without explicit owner approval.

## Provider references checked 2026-11-01

- Supabase Free plan and quotas: https://supabase.com/pricing
- Supabase Storage bandwidth: https://supabase.com/docs/guides/storage/serving/bandwidth
- Cloudflare R2 free allowance and paid overage rates: https://developers.cloudflare.com/r2/pricing/
- Cloudflare Stream paid storage/delivery model: https://developers.cloudflare.com/stream/pricing/

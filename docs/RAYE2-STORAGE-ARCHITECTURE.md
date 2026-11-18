# Raye2 Storage Architecture — Free-First, Provider-Neutral

**Status:** Approved engineering direction for implementation on development; provider accounts and credentials are not yet configured.
**Last reviewed:** 2026-11-15
**Scope:** Native videos, Mini's, Moments, thumbnails, stream replays, chat attachments, voice messages/consented recordings, Shared Memories and user uploads.

## 1. Decision

Build one Raye2 storage control plane with provider adapters. Keep Supabase as the application database/auth/control plane and retain existing Supabase objects as a compatibility/legacy provider. Add two independent S3-compatible object providers:

1. **Cloudflare R2 — primary hot/object delivery provider.** Use Standard storage for active public media and frequently read assets. Current published free allowance: 10 GB-month, 1 million Class A operations/month, 10 million Class B operations/month, and no internet-egress charge. Usage beyond included allowances can be billable.
2. **Backblaze B2 — secondary capacity/archive provider.** Use the first 10 GB of storage included free for overflow and less frequently accessed durable objects. Current published pricing also includes free egress up to 3x average monthly stored data; above that, charges may apply. Where practical, serve B2 objects through a supported Cloudflare CDN path to preserve eligible free egress, after verifying current provider terms and cache behavior.

This creates a nominal **up to 20 GB combined free object-storage allowance** across the two providers, before operation/egress constraints. It is not guaranteed 20 GB forever, not unlimited, and not a promise that every workload will remain free. Set conservative application ceilings below provider limits (initial target: 8.5 GB R2 and 8.5 GB B2) and fail closed before any provider overage. The Admin Panel must show actual configured limits and usage.

Keep the existing Supabase Storage buckets working for legacy assets and migration fallback; do not treat the Supabase Free 1 GB bucket quota as the long-term media backbone. Supabase remains the metadata/auth/control plane. Existing files must not be moved or deleted until a verified copy and rollback path exist.

**Do not use Google Drive as the primary media origin.** It is a personal-file collaboration product rather than a purpose-built public-media object store/CDN. Keep storage behind provider adapters so a future provider can be added without changing media records or user-facing flows.

## 2. Important meaning of “permanent”

- Storage quota is an allocation/capacity policy, not an expiry timer. A user's unused or used allocation must not reset monthly.
- A file remains stored until its owner deletes it, an explicit retention rule applies to that content class, or a lawful/safety moderation action requires removal.
- Monthly free-tier allowances are billing measurements; their monthly renewal does **not** delete objects. Provider pricing, free-tier rules, account status and terms can change.
- Moments, temporary stream replays, expiring Mini's, chat retention and voice recordings retain their separately configured lifecycle. Permanent storage does not override those product rules.
- Shared Memories and user-saved content remain excluded from generic cleanup unless their own explicit policy permits deletion.
- No free provider guarantees indefinite availability, backup, recovery, or account continuity. Do not describe this design as an immutable backup system.

## 3. Provider responsibilities and routing

| Data class | Default placement | Access model | Lifecycle |
| --- | --- | --- | --- |
| Public long videos and HLS renditions | R2 | Public CDN/custom domain after publication | Owner/admin policy; no automatic monthly reset |
| Mini's and Moments | R2 where capacity permits; B2 overflow | Public/private according to visibility | Product expiry rules apply |
| Thumbnails, posters, small images | R2 | CDN or signed URL | Follow parent asset unless independently saved |
| Private user uploads and chat attachments | B2 or private R2 bucket | Short-lived signed URLs only | Chat/attachment retention policy |
| Consented voice recordings | Private B2/R2 | Authorized room members only | Explicit recording retention |
| Shared Memories | Private provider placement, normally B2 | Membership/owner-scoped signed access | Separate preservation policy |
| Existing Supabase objects | Supabase legacy adapter | Existing policies/URLs until migrated | Preserve existing behavior |

Routing must be configurable by asset class, visibility, account quota, provider health and available free capacity. Do not duplicate every object across both providers by default: replication consumes the same scarce capacity twice. Replicate only explicitly selected critical assets or backup sets, and account for both copies in quota totals.

When a provider approaches its safety ceiling, stop assigning new uploads to it and route to the other provider if that provider has confirmed free headroom. If neither provider has safe capacity, reject or queue the upload with a clear message; never silently create a billable overage.

## 4. Provider-neutral data model

Extend the current provider-neutral media model rather than replacing existing identifiers:

- provider values: supabase, cloudflare_r2, backblaze_b2, youtube, external.
- asset_key: canonical provider object key; never a browser-visible credential or secret URL.
- playback_kind: file, hls, dash, youtube_embed, or external_url.
- size_bytes, mime_type, checksum_sha256, processing_status.
- A provider/bucket identifier and visibility state must be explicit; do not infer them from a URL.
- Keep stable Raye2 media IDs when objects move between providers.

Add control-plane tables/migrations for:
- provider registry and health snapshots (non-secret configuration only);
- per-provider capacity/free-tier ceilings and admin safety reserves;
- per-user, per-role and per-asset-class quota policies;
- storage objects/replicas and their lifecycle states;
- upload reservations and a durable usage ledger;
- idempotent upload, verify, migrate, replicate, delete and reconcile jobs;
- audit events for admin capacity changes and destructive operations.

Never store provider secret keys in ordinary database rows or browser bundles. Use server-only environment secrets (or an approved secret manager) and keep them out of logs, CI artifacts and client code. R2/B2 credentials must be least-privilege and restricted to the required buckets/actions.

## 5. Upload and publication transaction

1. Authenticate the user and verify role, ownership, content limits and moderation state on the server.
2. Choose a provider using the policy engine and current verified capacity.
3. Reserve both the user's allocation and the provider/platform capacity atomically before returning a signed upload URL.
4. Upload directly to object storage using a short-lived signed request; use multipart/resumable upload for large files where the provider supports it.
5. Verify the resulting object server-side (provider, bucket, key, size, MIME allowlist and checksum). Never trust client-supplied completion claims.
6. Commit metadata and consume the reservation in one database transaction.
7. If any pre-commit stage fails, release the reservation and remove staged objects. After the metadata commit, never run pre-commit rollback against an object now referenced by the committed record.
8. Processing workers create thumbnails/HLS renditions with their own reservations and record each output as a managed object.
9. Cleanup, migration and replication workers are idempotent, retryable and observable. Orphaned objects become reviewable candidates before destructive cleanup.

Private files must use signed URLs with short expiries and server-side authorization. Public files must be explicitly published and delivered through approved CDN/custom-domain paths. Do not expose private bucket URLs or provider credentials.

## 6. Quota and Admin control

Storage allocation is lifetime/current-usage based, not monthly-reset based. Admin/Owner controls should include:

- provider enable/disable and priority;
- per-provider safe capacity ceiling and reserve;
- per-user and per-role allocations, plus account overrides;
- asset-class allocation (video, Mini's, Moments, chat, voice, Shared Memories, thumbnails);
- routing and failover policy;
- per-file upload ceiling and accepted media types;
- retention policy separately from quota;
- provider health, stored bytes, reserved bytes, available safe bytes, object count, operation/egress usage where available;
- upload rejection/backpressure, migration queue, replication queue, orphan review and deletion backlog;
- audit log, dry-run previews and explicit confirmation for destructive operations.

Admins may allocate more quota to a Creator/Streamer only when platform/provider headroom exists. A quota setting must never override a provider's actual ceiling. User-facing storage screens should distinguish personal quota, platform free capacity and provider-level capacity.

## 7. Security, recovery and integrity

- Server-side authorization and RLS for all metadata and mutations.
- Signed uploads/downloads; no public write access.
- Verify SHA-256 after upload and after provider-to-provider copy.
- Use immutable object keys (new key on replacement) and database commit boundaries.
- Keep private objects private during migration; verify destination ACL before switching metadata.
- Migration sequence: copy -> verify size/checksum -> switch metadata atomically -> observe -> retain old copy for a defined rollback window -> delete old copy only after explicit successful verification.
- A provider outage must not cause metadata loss or make private objects public. Fail closed when authorization or provider state is unknown.
- A second provider used only for overflow is not a backup. Show replication status honestly.
- Admin storage recovery must preview affected records and preserve Shared Memories/chat according to the selected scope.

## 8. Implementation phases

### Phase A — Audit and contracts
- Inventory every existing upload/download/delete path, bucket, policy, quota RPC, media table and worker.
- Define a shared storage adapter interface and provider capability contract.
- Add tests for current Supabase behavior before changing it.
- Keep existing Supabase uploads functional during the transition.

### Phase B — R2 adapter
- Add server-only R2 client, presigned upload/download, object HEAD/delete/copy and usage reconciliation.
- Add provider-aware reservations and metadata writes.
- Add integration tests with mocked S3-compatible responses plus documented real-account acceptance steps.
- Do not configure a real provider or store credentials until the owner has created the account and added secrets.

### Phase C — B2 adapter and placement
- Add B2 S3-compatible adapter and independent capacity accounting.
- Add policy-based placement/failover and safe-cap enforcement.
- Add private/public delivery handling and B2 egress guardrails.
- Verify Cloudflare CDN/partner egress eligibility before relying on it.

### Phase D — Admin Storage Control Center
- Add provider health/capacity dashboards, per-user quotas, asset-class policies, routing controls, alerts and audit history.
- Add user-facing storage usage and clear upload-capacity messages.

### Phase E — Migration and recovery
- Add dry-run inventory, copy/verify/switch/rollback workflows for existing Supabase assets.
- Keep Supabase objects until every migrated object is verified and rollback windows close.
- Add orphan reconciliation, failed-upload cleanup and periodic provider usage reconciliation.

### Phase F — Community and full-platform integration
- Route chat attachments, voice messages/consented recordings, Shared Memories, Mini's, Moments and stream replays through the same control plane.
- Keep product-specific retention separate from storage quota.
- Add real end-to-end tests for private access, role quotas, upload resume, publication, provider outage and cleanup.

## 9. Current verified baseline (2026-11-15)

Live Supabase project Creator-Fan-Hub is ACTIVE_HEALTHY in eu-central-1. The live database currently exposes three media buckets:
- creator-media-private (private),
- creator-media-public (public),
- nhen-community-shorts (public; legacy bucket name).

All three currently have a 50 MiB per-object limit. The repository's existing reservation migration uses a 750 MiB application-level storage safety ceiling and a one-hour reservation lifetime. The existing resumable browser uploader and media worker are Supabase-specific. The current media provider constraint only supports supabase, youtube and external; R2/B2 are not integrated yet.

The live Supabase migration history currently ends at 20261102215604 (nhen_scope_storage_quota_to_managed_buckets). Later repository migrations are not proven applied to this project. Do not apply pending migrations or mutate production data as part of this architecture phase. First reconcile migration history and validate against an isolated development database.

## 10. Pricing references checked 2026-11-15

- Cloudflare R2 pricing: https://developers.cloudflare.com/r2/pricing/
- Cloudflare R2 product/pricing overview: https://www.cloudflare.com/products/r2/
- Backblaze B2 pricing: https://www.backblaze.com/cloud-storage/pricing
- Supabase pricing: https://supabase.com/pricing
- Supabase storage pricing: https://supabase.com/docs/guides/storage/pricing

Pricing and provider terms must be rechecked before launch. This document records the current design decision, not a guarantee that any provider will retain its free tier.


## 11. S3-compatible adapter implementation update (2026-11-15)

The development branch now contains a dependency-free Node.js S3-compatible adapter for Cloudflare R2 and Backblaze B2 using AWS Signature Version 4:
- Presigned PUT upload URLs with content-type bound into the signature.
- Presigned GET download URLs for private objects.
- Signed HEAD, server-side COPY and DELETE operations.
- Separate public/private bucket selection and optional HTTPS public custom-domain URLs.
- HTTPS-only endpoint validation, safe object-key validation, bounded presigned URL expiry and server-side environment configuration.
- No provider SDK dependency and no secrets in browser bundles or SQL.

Current adapter limitations are explicit: multipart/resumable S3 uploads are not implemented yet; the adapter reports this capability as false. HEAD metadata currently verifies size/content type/ETag but does not claim SHA-256 verification. Public delivery is advertised only when a public base URL is configured. The signed upload endpoint must still reserve quota, enforce role/content policy, and verify the uploaded object before publishing metadata.

Environment names are documented in `.env.example`. Real provider accounts, buckets, credentials, custom domains, live capacity polling, API route integration and isolated SQL validation remain required before production use.

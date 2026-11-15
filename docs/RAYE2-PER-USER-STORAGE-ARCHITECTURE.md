# Raye2 per-account media storage and zero-cost provider decision

## What "personal storage" means

Each Raye2 account receives a logical media library. Objects are stored under an owner-scoped prefix (the authenticated user ID), and the database tracks that owner's used bytes and active reservations separately. A per-account allowance controls uploads; a shared project ceiling protects the actual provider bucket.

A virtual library is not a new physical disk. Creating 1,000 user folders does not increase the capacity of Supabase, R2, or any other backend. Each stored byte still consumes the provider's shared storage and bandwidth.

## Implemented account quota defaults

The migration `20261115193000_raye2_per_user_media_storage_quotas.sql` introduces:
- Standard authenticated member: 100 MiB logical allowance.
- Creator role: 2 GiB logical allowance.
- Streamer role: 2 GiB logical allowance.
- Combined Creator+Streamer / Owner / Admin: 3 GiB logical allowance (combined, not additive).
- Platform admins can set or reset a member's quota through an audited RPC, capped at 10 GiB per account. Role-tier storage values are also admin-tunable but capped at 10 GiB.
- Shared managed-storage ceiling: remains 750 MiB until a larger provider is explicitly configured and verified.
- Both creator uploads and worker-generated thumbnails/HLS outputs are charged to the owner's allowance and the shared ceiling.
- Capacity query: `get_raye2_user_storage_capacity()`.
- Admin quota function: `set_raye2_user_storage_quota(uuid,bigint,text)`; never expose this function to browser sessions.

The Creator Media Library shows personal usage and the shared project safety ceiling separately. This avoids presenting an individual allowance as if it were additional physical capacity.


## Professional tiers and multi-provider safeguards

Migration `20261115194000_raye2_professional_storage_tiers_and_provider_registry.sql` connects storage allowances to the existing Creator / Streamer / Combined role model:
- Member: 100 MiB.
- Creator: 2 GiB.
- Streamer: 2 GiB.
- Combined Creator+Streamer: 3 GiB, never the sum of both role allowances.
- Owner/Admin use the combined tier.
- Admin quota overrides remain capped at 10 GiB per account.
- Existing content publishing quotas (long videos, streams, Mini's and Moments) remain governed by the separate existing `raye2_role_quotas` matrix.

The same personal allowance is checked during browser upload reservation, capacity display and worker-generated derivatives. A larger personal allowance never bypasses the physical provider cap.


### Admin controls

Migration `20261115195000_raye2_admin_storage_quota_controls.sql` adds:
- `raye2_admin_set_user_storage_quota(user_id, quota_bytes, reason)` for platform admins.
- Passing NULL resets the account to its role default.
- Every change is written to the platform admin audit log.
- Both per-user and per-role storage limits are hard-capped at 10 GiB.
- This RPC is ready for the admin UI to call; the dashboard control surface still needs wiring and end-to-end permission testing.

### Provider registry status

A private provider registry now records provider kind, free-only billing mode, capacity, monthly read/write/egress budgets, hard-stop percentage and priority. It contains:
- Supabase: enabled, 750 MiB application cap.
- Cloudflare R2: registered but disabled with zero capacity until owner approval and a tested adapter.

This registry is **not yet a multi-cloud router**. Current browser uploads and worker objects still use Supabase Storage. Provider selection, object migration, cross-provider playback, provider usage reconciliation, and automated budget counters must be implemented and tested before another backend can accept production media. No extra storage capacity is claimed yet.

### Strict $0 safeguards

- Only `billing_mode='free_only'` is allowed in the registry.
- Provider records are private and contain no credentials.
- Each enabled provider must have positive capacity and read/write budgets.
- The application hard-stop is configured below provider free limits (default 85%, configurable between 50% and 95%).
- The current Supabase upload RPC continues to enforce its independent 750 MiB shared cap.
- The R2 entry remains disabled. Do not add a payment method, enable pay-as-you-go, or configure credentials until its account-specific activation and overage behavior are confirmed.
- The registry's request/egress budgets are policy metadata until the storage adapter and runtime metering are connected; they must not be described as live-enforced yet.

## 10 GB per month target: provider comparison

### Cloudflare R2 — technically attractive, not enabled

Cloudflare currently lists 10 GB-month Standard storage, 1 million Class A requests and 10 million Class B requests in the free allowance, with no direct egress fee. The 10 GB-month is an average stored amount for the billing month, not a fresh 10 GB that accumulates every month. Storage and request usage beyond free allowances are billable.

Cloudflare's R2 onboarding requires adding an R2 subscription through a checkout flow. Cloudflare's billing documentation says a primary payment method is required to purchase Cloudflare products/services. Therefore R2 is not accepted as a strict-no-billing dependency for this project unless the account owner independently confirms a safe, no-charge setup and billing protections. Do not add a payment method or enable the subscription merely to test it.

Official references:
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/r2/get-started/
- https://developers.cloudflare.com/billing/get-started/create-billing-profile/

### Backblaze B2 — strongest no-card candidate, still disabled

Backblaze's official onboarding guide says an account can be created with email verification and does not list a payment method as a signup requirement. Backblaze advertises the first 10 GB of storage free and free egress up to 3x average monthly stored data. However, usage beyond the free allowances is billable.

Backblaze also offers daily spend caps for storage, downloads and transaction categories. These caps limit daily charges, but the documentation does not establish that setting every cap to $0 guarantees a complete service-side hard stop before any charge in every scenario. Therefore B2 remains disabled until we validate the actual account controls, set zero-spend caps, test quota exhaustion, and confirm the application adapter can stop before paid usage.

Official references:
- https://www.backblaze.com/docs/en/cloud-storage-enable-backblaze-b2
- https://www.backblaze.com/cloud-storage/pricing
- https://help.backblaze.com/hc/en-us/articles/217931138-How-to-use-B2-data-caps-alerts

### Tigris — useful 5 GB no-card candidate

Tigris currently advertises 5 GiB of Standard storage, 10,000 Class A requests and 100,000 Class B requests each month, with zero egress fees. Its pricing page says no card is required to start. Overage storage and request usage is billable, so the Raye2 adapter must maintain conservative hard stops below those free limits and reconcile usage before enabling the pool.

Official reference:
- https://www.tigrisdata.com/pricing/

### Cloudflare R2 — excluded under strict no-payment rules

R2's 10 GB-month free Standard allowance and free egress are attractive, but Cloudflare requires a primary payment method to purchase usage-based products and R2 is billed by usage. It remains disabled because the project must not add a payment method or risk billable overage.

Official references:
- https://developers.cloudflare.com/r2/pricing/
- https://developers.cloudflare.com/billing/get-started/create-billing-profile/
- https://developers.cloudflare.com/billing/understand/billing-policy/

### Supabase Free — keep as metadata/auth and a small media pool

The current 750 MiB project cap remains in place. Supabase continues to handle auth, permissions, metadata, comments, roles, upload reservations and media state. It is not the sole 10 GiB video store.

### Supabase Free — keep as metadata/auth, not the 10 GB video store

The current 750 MiB project cap remains in place. Supabase continues to handle auth, permissions, metadata, comments, roles, upload reservations and media state. It is not the target video-byte store at 10 GB.

### YouTube — external-hosted official video option

For creator videos that can be hosted externally, Raye2 can store YouTube video identifiers and metadata while YouTube serves the video. This is not equivalent to Raye2-owned raw file storage and depends on account eligibility, YouTube policies and playback availability.

## Why user-connected personal cloud drives are not automatically pooled

A member could theoretically connect their own cloud account, but that is not a shared Raye2 bucket:
- The user's provider quota and account can change or disappear.
- OAuth consent, token security, revocation, privacy, and account recovery become per-user dependencies.
- Personal-drive services are not necessarily designed or licensed as public video CDNs.
- Playback quotas, download restrictions and bandwidth limits still apply.
- Files may become unavailable whenever the user revokes access or loses the account.

Do not silently use a member's private drive to serve other members. If a future bring-your-own-storage option is built, it must be opt-in, clearly disclose who can access the files, and provide a clean unlink/export path.

## Zero-cost operating rules

1. Never enable pay-as-you-go providers automatically.
2. Never put provider secrets in client bundles.
3. Reject uploads before transfer when personal or shared quota is exhausted.
4. Include worker-generated derivatives in the same quota accounting.
5. Keep a shared hard ceiling even when individual quotas are raised.
6. Do not promise 10 GB active storage until a provider is selected, real quotas and account requirements are verified, and an end-to-end upload/playback test succeeds.
7. If no acceptable free provider exists, keep YouTube-hosted official videos as the large-video route and keep native uploads within the small managed quota. Do not pretend folders or per-user allowances create additional storage.

## Future 10 GB rollout gates

- [ ] Confirm the selected provider has at least 10 GB of genuinely free storage.
- [ ] Confirm signup/activation does not require a payment method or billable subscription under the owner's requirements.
- [ ] Confirm provider overage behavior cannot create charges; if not possible, do not use it under strict $0 policy.
- [ ] Set an application ceiling below the provider's published free allowance to leave request/metadata headroom.
- [ ] Verify upload, resume, owner isolation, private/public playback, deletion and quota-exhaustion behavior.
- [ ] Verify bandwidth and request allowances using realistic viewing tests.
- [ ] Keep Supabase as the authoritative owner/permission/quota ledger.


## Confirmed target policy: 10 GiB total + 10 GiB monthly uploads

Migration `20261115196000_raye2_dynamic_storage_capacity_and_monthly_upload_budgets.sql` adds the requested target policy:
- Initial total storage target: 10 GiB.
- Global monthly upload target and absolute ingestion hard-stop: 10 GiB.
- Both values are binary GiB (10 × 1,073,741,824 bytes).
- Effective live capacity is the lesser of the 10 GiB target and the sum of enabled, adapter-ready, zero-cost-verified provider capacities after each provider's hard-stop safety margin.
- Current verified provider: Supabase only, with a 750 MiB configured project ceiling and an 85% application stop. Therefore the current usable application capacity remains below 10 GiB. The 10 GiB target is a policy target, not provisioned storage.
- Cloudflare R2 remains disabled with zero accepted capacity. No payment method, subscription, or paid overage is enabled.

### Dynamic role allocation

The manager computes weighted shares from recently active accounts (signed in during the last 90 days, or new accounts created during the last 30 days):
- Member weight: 1.
- Creator weight: 3.
- Streamer weight: 3.
- Creator + Streamer / Owner / Admin weight: 5.

The per-account logical quota is the lesser of the role/admin-requested allowance and the account's weighted share of verified physical capacity. Existing stored usage is grandfathered if the active-account denominator later changes; new uploads are denied until usage is below the recalculated share. Creator/Streamer/Combined role ceilings are 2 GiB / 2 GiB / 3 GiB, subject to real capacity. Admin overrides remain capped at 10 GiB, also subject to real capacity.

The monthly upload target is dynamically split using the same role weights. Each upload is reserved before transfer and accounted atomically when Storage creates the object. Global, per-user, and provider write-operation budgets are hard stops.

### Fail-closed provider eligibility

A provider can receive writes only when:
- It is explicitly enabled.
- Billing mode is `free_only`.
- A provider adapter is marked ready.
- Zero-cost / no-billable-overage status is verified.
- It has positive capacity and positive operation/egress budgets.
- Its capacity snapshot is recent and has sufficient free space and request/egress headroom.

A missing or stale provider snapshot means no routing to that provider. The existing upload flow currently uses Supabase Storage, and the new router deliberately returns only the Supabase provider until a real adapter has been built and tested. This patch establishes the policy and hard-stop ledger; it does not claim multi-cloud object placement is already live.

### Accounting scope and remaining acceptance work

- Database ingestion bytes and write-operation counts are enforced on reservation and object insertion.
- Provider read/egress budgets for non-Supabase backends require adapter-side metering and fresh reconciliation; they are not represented as already-live enforcement.
- Supabase Storage egress is not measured directly by the new SQL ledger. The provider's own limits and project-level monitoring remain necessary; do not claim unlimited video playback.
- Before increasing the current 750 MiB ceiling, configure and test an actual provider with verified no-payment and no-overage guarantees.
- CI must replay the entire migration history against a clean local Supabase database and execute the quota contract tests before this PR is considered ready.

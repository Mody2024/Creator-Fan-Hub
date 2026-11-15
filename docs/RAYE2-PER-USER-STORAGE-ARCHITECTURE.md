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

### Tigris — smaller allowance

Tigris advertises a smaller free storage allowance than the 10 GB target. It does not solve the complete target on its own. Do not enable it until current terms, overage behavior and account requirements are confirmed.

### Backblaze B2 — possible secondary archive, not primary video delivery

B2 advertises a small free storage allowance and limited free egress relative to stored data. That can be useful for a small backup archive, but it does not meet a 10 GB active video library target by itself.

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

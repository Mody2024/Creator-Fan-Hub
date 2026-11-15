# Raye2 per-account media storage and zero-cost provider decision

## What "personal storage" means

Each Raye2 account receives a logical media library. Objects are stored under an owner-scoped prefix (the authenticated user ID), and the database tracks that owner's used bytes and active reservations separately. A per-account allowance controls uploads; a shared project ceiling protects the actual provider bucket.

A virtual library is not a new physical disk. Creating 1,000 user folders does not increase the capacity of Supabase, R2, or any other backend. Each stored byte still consumes the provider's shared storage and bandwidth.

## Implemented account quota defaults

The migration `20261115193000_raye2_per_user_media_storage_quotas.sql` introduces:
- Standard authenticated member: 100 MiB logical allowance.
- Assigned creator: 250 MiB logical allowance.
- Admin override: trusted service-role-only function; configurable up to 10 GiB per account, or reset to role default.
- Shared managed-storage ceiling: remains 750 MiB until a larger provider is explicitly configured and verified.
- Both creator uploads and worker-generated thumbnails/HLS outputs are charged to the owner's allowance and the shared ceiling.
- Capacity query: `get_raye2_user_storage_capacity()`.
- Admin quota function: `set_raye2_user_storage_quota(uuid,bigint,text)`; never expose this function to browser sessions.

The Creator Media Library shows personal usage and the shared project safety ceiling separately. This avoids presenting an individual allowance as if it were additional physical capacity.

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

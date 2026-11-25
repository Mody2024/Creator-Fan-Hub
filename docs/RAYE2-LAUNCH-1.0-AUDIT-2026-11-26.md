# Raye2 Launch 1.0 — release audit
**Audit date:** 2026-11-26  
**Repository:** `Mody2024/Creator-Fan-Hub`  
**Working branch:** `development`  
**Audited commit:** `7d7ca63ae4a499bdf61e14e95ea8b6e1aa9b2a6e`

This is the Launch 1.0 release-scope audit. It replaces the habit of using the legacy full-platform percentage as a proxy for Launch 1.0 readiness. A route, migration, design screen, or source-contract test does not by itself prove a complete user journey.

## 1. Current verification snapshot

| Check | Result |
|---|---|
| Git branch | `development`; `main` and production were not modified |
| GitHub Actions | Green on audited commit; run [45717666505](https://github.com/Mody2024/Creator-Fan-Hub/actions/runs/45717666505) |
| Automated tests | 1,076 passed, 0 failed |
| Static repository validator | 542 assertions passed |
| TypeScript | Passed |
| ESLint | Passed |
| Next.js production build | Passed |
| Media-worker image build | Passed |
| Vercel status | Success for audited commit |
| Supabase project | `ACTIVE_HEALTHY`, PostgreSQL 17.11 |
| Public schema inventory | 135 tables |
| Migration inventory | 253 files in repo; 253 versions recorded in live project, with two version-ID mismatches described below |

These checks establish a green code/build baseline. They do not replace browser/device QA or signed-in acceptance tests with distinct member, non-member, moderator, admin and owner accounts.

## 2. Release-blocking findings

### A. Platform invite-only signup is not enforced in the client flow

The community sign-up handler calls `supabase.auth.signUp({ email, password })` directly when signup mode is selected; it does not pass or validate a platform invitation token. The group-invite token is handled separately after a member is already authenticated and redirects through `/raye2/invite`. The owner setup guide says public Supabase sign-up is disabled, but the live Auth setting was not independently verified during this audit.

**Current admission model:** owner-provisioned Auth accounts with public signup intended to be disabled. This is not yet a member invitation-link workflow.

**Required:** verify the actual Supabase Auth signup setting, remove or replace the misleading public signup UI, and implement an owner-controlled platform invitation flow if self-service invite redemption is part of Launch 1.0. Enforce admission server/database-side; client-only token checks are insufficient. Keep group invitations distinct from platform admission invitations.

### B. Screen sharing is not implemented

The Launch 1.0 feature matrix marks screen sharing as new design. The current private/group voice controls do not contain a browser display-capture flow (`getDisplayMedia`) or a screen-share publishing lifecycle.

**Required:** implement live-only screen sharing with explicit user action, visible sharing state, stop/reconnect handling, desktop support detection and a clear mobile-browser fallback. Do not store screen-share streams or recordings by default.

### C. Live migration history has version drift

The repository contains these migration filenames:

- `20261119200000_raye2_youtube_promo_channels.sql`
- `20261119210000_raye2_youtube_channel_policy_refinement.sql`

The live Supabase migration history records the same semantic migration names under:

- `20261119181242` — `raye2_youtube_promo_channels`
- `20261119181458` — `raye2_youtube_channel_policy_refinement`

The total counts match (253), but those two version IDs do not. A read-only schema check confirms the live table exists and has the five final policies expected by the second repository migration. This is confirmed migration-ledger version drift; it is not evidence that the final table/policy state is currently missing. The repository migration-check script applies repository files to an isolated PostgreSQL harness; it does not compare repository version IDs with the live Supabase migration ledger.

**Required:** document the reconciliation before any future `supabase db push`, migration repair, or schema change. Do not blindly apply the two repository files or rewrite migration history as a shortcut. First verify the historical SQL and current schema, then choose a safe, documented reconciliation.

## 3. Feature implementation map

| Launch area | Present in code | Still required for Launch 1.0 acceptance |
|---|---|---|
| Accounts and sessions | Supabase sign-in/sign-up UI, session refresh, account recovery | Enforce platform invite-only admission; test new member, existing member, expired/revoked invite and non-member denial |
| Direct/group messaging | DMs, group conversations, replies, reactions, read receipts, message requests and notifications | Finish member/details panel, attachment flow, voice messages and complete message-action UX; run real multi-account sessions |
| Threads | Basic focused thread panel added | Replies are derived only from currently loaded messages; add independent/paginated thread loading before claiming full thread support |
| Groups | Public/private groups, three-step creation wizard, membership and moderation foundations, profile fields, topics/channels, invite redemption | Full room types/categories, richer group identity/onboarding, role/permission acceptance, and room lifecycle |
| Voice | Private calls and LiveKit group voice; mute, raise hand, moderation and recording-consent UI foundations | Stage UX, speaker queue/scheduling, robust recording-consent acceptance and screen sharing |
| Polls | Basic text polls and voting | Image choices, deadlines, live results and permission enforcement in the final UI |
| Invitations | Group invitation redemption and group invite-link controls | Platform invite-only onboarding and platform invitation management dashboard |
| Notifications | Notification inbox, unread indicators and read-state foundations | Real-time and multi-device acceptance; verify quiet-hours and delivery behavior |
| Moderation and safety | Reports, blocks, group bans, member restrictions and moderation/admin RPC foundations | Test every action against member/moderator/admin/owner boundaries; review appeal and audit flows |
| Admin and retention | Admin route, rules, retention, cleanup, storage, moderation, member and audit sections exist | Finish Launch 1.0 visual/content integration; add platform invite dashboard; verify destructive-operation previews, reasons and audit records |
| Events | Events route and event-related backend features exist | Finish calendar/reminder UX and verify end-to-end scheduling if retained in the 1.0 scope |
| PWA | Manifest, privacy-conscious service worker, offline fallback and bilingual install prompt | Browser install/update/offline tests on desktop and mobile |
| Localization/accessibility | English/Arabic copy and RTL support across major surfaces | Page-by-page EN/AR review, keyboard/screen-reader checks, contrast and reduced-motion audit |
| Shared workspaces/tasks/AI extras | Not complete as Launch 1.0 components | Keep out of the critical 1.0 path unless explicitly promoted into the frozen scope |

The current `src/lib/launch-features.ts` matrix and older design handoff are not fully synchronized with the latest implementation batches. Do not use their raw status counts as a release percentage without updating each row against the acceptance criteria above.

## 4. Supabase security review notes

The live Security Advisor returned:

- 44 tables with RLS enabled and no table policies. Many are internal/admin/worker tables and are expected to be inaccessible directly; verify table grants and their intended RPC-only access rather than treating this INFO finding as proof of a breach.
- 70 functions flagged as executable by `anon` while marked `SECURITY DEFINER`, and 416 executable by `authenticated`. Many are intended public read or guarded RPC endpoints, but every exposed function needs a purpose/authorization review. Pay particular attention to maintenance/expiry functions that can be invoked from public page reads.
- 2 functions with mutable search paths: `raye2_in_quiet_hours` and `raye2_notification_category`.
- Compromised-password protection is disabled in Supabase Auth.

The previous security review is a source/grant review, not a penetration test. Before release, test with a real anonymous session, an authenticated non-member, a normal member, a group moderator, a platform admin and the owner. Confirm that internal cleanup, storage, moderation, quota and financial functions cannot be used outside their intended role.

## 5. Preview database isolation

The setup guide identifies one dedicated Supabase project for Creator Fan Hub, with its URL and publishable key configured for Vercel Preview on the `development` Git branch and not configured for Vercel Production. The Supabase project currently has **no separate Supabase development branches**.

This means Preview is intended to use the dedicated development database rather than a configured Production Supabase database. However, all Preview deployments share the same development database; there is no per-preview database branch. The current state of production database configuration must not be inferred beyond the setup guide.

**Required:** use clearly marked synthetic test accounts/data and avoid destructive acceptance tests that could interfere with other development testing. Do not configure Production Supabase credentials or promote this project to Production without explicit owner approval. If parallel isolated testing becomes necessary, create a separate test project only after checking cost and obtaining approval.

## 6. Frozen Launch 1.0 acceptance scope

Launch 1.0 is the communication-first release. Its release gates are:

1. Invite-only member admission, account/session lifecycle and recovery.
2. Direct messages and group conversations, with privacy, notifications and reliable message history.
3. Public/private communities, membership, invitations, rooms/channels and role permissions.
4. Private/group voice, live-only screen sharing and clear browser fallback behavior.
5. Basic/professional polls as approved for the first release.
6. Moderation, reporting, blocking, bans/restrictions and auditable admin controls.
7. Admin-configurable retention, cleanup and storage limits that respect the small invite-only launch.
8. Responsive desktop/mobile UI, English/Arabic/RTL, accessibility and PWA behavior.
9. Green CI, reconciled migrations, a working Preview with real test credentials, and owner acceptance.

Shared documents, task boards, optional AI summaries/translation and other expansion ideas are not allowed to hold the core release hostage. Keep them as later updates unless the owner explicitly changes the frozen 1.0 scope.

## 7. Progress accounting rules

- Track **Implemented**, **Verified**, and **Remaining** separately.
- “Implemented” means the feature exists in the actual app and has the required server-side authorization—not merely a design reference, route or migration.
- “Verified” means the acceptance scenario passed. Source-contract tests and CI are useful evidence but do not count as real-session/browser acceptance.
- “Remaining” lists unfinished or unverified release gates.
- Do not copy the legacy full-platform 93%/96% estimate into Launch 1.0.
- Do not increase the Launch 1.0 percentage for cosmetic changes or for adding tests alone.
- Publish a new overall Launch 1.0 percentage only after the acceptance checklist has stable weights and each row has an evidence-backed status.

## 8. Next implementation batches

1. **Admission + migration integrity:** implement invitation-bound signup; investigate and document migration-ledger reconciliation without touching production schema.
2. **Communication completion:** finish room/channel model and management, message details/actions, attachments/voice messages, and independent thread loading.
3. **Voice completion:** stage/speaker queue and live-only screen sharing with mobile fallback.
4. **Polls + invitations:** finish advanced poll UX and platform invitation dashboard.
5. **Release hardening:** close security advisor findings or document justified exceptions; run real multi-account, EN/AR, mobile/desktop and storage-retention acceptance.

No merge to `main` and no production deployment is authorized by this audit.

## 9. Development-branch corrections after the audited snapshot

The table above describes audited commit 7d7ca63ae4a499bdf61e14e95ea8b6e1aa9b2a6e. Subsequent development commits add functionality that was not present in that snapshot. Do not interpret the earlier feature map as a description of the current development head.

- **Platform admission:** development now contains a platform invitation table/migration, owner-only invitation RPCs, an owner invitation dashboard, signup token capture, and a Before User Created Auth hook function. The migration has not been applied to the live Supabase project and the Auth hook has not been configured. Consequently, invite-only admission is still not proven/enforced in the live environment. See Batch 4 in the implementation tracker.
- **Group-room screen sharing:** the current development group voice component already supports user-initiated LiveKit screen capture, remote screen rendering, stop handling, and browser capability fallback. The earlier statement that group voice had no screen sharing is stale for the current branch.
- **Private-call screen sharing:** subsequent development commits add a pre-negotiated WebRTC video transceiver, live-only display capture, remote screen rendering, visible sharing status, stop/cleanup behavior, and source-contract tests. This is implemented in code but is not yet CI-verified or accepted in real two-account browser/device tests. Mobile browser support may be unavailable; the UI reports that limitation rather than promising it works.
- **Verification boundary:** the later invitation and voice changes do not inherit the green CI result from the audited commit. Re-run full CI on the latest development head and complete real-session acceptance before treating these items as release-ready.

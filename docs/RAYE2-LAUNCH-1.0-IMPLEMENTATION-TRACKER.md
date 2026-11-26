# Raye2 Launch 1.0 implementation tracker

> **Latest release audit (2026-11-26):** [Raye2 Launch 1.0 audit, verified state and release blockers](RAYE2-LAUNCH-1.0-AUDIT-2026-11-26.md). Use that audit for the current implementation/verification baseline; the historical batch notes below are not a live progress percentage.

This tracker is scoped to the communication-first launch. It is separate from the legacy ten-wave full-platform estimate in `RAYE2-IMPLEMENTATION-PROGRESS.md`. A design reference, route, or schema alone does not count as a finished user-facing feature.

## Batch 1 — 2026-11-25: PWA foundation

- Added `public/manifest.webmanifest` with standalone install metadata, Raye2 theme colors, app icons, and Messages/Groups shortcuts.
- Added a bilingual offline fallback page.
- Added a production-only service-worker registration component.
- Added `public/sw.js`: it caches only immutable same-origin public assets. Navigations remain network-only; when offline they receive the generic offline page. API, auth, creator, Raye2, and group paths are excluded from caching to avoid storing private content on a shared device.
- Added automated source-contract coverage for manifest metadata, privacy-safe caching boundaries, and registration wiring.
- **Verification:** automated tests, TypeScript, lint, and Next.js production build passed on commit `942d569c22f4c95cb7f8fd38d72fddf93538bc8b`. Real-browser install prompt, update behavior, and offline behavior remain unverified.
- **Safety boundary:** no backend, database, auth, role, or production configuration was changed.

## Launch work remaining

| Area | Status | Required completion |
|---|---|---|
| Shared chalk shell and responsive navigation | Design reference exists | Integrate/verify the Launch 1.0 design without replacing the preserved full-platform branch |
| Chat and messaging | Existing functionality; design pass exists | Real-session visual QA; details/member panel, room list, threads, message actions, voice controls, polls |
| Groups and rooms | Existing foundations | Three-step creation, group identity, roles/permissions, rooms/categories, stage controls |
| Voice and screen sharing | Existing voice foundations | Stage UX, screen-share flow and browser fallback; consent and live-session acceptance |
| Polls | Basic implementation exists | Image choices, multi-select, deadlines, live results, creator/admin permission enforcement |
| Invitations | Redemption exists | Admin invitation dashboard and invite-only onboarding acceptance |
| Admin | Existing backend and partial UI | Complete admin navigation/content design, storage/limits/retention/cleanup controls, audit-safe workflows |
| Events and collaboration | Events route exists | Calendar/reminders, shared notes/resources, tasks and deadlines |
| Member identity | Existing profile foundations | Badges, achievements, translation/summaries if approved for launch |
| PWA | Foundation added in Batch 1 | CI, build, install prompt, update behavior, offline fallback, mobile/desktop QA |
| Accessibility and localization | Partial | EN/AR route audit, keyboard/focus, labels, contrast, reduced motion |
| Release readiness | Not complete | Preview env, real signed-in tests, security checks, owner acceptance; no production push without approval |



## Batch 2 — 2026-11-25: Group creation wizard

- Replaced the one-screen group creation modal with a three-step flow: group basics, public/private visibility, and a final review.
- Added bilingual English/Arabic copy, an accessible progress indicator, clear public/private explanations, and a mobile-friendly layout using the existing Raye2 palette.
- Kept the existing `raye2_create_group` RPC and its current fields unchanged. No database or authorization changes were made; advanced group identity, custom roles, and room creation remain separate implementation work.
- Added an automated source-contract test for the three-step flow and its existing RPC boundary.
- **Verification:** automated tests, type-check, lint, and build passed on commit `942d569c22f4c95cb7f8fd38d72fddf93538bc8b`. Real Supabase group creation and browser/device QA remain pending.



## Batch 3 — 2026-11-25: Launch design integration and access rules

- Imported the 119 changed files from Claude's `design/launch-1.0` PR into `development` while preserving the source design branch and full-platform design branch.
- Added the shared inline language control to the main shell, creator workspace chrome, and admin header; wired the editable language label through the public shell.
- Connected the launch media gate to a shared server-side platform-admin check. Active `owner` and `admin` accounts retain media access; ordinary members see the Launch 1.0 Coming Soon state. The check fails closed.
- Made the public home, Raye2 home, and search surfaces communication-first for members while retaining media discovery for platform admins.
- Removed the member-facing Videos/Mini's/Moments search filters during Launch 1.0; group and creator discovery remain available.
- Locked the live appearance to the single Raye2 dark palette, approved blue accents, and one logo preview theme. Deferred scheduled theme creation.
- Updated validation contracts to reflect the shared shell, admin-only media visibility, and the fixed brand theme.

## Verification status

- The media-worker container image built successfully in CI.
- Full CI passed on commit `942d569c22f4c95cb7f8fd38d72fddf93538bc8b`: static validation, automated tests, TypeScript, lint, Next.js production build, and media-worker image build.
- The one remaining legacy light-theme selector and the missing locale-cookie import found during verification were fixed before the passing run.
- Browser/device QA, authenticated admin/member checks against the live Supabase project, Arabic visual review, accessibility review, and final Vercel preview verification are still pending.
- Production branch and deployment remain untouched; all work is on `development`.


## Progress accounting

- **Overall full-platform implementation:** carry forward the last agreed **93%** baseline; do not reduce it because Launch 1.0 is being tracked as a separate release scope.
- **Launch 1.0 batches added:** PWA foundation, group-creation wizard, Claude Launch 1.0 shell integration, shared language controls, fixed-theme enforcement, communication-first home/search, and server-side admin media bypass are implemented and CI-verified.
- **Automated verification:** passed for the exact commit above.
- **Not yet browser/device tested:** installability/offline behavior, responsive page-by-page visual QA, authenticated member/admin access, real group creation, Arabic route review, accessibility, and Vercel preview.
- **Not yet implemented to launch acceptance:** advanced chat threads/member panels/message actions, room and role management, stage/screen-share UX, advanced polls, admin invite dashboard, full admin content/storage/retention UI, and collaboration modules.

## Batch 4 — 2026-11-26: Platform invite-only admission

- Added `raye2_platform_invites`, storing only SHA-256 token hashes; browser roles have no direct table access.
- Added owner-only create/revoke operations and admin-readable invitation metadata. Creation and revocation are written to the Raye2 audit log.
- Added a Supabase Auth Before User Created hook function that rejects missing, invalid, expired, revoked, exhausted, or email-mismatched invitation codes. It locks the invitation row and increments usage only for an accepted signup.
- Added an owner-facing Platform invitations panel with one-time link display, optional email restriction, expiry, use limits, refresh, and revocation.
- Signup now requires an invitation code and passes it through Auth user metadata. Existing group invitations remain a separate mechanism.
- Added source-contract tests for the migration, hook security boundary, signup metadata, and admin controls.
- **Not yet complete / not claimed as secure in production:** the migration has only been committed to `development`; it has not been applied to the live Supabase database. The Supabase Auth **Before User Created** hook must be configured to call `pg-functions://postgres/public/raye2_before_user_created`. Direct signup rejection, invite acceptance, expiry, revocation, and concurrent-use behavior still require live tests after that configuration.
- **CI correction:** the first migration check failed because its plain-PostgreSQL test instance does not define Supabase's managed `supabase_auth_admin` role. The migration now conditionally grants the Auth hook to that role when present. A second SQL quoting issue was corrected; the final invite-admission migration passed the full CI workflow on commit `a5bd7ac1ffb6efdd1f54470e8570006b1150724d` (static validation, automated tests, TypeScript, lint, Next.js production build, and media-worker image build).
- **Deployment:** Vercel has started a development preview for the correction. The earlier Vercel rate-limit failure was on a prior attempt. A Cloudflare integration also reports a failed check labelled `production`; no manual production deployment was initiated, and the branch-to-environment mapping needs owner review before release. No changes were made to `main` or the live Supabase database.


## Batch 5 — 2026-11-26: Voice safety and invitation admin usability

- Hardened group-room push-to-talk so pressing Space or holding the Talk control cannot reopen a microphone while the participant is muted. Unmuting while push-to-talk is enabled leaves the microphone closed until a deliberate transmit action.
- Added source-contract coverage for the mute / push-to-talk interaction.
- Platform invitation inventory now loads automatically when an owner opens the Invitations tab; manual refresh remains available. Added regression coverage for the initial load.
- **Verification:** the invite-admission migration itself passed the complete CI workflow on commit `a5bd7ac1ffb6efdd1f54470e8570006b1150724d`. The later voice and auto-load changes are committed to `development`; their latest workflow has not yet completed successfully, so they are implemented but not yet CI-verified. Vercel preview builds remain blocked by the account's build-rate limit.
- **Live acceptance still required:** Supabase migration and Auth hook configuration are not applied; invite-only admission must not be advertised as enforced until the hook is configured and tested. Voice behavior still needs two-account browser/device acceptance.

## Batch 6 — 2026-11-26: Private-call screen sharing

- Added a negotiated video transceiver to private WebRTC calls so a participant can begin sharing after the call connects without a second offer/answer renegotiation.
- Added explicit user-initiated display capture with video only; system/display audio is not captured.
- Added a remote screen stage, visible local sharing state, browser/device support feedback, and stop handling when the user ends capture from the browser's native sharing controls.
- Screen tracks are stopped and detached when sharing ends or the call is cleaned up. The screen stream is live-only and is not written to Raye2 storage.
- Group-room screen sharing was already present in the current source; this batch closes the corresponding private-call gap. The 2026-11-26 audit's blanket statement that screen sharing was absent is stale and described its earlier audited snapshot.
- Added source-contract regression coverage for private-call capture, sender lifecycle, cleanup, and the screen-share stage.
- Hardened remote track handling so the initially muted negotiated video transceiver stays hidden until frames arrive, and the stage hides again when the remote track mutes or ends.
- **Verification:** code and regression assertions are committed to development; full CI and browser/device acceptance have not yet passed for this batch. Test two real accounts on desktop browsers, verify remote video/audio together, user-stop behavior, permission denial, reconnect/end cleanup, and mobile fallback. Vercel's build-rate-limit check remains a separate deployment blocker.
- **Safety boundary:** no Supabase schema, Auth configuration, main branch, or production deployment was changed.

## Batch 7 — 2026-11-26: Conversation history pagination and verification repairs

- Added an explicit **Load earlier messages** control to direct and group conversations. It fetches the preceding 100 messages for the selected conversation, so the initial cross-conversation preview query's 600-row cap no longer permanently hides older messages in a busy account.
- Older pages merge without duplicates, preserve chronological order, load sender profiles and reaction state, and preserve the message-list scroll position while older content is prepended.
- Added request sequencing so a delayed history response from a conversation the user has already left cannot update the newly selected conversation's paging state.
- Added English and Arabic labels plus regression coverage for paging, the timestamp cursor, scroll preservation, and conversation-switch reset.
- Corrected the private-call screen-stage background to use the Raye2 theme surface token instead of an off-palette hard-coded hex value.
- Corrected the invitation inventory's automatic loader to use an async error-handled flow; this removed the implicit-`any` TypeScript error found by CI.
- **Verification:** GitHub Actions Free CI passed on code commit `2fee1596dfc91bfd6e551194119a66f1b33295cc` (1,087 automated tests; static repository/migration validation; TypeScript; lint; Next.js production build; media-worker image build). Run: https://github.com/Mody2024/Creator-Fan-Hub/actions/runs/45723448556
- **Still requires live acceptance:** test paging with two accounts and long conversations, confirm older reply roots load, verify the scroll position on desktop and mobile, and check realtime updates while loading history. This is automated CI verification, not a substitute for real-device testing.
- Vercel preview remains blocked by the account's build-rate limit. No live Supabase migration/Auth hook, `main` branch, or production deployment was changed.


## Batch 8 — 2026-11-26: Incremental realtime messaging

- Replaced the raye2_messages realtime handler's full loadData(userId) reload with row-scoped, RLS-respecting fetches and incremental local updates.
- Inserts and edits merge by message ID without discarding previously paginated history; sender profile details are refreshed when needed.
- Deletes remove the message and pinned-message entry, then refresh the affected conversation's latest-message preview.
- Conversation previews and unread counts are updated from incoming message events; older events do not overwrite a newer preview.
- Added dedicated realtime synchronization for message reaction counts / the current user's reactions and for the signed-in user's notification inbox. These changes no longer depend on a full platform reload.
- Added regression tests for incremental message handling, deletion, sender identity, unread state, reactions, and notifications.
- **Verification:** full GitHub Actions CI passed on commit 078a03483d26423b9118d06c46676851ea633285, including the automated repository checks and test suite (1,089 tests), TypeScript, lint, Next.js production build, and media-worker image build. The run also includes the explicit TypeScript annotation fix committed as 9043192e33da54be15812c81a9676edfa54f1cb1. Run: https://github.com/Mody2024/Creator-Fan-Hub/actions/runs/45724801330
- **Live acceptance still required:** use two or more accounts to verify inserts, edits, deletes, reactions, notifications, unread/read behavior, thread replies, pinned messages, and paging while realtime events arrive. Confirm no duplicate notifications or stale previews, and test reconnect/reload behavior.
- No Supabase migration, Auth configuration, main branch, or production deployment was changed.


## Batch 9 — 2026-11-26: Voice-room disconnect recovery

- Unexpected LiveKit room disconnects now clear stale participant, speaker, host, moderation, mute, screen-share, and recording UI state; the disconnected user is informed that they can rejoin.
- The disconnect handler releases the associated server-side voice session through `raye2_leave_voice_session`, guarded so a manual leave does not issue the cleanup RPC twice.
- Manual leave now attempts server-side session cleanup even if the local LiveKit transport disconnect throws.
- Added regression coverage for unexpected disconnect cleanup and manual leave resilience.
- **Verification:** full GitHub Actions CI passed on commit `e6a155d0a59491dc4c09d40c36fbcfbacac724ae`: automated tests, static repository/migration validation, TypeScript, lint, Next.js production build, and media-worker image build. Run: https://github.com/Mody2024/Creator-Fan-Hub/actions/runs/45725122437
- **Live acceptance still required:** disconnect/reconnect real participants, confirm server sessions are released, and verify host handoff, moderation, screen sharing and recording state on desktop/mobile browsers.
- No Supabase migration, Auth configuration, main branch, or production deployment was changed.


## Batch 10 — 2026-11-26: Independent, paginated message threads

- Thread replies are now fetched directly from `raye2_messages` for the selected conversation and parent message instead of being derived only from the main chat's currently loaded message window.
- The thread opens with the latest 100 replies, ordered chronologically in the UI; older replies can be loaded in additional 100-message pages.
- Added loading, empty, and older-replies states in English and Arabic. Sender profiles for fetched replies are loaded through the current user's Supabase session and RLS.
- Added request sequencing and cancellation guards so a late response from a closed/switched thread cannot overwrite the current thread.
- Added source-contract regression tests for independent loading, page size/cursor, locale labels, and thread states.
- **Verification:** full GitHub Actions CI passed on code commit `72f82ffe08299999e3b9d0047cd6198015bebe8e`: 1,093 automated tests passed; static repository/migration validation, TypeScript, lint, Next.js production build, and media-worker image build passed. Run: https://github.com/Mody2024/Creator-Fan-Hub/actions/runs/45726528780
- **Live acceptance still required:** open threads whose replies are older than the main history page, paginate several pages, switch conversations while a request is in flight, and verify new replies appear correctly with two accounts on desktop/mobile.
- No Supabase migration, Auth configuration, main branch, or production deployment was changed.


## Batch 11 — 2026-11-26: Shared group-voice speaker queue

- Added a shared, ordered hand-raise queue backed by the voice participant roster, synchronized on join and participant updates.
- The queue displays participant names and positions in the room UI in English and Arabic.
- Added source-contract regression coverage for queue loading, ordering and display.
- **Verification status:** the two associated GitHub Actions runs were superseded/cancelled by later commits before a completed CI result was available. Treat this batch as implemented but not CI-verified yet.
- No live database, main branch or production changes.

## Batch 12 — 2026-11-26: Private chat attachments

- Added a private raye2-chat-attachments bucket and conversation-scoped Storage RLS: only conversation members can read; uploads are restricted to the authenticated sender's own folder; deletion is restricted to the owner.
- Chat uploads use the existing storage reservation RPC and a 50 MiB file cap. Downloads use short-lived signed URLs, not public links.
- Added composer file selection, attachment removal, message metadata and inline attachment links. Failed message insertion attempts to remove the uploaded object.
- Added regression tests for the private bucket, membership policies, reservation, upload, signed URLs and composer handling.
- **Verification status:** earlier CI attempts were cancelled as newer commits arrived. The latest combined CI run will determine verification.
- Migration is not applied to live Supabase. Two-account access tests remain outstanding.

## Batch 13 — 2026-11-26: Voice-message recording and playback

- Added user-initiated microphone recording through MediaRecorder, with explicit start/stop controls and microphone-track cleanup.
- Voice notes are capped at 10 MiB, saved as private voice_note attachments, and played with an inline audio player from a signed URL.
- Supports browser-reported WebM, OGG and MP4 recording formats. The private bucket MIME allow-list includes MP4 and generic binary fallback for supported browser/file handling.
- Sending is disabled while recording is active; voice notes must be stopped and attached before sending.
- Added regression coverage for recording, size limits, private signed playback and accepted MIME types.
- **Verification status:** awaiting the combined development-branch CI run. Browser microphone permissions, Safari/Chrome playback and two-account delivery still require live acceptance.
- No Supabase migration has been applied, and no main or production changes were made.


## Batch 14 — 2026-11-26: Live conversation poll results

- Poll cards now subscribe to the poll's vote and poll-state rows through Supabase Realtime.
- A member's vote refreshes the live totals for other members; closing a poll refreshes its closed state without requiring a manual reload.
- Realtime subscriptions are removed when the poll card unmounts or the message changes.
- Added source-contract regression coverage for both subscriptions and cleanup.
- **Verification:** full GitHub Actions CI passed on commit 0d47b6a359ebcb93c2f7b245b8d2c5608bb7a9b8 (1,097 automated tests; repository/migration validation; TypeScript; lint; Next.js production build; media-worker image build). Run: https://github.com/Mody2024/Creator-Fan-Hub/actions/runs/45728800465
- Existing poll permissions remain server-enforced: only conversation members may read/vote, and only the poll author or group manager may close.
- Realtime migration is not applied to live Supabase. Two-account acceptance remains outstanding.
- No live migration, main branch or production deployment changed.


## Batch 15 — 2026-11-26: Notification helper search-path hardening

- Added an additive migration that pins the search path to the empty path for the two live notification helper functions flagged by Supabase Security Advisor: raye2_in_quiet_hours and raye2_notification_category.
- Both functions are invoker functions and use built-in operations only; the change removes mutable role search-path resolution without changing their return behavior or access grants.
- Added a migration-contract regression test.
- **Verification status:** pending CI on this development head. The migration has not been applied to live Supabase.
- No production database, main branch or deployment changed.

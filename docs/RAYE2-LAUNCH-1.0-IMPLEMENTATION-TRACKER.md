# Raye2 Launch 1.0 implementation tracker

This tracker is scoped to the communication-first launch. It is separate from the legacy ten-wave full-platform estimate in `RAYE2-IMPLEMENTATION-PROGRESS.md`. A design reference, route, or schema alone does not count as a finished user-facing feature.

## Batch 1 — 2026-11-25: PWA foundation

- Added `public/manifest.webmanifest` with standalone install metadata, Raye2 theme colors, app icons, and Messages/Groups shortcuts.
- Added a bilingual offline fallback page.
- Added a production-only service-worker registration component.
- Added `public/sw.js`: it caches only immutable same-origin public assets. Navigations remain network-only; when offline they receive the generic offline page. API, auth, creator, Raye2, and group paths are excluded from caching to avoid storing private content on a shared device.
- Added automated source-contract coverage for manifest metadata, privacy-safe caching boundaries, and registration wiring.
- **Verification:** code committed to `development`; automated tests, TypeScript, lint, production build, browser install prompt, and offline behavior are **not yet verified** in this environment. Do not count PWA as launch-ready until those checks pass on the exact commit and a real browser test confirms installability.
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
- **Verification:** tests, type-check, lint, build, and browser/device QA are pending the next CI run. This batch is implemented but not yet tested.



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
- The latest completed automated run exposed one remaining legacy light-theme selector; that selector has now been removed.
- A fresh full CI run is required to confirm static validation, automated tests, type-check, lint, and Next.js production build.
- Browser/device QA, authenticated admin/member checks, Arabic visual review, accessibility review, and final Vercel preview verification are still pending.
- Production branch and deployment remain untouched; all work is on `development`.


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


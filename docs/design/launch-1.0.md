# Raye2 design versions

Design only. Nothing in either version changes backend logic, database structure, authentication, APIs or production.

| | Raye2 — Full Platform Design | Raye2 — Launch 1.0 (Communication Edition) |
|---|---|---|
| Git | tag `design/full-platform-v1`, branch `design/full-platform` (never modified again) | branch `design/launch-1.0` (independent duplicate) |
| Scope | Complete long-term vision: communication + the whole media platform | Communication-first first release |
| Navigation | Home, Watch, Mini's, Community, Explore + More (Minis, Moments, Clips, Live, Series, Creators, Spaces) | Home, Messages, Groups, Community, Events; media under a collapsed **Coming soon** group |
| Phone bar | Home, Watch, Create, Community, You | Home, Messages, Create, Groups, You |
| Create menu | Upload, Mini, Moment, Post, Go live | New group, New room, New poll, Schedule event |

Design reference for screens that do not exist in code yet: `public/design/launch-1.0/index.html` (served at `/design/launch-1.0/index.html`).
Feature status table in code: `src/lib/launch-features.ts`.

## What changed in the Launch 1.0 duplicate
- Side menu: five communication places, three personal ones, media tucked under "Coming soon".
- Phone bottom bar and Create sheet re-pointed to communication.
- Member home no longer shows the video grid, the Mini's tab, or the "every format" promo; hero CTA is "Explore groups".
- Media sections (Watch, Mini's, Moments, Clips, Live, Series) show a polished **Coming Soon** screen with a launch roadmap. Their pages are untouched underneath.
- Everything else (chalk typography, transitions, workspace and auth screens, bilingual EN/AR) is identical to the full-platform design.

## Availability
**Exists today (confirm each against the running app):** direct and group chat, replies/reactions/mentions, voice calls and group voice, basic polls, groups browsing, events page, redeeming invitations, notifications, saved, account settings, admin panel.

**New design, needs implementation:** user-created groups; group identity (icon, banner, colors, welcome, onboarding); roles, hierarchy, permissions, ownership transfer; rooms (text, voice, announcement, forum, private, role-restricted, temporary, categories); threads, edit/delete/pin/bookmark, attachments, voice messages, searchable history; stage rooms, hand raising, speaker queue, scheduling; screen sharing; professional polls (image choices, multi-select, deadlines, live results, permission-controlled creation); invitation management dashboard; storage/limits/retention/cleanup admin; calendar and reminders; shared notes/docs/links; task boards; badges and achievements; translation, summaries, optional AI assistance; PWA install.

**Coming Soon (preserved, unavailable to members):** video uploads and playback, Mini's, Moments, Clips, Live streaming, Series and exclusives.

**Administrator-only:** admin panel, invitation management, storage and limits, feature availability switches, and the complete platform including all media features.

## Implementation required
- Admin bypass for the Coming Soon gate: `ComingSoonGate` takes an `adminBypass` prop that must be wired to the existing admin check. Until then the launch preview shows Coming Soon to everyone; administrators use the full-platform build.
- Every item under "New design" above, plus: invite-only sign-up flow, PWA manifest and service worker, consent flow for recording, scheduled cleanup jobs.
- Member-level feature flags so "Media features for members" in the storage screen actually controls the gate.

## Not represented accurately / limitations
- Screen sharing depends on browser support (limited or absent on many phones); design shows desktop behavior and a graceful fallback is needed.
- Multiple simultaneous presenters depend on the chosen real-time provider.
- Voice messages and window-level sharing depend on browser permissions.
- Dashboards use sample numbers; real storage metrics need backend support.
- The design reference is static HTML in the chalk style, not a clickable prototype of the real components.
- Nothing here was checked against your live database or production environment.

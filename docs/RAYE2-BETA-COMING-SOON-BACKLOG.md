# Raye2 — Beta & Coming Soon Backlog

**Purpose:** Keep new product ideas visible without silently expanding the private-beta critical path.
**Status:** Candidate backlog. Items below are proposals unless marked as already specified in the master plan.
**Branch:** `development` only.

## Delivery lanes

- **Private beta blocker:** Required for the one-month friends test. Must be implemented, permission-tested and operationally verified.
- **Beta candidate:** Useful in the private test, but can be feature-flagged or limited to invited testers.
- **Coming soon:** Public-facing roadmap idea only. Do not expose a fake or nonfunctional control.
- **Needs owner decision:** Do not lock product rules, quotas, retention or provider costs until the owner confirms them.

## Beta candidates to evaluate

| Feature | Lane | Notes / acceptance |
|---|---|---|
| Creator drafts and scheduled publishing | Beta candidate | Drafts must remain private; scheduled jobs need retry, audit and timezone-safe scheduling. |
| Creator series and richer playlists | Beta candidate | Reuse canonical video records and enforce private/public visibility. |
| Video chapters, captions and subtitle tracks | Beta candidate | Only show language/quality options when a real track exists. |
| Moments and eligible community clips | Beta candidate | Preserve source attribution, creator opt-out and admin-configurable limits; no default manual pre-review for ordinary member clips. |
| Creator Q&A and audience polls | Beta candidate | Reuse moderation and rate-limit controls. |
| Scheduled community events and live reminders | Beta candidate | Notifications must respect user preferences and quiet hours. |
| Watch Together room reactions and polls | Beta candidate | Must not weaken host controls, privacy or external-player restrictions. |
| Voice-room stage, hand-raise and co-host tools | Beta candidate | Keep recording off by default and require unanimous active consent if recording is ever enabled. |
| Creator collaboration and shared drafts | Coming soon | Requires explicit ownership, contributor permissions and audit history. |
| Creator memberships, tips and paid exclusives | Coming soon | Requires legal/provider review, transparent fees and age-appropriate eligibility. |
| Advanced recommendations and topic personalization | Coming soon | Explain controls and respect blocks, private activity and opt-outs. |
| AI-assisted captions, clip suggestions and editing | Coming soon | Optional assistance only; creator approves all generated changes before publishing. |
| Multi-camera live production and advanced replay tools | Coming soon | Dependent on a real provider pipeline and measured capacity. |
| Installable PWA and offline saved metadata | Coming soon | Must not imply offline video playback unless the rights and storage flow support it. |

## New idea intake

For each new idea, record:
1. User problem and target role.
2. Whether it is a private-beta blocker, beta candidate or coming soon.
3. Required database, storage, realtime and provider changes.
4. Privacy, moderation, abuse and cost implications.
5. Acceptance criteria and a reversible feature flag.
6. Whether the owner explicitly approved the product decision.

## Release rule

A roadmap card is not an implemented feature. Hide disabled features or label them clearly as **Coming soon**; never present placeholders as working controls. Keep the private beta focused on stable core journeys and test one experimental lane at a time.

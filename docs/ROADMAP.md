# Delivery plan

## Current branch
- `main`: repository starter README only; keep stable.
- `development`: current responsive visual prototype and ongoing work.

## Milestones
1. **Foundation and UI prototype** — responsive public layout, theme switcher, accessible interactions, tour, demo poll/form. Current starter milestone.
2. **App structure and design system** — move inline styles/scripts into maintainable components, add tests, mobile/keyboard/reduced-motion QA.
3. **Backend and data model** — connect a database only after the project environment is configured. Store published site configuration, drafts, polls, votes, ideas, media metadata, events, social links, and audit history.
4. **Secure Creator Panel** — authenticated admin routes, server-side authorization, secure session lifecycle, recovery and optional MFA; never rely on a hidden admin URL.
5. **Draft/preview/publish** — public pages read only published configuration; creator edits drafts, previews, then publishes a versioned configuration for every visitor.
6. **Real community features** — server-validated poll votes, idea submissions, moderation, rate limits, spam/duplicate detection and transparent voting rules.
7. **Media and experiences** — creator-managed video embeds/uploads, socials, events, countdowns, guided tour, mascot and narration controls.
8. **Hardening and launch** — automated tests, accessibility/performance review, backups/recovery, security review, preview acceptance, then explicit production release.

## Non-negotiable principles
- Do not claim a vote or submission was stored until the backend confirms it.
- Anonymous display names are not verified identities; no system can guarantee one vote per real human without stronger verification.
- Uploaded files are data, never executable code. Validate type, size, ownership and access.
- Keep secrets out of Git and browser bundles; configure them only in protected environment settings.
- Keep the permanent “Made by Almuddaththir” signature in the shared public layout, with no ordinary Creator Panel removal toggle.
- Disabled modules retain their configuration. Explain dependencies instead of silently deleting settings.
- Respect keyboard use, screen readers, mobile/touch, and reduced-motion preferences.
- Do not promote to production before the preview is reviewed.

## Current limitations
This prototype is static. Theme choice and interactions run in the browser only. Polls and forms are demonstrations and do not persist or transmit data. The sample title, copy, cards, and mascot drawing are placeholders, not final branding. No secure Creator Panel or database exists yet.

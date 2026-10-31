# NHEN — Product implementation plan

## Product structure
- **NHEN** — public creator platform and brand.
- **NHEN Studio** — private creator and staff workspace.
- **NHEN Community** — public community feed and discussions.
- **NHEN Identity** — member profiles, privacy and achievements.
- **NHEN Experience** — themes, languages, accessibility and responsive behavior.

## Delivery gates

### Gate 0 — Foundation and rebrand
- Rebrand product-facing copy and metadata to NHEN while preserving repository history.
- Keep the current preview branch isolated from production.
- Establish shared navigation, design tokens, empty/loading/error states and feature flags.
- Verify the free Vercel project subdomain before advertising it.

### Gate 1 — Creator publishing
- Admin-only upload and management of official videos and shorts.
- Metadata, thumbnails, visibility, tags, playlists/series, scheduling and public video pages.
- Separate official creator media from member-generated posts.
- Storage quotas, upload validation, deletion and retention behavior.

### Gate 2 — Community identity
- Supabase Auth member registration and login.
- Public profiles with handles, avatars, bios, links and privacy controls.
- Community feed with text posts, creator announcements, polls and video-linked moments.
- Comments, replies, reactions, bookmarks, follows and notifications.

### Gate 3 — Trust and moderation
- Pending review, reports, block/mute, moderation queue and appeals.
- Rate limits and spam controls on all public write paths.
- Staff roles: owner, administrator, editor, moderator and analyst.
- Server-side permission checks, least-privilege RLS, one-use invitations and immutable audit records.

### Gate 4 — Discovery and experience
- Search across videos, posts and profiles.
- Categories, featured content and chronological/trending discovery.
- Arabic and English with proper RTL, theme choices, keyboard access, captions and reduced motion.
- Transparent achievements with no pay-to-win or manipulative streak mechanics.

### Gate 5 — Release readiness
- Automated unit, integration, authorization and RLS tests.
- Mobile and desktop browser acceptance, accessibility, performance and security review.
- Backups and recovery runbook.
- Preview acceptance by the owner, then a separately approved production release.

## Free-tier constraints
- Use free GitHub, Vercel and Supabase tiers where possible.
- Never promise unlimited uploads, bandwidth, transcoding or notifications on free plans.
- Begin with bounded MP4/WebM uploads and clear per-file/storage limits; evaluate external video hosting only after reviewing cost, privacy and terms.
- No paid domain purchase is required for development. The desired `nhen.vercel.app` address must be verified and attached before it is considered live.

## Current verified baseline
- Existing public site supports configurable identity, hero, themes, section ordering, videos, social links, events, mascot and narration.
- Existing Creator Panel supports authenticated allowlist access, drafts, publishing history, polls, idea moderation, events/social links and a private media library.
- Existing anonymous voting and idea submissions are rate-limited and use server/database-backed operations.
- The current media library is an asset manager, not yet a full channel/playlist publishing system.
- The current allowlist has one active creator account; multi-role staff management is not yet implemented.
- The latest verified Vercel preview is linked to the `development` branch. Production remains untouched.

## Completion definition
A gate is complete only after its schema, UI, server authorization, regression tests, successful CI, READY preview and relevant manual acceptance checks are verified. Documentation or a successful deployment alone does not count as feature completion.

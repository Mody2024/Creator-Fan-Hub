# Raye2 — Full Platform Product & Implementation Master Plan

**Document type:** Master product specification and phased implementation roadmap  
**Status:** Planning baseline — requirements and implementation tasks, not a claim that features are already built  
**Active branch:** `development` only  
**Production:** `main` and production deployment remain untouched unless the owner explicitly approves  
**Related specification:** `docs/RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md` contains the deeper chat, voice, Watch Together, memories, retention and realtime requirements. This master plan governs the whole product; the related document supplements it and must not be treated as the entire Raye2 scope.

---

## 0. Product vision and non-negotiable principles

Raye2 is a connected creator-led media and community platform: a unified place to discover and watch videos, follow creators, publish permitted content, participate in communities, communicate, join live experiences and manage a personal social identity.

The experience should feel like a mature product from a major media/social company, not a collection of disconnected demos or generic AI-generated pages. The home/feed, media player, creator surfaces, profiles, communities, chat, voice, events and administration must share one coherent design system and data model.

### Non-negotiable delivery rules

- Work on `development` only. Do not merge to `main`, deploy production, change production data or rotate production credentials without explicit owner approval.
- Before implementation, inspect the complete repository, current branch, existing routes/components, database schema, migrations, storage buckets, policies, tests and deployment configuration. Map existing functionality before replacing anything.
- Preserve working functionality and data. Prefer incremental migrations and compatibility layers over destructive rewrites.
- Implement in large, logically complete batches, but keep each batch reviewable and testable. Do not report a feature as complete merely because a page or placeholder exists.
- Report honest progress by wave and by verified acceptance criteria. Distinguish planned, implemented, tested, preview-verified and owner-accepted work.
- Finish the planned implementation and automated verification before asking the owner to perform broad manual testing. Use preview deployments for owner review; production remains gated.
- No fake buttons, mock backends presented as real, nonfunctional controls, placeholder media pipelines or invented integrations.
- Do not promise unlimited free storage, unlimited streaming, zero latency or capacity beyond provider limits. Measure usage and explain actual ceilings.
- Keep provider-required branding and controls intact for third-party embeds. Remove obsolete Raye2 predecessor branding and unapproved legacy watermarks from the product UI.

## 1. Brand identity and complete visual redesign

This is a major product-wide redesign, not a small styling pass.

### 1.1 Brand direction

- Core palette: **black, white, grey and blue**.
- Establish semantic tokens for backgrounds, surfaces, borders, text, muted text, primary blue, hover/focus, selected, success, warning and error states.
- Use restrained, consistent contrast and blue accents. Avoid random gradients, excessive glow, neon overload, generic AI visual motifs and inconsistent one-off colors.
- Support light and dark themes. Theme variants and allowed accent/surface choices should be configurable centrally by authorized Admins without breaking contrast or component consistency.
- Raye2's site identity is the **logo**, not a written “Raye2” wordmark repeated through the interface. Do not add the product name as visible header text where the logo is intended to represent the brand.
- Preserve the supplied logo's recognizable hand-drawn style. Correct the Arabic typo in the artwork/asset where applicable; improve alignment, spacing, scaling, contrast and integration without turning it into an unrelated generic icon.
- Logo assets are managed through the authorized branding controls in the Admin/Creator Panel. Provide preview, crop/fit, transparent-background handling where technically reliable, fallback assets and theme-aware variants. Never silently destroy the uploaded original.
- Remove legacy NHEN/Nhen?/Creator Fan Hub labels, old watermarks and obsolete visual remnants from Raye2 product surfaces. Preserve required third-party marks, such as the YouTube player branding.

### 1.2 Design-system rebuild

Create a reusable design system rather than styling pages independently:
- Typography system with distinctive, readable fonts and correct Arabic/English rendering, including RTL/LTR behavior.
- Spacing, sizing, radii, shadows, borders, elevation and responsive breakpoints.
- Buttons, icon buttons, inputs, menus, dialogs, popovers, tabs, tooltips, cards, skeletons, empty states, alerts, toasts, dropdowns and confirmation flows.
- Shared media cards, creator cards, profile headers, feed items, video player shell, Mini/Moment cards, group cards and event cards.
- Consistent loading, error, retry, offline, permission-denied and no-content states.
- Keyboard focus, hover, pressed, selected, disabled and loading states.
- Motion should be purposeful, subtle and reduced-motion aware.
- Avoid arbitrary emoji as substitutes for a coherent icon set. Custom reaction artwork is a separate feature.

### 1.3 Platform layout and navigation

- Rebuild the global shell and information architecture so all major areas feel connected.
- Desktop-first layout with a complete responsive adaptation for tablets and phones.
- Navigation should make Home/Feed, Explore/Search, Videos, Mini's, Moments, Live, Communities, Messages and the user's profile discoverable without fragmenting the product into unrelated microsites.
- Use context-aware side navigation, compact mobile navigation, menus and command/search entry points where appropriate.
- Maintain consistent header, navigation, content width, player behavior, overlays and page transitions.
- The home page should behave as a media discovery feed inspired by the usability of major video platforms, while retaining Raye2's own visual identity and interaction patterns.
- Build a real responsive layout; do not merely shrink desktop components onto mobile.

### 1.4 Design acceptance

- Every primary route uses the same tokens and shared components.
- No old brand text, obsolete labels, mismatched colors or unrelated design fragments remain.
- Arabic and English layouts are both checked, including mixed-direction titles and metadata.
- All interactive controls have visible keyboard focus and accessible names.
- Theme switching does not break media controls, overlays, menus or contrast.
- Screens are reviewed at mobile, tablet and desktop widths.

## 2. Core platform structure and account system

### 2.1 Accounts and identity

- Secure sign-in, sign-out, session handling, password recovery and account lifecycle.
- Profile identity: avatar, cover, display name, handle, bio, links, interests and privacy settings.
- Follow/unfollow creators and users; follower/following lists with privacy controls.
- Profile tabs/surfaces for videos, Mini's, Moments, community activity, playlists/collections and achievements where enabled.
- User settings for privacy, notifications, accessibility, language, theme, sessions/devices and data export/deletion.
- Clear account states: normal, verified/trusted if implemented, restricted, suspended and banned.
- Do not expose private account details or private activity through public search, feeds or APIs.

### 2.2 Roles and authorization

- Normal user, Creator, Streamer, Creator + Streamer, Moderator, Admin, Owner/Super Admin and configurable trusted/restricted variants.
- Role assignment is controlled by authorized administration; users cannot grant themselves elevated privileges.
- Both-role accounts use the explicitly defined combined quotas, not the sum of Creator and Streamer quotas.
- Permissions must be checked server-side for every protected action. Hiding a button is not authorization.
- Support temporary role grants, expiry dates, account-specific overrides and a complete audit trail.
- Use least privilege and separate Owner/Super Admin powers from ordinary Admin capabilities.

### 2.3 Language and accessibility

- Full English and Arabic support, including RTL layouts and mirrored navigation where appropriate.
- Translation keys rather than hard-coded strings in components.
- Language preference saved per account and sensible first-visit selection.
- Captions/subtitles support, readable contrast, keyboard navigation, screen-reader labels, reduced motion and accessible media controls.

## 3. Home, feed and discovery ecosystem

### 3.1 Home experience

- One connected home experience with feed/discovery sections, not a set of empty disconnected pages.
- Mix eligible long videos, creator posts, Mini's, Moments, live events, community updates and recommendations with clear content-type distinction.
- Support sections such as recommended, following, latest, live now and topic/category collections where useful.
- Feed cards link to canonical content and creator profiles; reactions, comments, saves and sharing operate on Raye2's own data model.
- Preserve feed position and support pagination/infinite loading without duplicate or missing items.
- Provide meaningful loading, empty, error and retry states.

### 3.2 Explore and search

- Search public creators, users, videos, Mini's, public Moments while active, public communities and events.
- Filters for content type, creator, category, recency and other useful metadata.
- Search respects privacy, blocks, moderation state, visibility and expiry.
- Discovery recommendations should be explainable enough to tune and should not reveal private interests or private memberships.
- Include trending/popular surfaces only when backed by real data and abuse-resistant ranking.

### 3.3 Social interactions

- Likes and a richer reaction picker inspired by familiar social platforms.
- Raye2-specific custom reaction artwork, names and accessible labels; reactions are not generic emoji-only placeholders.
- Comments and replies, configurable creator controls, moderation, pinning and reporting.
- Follow/subscribe relationships and notification preferences.
- Share links and in-platform sharing for permitted users/content.
- Save/bookmark and collections/playlists.
- Polls in appropriate feed/community surfaces.
- Repost/quote with commentary if enabled by Admin.
- Report/block/mute and privacy boundaries across every surface.

## 4. Media platform: videos, Mini's, Moments and player

### 4.1 Native video platform

- Native Raye2 video upload, storage, processing, playback, thumbnails, metadata and delivery.
- The media player is a first-class Raye2 component with playback controls, quality selection when renditions exist, captions, seek, volume, fullscreen, playback speed where supported, progress and error recovery.
- Raye2-native videos use Raye2 comments, reactions, sharing, saves and creator links.
- Upload flow includes validation, progress, retry/resume where supported, thumbnail selection, title, description, visibility, category and expiry.
- Support direct uploads using secure signed upload flows; do not route large media through small serverless request bodies.
- Encoding/transcoding and adaptive renditions must be handled by an actual media pipeline/provider, not assumed to be supplied by object storage.
- Media metadata and file storage have separate lifecycle and access policies.

### 4.2 External YouTube content

- Creators may add a supported YouTube video through an official embed/link flow where permitted.
- Preserve the official player, branding, controls, restrictions and required ads.
- Raye2 can wrap the player with its own surrounding title, creator identity, comments, reactions, community discussion and sharing metadata.
- Do not download, cache, proxy, alter or extract audiovisual streams from YouTube without permission.
- Do not claim that an external YouTube video is a Raye2-native exclusive or that Raye2 controls its availability.
- If an external source is unavailable or blocks embedding, show a clear fallback.

### 4.3 Long videos and exclusives

- Long-video maximum duration: **10 minutes** under the current planned policy.
- Only Creator and Creator + Streamer roles may publish long videos and exclusives.
- Creator-only quota: **5 long videos/month**, with a **4-day cooldown**.
- Creator + Streamer quota: **3 long videos/month**, with **one per week** cooldown.
- Streamer-only cannot upload long videos unless separately granted permission.
- User-selected long-video expiry may be up to **14 days**, subject to Admin policy.
- Exclusivity window: maximum **7 days** under the current plan.
- Support native uploads and supported official external YouTube embeds, with clear capability differences.
- True Raye2 exclusives must be hosted/controlled by Raye2. YouTube embeds cannot be access-gated by Raye2.
- Define publication state, scheduled release if enabled, moderation, takedown, expiration and deletion workflows.

### 4.4 Mini's

- Mini's are short-form clips with a maximum planned duration of **15 seconds**.
- Available to ordinary users as well as creator roles, subject to quotas and anti-abuse controls.
- Ordinary-user planned cap: **3 per day**.
- Role monthly quotas: Creator **30/month**, Streamer **30/month**, Both **20/month**.
- Mini's can be uploaded directly from a phone or created from eligible Raye2 long videos/streams.
- An extracted Mini must remain available for its own permitted lifetime even if the source expires. Use independent storage/materialization only when necessary; avoid needless duplicate files.
- Planned maximum lifetime: **30 days**, after which access expires and cleanup is queued.
- Provide clip selection, preview, caption, creator attribution, source attribution, visibility and reporting.
- Admin can configure daily/monthly limits, maximum duration, file size, allowed sources and retention within technical limits.

### 4.5 Moments

- Temporary story-like media surfaces available to all users, subject to configured limits.
- Current planned role quota: Creator **30/month**, Streamer **30/month**, Both **30/month**. Ordinary-user limits remain configurable and must be anti-abuse protected.
- Planned default lifetime: **6 hours**, configurable by Admin.
- Support eligible photos/videos, creator/user attribution, view controls and reporting.
- Expired Moments disappear from user-facing surfaces immediately; physical deletion follows the cleanup queue.
- Avoid making Moments a permanent duplicate of source media.

### 4.6 Comments, reactions and media sharing

- Raye2-native reactions and comment threads for native media.
- Comments and reactions around external embeds must remain in Raye2's own interface without altering the external player.
- Share a video, timestamp/moment or permitted clip link.
- Support sharing content into DMs, groups, communities and Watch Together invitations.
- Respect privacy, blocks, moderation, age-appropriate safety and expiry when rendering shared links.

## 5. Live streaming ecosystem

- Only Streamer and Creator + Streamer roles can start live streams unless Admin grants a specific exception.
- Streamer quota: **5 streams/month**, maximum **2 per week**.
- Creator + Streamer quota: **3 streams/month**, maximum **1 per week**.
- Stream replay retention: **24 hours after the stream ends**. This is the replay deletion window, not the live duration.
- Proposed initial maximum live duration: **3 hours**, configurable by Admin after provider/capacity validation; this duration is not a confirmed user requirement.
- Live experience needs stream setup, title, thumbnail, audience/visibility, scheduled start if supported, stream health, viewer count, chat/reactions, moderation and end-stream handling.
- Creator/streamer must see clear connection/health state and recovery guidance.
- Provide actual ingest, transcoding/packaging and distribution infrastructure. OBS is a possible broadcaster client, not the live backend.
- Support stream recording/replay only if the selected provider and storage pipeline can reliably handle it.
- Replay expiration is enforced logically at the application layer, with physical deletion queued separately.
- Concurrent live streams, bitrate, resolution, viewer delivery and recording limits must be based on real provider capacity and cost.

## 6. Creator Studio and publishing controls

- A dedicated Creator/Streamer workspace for eligible users.
- Upload and manage long videos, exclusives, Mini's and live streams according to role.
- Manage title, description, thumbnail, visibility, category, scheduled publication where supported, expiration and comments/reactions controls.
- Show quota and cooldown status before an upload or stream starts.
- Show upload/processing/publication states, retryable failures and clear error reasons.
- Content library with filters, drafts, scheduled items, published items, expired items and moderation/takedown state.
- Basic analytics: views, watch time, completion/retention where measurable, engagement, followers and content performance.
- No fabricated analytics. Label estimates and delayed metrics.
- Branding controls for authorized users/Admin: logo upload, crop/fit, transparent background processing with preview, and theme-aware placement. Protect the original upload.
- Role restrictions and quotas must be validated server-side.

## 7. Communities, groups and events

- Public discoverable and private invite-only communities/groups.
- Group profiles with description, rules, image, topics, member list visibility and ownership/moderator roles.
- Group posts, announcements, polls, pinned content, topic channels and shared collections.
- Join requests, invite links with expiry/use limits, member approvals, bans, removals and moderation logs.
- Community discovery and search respect privacy and moderation.
- Scheduled events with RSVP, reminders, event details, host/co-host roles and optional attached chat/voice/Watch Together rooms.
- Creator office hours, Q&A sessions, co-hosted events and collaborations as supported event types.
- Community notification controls, quiet hours, digest/bundle preferences and per-group mute.
- Detailed chat/group/voice requirements are in the companion chat/voice plan.

## 8. Messaging, voice, Watch Together and shared memories

The companion document `docs/RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md` is the detailed specification for this wave and remains part of the master scope. It must be read alongside this file, not instead of it.

The following confirmed requirements must be preserved:
- Direct one-to-one chat and group chat.
- Both public and private groups.
- Both private one-to-one voice calls and group voice rooms.
- Optional voice-session recordings only after explicit consent from every participant; recording is off by default, visibly indicated, and stops if consent is declined/withdrawn or a new participant has not consented.
- Watch Together as a first-class synchronized shared viewing feature.
- Automatic expiry/cleanup for chats, groups and rooms using Admin-configurable retention.
- Admin selective cleanup, including the ability to preserve chat history and Shared Memories while clearing selected other categories.
- Shared Memories are separate from normal chat retention and protected from ordinary cleanup unless their own policy explicitly says otherwise.
- Add message reactions, replies, edits/deletes, pins, bookmarks, search, message requests, block/report, group roles, invites, polls, scheduled events, shared collections, room moderation, recording permissions and retention.
- Implement realtime presence, typing, reactions and messages with honest connection/reconnect state.
- Group voice requires an appropriate WebRTC/SFU/TURN architecture; a simple WebSocket is not a substitute for media transport.
- Watch Together supports synchronized playback only for eligible sources and must communicate external-player limitations.

Do not weaken or remove the companion plan's privacy, consent, retention, audit and cleanup safeguards.

## 9. Notifications and user engagement

- In-app notifications for follows, replies, reactions, mentions, group invitations, event reminders, live starts and relevant creator activity.
- User preferences by notification type, creator, group and channel.
- Quiet hours, mute, digest and frequency controls.
- Avoid duplicate notifications and notification spam.
- Push/email notifications only after a suitable consent and delivery design is established; do not assume a provider is configured.
- Deep links open the correct content and respect authentication, visibility and expiry.

## 10. Admin Panel and platform operations

Build a real central Admin Panel with role-based access, audit logs and a unified Rules Engine.

### 10.1 Platform Rules Engine

Admin should be able to configure without code, within provider/system ceilings:
- Role assignment, permissions, role expiry and account overrides.
- Long-video, exclusive, Mini, Moment and live quotas, cooldowns and duration limits.
- Upload sizes, accepted media types, storage quotas and per-user/per-role/platform caps.
- Group creation, member limits, invite rules, message rate limits, voice room capacity and concurrent sessions.
- Recording availability, consent (mandatory), recording duration/size and retention.
- Watch Together availability, sources, queue limits and participant caps.
- Theme presets, logo/branding assets, language availability and feature flags.
- Retention clocks, warning windows, archive/delete behavior and cleanup schedules.
- Moderation thresholds, rate limits, restricted features and abuse controls.
- Storage pressure thresholds, upload backpressure and operational alerts.

Application-configured values cannot exceed actual infrastructure/provider ceilings. The Admin UI must display when a requested setting is limited by the current plan or architecture.

### 10.2 Admin dashboards

- Platform health: request errors, latency, job failures, realtime connections and provider status.
- Media operations: storage by bucket/type/user, upload bytes, delivery usage, encoding queue, failed processing and expiring content.
- Live/voice operations: active streams, rooms, concurrent participants, voice minutes and TURN relay usage where measurable.
- Cleanup operations: expiring items, deletion backlog, orphaned files, retries and estimated space recovery.
- Quotas: usage by role/account and rejected attempts.
- Moderation: reports, queues, actions, appeals and repeat abuse.
- Cost/capacity: free-tier/provider usage, thresholds, forecasts where supportable and capacity warnings.
- Avoid displaying metrics that are not actually collected.

### 10.3 Moderation and safety

- Report/block/mute users, messages, groups, comments, videos, Mini's, Moments, streams and events.
- Moderation queue with evidence access controlled by permission.
- Warning, timeout, rate reduction, feature restriction, suspension, ban and appeal/review.
- Creator controls for comment permissions and moderation.
- Spam prevention, abuse throttles, upload limits and suspicious activity alerts.
- Copyright/ownership/consent reporting and takedown workflow.
- Admin actions must be auditable and appropriately permissioned.

### 10.4 Destructive actions and preservation

- Every bulk-clear operation previews exact categories, scope, record counts and estimated storage recovery.
- Require elevated permission, explicit confirmation and a reason.
- Support exclusion of chats, Shared Memories, pinned preservation items or selected categories.
- Keep an audit record without retaining deleted private content.
- Provide a recovery/quarantine window where technically and legally appropriate.
- Separate logical expiry from physical file deletion.
- Never let a generic “clear everything” action silently destroy protected memories.

## 11. Storage, media processing, realtime and architecture

### 11.1 Separate infrastructure responsibilities

Plan and validate each responsibility independently:
1. Database and authorization for accounts, content metadata, memberships, permissions, quotas and audit records.
2. Object storage for native media and attachments.
3. Upload pipeline with signed uploads, validation, quota reservations and cleanup of abandoned uploads.
4. Transcoding/encoding for playable renditions, thumbnails and adaptive quality.
5. CDN/media delivery for playback and bandwidth.
6. Live ingest, stream processing and distribution.
7. Realtime messaging and presence.
8. WebRTC media transport, SFU and TURN for voice rooms.
9. Durable background jobs for cleanup, notifications and media processing.
10. Observability and cost/capacity measurement.

Object storage alone is not a video platform and does not provide live ingest or transcoding. OBS is a client, not a server. Do not introduce a paid provider or a mock integration without first documenting the need, free-tier limits, pricing and user approval where required.

### 11.2 Security and data model

- Enforce Row Level Security and server-side authorization for every private object and mutation.
- Use least-privilege service credentials; never expose service-role secrets to browser code or commit credentials.
- Use signed upload/download access with expiry and ownership checks.
- Validate file type, size, duration and metadata server-side; do not trust client-supplied MIME type or quota claims.
- Protect against IDOR, unauthorized role escalation, replayed requests, spam and upload abuse.
- Use idempotent operations for upload completion, processing, expiry and deletion.
- Keep audit records for privileged actions.
- Add migrations with rollback/compatibility considerations and migration-history reconciliation.
- Preserve user privacy in search, analytics, moderation and admin surfaces.

### 11.3 Retention and cleanup

- Every temporary content type has a configurable expiry.
- Expired items become inaccessible immediately, regardless of when physical storage deletion completes.
- Physical deletion is queued, retried and observable.
- Track orphan files and metadata.
- Separate metadata retention from binary asset retention.
- Preserve independent Mini assets only when they must outlive an expiring source.
- Shared Memories use their own explicit retention policy and are excluded from generic cleanup by default.
- Do not promise instant provider-side physical deletion where lifecycle jobs are asynchronous.

### 11.4 Cost and capacity

- Free tiers are useful for prototypes and constrained launches, not unlimited media platforms.
- Track storage, delivery, requests, encoding, live minutes, realtime connections and TURN relay usage.
- Apply quotas and backpressure before capacity exhaustion.
- Reserve capacity for temporary uploads, processing and non-media assets.
- Show Admin actual provider limits and current usage.
- Do not make “unlimited users/videos/streams” promises unless the architecture and funded capacity genuinely support them.

## 12. Privacy, trust, safety and user data

- Private profiles and content visibility settings.
- Message requests and who-can-contact controls.
- Blocking and reporting that work consistently across the product.
- Session/device management and suspicious-login alerts.
- Account export and deletion workflows.
- Consent-aware voice recording; no secret recording.
- Clear content ownership, rights and takedown procedures.
- Privacy boundaries for group membership, private messages, recordings, bookmarks and Shared Memories.
- Admin access to private user content must be narrowly scoped, justified and audited.
- Safe defaults for public discovery, comments, invitations and notifications.

## 13. Performance, reliability and quality

- Optimize perceived performance with skeletons, progressive loading, image sizing, lazy loading and pagination.
- Avoid blocking the entire app on noncritical widgets.
- Use caching only where it does not leak private or expired content.
- Realtime features must handle reconnects, duplicate delivery, ordering and offline/degraded states.
- Media playback must handle slow networks, missing renditions, expired content and provider errors.
- Add telemetry for client errors, API latency, background jobs, media processing and realtime quality.
- Test on supported browsers and representative low/mid-range mobile devices.
- Performance goals are measured targets, not guarantees. Report percentiles and real test conditions.

## 14. Full implementation roadmap — waves

Waves are dependency-aware work packages. They may be split into several large commits/batches, but their acceptance criteria must remain visible. Do not mark a wave complete until its criteria are implemented and verified.

### Wave 0 — Repository audit and implementation map
- Inspect the full development branch, routes, components, current product behavior, database, migrations, RLS, storage, integrations, tests and Vercel configuration.
- Inventory existing features as working, partial, broken, absent or obsolete.
- Map every requirement in this master plan and the companion chat/voice plan to existing code or a concrete task.
- Identify schema conflicts, duplicate components, legacy branding and risky migrations.
- Produce a gap matrix and dependency order before broad refactoring.
**Exit gate:** a verified implementation map exists; no feature is assumed complete from appearance alone.

### Wave 1 — Brand system and full product redesign
- Implement the black/white/grey/blue token system and light/dark themes.
- Rebuild typography, spacing, components, navigation, responsive shell and page templates.
- Integrate the hand-drawn logo correctly; remove obsolete branding and unapproved legacy watermarks.
- Redesign Home, Explore, profiles, video surfaces, Creator Studio, communities, chat and Admin to one consistent standard.
- Validate Arabic/English, RTL/LTR, accessibility and responsive breakpoints.
**Exit gate:** all primary surfaces use the new design system; no major old-layout islands remain.

### Wave 2 — Core platform architecture, accounts and permissions
- Stabilize account/profile model, roles, permissions, privacy settings and session handling.
- Build shared navigation, route guards, server-side permission checks and reusable content identity.
- Establish consistent data models and APIs for creators, media, communities, interactions and notifications.
- Add RLS/policy tests and migration safety.
**Exit gate:** protected actions are enforced server-side and cross-platform identity/permissions are consistent.

### Wave 3 — Video, feed and discovery ecosystem
- Complete native media metadata, upload, processing, player and playback lifecycle.
- Build Home/feed, Explore/search, creator discovery and content cards.
- Implement comments, reactions, saves, sharing, follows and feed interactions.
- Integrate official external YouTube embeds within provider restrictions.
- Add Mini's and Moments creation, rendering, quotas and expiry rules.
**Exit gate:** users can discover and interact with real persisted content end-to-end; no mock player or fake engagement.

### Wave 4 — Creator Studio, exclusives and live streaming
- Complete Creator/Streamer role workflows and quotas.
- Build upload library, thumbnails, drafts, publishing states, expiry and basic analytics.
- Implement exclusivity rules and clearly separate native content from external embeds.
- Integrate a real live ingest/processing/delivery architecture after capacity/provider validation.
- Implement stream moderation, replay retention and operational visibility.
**Exit gate:** creator workflows and live features function end-to-end within verified technical limits.

### Wave 5 — Social graph, communities and engagement
- Complete profiles, follows, communities, public/private groups, member roles and invitations.
- Add posts, announcements, polls, events, RSVP, collections and community discovery.
- Implement notification preferences, quiet hours, moderation and safety controls.
**Exit gate:** social relationships and community features are connected to profiles, feed, media and notifications.

### Wave 6 — Messaging and chat
- Implement DMs, group messaging, replies, reactions, edits/deletes, pins, bookmarks and search.
- Add message requests, delivery/read/presence states and moderation.
- Implement public/private groups, permissions, invites and group lifecycle.
- Add retention policies and Shared Memories preservation.
**Exit gate:** messaging works with correct privacy, server-side authorization, cleanup and recovery behavior.

### Wave 7 — Voice, Watch Together and shared experiences
- Implement private voice calls and group voice rooms with WebRTC/SFU/TURN.
- Add room moderation, reconnect handling and quality indicators.
- Implement optional recording with unanimous, active consent and visible recording state.
- Build Watch Together synchronization, queues, host controls, chat/reactions and supported-source fallbacks.
- Add scheduled rooms/events and Shared Memories experiences.
**Exit gate:** supported voice/watch flows work on tested devices; consent and privacy tests pass.

### Wave 8 — Admin Rules Engine, operations and platform governance
- Consolidate roles, quotas, cooldowns, feature flags, themes, retention and per-account overrides.
- Build moderation queues, audit logs, bulk cleanup previews and storage recovery tools.
- Add health, media, realtime, cost and capacity dashboards with real metrics.
- Add alerts, safe defaults and infrastructure ceiling warnings.
**Exit gate:** authorized Admins can operate platform rules safely without code changes; every privileged action is auditable.

### Wave 9 — Security, reliability, optimization and release readiness
- Full security review: RLS, API authorization, role escalation, IDOR, upload validation, rate limits, secrets and privacy.
- Automated tests for expiry, cleanup, consent, quotas, role combinations, media visibility and destructive actions.
- Integration/E2E tests for major journeys.
- Load and resilience tests for feed, chat, voice, live and media delivery where infrastructure permits.
- Accessibility, browser, device, localization and responsive regression testing.
- Fix all critical/high-severity defects; verify migrations and backup/restore procedures.
- Produce a preview acceptance report and remaining-known-issues list.
**Exit gate:** all launch gates pass on the exact preview commit; owner reviews and explicitly approves any production release separately.

---

## 15. Acceptance matrix

The project is not “finished” merely because it builds. Track each area separately:

| Area | Required evidence |
|---|---|
| Brand redesign | Screenshots/review of all primary routes in light/dark and desktop/mobile |
| Navigation | Every primary route reachable; no dead links or disconnected shells |
| Accounts and roles | Automated permission/RLS tests, including negative unauthorized cases |
| Feed and discovery | Persisted content, pagination, search filters and privacy-aware results |
| Native video | Upload → processing → playback → comments/reactions → expiry |
| YouTube embeds | Official player retained; no unauthorized stream extraction or overlay |
| Mini's/Moments | Creation, quota enforcement, source attribution, expiry and cleanup |
| Creator Studio | Role-gated upload, publishing, quota/cooldown and analytics correctness |
| Live streaming | Real ingest and delivery, measured capacity, moderation and replay expiry |
| Communities | Public/private visibility, invites, roles, events and moderation |
| Chat | DMs/groups, realtime states, permissions, retention and cleanup |
| Voice | Private/group sessions, reconnect, capacity and privacy tests |
| Recording | Cannot start without unanimous consent; late joiners must consent; withdrawal stops recording |
| Watch Together | Supported-source synchronization, queue, host controls and fallback states |
| Shared Memories | Explicit preservation, access controls and cleanup exclusion |
| Admin | Rules Engine, audit logs, preview-before-delete, storage/capacity metrics |
| Security | RLS/API/role/upload/privacy review and automated regression tests |
| Release | Passing CI, verified preview commit, owner acceptance; no automatic production push |

## 16. Progress reporting standard

Every progress update must report:
- Overall completion percentage for the **entire master plan**, not just the current feature slice.
- Per-wave percentage with completed, in-progress and blocked items.
- What changed in the repository, including commit SHA and files/areas touched.
- Which automated checks actually ran and their results.
- Whether the exact development preview was deployed and inspected.
- Remaining risks, provider dependencies and unverified behavior.

Percentages must be based on acceptance criteria, not estimated enthusiasm or number of commits. A plan/documentation update does not count as implementation progress.

## 17. Current confirmed product rules and unresolved proposals

### Confirmed/current planned rules to preserve

| Content | Creator only | Streamer only | Creator + Streamer |
|---|---:|---:|---:|
| Long videos/month | 5 | 0 | 3 |
| Long-video cooldown | 4 days | — | 1 per week |
| Streams/month | 0 | 5 | 3 |
| Streams/week | — | 2 | 1 |
| Mini's/month | 30 | 30 | 20 |
| Moments/month | 30 | 30 | 30 |

Additional current planned rules:
- Long videos max 10 minutes.
- Mini's max 15 seconds; ordinary-user proposed daily cap 3.
- Mini lifetime max 30 days.
- Moments default lifetime 6 hours.
- Long-video expiry selectable up to 14 days, subject to Admin policy.
- Exclusivity window max 7 days.
- Stream replay deleted after 24 hours; this is not the stream duration.
- Both-role accounts use the combined column, never additive quotas.
- Proposed 3-hour maximum live duration is an initial proposal and must be configurable/validated, not represented as a user-confirmed requirement.

### Still configurable/proposed, not confirmed fixed requirements

- Ordinary-user monthly Mini/Moment caps.
- Chat message length, daily DM creation, group member caps and group creation caps.
- Voice-message duration and attachment size.
- Voice room participant limits and recording duration/retention.
- Exact cleanup defaults for each chat/group/room category.
- Exact media provider, SFU/TURN provider, encoding provider and paid scaling path.
- Any numeric latency or concurrent-user promise.

Admin may configure these within actual infrastructure limits. The product must expose the difference between an application setting and a provider-imposed ceiling.

---

**Implementation instruction:** Read this entire master plan and the companion chat/voice plan before continuing work. Start with Wave 0 repository audit, then execute the waves in dependency order on `development`. Preserve all confirmed decisions, use large complete implementation batches, report verified per-wave and overall percentages, run checks after each meaningful batch, and keep `main` and production untouched until explicit approval.


---

## 13. Complete owner-agreed requirements register (binding addendum)

This register is part of the master specification. It expands the earlier summaries into explicit product behavior and acceptance criteria. If a feature appears in this register and its detailed companion document, both apply. A wave is not complete until its applicable checks pass.

### 13.1 Brand, identity and visual system — Wave 1

- [ ] Replace the predecessor NHEN / Nhen? / Creator Fan Hub visual identity across the actual product, not only the landing page.
- [ ] Use black, white, grey and blue as the complete core palette. Remove the old lime-green identity and audit every route, modal, hover state, chart, badge, skeleton and error state for stray old colors.
- [ ] The supplied hand-drawn logo is the visual identity. Preserve its character; improve spacing, composition, resolution, sizing and responsive placement without replacing it with a generic mark.
- [ ] Correct the Arabic typo in the supplied logo artwork when the source asset is available. Do not invent replacement Arabic lettering.
- [ ] Creator/Admin branding controls must support logo upload, safe crop/fit, preview on light/dark surfaces, background-removal preview where reliable, original-file preservation, transparent PNG/WebP where supported, fallback and theme-aware variants.
- [ ] The logo must integrate into navigation, loading, favicon/app icon and relevant media/creator surfaces without being repeated as a written “Raye2” wordmark throughout the UI.
- [ ] Rebuild the home layout, menus, navigation hierarchy, content cards, player shell, profile headers, creator surfaces, feed, dialogs and mobile navigation as one coherent system.
- [ ] Make the desktop experience the primary design target while delivering complete responsive tablet/mobile behavior, not a squeezed desktop layout.
- [ ] Provide Arabic and English typography with correct RTL/LTR direction, mixed-language metadata and mirrored layout where appropriate.
- [ ] Admin-managed themes may change supported theme tokens and logo variants but cannot break accessibility, contrast or brand consistency.
- [ ] Remove obsolete predecessor branding and legacy marks from Raye2 UI. Preserve third-party marks/player controls required by providers.
- [ ] **Open branding decision:** the existing README says a permanent “MADE BY ALMUDDATHTHIR” credit remains in the shared public layout, while the Raye2 redesign direction says obsolete/unapproved predecessor watermarks are removed. Do not silently choose. Before changing that credit, record the owner's explicit decision: retain it as a deliberate creator credit, redesign/reposition it, or remove it. It must not be mistaken for a third-party legal mark.

### 13.2 Home, navigation and connected discovery — Waves 1 and 3

- [ ] Home is the central YouTube-style browsing experience: a clear primary feed with connected video discovery, creator identity, categories/topics and recommendations—not a collection of isolated feature pages.
- [ ] Use familiar media-platform information architecture while retaining Raye2's own design. Include useful side navigation on desktop and compact navigation on mobile.
- [ ] Home sections can include recommended, following, latest, creators, videos, Mini's, Moments, live now, communities and events, subject to available content and Admin feature flags.
- [ ] Every media card, feed post and creator mention links to the canonical content/profile. Follow, subscribe, reactions, comments, save and share state remains consistent wherever the item appears.
- [ ] Include feed polls with question, options, voting rules, closing time where enabled, results visibility and anti-repeat/abuse controls.
- [ ] Search and discovery span public creators/users, native videos, Mini's, active public Moments, public communities and events; privacy, blocks, moderation and expiry apply to every result.
- [ ] Build connected menus, contextual actions, notification entry points, account controls and search—not dead-end buttons or disconnected mock pages.

### 13.3 Native video, external video and player behavior — Wave 3

- [ ] Native Raye2 uploads are stored, processed, delivered and played through a real supported media pipeline. The player, upload state and processing state must reflect real backend state.
- [ ] Native video pages have Raye2-owned comments, replies, reactions, creator profile links, saves, share actions and community discussion.
- [ ] Support direct phone/computer upload, secure resumable/retryable upload where the provider supports it, thumbnail selection, title, description, category, visibility, captions and expiry.
- [ ] External YouTube videos use the official permitted embed/player. Keep YouTube's required branding, controls, restrictions and player behavior. Raye2's own title, creator context, comments, reactions, polls where appropriate and discussion can surround it.
- [ ] Never imply Raye2 owns, stores or controls an external YouTube video's availability; do not download, proxy, cache, alter or extract its audiovisual stream without authorization.
- [ ] Share a whole video, timestamp/moment, or an eligible clip into DMs, groups, communities and Watch Together.
- [ ] Shared links must re-check current permissions, moderation and expiry at view time.

### 13.4 Publishing permissions, Creator Panel and quotas — Waves 2 and 4

- [ ] Admin/Owner assigns Creator and Streamer roles; users cannot self-assign them. Creator-only, Streamer-only and combined Creator + Streamer permissions are distinct.
- [ ] Creator-only may publish long videos and exclusives; Streamer-only may start streams; combined role receives only the explicit combined quota below, never additive quotas.
- [ ] Ordinary users may publish allowed community content and create eligible clips from existing Raye2 content, but cannot use Creator Studio upload controls to publish official long-form uploads unless granted the role.
- [ ] Creator Studio shows only permitted actions and explains why an action is unavailable. Every permission and quota is checked server-side.
- [ ] Current planned role quota matrix:

| Content | Creator only | Streamer only | Creator + Streamer |
|---|---:|---:|---:|
| Long videos/month | 5 | 0 | 3 |
| Long-video cooldown | 4 days | — | 1 per week |
| Streams/month | 0 | 5 | 3 |
| Streams/week | — | 2 | 1 |
| Mini's/month | 30 | 30 | 20 |
| Moments/month | 30 | 30 | 30 |

- [ ] Long-video user-selected expiry: up to 14 days, subject to Admin policy. Exclusivity: up to 7 days.
- [ ] Stream replay retention: 24 hours after stream end. This is not the stream's live duration.
- [ ] Mini's maximum duration: 15 seconds; planned maximum lifetime 30 days. Ordinary-user planned Mini cap is 3/day, configurable by Admin.
- [ ] Moments planned default lifetime: 6 hours; role quotas are 30/month for each listed role. Ordinary-user limits remain an explicit Admin-configurable policy.
- [ ] Admin can tune quotas, cooldowns, file-size/duration ceilings, retention, allowed sources, role overrides and feature access within provider/system limits.
- [ ] Quota calculations, timezone/month boundaries, concurrent upload reservations, failed upload refunds and race conditions must be defined and tested. A client-side counter is not enforcement.
- [ ] Creator Panel includes content library, drafts, processing/publishing status, retryable errors, moderation/takedown state, quota/cooldown display and real analytics (views, watch time, completion/retention where measurable, engagement and followers).
- [ ] Never fabricate views, watch time, live viewers or analytics when instrumentation is unavailable.

### 13.5 Mini's, Moments and community-created clips — Waves 3 and 5

- [ ] “Mini's” is the Raye2 product term; do not replace it with generic Shorts/Reels labels.
- [ ] Mini's may be directly uploaded from a phone or created from eligible Raye2 long videos and streams.
- [ ] Extracted Mini's retain source attribution and must survive source expiry/deletion for their own allowed lifetime. Materialize an independent clip asset only when a durable reference cannot meet the retention requirement.
- [ ] Add a distinct **community clip** flow: ordinary fans can select an allowed portion of an already-published eligible Raye2 video/stream and publish it as a community contribution with their own caption and Raye2 interactions. This is not permission to upload arbitrary official long videos.
- [ ] Community clips must follow source creator permissions, clip-length rules, attribution, privacy, takedown, reporting, copyright and Admin policy. A source creator/Admin must be able to disable clipping for a source where appropriate.
- [ ] The owner's requested low-friction community creation should not require manual pre-approval for every ordinary clip by default; automated safeguards, rate limits, reporting and post-publication moderation remain available. Admin can enable review for specific accounts/sources/categories.
- [ ] Define ordinary-user clip limits explicitly in Admin policy rather than accidentally inheriting Creator quotas. Do not describe ordinary clip creation as unlimited until the owner sets and infrastructure validates an actual limit.
- [ ] Provide trim/preview, caption, attribution, visibility, share, report and remove/takedown behavior.
- [ ] Clips shared into communities or chats must remain subject to source and clip permissions.

### 13.6 Custom Raye2 reactions and social engagement — Waves 3 and 5

- [ ] Build a Raye2-owned reaction pack with original image assets, distinct reaction names, accessible text labels and a consistent visual style.
- [ ] Reaction picker opens as a clear popup/overlay from posts, videos, comments and supported messages. It must work by pointer, touch and keyboard.
- [ ] Show the selected reaction state and real reaction counts; support changing/removing a reaction and enforce one active reaction per user per target unless the product explicitly defines otherwise.
- [ ] Do not substitute generic emoji-only reactions for the requested custom reaction artwork. Emoji may be used only as a temporary accessible fallback while the final assets are unavailable.
- [ ] Include comments, threaded replies, edit/delete permissions, pinning, moderation, reporting and notification preferences across supported content types.
- [ ] Polls, saves/bookmarks, collections, follows/subscriptions, repost/quote where enabled and share-to-chat/community must use consistent canonical records.

### 13.7 Profiles, creator identity and achievements — Waves 2, 3 and 5

- [ ] Public/private profile controls with avatar, cover, display name, unique handle, bio, links, interests and creator identity.
- [ ] Profile surfaces connect to videos, Mini's, Moments while active, community posts/clips, public communities, playlists/collections and achievements where enabled.
- [ ] Include meaningful achievement/badge framework with defined eligibility, anti-abuse checks and transparent criteria; do not award fabricated achievements.
- [ ] Provide profile customization and visibility controls without exposing private activity, private groups or restricted media.
- [ ] Creator profiles are connected from every eligible media card, comment, live event and community surface.
- [ ] Support follow/unfollow, follower/following views and notification preferences with block/mute/privacy enforcement.

### 13.8 Communities and fan participation — Wave 5

- [ ] Public discoverable and private invite-only communities, with ownership, moderators, rules, join requests, invites, bans and member controls.
- [ ] Community feed supports posts, announcements, polls, Mini's/community clips, shared video moments, pinned items, topic channels and collections.
- [ ] Fans can discuss official creator videos and create eligible community clips without being granted official Creator publishing privileges.
- [ ] Admin/Owner and authorized moderators can edit/remove community posts and clips, handle reports and apply restrictions with audit history.
- [ ] Support events, RSVP/reminders, Q&A, creator office hours, collaborations and optional attached chat/voice/Watch Together spaces.
- [ ] Community activity, user mentions and shared media obey membership visibility, privacy, blocking and content expiry.

### 13.9 Chat, voice, Watch Together and Shared Memories — Wave 6 and 7

- [ ] The companion document `docs/RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md` is mandatory and remains incorporated by reference. Its detailed requirements are not optional or superseded by this checklist.
- [ ] Direct messages, public/private groups, message requests, reactions, replies, edits/deletes, pins, bookmarks, search, polls, scheduled events, shared collections, notification controls, block/report and group moderation.
- [ ] Private one-to-one voice calls and group voice rooms, with join/leave, mute, speaker/device controls, speaking indicators, raise hand, host/co-host moderation, lock/waiting room and reconnect/quality state.
- [ ] Optional recording is off by default and requires active consent from every participant. New joiners must consent before inclusion; declined/withdrawn consent stops recording or excludes the participant safely. Visible recording indicator and elapsed time are mandatory. No secret/background recording.
- [ ] Watch Together supports synchronized eligible native video, shared queue, queue voting, chat/reactions and optional voice; external player limitations must be clear.
- [ ] Automatic cleanup of messages, groups, rooms, attachments, recordings and session artifacts follows independent Admin-configurable retention clocks.
- [ ] Shared Memories remain separate from ordinary chat retention and are excluded from bulk cleanup unless their own explicit policy permits deletion.
- [ ] Bulk cleanup must preview affected records, estimated storage, exclusions, reason and recovery options, require confirmation, and write an audit record.

### 13.10 Admin/Owner platform control center — Wave 8

- [ ] Central Admin Rules Engine for roles, quotas, cooldowns, publishing permissions, duration/file limits, visibility, feature flags, retention, cleanup and storage thresholds.
- [ ] Admin can assign/remove Creator and Streamer roles, set account-specific overrides and temporary grants, suspend/restrict accounts, and moderate official and community content.
- [ ] Admin can edit/remove community posts/clips and manage reported content; actions require appropriate permissions and audit records.
- [ ] Admin dashboards show real users, creators, uploads, views, watch time, active streams, reports, moderation queues, storage by category/bucket, delivery/realtime usage, failed processing and cleanup backlog.
- [ ] Provide feature switches and safe staged rollout; disabling a feature must not orphan data or break unrelated routes.
- [ ] Storage cleanup controls allow selecting categories to clear while preserving explicitly selected categories such as chat history or Shared Memories.
- [ ] Destructive bulk actions require scope preview, reason, elevated authorization, confirmation, audit log and recovery/quarantine where feasible.
- [ ] Owner/Super Admin powers are separate from ordinary Admin; no self-escalation through normal role controls.

### 13.11 Safety, privacy, security, reliability and operations — Wave 9

- [ ] Enforce authorization and quotas server-side, with database policies and tests for every role/content combination.
- [ ] Apply age-appropriate defaults, reporting, blocking, moderation queues, anti-spam/rate limits, copyright/takedown workflows and privacy-aware discovery.
- [ ] Validate media type, size, duration, ownership, source permissions and processing output. Use signed uploads and safe access policies.
- [ ] Ensure expired content becomes inaccessible immediately even if physical storage deletion is delayed.
- [ ] Background jobs must be durable, retryable, idempotent and observable; track orphaned assets and failed cleanup.
- [ ] Test Arabic/English, RTL/LTR, mobile/tablet/desktop, keyboard accessibility, slow network, reconnects, upload interruption and permission edge cases.
- [ ] Test concurrent quota reservations, role changes during uploads, source deletion while clips survive, late voice-room joiners, recording consent withdrawal, cleanup exclusions and private-group link leakage.
- [ ] Maintain real cost/capacity accounting. No unlimited-free storage/streaming or zero-latency promises.
- [ ] Complete repository audit, schema/migration review, RLS/security review, automated tests, preview validation and owner acceptance before production release.

### 13.12 Explicit decision register — do not silently resolve

1. **Long-video duration conflict:** earlier product direction requested videos of at least 20–30 minutes or longer; the later quota policy says a 10-minute maximum. The current 10-minute value is retained as a provisional policy, but Wave 0 must obtain the owner's final decision before implementation locks the limit. Keep architecture capable of a configurable higher ceiling if provider capacity permits.
2. **Permanent creator credit:** README currently requires the “MADE BY ALMUDDATHTHIR” credit, while the redesign calls for removal of obsolete/unapproved legacy marks. Wave 0 must confirm retain, redesign/reposition or remove before editing the shared layout.
3. **Ordinary-user community clips:** low-friction/no manual pre-review by default is the direction; exact per-day/month limits, clip duration and source-creator opt-out rules must be set in Admin policy before launch.
4. **Live session duration:** 3 hours is only a proposed starting maximum, not an owner-confirmed requirement. Keep it configurable and validate against the selected live provider.
5. **Ordinary-user Mini's and Moments quotas:** Mini's 3/day is a proposed starting cap; ordinary-user Moments quota is not yet fixed. These remain Admin-configurable launch decisions.
6. **Infrastructure/provider choices:** storage, transcoding, CDN, live ingest, WebRTC SFU/TURN and realtime providers must be selected from measured free-tier limits, reliability, legal terms and cost. Product requirements do not imply unlimited capacity.

### 13.13 Wave completion and reporting contract

For each wave, report:
- planned scope and acceptance criteria;
- implemented items with exact routes/components/schema/services changed;
- automated checks run and their outcomes;
- preview-tested behavior and known limitations;
- remaining blockers and decisions;
- separate percentages for implementation, automated verification and preview/owner acceptance.

A wave is **not complete** because a plan exists, a route renders, a placeholder is present, or a commit was pushed. Mark a requirement complete only when the corresponding behavior exists and its acceptance test passes. Never collapse planned, implemented, tested and owner-accepted into one percentage.



---

## 18. Smart Sponsorship, Advertising & Creator Monetization — PRE-BETA BLOCKER

**Delivery status:** Required before the one-month friends test. This is not a post-launch idea and must not be moved to the Coming Soon backlog. Implementation spans Wave 4 (Creator Studio and streaming), Wave 8 (Admin campaign control and accounting), and Wave 9 (provider, privacy, security and release verification).

### 18.1 Two distinct sponsorship ownership paths

**A. Creator/streamer-contracted sponsorships**
- Creators and streamers add and manage their own contracted sponsors from the video-upload flow or stream setup/settings. This is not an Admin-created item.
- Each sponsorship record supports sponsor/brand identity, approved logo/artwork, one or more sponsor video assets/variants, campaign start/end, covered videos or streams, placement preferences, category/exclusivity restrictions, required wording/disclosure, allowed regions where applicable, frequency limits and contract notes.
- Support multiple creative versions (for example short, medium and longer cuts) so the director can choose a permitted version for the available slot.
- Creator/streamer controls whether a sponsorship is active for a given upload/stream, can review proposed placements and can pause/remove it subject to the recorded contract terms.
- Sponsor media remains separate from the creator's main content and is served only in the placements permitted by the campaign.

**B. Raye2 platform-wide sponsorships**
- Admin/Owner manages platform-wide sponsor campaigns in the Admin Panel.
- Admin campaign settings include creative assets/variants, dates, placement inventory, eligible content categories, region restrictions, campaign priority, frequency caps, exclusivity/conflict rules and reporting.
- Active platform-wide campaigns can be automatically distributed across eligible Raye2 content and streams by the Smart Advertising Director.
- Platform-wide campaigns must not silently override a creator's active contractual sponsor, exclusivity, category restriction or approved campaign terms. Conflicts are resolved by explicit campaign policy and safe fallback, never by an undocumented override.
- Platform-wide sponsor revenue is accounted separately; do not automatically deduct a creator share unless that creator has explicitly joined/contracted for that campaign.

### 18.2 Smart Advertising Director

Build a shared decision engine that coordinates creator sponsors, Raye2 platform campaigns and approved external ad-provider inventory without conflating them.

For eligible native video, the director should:
- Analyze media structure and identify candidate breakpoints using scene transitions, chapter boundaries, natural pauses, dialogue boundaries and broad activity/intensity changes.
- Prefer natural breakpoints and avoid cutting off important dialogue, the climax of a scene, a key action or an essential explanation.
- Select from the campaign's permitted creative variants and placements, while enforcing campaign dates, content eligibility, category exclusions, exclusivity, frequency caps and sponsor conflicts.
- Balance campaign delivery and revenue goals against viewer experience; never interpret "maximum ads" as unlimited or mechanically place ads at every detected moment.
- Support creator review/approval of proposed placements, exclusions and a configurable ad-intensity policy.
- Clearly distinguish sponsored content from platform/provider advertising and preserve required disclosures.

For live streams:
- Use supported live insertion/overlay capabilities and natural break signals where the provider permits them.
- Prefer round breaks, intermissions, loading/transition screens and streamer-declared breaks; avoid interrupting active gameplay, live conversation or important events.
- Respect provider latency, live-DVR and insertion limits. If safe insertion is unavailable, skip the slot rather than corrupting playback.

### 18.3 Optional five-second context replay

- After an inserted mid-roll, the player may replay a short context bridge (initial target: up to five seconds before the break) so the viewer can reorient.
- This is a configurable product behavior, not a mandatory replay after every ad. Avoid confusing loops, repeated critical dialogue or replaying copyrighted third-party material outside its permitted player.
- For live streams, only offer a replay bridge if the approved live provider exposes a compliant rolling buffer/DVR path. Otherwise resume at the live edge with a clear return state.

### 18.4 External ad network and revenue share

- Keep third-party network advertising technically and financially separate from creator-contracted sponsors and Raye2 platform-wide campaigns.
- Provider integrations must use the provider's approved SDK/API and comply with its publisher, content, age, consent, geography and revenue-sharing policies.
- The proposed commercial split is **70% Raye2 / 30% eligible creator or streamer** from the net ad revenue actually recognized and received by Raye2 for attributable eligible inventory, after provider deductions, invalid-traffic adjustments, refunds and other contractually required adjustments.
- The split is not a share of gross advertiser spend and must not be presented as guaranteed income.
- Do not assume Google Ad Manager, IMA or any other provider grants approval, demand, creator sub-publisher rights or a specific revenue split automatically. Provider approval and contractual eligibility are release dependencies.
- Do not monetize third-party YouTube embeds as if Raye2 owns the ad inventory. Preserve the external provider's player, ads and required controls.

### 18.5 Revenue attribution and creator reporting

Maintain separate ledgers for:
1. Creator/streamer-contracted sponsor campaigns and any direct sponsor compensation declared by the creator (Raye2 reports campaign delivery; it does not claim to custody or pay private contract funds unless a compliant payment product is later approved).
2. Raye2 platform-wide sponsorship campaigns and their platform revenue.
3. External ad-provider revenue and the eligible creator share.

Creator/streamer dashboard should show eligible monetized content, campaign/sponsor identity, placements served, impressions or delivery metrics where actually measurable, estimated versus finalized amounts, adjustments, reporting period and payout status only when a compliant payout provider and eligibility are configured. Never fabricate earnings or impressions.

### 18.6 Safety, legal and operational gates

- Clearly label sponsored placements and keep ad creative subject to content, age-appropriateness, privacy, copyright and provider rules.
- Do not infer sensitive traits to target ads. Use contextual placement and explicit campaign eligibility rules.
- Cash compensation, account eligibility, tax and payment onboarding must follow applicable law and provider terms. Underage creators must not be promised direct payouts; require age-appropriate eligibility and guardian/legal handling where applicable.
- Build fraud/invalid-traffic checks, duplicate-delivery protection, campaign budgets/caps, audit history, reconciliation and dispute states before enabling real monetization.
- Test with internal non-billable sponsor creatives and simulated provider responses. Do not claim real ad demand or payouts until the provider integration is approved and live.

### 18.7 Required acceptance before friends testing

- Creator/streamer can create, edit, attach, pause and review their own sponsor campaign during video or stream setup.
- Admin/Owner can separately create and manage Raye2-wide sponsor campaigns.
- Director resolves conflicts using the campaign rules and never violates creator contract restrictions.
- Video placement proposals are based on safe natural breakpoints and can be reviewed/excluded.
- Live placements fail safely when the provider cannot support compliant insertion.
- Optional context replay behaves correctly and can be disabled.
- External network ads, creator sponsors and platform sponsors have distinct labels, delivery records and revenue ledgers.
- Revenue split calculation uses net recognized/received attributable revenue and is covered by tests.
- Creator dashboard distinguishes estimates, finalized revenue, adjustments and payout status; no fabricated figures.
- Provider, age, privacy, copyright, moderation, fraud and payout eligibility gates are documented and tested.
- The full feature is available in the development preview with internal test campaigns before the one-month friends test; production remains gated.



## 19. Cross-session continuity and implementation operating contract

This section is mandatory for every future Raye2 development session. The repository is the source of truth; do not rely on chat memory alone.

### 19.1 Session start protocol

1. Read this full plan, `docs/RAYE2-IMPLEMENTATION-PROGRESS.md`, and the latest relevant wave-specific plan before changing code.
2. Inspect the current `development` branch HEAD, recent commits, latest GitHub Actions runs, and working tree/branch context available through the repository tools. Never assume a prior session's reported SHA or CI state is still current.
3. Read the actual implementation and tests for the next priority. Treat existing code, migrations, tests and docs as authoritative; do not recreate already implemented work or silently drop requirements.
4. Resume from the highest-priority incomplete deliverable in the progress log. If a new session starts with a short instruction such as “go on” or “continue”, that means continue implementation using this protocol, not ask the user to restate the plan.
5. Give the user a concise starting update with verified overall and wave percentages, current branch/HEAD, latest exact-HEAD CI status, and the batch being resumed.

### 19.2 Implementation batch rules

- Prefer substantial, cohesive, end-to-end batches over isolated cosmetic edits or repeated tiny fixes. A batch should deliver working behavior, its authorization/data contract, regression tests, and documentation together where practical.
- Prioritize in this order unless a newly discovered blocker changes it: (1) finish Creator Studio lifecycle and rewards/sponsorship workflows; (2) complete the native video pipeline, including actual adaptive renditions/HLS and playback acceptance; (3) complete the major Raye2 redesign and connected feed/watch/profile experience; (4) finish remaining social, community, messaging and voice scope; (5) harden governance, accessibility, localization, security and release readiness.
- Platform sponsor lifecycle UI and database enforcement have now been implemented on `development`: draft create/edit/delete, selected creative restoration, owner-scoped activation/pause, immutable ownership, constrained state transitions, and regression contracts. Treat this as code implementation only until exact-HEAD CI and isolated database verification pass. Do not label campaign configuration as live ad delivery or claim real payouts.
- The adaptive video implementation batch is now in code on `development`: the self-hosted worker generates bounded 360p/720p HLS VOD renditions, preserves audio when present, writes quota-reserved private outputs, and records the managed master playlist path. Creator publication copies the complete HLS package between private/public buckets alongside the source and poster. The watch route/player use the Apache-2.0 `hls.js` engine (1.7.4) for Media Source browsers, native HLS where supported, and the original source file as fallback. Exact-HEAD CI and a local FFmpeg sample passed; isolated database, deployed-worker and real-browser playback acceptance remain.
- Adaptive video database protection is now also in place: a media-row trigger validates that each HLS master pointer belongs to the same creator and media UUID, exists in managed storage, and uses the bucket matching the media's publication state. The transcoder forces six-second keyframes (not merely a six-second target), and the exact FFmpeg commands have been exercised against a generated sample with AAC audio.
- The real FFmpeg HLS smoke test is now part of the media-worker Docker image build. It generates a 12-second 720p source with AAC audio, transcodes both 360p/720p renditions using the production worker's encoding settings, verifies two six-second VOD segments per rendition, probes each segment for video/audio streams and enforces rendition dimensions. The exact-HEAD CI run passed this Docker build plus repository tests, TypeScript, lint and the Next.js build.
- Remaining video acceptance: apply the processing-preservation and HLS-pointer migrations in an isolated Supabase database; exercise the deployed worker with a test upload and verify quota reservations, publication visibility and cleanup; verify HLS adaptive switching/seeking/fallback in real browsers. Do not claim deployed HLS is production-ready until those environment-dependent checks pass. Keep manual user testing deferred until approximately 50% overall implementation progress.
- Keep UI redesign substantive and coherent across navigation, feed, Creator Studio, watch pages, profiles and responsive Arabic/English layouts. Do not count a new link/card or CSS micro-adjustment as completion of the redesign wave.
- Do not invent successful browser checks, database acceptance, preview deployment, storage capacity, monetization, or runtime behavior. Separate code/test evidence from environment-dependent verification.

### 19.3 Progress and reporting rules

- Every continuation update must report two distinct measures: **implementation progress** (features built and integrated in code) and **test/release readiness** (features verified and safe for the user's later test stage).
- Implementation progress is allowed to increase before manual user/friends testing. Do not freeze it at the test-readiness percentage. Count real code and integration against the master requirements; do not count plans, documentation-only commits, placeholders, or unintegrated code.
- Test/release readiness must remain separate and conservative. Automated CI, migrations applied in an isolated database, browser verification and real-account checks are different evidence; label them accurately.
- The user's first major manual testing stage is targeted at **about 50% implementation progress**. Until that threshold, continue building without asking the user to manually test every batch. Run automated CI and fix regressions as part of development; collect manual acceptance checks for the planned test stage.
- At every update include: overall implementation %, test/release readiness %, active wave implementation %, and the active batch's implementation %. Show meaningful movement when a complete implementation requirement is delivered, even if manual testing is still pending.
- Percentages are scope-based estimates, not commit counts. Raise implementation progress when meaningful planned functionality is implemented and integrated. Raise test/release readiness only when the corresponding verification is actually complete.
- Keep the ten-wave master plan and implementation progress log synchronized. Record completed deliverables, remaining blockers, test/CI evidence, exact resulting HEAD, and the next concrete batch after each meaningful batch.
- Do not inflate progress because documentation was updated or because several small commits were made. If no implementation-level progress occurred, keep implementation percentage unchanged and explain why.
- Prefer one larger batch with multiple related files and tests; avoid unnecessary commits that repeatedly cancel CI. Run or await verification on the quiet exact HEAD before claiming success.

### 19.4 Branch, deployment and handoff safeguards

- All ongoing implementation and previews stay on `development`. Do not merge to `main`, deploy production, or change production data unless the user explicitly authorizes that separate release step.
- Do not reset, force-push, overwrite, or discard user work. Fetch fresh file/blob SHAs before sequential GitHub content updates.
- At the end of each session, append a handoff entry to the progress log containing: date, branch, exact HEAD, verified CI result, files/features changed, tests run versus merely authored, environment checks still pending, updated percentages, and the next batch in execution order.
- A future assistant should continue from the repository's latest handoff and verify it against the live branch before acting; this instruction persists even if chat history is unavailable.

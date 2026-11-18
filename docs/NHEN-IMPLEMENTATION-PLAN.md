# NHEN — Product and design system

## Brand identity
NHEN is a creator-led media and community platform. It should feel like a modern global product, not a generic agency site or an imitation of another social network.

- Primary canvas: near-black ink (#0B0B10).
- Raised surfaces: #13131B and #1A1924.
- Primary signal: vivid coral (#FF647C).
- Secondary creative signal: ultraviolet (#A58BFF).
- Positive status: teal (#65DBC5); warning: warm amber (#F6C76C).
- Light theme: warm neutral canvas with deep ink and coral actions.
- Violet theme: deep aubergine canvas with lavender/coral contrast.
- Rounded geometry: 10px controls, 18px cards, 26px feature surfaces, pill actions.
- Typography: modern sans-serif, compact strong headings, readable body text and system fallbacks.
- Motion: restrained, purposeful transitions; reduced-motion support.

### Brand behavior
- NHEN wordmark is typographic and compact; coral is the signature recognition color, ultraviolet signals discovery and creative tools.
- Official creator content gets a clear OFFICIAL marker; community content never visually impersonates creator posts.
- Use color as meaning, not decoration. Keep contrast and text legibility first.
- Do not copy another product's exact layouts, icons, wording or visual identity.

## Product information architecture
- Home: personalized feed, creator announcements, featured uploads, events and polls.
- Watch: videos, shorts, playlists, series, creator channel and individual watch pages.
- Explore: searchable videos, posts, profiles, topics and trending discussions.
- Community: posts, video moments, questions, polls, comments and member contributions.
- Profile: creator/member identity, uploads, activity, follows, achievements and privacy.
- Notifications: replies, mentions, reactions, follows, creator announcements and moderation outcomes.
- NHEN Studio: private workspace for publishing, analytics, brand design, moderation, team and settings.

## Responsive navigation
- Desktop: sticky top header with wordmark, central search and account/actions; app surfaces use a left navigation rail and optional right discovery rail.
- Tablet: collapse discovery rail and keep main feed readable.
- Mobile: compact sticky header, full-width feed and persistent bottom navigation with safe-area spacing.
- Public landing remains an editorial entry point, while the community experience becomes a genuine multi-column social app.

## Shared component language
- Consistent surfaces, cards, pills, avatar sizes, buttons, search, empty/loading/error states and accessible focus rings.
- Feed cards have clear author identity, timestamps, official/member distinction, content and action rows.
- Video cards use consistent 16:9 or portrait media frames, title hierarchy, creator identity and metadata.
- Profiles share cover, avatar, identity, follow actions, tabs and privacy-aware activity.
- Studio uses the same tokens but denser data tables, filters, editing panels, preview/publish controls and role-aware navigation.

## Feature direction
- Smart feed modes: For You, Following, Latest and Official.
- Watch: Videos, Shorts, Playlists and Series; continue watching and saved videos.
- Explore: search suggestions, topic/category hubs, creator discovery and trending conversations.
- Community: video-linked timestamp moments, clip discussions, polls, questions and posts.
- Creator toolkit: scheduled publishing, drafts, thumbnail management, playlists, featured content, analytics and audience insights.
- Identity: handles, creator verification marker, profile customization, privacy and transparent achievements.
- Trust: reporting, block/mute, rate limits, spam controls, moderation queue, appeals and staff audit.
- Experience: English/Arabic, proper RTL, dark/light/violet themes, accessibility and captions.

## Implementation status
The current branch has the original configurable creator portal, polls, ideas, events, social links, media asset library and creator dashboard. The NHEN design stylesheet establishes the visual foundation and reusable layout primitives; the full app navigation and social modules still need functional components, data models, permissions and tests.

## Delivery and safety
- Keep development work on the development branch and verify preview deployments.
- Do not alter main or production until the owner explicitly approves.
- Free hosting tiers have quotas; do not promise unlimited video storage, bandwidth or transcoding.
- A design or documentation commit is not evidence that the full platform feature is complete.

# Current implementation status

Updated: 2026-10-26

## Done
- Created GitHub repository: https://github.com/Mody2024/Creator-Fan-Hub
- Created `development` branch; active implementation is isolated from `main`.
- Added a responsive static prototype in `index.html`.
- Added `docs/ROADMAP.md` with milestones and launch requirements.
- Created a separate Vercel Git-linked project `creator-fan-hub-dev` without triggering an initial deployment.

## Current prototype behavior
- Three local themes, responsive layout, reduced-motion handling, keyboard-focus styling, scroll reveals, desktop pointer aura/tilt, guided tour, demo poll and demo idea form.
- Demo interactions are local only. No vote or idea is transmitted or persisted.
- Branding, mascot, copy, content and vote results are placeholders.

## Next
1. Refine component structure and add automated checks.
2. Configure the data/auth provider safely.
3. Build secure Creator Panel and draft/preview/publish workflow.
4. Implement real polls/submissions with server-side validation and moderation.
5. Add configurable media, events, links, mascot and tour.
6. Accessibility, security, performance and release checks.

## Release rule
Do not treat the existing static prototype as a finished product. Keep production release separate until backend, authentication, persistence, tests, backups, and review are complete.


## Additional work in this build session
- Added an initial database schema proposal in `supabase/schema.sql` for site configuration, polls/options/votes, ideas, media, events, social links, and admin audit history.
- Added `supabase/rls-policies.sql` with a public-read-only starting point and explicit revocations for public writes/private records.
- Added `.gitignore` and a placeholder-only `.env.example`; no real credentials were added.
- Added `docs/BACKEND-SECURITY.md` covering draft/publish boundaries, admin authorization, vote/submission validation, media safety, and recovery.
- These SQL files are committed as implementation artifacts but have **not** been applied to a database. No Supabase project was created or modified; existing projects were left untouched.
- The current web app remains the static prototype until the app architecture and backend are integrated.


## Validation groundwork (2026-10-26)
- Added a dependency-free Node test setup: `npm run check` and `npm test`.
- Added GitHub Actions workflow `.github/workflows/validate.yml` for pushes and pull requests to `development` and `main`.
- Added checks for required sections, responsive/reduced-motion support, the permanent creator signature, explicit demo-only messaging, and baseline security documentation.
- Fixed a validation pattern to match the poll's actual demo disclosure.
- Latest Git-linked Vercel development deployment for commit `b46971cf400f667afba0bf13771ae9d101f53468` reached READY.
- Important: Vercel READY confirms deployment completed; it does not mean GitHub Actions passed. I have not verified a successful CI run yet.


## Configuration and schema hardening (2026-10-26)
- Split unpublished settings into `site_config_drafts` and a separate `published_site_config` snapshot. This avoids the mistaken assumption that row-level security can hide individual JSON columns.
- Updated public-read policies so anonymous clients can select the published snapshot only; the draft table has no client-facing policy or grants.
- Added a composite foreign key requiring a vote's selected option to belong to the same poll.
- Added `src/lib/site-config.mjs`, a dependency-free validator for supported schema version, theme/color/motion choices, section ordering, text lengths, media ID shapes, hero settings, feature flags, and maintenance settings.
- Expanded tests for valid/invalid site configuration, private draft separation, and poll-option integrity; aligned the demo poll test with the page's actual wording.
- These are code/schema artifacts. The validator is not yet connected to a running Creator Panel or publishing API, and the SQL has not been applied to any database.
- CI workflow exists, but a passing GitHub Actions run has not been confirmed.


## Publishing-boundary pass (2026-10-26)
- Added `src/lib/publish-site-config.mjs`: a server-only publishing service boundary that validates configuration, requires a trusted actor ID supplied by the authenticated server, checks the expected draft revision, handles concurrent-edit conflicts, and reports success only when the repository adapter reports a committed published version.
- Added tests for missing actor identity, invalid configuration, stale draft revisions, transaction conflicts, and successful committed-version responses.
- Extended the schema proposal with a draft revision counter and private published-version history table; RLS/grants also keep version history unavailable to public client roles.
- Strengthened config validation to reject unknown fields, malformed/blank media IDs, and duplicate social-link IDs.
- Latest Git-linked Vercel development deployment for commit `e849d3a2132ceb67dfd01e4436286d68c3bcacb7` reached READY.
- Verification limitation: the commit status currently reports Vercel pending even though the deployment API reports READY; the available workflow-run lookup returned no runs. Automated tests have therefore **not** been reported as passing.
- The publishing service is an adapter-based boundary, not a completed live API. There is no database adapter, authenticated admin session, or deployed publish endpoint yet. SQL remains unapplied; no Supabase project was modified.


## Next.js + Supabase application foundation (2026-10-26)
- Added a pinned Next.js/React/TypeScript package manifest and framework configuration.
- Added server/browser Supabase client factories using `@supabase/ssr` and publishable-key-only client configuration.
- Added a new responsive app-router homepage that reads only the published configuration snapshot and falls back safely when Supabase environment values/data are missing.
- Added a shared layout with the permanent creator credit, security headers, accessible focus styling, mobile layout, and reduced-motion support.
- Confirmed the connected Supabase account has existing projects named `Eldukkan` (active) and `SKL27` (inactive); neither was changed or selected for this site.
- Corrected Vercel's project framework from unconfigured/static to Next.js and cleared the static output-directory override. This fixes the observed `STATIC_BUILD_NO_OUT_DIR` configuration mismatch; the new app build must still be verified.
- No dedicated Supabase project has been created. The database schema remains unapplied, and the Creator Panel/authentication/write APIs are not complete.


## Supabase free-tier setup and first creator editor (2026-10-26)
- Created dedicated Supabase project `Creator-Fan-Hub` in `eu-central-1` under the selected `2DogsStudios` organization. Supabase returned `ACTIVE_HEALTHY`; quoted project creation cost was $0/month.
- Applied the initial schema, explicit public-read-only RLS/grants, default configuration seed, creator allowlist, draft save/publish functions, and canonical configuration migration.
- Verified 11 public tables with RLS enabled and one starter draft + one published config row. Existing `Eldukkan` and `SKL27` projects were not changed.
- Added Supabase URL and publishable key to the Vercel development project's Preview environment for the `development` branch only; no production env values were added.
- Added protected draft read/save and publish API routes, plus a creator editor for identity, hero copy, theme/accent, feature flags, maintenance mode, draft revision conflicts, and publishing.
- The creator editor is database-backed, but it requires a Supabase Auth user explicitly allowlisted in `public.creator_admins`; no public self-signup is enabled and no owner account has been created automatically.
- Security advisor reports INFO findings for intentionally private tables with RLS but no policies. Performance advisor reported missing foreign-key indexes; index migration added. Security/performance advisors should be rerun after integration.
- Free-tier target: no paid APIs or paid integrations. $0 project-creation quote does not guarantee unlimited use or permanent free service; enforce provider usage limits and do not enable paid upgrades without owner approval.
- Not complete: production deployment, confirmed passing CI/build, actual first creator login, end-to-end editor save/publish, real idea/vote write endpoints, media uploads, and full feature set.


## Integrated creator experience and accessibility pass (2026-10-26)
- Published site reads only the versioned public configuration snapshot; the creator editor saves drafts separately and publishes by expected revision.
- Connected creator workflows now include idea moderation, polls, events/social links, media upload/publish, publishing history with draft-only restore, narration controls, and a guided welcome tour.
- The guided tour now traps keyboard focus inside its modal, wraps forward/reverse Tab navigation, closes on Escape, and restores focus to its launcher.
- GitHub Actions validation and free-tier CI passed for commit `602420924b3cee0962241233a75dd032c8c42acb`. Follow-up tour accessibility changes are being validated in the next commit.
- Production remains intentionally untouched. A passing static repository validator is not a substitute for live Supabase end-to-end testing, mobile/browser acceptance, or confirming the current Vercel preview.


## Media ownership hardening (2026-10-26)
- Added a migration to associate uploaded media metadata with its uploader, backfill ownership from valid existing storage paths, and scope creator media listing, edits, and deletion to the current owner.
- The metadata-save RPC rejects storage paths outside the signed-in creator's folder. Existing records that cannot be safely attributed remain unavailable for creator mutation until reviewed.
- This migration is committed as code only; it has not been applied to the Supabase project. Live database behavior still needs an authorized migration run and end-to-end tests.

- Follow-up review hardened the ownership backfill so malformed legacy storage paths cannot trigger an unsafe UUID cast; validator coverage now asserts the guarded conversion.


## Media ownership migration repair (2026-10-27)
- Rebuilt the media-owner migration as a complete SQL file after review found the UUID backfill statement was malformed.
- The migration matches the existing media type constraint, scopes listing and mutation to owner_id, and grants its RPCs only to authenticated users.
- This remains code-only until applied and tested against the connected Supabase project.


## Media publish/unpublish safety (2026-10-27)
- Unpublishing now attempts to remove the public storage object before marking the asset private, avoiding a stale publicly accessible copy if storage removal fails.
- If the metadata update fails after public removal, the client attempts to restore the original public object and reports a critical recovery failure explicitly.
- Publishing cleanup failures can leave a private duplicate only; live storage/database rollback still needs end-to-end testing.


## Publishing schema integration fix (2026-10-27)
- Aligned the site-config validator with creator-editor narration media ID, transcript, and autoplay fields. Transcript text is capped at 1,600 characters and autoplay must be boolean.
- Removed the unsupported latest section key from the publish schema because the public homepage has no corresponding renderer.
- Added static checks for these contracts. Live publishing remains subject to database and deployment verification.


## Creator editor recovery hardening (2026-10-27)
- Wrapped draft save and publish in try/catch/finally so thrown network errors cannot leave the editor stuck in a permanent saving state.
- Added explicit handling for auth lookup failures and connection errors; existing revision-conflict and draft-saved/publish-failed messaging is preserved.
- Added a static assertion for reliable saving-state cleanup.


## CI fixture repair (2026-10-27)
- Updated the valid site-config test fixture to match supported public sections and the creator editor's narration fields.
- Added a regression test ensuring oversized narration transcripts and non-boolean autoplay preferences are rejected.


## Event and social editor reliability (2026-10-27)
- Added try/catch/finally recovery to event creation, event status changes, social-link saves, and link publication toggles so rejected network requests cannot leave the UI permanently busy.
- Hardened parallel event/link loading against rejected requests and guaranteed the loading indicator resets.
- Added static assertions for the recovery paths; live creator authorization still needs end-to-end verification.


## Event timezone edit fix (2026-10-27)
- Fixed the edit form's datetime-local formatting so stored UTC timestamps display in the creator's local timezone; editing and saving an event no longer silently shifts its scheduled time by the timezone offset.
- Added a regression assertion for the timezone conversion helper.


## Public event feed polish (2026-10-27)
- Scheduled events with known dates now appear before events with no start date; the latter remain visible with a clear date-to-be-announced label.
- Event dates now use semantic HTML time elements with machine-readable ISO timestamps for accessibility and downstream tooling.
- Added a static regression assertion for the ordering and time markup.


## Creator event module cleanup (2026-10-27)
- Moved the Supabase client import above the local date helper to keep module declarations consistently ordered for linting and tooling.
- Added a static check to guard the import/helper ordering.


## Media deletion consistency (2026-10-27)
- Reordered private-media deletion to verify creator ownership, back up the object, remove storage, then delete metadata.
- If the database deletion fails after storage removal, the file is restored from the in-memory backup; failed restoration produces an explicit administrator warning.
- Added a static regression assertion for ownership validation and compensation paths. This is application-level recovery, not a substitute for a transactional storage/database service.

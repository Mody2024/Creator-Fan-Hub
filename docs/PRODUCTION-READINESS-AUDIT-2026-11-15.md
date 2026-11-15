# Raye2 runtime-readiness audit — 2026-11-15

## Verdict

The repository and its CI are real: the development branch builds, the latest development deployment is READY, and GitHub Actions successfully builds the isolated media-worker image. This is not evidence that every feature is live.

**The project is not release-ready.** The largest blocker is live Supabase schema drift: the repository has 233 SQL migration files while the connected development database records only 89 applied versions. 144 migration versions are absent from the live migration history. Several tables and RPCs required by voice, sponsorship and media processing are confirmed absent.

No production deployment, migration batch, provider credential, billing change or merge to `main` was performed during this audit.

## Exact targets checked

- Repository: `Mody2024/Creator-Fan-Hub`
- Branch audited: `development`
- Audited head: `7e656421d2416b94befad6b653cc6d37a58771ba`
- Supabase project: `scxkgybuodhuohcxpfat`
- Vercel development project: `creator-fan-hub-dev`
- Vercel production project: `creator-fan-hub`

## What passed

- Latest GitHub Actions run on the audited head: both jobs passed.
- TypeScript, lint, repository validator, automated tests and Next.js production build passed in CI.
- The Docker media-worker image built successfully.
- The Dockerfile runs `scripts/raye2-hls-smoke-check.mjs` during image build; the test generates a sample video, creates 360p/720p HLS renditions and verifies playlists, segments, dimensions and audio.
- The latest Vercel development deployment for the audited commit is `READY`.
- Supabase project status is `ACTIVE_HEALTHY`.
- All 35 public tables have RLS enabled.
- Supabase Health Advisor returned no findings.

## Critical blockers

### 1. Live Supabase migration drift

- Repository migration files: 233.
- Applied migration versions in the live project: 89.
- Latest applied version: `20261102215604`.
- Repository latest migration: `20261111120000`.
- Missing from live migration history: 144 versions.

The live database was queried directly. These feature objects are absent:

- Voice tables: `raye2_voice_sessions`, `raye2_voice_participants`, `raye2_voice_recording_consent_events`.
- Sponsorship tables: `raye2_creator_sponsor_campaigns`, `raye2_platform_sponsor_campaigns`.
- Media worker RPCs: `claim_raye2_media_processing_job`, `complete_raye2_media_processing_job`, `reserve_raye2_worker_thumbnail_capacity`, `release_raye2_worker_thumbnail_capacity`.
- Voice RPCs: `raye2_can_moderate_voice_session`, `raye2_start_or_join_group_voice_room`.
- The `media_items` table lacks the newer lease/thumbnail columns `processing_lease_until`, `processing_lease_token`, and `thumbnail_path`.

This means the source code for these features is ahead of the connected database. Do not start the worker or claim voice/sponsorship is live until the reviewed migration chain is applied and verified.

### 2. Voice providers are not connected

The development Vercel project has only the two public Supabase environment variables. It has no `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `RAYE2_TURN_URLS`, or `RAYE2_TURN_SHARED_SECRET`.

The group voice token endpoint explicitly returns `503` when LiveKit credentials are absent. Private calling has only the STUN fallback unless TURN is configured. Provider credentials must be entered privately by the owner; never send secrets through chat or commit them.

### 3. Media worker is built, not deployed

The worker source includes a real HLS packaging path, and the container build smoke test passes. The image build uses `push: false`; no long-running worker deployment was verified. The live database also lacks the worker queue RPCs and lease columns. A passing image build is not proof of real uploads being transcoded and published.

### 4. Production Vercel project is not configured for the current app

The production project currently reports no environment variables, no detected framework, and Node 24.x while the repository declares Node 22.x. Its latest deployment is READY but predates the audited development head and has no Git commit metadata in the deployment listing. Do not promote or push to `main` based on that deployment.

The development project has the two public Supabase variables scoped to Preview on the `development` branch. Its SSO protection is enabled for deployments other than custom domains.

### 5. Sponsorship is not equivalent to an external ad network

The repository contains native sponsorship campaign, review, delivery and ledger code. The corresponding live database migrations are not applied, and no external ad-network provider connection was verified. Do not describe external advertising or revenue as operational yet.

## Security-advisor interpretation

The live Security Advisor reported:

- Seven RLS-enabled tables with no direct policies. These are currently deny-all through direct table access and appear to be intended for guarded RPC-only workflows. Do not add broad table policies to silence the notice.
- Seven anon-executable `SECURITY DEFINER` functions for intentional public features: public poll voting, public idea submission, approved idea reads, poll results and bounded reaction counts. Their public grants should remain narrowly scoped and their input/abuse controls must be tested.
- 48 authenticated-executable `SECURITY DEFINER` functions. A sample of sensitive creator functions was inspected and contained auth/role checks; a complete function-by-function authorization audit remains outstanding.
- Performance notices: 41 unused indexes and 21 multiple permissive policy combinations. These require review/optimization, not blind deletion or policy removal.

No RLS-disabled public tables were found. The advisor output is not proof that every route, RPC and storage object is secure.

## Ordered completion plan

1. Reconcile the 144 unapplied migrations against an isolated local Supabase instance. Resolve failures and inspect schema diffs; do not bulk-apply to the live project blindly.
2. Apply the reviewed migrations to the development Supabase project and verify all tables, columns, RPCs, triggers, RLS policies and storage policies.
3. Run authenticated and anonymous end-to-end tests for accounts, creator permissions, uploads, publishing, messaging, voice and sponsorship.
4. Configure LiveKit and TURN on Preview only, then test multiple real devices and network conditions.
5. Deploy the media worker to a private always-on host with the service-role key stored only in that host's secret environment; run real upload-to-HLS tests.
6. Verify native sponsor campaign review, delivery and ledger behavior. Treat external ad-network integration as a separate provider project.
7. Configure Production environment variables and Node version only after the development acceptance suite passes.
8. Keep `main` and production untouched until the owner explicitly approves release.

## Audit limitations

This was a live metadata, SQL catalog, advisor, source-file and CI/deployment audit. It did not perform a full manual browser test, replay all 233 migrations locally, run a real media upload, join a LiveKit room, or verify external ad delivery. Those are explicit remaining acceptance tasks.

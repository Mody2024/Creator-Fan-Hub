# Supabase setup — verified project state

## Dedicated project

The Creator Fan Hub uses a dedicated Supabase project:

- Project: `Creator-Fan-Hub`
- Project ref: `scxkgybuodhuohcxpfat`
- Last observed platform status: `ACTIVE_HEALTHY`
- Region: `eu-central-1`
- Database: PostgreSQL 17.11.0.003

Do not reuse unrelated Supabase projects.

## Availability and backup protection

- Supabase Free projects can be paused after a week of low database activity. A few genuine database requests per day are usually enough, but Supabase explicitly does not guarantee that this will prevent pausing.
- The existing workflow makes read-only database requests three times daily. This reduces inactivity risk; it cannot override Supabase's platform rules.
- Supabase currently documents a one-year restore window for paused Free projects. This is not permanent protection against account loss or deliberate project deletion.
- The repository includes a weekly encrypted database + Storage backup workflow. Follow [SUPABASE-BACKUP-RESTORE.md](SUPABASE-BACKUP-RESTORE.md) to configure it after implementation is complete.
- GitHub Actions backup artifacts are retained for 14 days only. Download important backups to storage you control before expiry; keep the age private identity offline.
- Supabase Free does not include managed automatic database backups. The owner must retain independent recovery copies and keep the Supabase account in good standing.

## Vercel environment

The development Vercel project has these variables for Preview deployments on the `development` branch:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

The production Vercel project currently has no configured environment variables. The publishable key is intended for browser use; access is constrained by database grants and RLS. Never add a Supabase secret/service-role key to browser code or commit secrets to Git.

LiveKit and TURN variables are not configured in the development preview:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `RAYE2_TURN_URLS`
- `RAYE2_TURN_SHARED_SECRET`

The media worker's `SUPABASE_SERVICE_ROLE_KEY` belongs in its private worker environment. The same server-only key is also used as a restricted GitHub Actions secret by the dedicated encrypted-backup workflow; it must never appear in browser variables, repository files, workflow logs or chat.

## Database migration state — verified 2026-11-15

The repository contains **233 SQL migration files**. The connected live project records **89 applied migration versions**; its newest applied version is `20261102215604`. There are **144 repository migration versions not recorded as applied** in this project. The newest migration file in the repository is `20261111120000`.

This is material schema drift. A green Next.js build does not apply Supabase migrations and does not prove that database-backed features work.

The live project was queried directly. These objects required by newer features were not present:

- Voice: `raye2_voice_sessions`, `raye2_voice_participants`, `raye2_voice_recording_consent_events`
- Sponsorship: `raye2_creator_sponsor_campaigns`, `raye2_platform_sponsor_campaigns`
- Worker queue RPCs: `claim_raye2_media_processing_job`, `complete_raye2_media_processing_job`, `reserve_raye2_worker_thumbnail_capacity`, `release_raye2_worker_thumbnail_capacity`
- Voice RPCs: `raye2_can_moderate_voice_session`, `raye2_start_or_join_group_voice_room`

The live `media_items` table also lacks the newer lease and thumbnail columns required by the worker queue migrations, including `processing_lease_until`, `processing_lease_token`, and `thumbnail_path`.

**Do not apply all pending migrations blindly to the connected project.** First replay the complete migration chain against an isolated local Supabase instance, resolve failures and schema drift, inspect the resulting diff, and test the feature contracts. Only then apply the reviewed sequence to the development project and verify every expected table, column, function, trigger, policy, and storage path. Do not run this sequence against production without explicit owner approval.

## Security advisor snapshot — 2026-11-15

- All 35 public tables have RLS enabled; no public table was found with RLS disabled.
- Seven RLS-enabled tables have no direct table policies. These appear to be intentionally RPC-only/private tables (for example, audit logs, drafts, invitations, votes and upload reservations). No-policy means direct access is denied; verify the intended RPC workflows rather than adding broad table policies.
- The advisor reports seven anon-executable `SECURITY DEFINER` functions. They correspond to public voting, idea submission, approved-idea reads, public poll results and bounded reaction-count reads. Their public exposure is intentional in the current design, but keep input bounds, feature gates and abuse controls.
- The advisor reports 48 authenticated-executable `SECURITY DEFINER` functions. A sample of sensitive creator functions was inspected and contained authentication and/or role checks. The complete function-by-function authorization review remains a release gate.
- Health advisor: no findings.
- Performance advisor: 41 unused-index notices and 21 multiple-permissive-policy notices. These are optimization work, not proof of a security breach.

## Provision the first creator account (owner action)

There is intentionally no public registration. The first creator must be provisioned by the project owner:

1. In Supabase Dashboard, open **Authentication → Users** and create/invite the owner's own account using an email address they control.
2. Copy that account's Auth user UUID.
3. In the Supabase SQL Editor for this dedicated project, run the following after replacing the placeholder with that UUID:

```sql
insert into public.creator_admins (user_id, active)
values ('REPLACE_WITH_OWNER_AUTH_USER_UUID', true)
on conflict (user_id) do update set active = true;
```

4. Complete the Supabase email/password setup, then sign in at `/creator/login` on the development preview.
5. Confirm the Creator Panel loads. Do not share passwords, recovery codes, service-role keys, or other secrets in chat or Git.

The application checks both the authenticated Supabase user and the active `creator_admins` allowlist row on the server. A normal Auth account without that row cannot administer the site.

## Acceptance tests still required

- [ ] Sign in/out and reject a non-allowlisted account.
- [ ] Save a draft, test stale-revision conflict handling, publish, and restore a previous version to draft.
- [ ] Create a poll, cast a vote, reject duplicate votes, close the poll, and verify public result visibility.
- [ ] Submit an idea anonymously, enforce cooldown/rate limits, moderate it, and verify public visibility.
- [ ] Upload media, verify owner scoping, publish/unpublish, and delete only eligible private media.
- [ ] Apply and verify the reviewed media-processing migrations; run a real upload through claim, processing, HLS storage and completion.
- [ ] Apply and verify voice migrations; test LiveKit join, moderation, TURN relay and reconnect on multiple devices.
- [ ] Apply and verify sponsorship migrations; prove campaign review, delivery and ledger flows with test assets.
- [ ] Create/update events and social links and verify their public visibility.
- [ ] Test maintenance mode and each feature flag with missing/disabled public config.
- [ ] Run mobile/browser accessibility checks and review Supabase Security Advisor output.

## Release discipline

- Keep development preview isolated from production.
- Keep production environment variables and deployment settings separate from Preview.
- Do not promote to production until migrations, providers and real-account acceptance tests pass and the owner explicitly approves the release.

# Supabase setup — current project state

## Dedicated project
The Creator Fan Hub has a dedicated Supabase project:
- Project: `Creator-Fan-Hub`
- Project ref: `scxkgybuodhuohcxpfat`
- Project status: `ACTIVE_HEALTHY`
- Preview branch: `development`

Do not reuse unrelated Supabase projects.

## Vercel environment
The following environment variables are configured for the Vercel Preview target on the `development` Git branch:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

They are not configured for Production. The publishable key is intended for browser use; access is constrained by database grants and RLS. Never add a Supabase secret/service-role key to browser code or commit secrets to Git.

## Database state
The schema and reviewed migrations are in `supabase/migrations/`. The dedicated live project has applied the initial schema and the subsequent feature/security migrations, including:
- Public poll aggregation, voting, and visibility gates.
- Anonymous idea submission and moderation.
- Creator poll, event, social-link, and media management.
- Draft/publish version history and restore-to-draft.
- Media metadata ownership.
- Fail-closed public feature gates.

The public config snapshot currently exists at version 3, with maintenance mode disabled. The content tables are currently empty; this is a clean initial state, not proof of end-to-end workflow acceptance.

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
- Sign in/out and reject a non-allowlisted account.
- Save a draft, test stale-revision conflict handling, publish, and restore a previous version to draft.
- Create a poll, cast a vote, reject duplicate votes, close the poll, and verify public result visibility.
- Submit an idea anonymously, enforce cooldown/rate limits, moderate it, and verify public visibility.
- Upload media, verify owner scoping, publish/unpublish, and delete only eligible private media.
- Create/update events and social links and verify their public visibility.
- Test maintenance mode and each feature flag with missing/disabled public config.
- Run mobile/browser accessibility checks and review Supabase Security Advisor output.

## Release discipline
- Keep development preview isolated from production.
- Do not promote to production until the owner has completed the acceptance tests and explicitly approved the release.

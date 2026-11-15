# Owner setup and release checklist

This guide is for the site owner or a trusted Supabase project administrator. Do not send passwords, API secrets, service-role keys or private authentication links in chat. Do not commit credentials or secrets to Git.

## 1. Configure the Supabase project

1. Open the dedicated Supabase project connected to the Creator Fan Hub.
2. In **Project Settings → API**, copy the Project URL and the publishable key.
3. Add those two values to the Vercel project's Environment Variables for Preview and Production as appropriate:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. For local development, put the same development-project values in `.env.local`, which must remain untracked.
5. Do not add a service-role or secret key to `.env.example`, browser code, GitHub Actions or the public client.

The app uses the publishable key with RLS and guarded database functions. A secret key is not required for normal browser or server-session access.

## 2. Create the owner login

1. In Supabase **Authentication → Users**, create the owner's user account. Use an email address controlled by the owner and a unique, strong password.
2. Complete any email confirmation required by the project's Auth settings.
3. Copy the exact **User UID** shown for that newly created account.
4. Open the Supabase SQL Editor using an administrator account.
5. Review the UUID carefully, then run the following statement after replacing the placeholder with the owner's actual Auth user UUID:

```sql
insert into public.creator_admins (user_id, active)
values ('REPLACE-WITH-OWNER-AUTH-USER-UUID'::uuid, true)
on conflict (user_id)
do update set active = true;
```

This allowlist is the authorization source of truth. The owner must not use a public registration form; none is provided. Do not add a user based only on an email address or a display name.

To revoke access, run the following with the same verified UUID:

```sql
update public.creator_admins
set active = false
where user_id = 'REPLACE-WITH-OWNER-AUTH-USER-UUID'::uuid;
```

## 3. Verify access boundaries

1. Open `/creator/login` on the Vercel preview and sign in as the owner.
2. Confirm the dashboard opens and can load its draft and management sections.
3. Sign out.
4. Sign in using a separate authenticated account that is not in `creator_admins`. A non-allowlisted account must be redirected to the login page with an access-restricted message. It must not load creator data or perform creator mutations.
5. Open public pages in a private/incognito browser. Public voting and idea submission should work without a visitor account, subject to their feature flags and published configuration.
6. Confirm an anonymous user cannot call creator delete, reorder, publish, restore or media-management RPCs.

Never temporarily grant broad table access to make a test pass. Test using the existing RLS policies and guarded RPCs.

## 4. Configure Auth URLs and account recovery

- Set the Supabase Auth Site URL to the production domain when production is approved.
- Add the exact preview and production callback/redirect URLs required by the Supabase Auth configuration.
- Keep public sign-up disabled unless the product owner explicitly changes the access model and a separate abuse/security review approves it.
- Use Supabase's trusted dashboard process for password resets or account recovery; this app does not provide public registration or a self-service password-reset flow.
- Enable multi-factor authentication for the owner where supported by the project's Auth settings.

## 5. Configure realtime voice providers (development only)

Group voice uses LiveKit server-side token generation. The current development preview does not have the required provider variables, so the group-voice token route returns a controlled `503` until they are configured.

After selecting and provisioning a LiveKit endpoint, configure these variables on the Vercel **Preview** target for the `development` branch:

- `LIVEKIT_URL` — WebSocket endpoint for the LiveKit deployment.
- `LIVEKIT_API_KEY` — server-side API key.
- `LIVEKIT_API_SECRET` — server-side secret; never prefix it with `NEXT_PUBLIC_`.

For reliable peer-to-peer private calls across restrictive networks, configure a TURN provider and set:

- `RAYE2_TURN_URLS` — comma-separated TURN/TURNS URLs.
- `RAYE2_TURN_SHARED_SECRET` — server-only shared secret used to mint short-lived credentials.

Do not paste provider secrets into chat or commit them to Git. Enter them directly in the provider dashboard and Vercel environment settings. Confirm provider pricing/limits before enabling any service; no paid provider should be activated without owner approval. Do not configure Production until the development integration passes multi-device tests and production is explicitly approved.

## 6. Configure the self-hosted media worker

The worker is a separate long-running process; a Vercel deployment does not run it. It requires:

- The development Supabase project URL.
- `SUPABASE_SERVICE_ROLE_KEY` in the private worker environment only.
- Node.js 22, FFmpeg/FFprobe, and the repository's worker image.

Do not put the service-role key in Vercel's `NEXT_PUBLIC_*` variables, repository files, workflow logs, issues, or chat. The only GitHub Actions use is the dedicated encrypted-backup workflow, where it must be stored as the restricted `SUPABASE_SERVICE_ROLE_KEY` Actions secret and is not passed to ordinary CI jobs. The development database must first receive the reviewed media-processing and worker-queue migrations. The worker should remain stopped until those migrations and the end-to-end upload/HLS test pass.

## 7. Final acceptance checklist

- [ ] Owner can sign in, refresh the dashboard, and sign out.
- [ ] A non-allowlisted authenticated account is denied.
- [ ] Draft save detects stale revisions.
- [ ] Publish creates a versioned public snapshot.
- [ ] Restore changes only the private draft until the owner publishes it.
- [ ] Public poll voting accepts a nickname only (no visitor account), and duplicate browser tokens are handled.
- [ ] Voter nicknames are visible only to the authorized creator; anonymous visitors cannot call the voter-list RPC.
- [ ] Public idea submission works without requiring a display name.
- [ ] Idea moderation is creator-only.
- [ ] Media upload, publish, unpublish and delete work for the owner.
- [ ] Cross-owner media access is denied.
- [ ] Event and social-link create, edit, publish, reorder and delete flows work.
- [ ] Voice works through LiveKit and TURN on multiple real devices, including reconnect and moderator removal.
- [ ] Media worker completes a real test upload, generates thumbnails and HLS, and records a successful lease completion.
- [ ] Sponsorship review and delivery are tested with clearly disclosed test assets; no external ad network is claimed as connected until provider integration is verified.
- [ ] Mobile and desktop layouts are checked in a real browser.
- [ ] Supabase Security Advisor findings are reviewed after the final schema change.
- [ ] GitHub validation and Free CI pass on the exact release commit.
- [ ] Vercel preview is READY for the exact release commit.
- [ ] The owner explicitly approves the merge to `main` and production deployment.

A green CI run and a READY preview are necessary but do not replace these real-account acceptance checks.

## 8. Add operational credentials at the end

Do this only after the implementation and tests are ready. Add credentials directly in the relevant provider dashboards; never paste them into chat or commit them.

### GitHub Actions → Secrets

- `SUPABASE_ACCESS_TOKEN` — used only by the manually triggered development migration gate.
- `SUPABASE_DB_PASSWORD` — password for the dedicated development database, used only by that migration gate.
- `SUPABASE_DB_URL` — PostgreSQL connection string used only by the encrypted backup workflow.
- `SUPABASE_SERVICE_ROLE_KEY` — server-only key used by the backup workflow and, separately, the private media-worker environment. It must never be exposed to browser code or ordinary CI.

### GitHub Actions → Variables

- `RAYE2_BACKUP_AGE_RECIPIENT` — age public recipient used to encrypt backups. Keep the matching private identity offline in at least two safe places.

### Vercel environment variables

The development Preview already has the Supabase URL and publishable key. Add provider variables only after a free, reachable host has been selected and tested:

- `LIVEKIT_URL`
- `LIVEKIT_API_KEY`
- `LIVEKIT_API_SECRET`
- `RAYE2_TURN_URLS`
- `RAYE2_TURN_SHARED_SECRET`

Do not configure Production until the development integration passes and the owner explicitly approves a release.

### Hosting requirement

The media worker, LiveKit and TURN need an always-on reachable machine with sufficient CPU, RAM, disk, network bandwidth and public connectivity. Open-source components have no licence fee, but a continuously available server is not guaranteed free. If no free host is available, leave processing queued and group voice disabled rather than enabling a paid service or pretending the integration is live.

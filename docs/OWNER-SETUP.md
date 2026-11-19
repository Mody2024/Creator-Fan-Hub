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

## 3. Enable Google sign-in (one-time provider setup)

The Creator login now starts a Supabase Google OAuth flow and returns through `/auth/callback`. The callback exchanges the one-time PKCE code, checks that the identity is Google-backed, and requires Supabase to report a confirmed email. The Creator page then performs its existing server-side allowlist check. Google authentication alone never grants Admin or Studio privileges.

1. In Google Cloud Console, create or select a project and configure an **OAuth client ID** with application type **Web application**.
2. In Supabase **Authentication → Providers → Google**, enable Google and enter the OAuth client ID and client secret from Google. Save them only in the Supabase dashboard; never commit or paste the secret into chat.
3. In the Google OAuth client's **Authorized redirect URIs**, add this exact Supabase callback: `https://scxkgybuodhuohcxpfat.supabase.co/auth/v1/callback`. This is Google's callback into Supabase, not the Raye2 app callback.
4. In Supabase **Authentication → URL Configuration → Redirect URLs**, add `https://*-modytupegaming-9846.vercel.app/**` for development previews and `http://localhost:3000/**` for local development. Add the exact final production callback `https://YOUR-PRODUCTION-DOMAIN/auth/callback` only after the production domain is approved. The app callback path is `/auth/callback`. Supabase documents the `https://*-<team-or-account-slug>.vercel.app/**` pattern for Vercel previews.
5. Keep the Supabase Site URL set to the approved canonical site URL. Do not switch it to a temporary deployment.
6. Save the provider settings and test on the development preview first. Choose the Google account, complete Google's own verification/consent screens, and confirm the browser returns to `/creator`.
7. Confirm the owner UID is still active in `public.creator_admins`. A different Google account should authenticate but be denied access unless its exact Auth UID is separately authorized by the owner.

If the Google button reports provider configuration is missing, recheck that Google is enabled in Supabase and that the Supabase redirect allow-list exactly matches the app callback. If Google rejects the redirect, recheck the Supabase callback URI in Google Cloud Console.

## 4. Verify access boundaries

1. Open `/creator/login` on the Vercel preview and sign in as the owner using Google or email/password.
2. Confirm the dashboard opens and can load its draft and management sections.
3. Sign out.
4. Sign in using a separate authenticated account that is not in `creator_admins`. A non-allowlisted account must be redirected to the login page with an access-restricted message. It must not load creator data or perform creator mutations.
5. Open public pages in a private/incognito browser. Public voting and idea submission should work without a visitor account, subject to their feature flags and published configuration.
6. Confirm an anonymous user cannot call creator delete, reorder, publish, restore or media-management RPCs.

Never temporarily grant broad table access to make a test pass. Test using the existing RLS policies and guarded RPCs.

## 5. Configure Auth URLs and account recovery

- Set the Supabase Auth Site URL to the production domain when production is approved.
- Add the exact preview and production callback/redirect URLs required by the Supabase Auth configuration.
- Keep public sign-up disabled unless the product owner explicitly changes the access model and a separate abuse/security review approves it.
- Use Supabase's trusted dashboard process for password resets or account recovery; this app does not provide public registration or a self-service password-reset flow.
- Enable multi-factor authentication for the owner where supported by the project's Auth settings.

## 6. Final acceptance checklist

- [ ] Owner can sign in with Google and email/password, refresh the dashboard, and sign out.
- [ ] Google callback rejects missing codes, non-Google identities and unconfirmed email accounts.
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
- [ ] Mobile and desktop layouts are checked in a real browser.
- [ ] Supabase Security Advisor findings are reviewed after the final schema change.
- [ ] GitHub validation and Free CI pass on the exact release commit.
- [ ] Vercel preview is READY for the exact release commit.
- [ ] The owner explicitly approves the merge to `main` and production deployment.

A green CI run and a READY preview are necessary but do not replace these real-account acceptance checks.

# Supabase setup

Supabase is the planned backend for the Creator Fan Hub. The app uses the publishable key in server/browser clients and never requires a secret key in browser code.

## Project selection
Two Supabase projects are currently visible to the connected account: `Eldukkan` (active) and `SKL27` (inactive). Neither has been changed for Creator Fan Hub. Do not reuse either automatically; create/select a dedicated project for this site after choosing the organization and checking project cost.

## Environment
Set in Vercel's protected environment settings:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

A server-only secret key may be added later only if a specific trusted server operation requires it. Never use a `NEXT_PUBLIC_` prefix for secrets. Do not commit real values.

## Public page behavior
The Next.js public page reads only `published_site_config.published` and uses a safe static fallback when credentials are absent or the row is unavailable. Draft data is never read by the public page.

## Next integration steps
1. Create/select a dedicated project and configure environment variables.
2. Apply reviewed schema/RLS migrations to that dedicated project only.
3. Test anonymous reads with RLS enabled.
4. Implement admin sign-in and verify JWT claims server-side.
5. Add authenticated draft editing and a transactional publish adapter.
6. Add server-validated vote/idea submission handlers and rate limiting.
7. Run Supabase security advisors and end-to-end tests before launch.

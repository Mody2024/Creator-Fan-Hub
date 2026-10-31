# Creator Fan Hub

A creator-community website with a public fan experience and a private Creator Panel.

## Project status

- Active implementation branch: `development`
- Production branch: `main` (kept separate until owner acceptance)
- Preview deployment: Vercel project `creator-fan-hub-dev`
- Backend: Supabase Auth, PostgreSQL, Row Level Security, guarded RPCs and Storage
- Runtime: Next.js 15 / React 19 / Node.js 22
- Cost target: use the free GitHub, Vercel and Supabase tiers; no paid AI API is required.

The current development build includes public voting with nickname-only participation (no visitor account), idea submission, configurable site identity and appearance, a private Creator Panel, poll and idea moderation, media management, events, social links, publishing history and draft restoration. Voter nicknames are visible only to the authorized creator; public results expose aggregate counts only.

A passing build or READY preview is not the same as owner acceptance. Do not merge to `main` or deploy production until the launch gates below are completed.

## Development

1. Use Node.js 22.
2. Copy `.env.example` to `.env.local`.
3. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` from the dedicated Supabase project.
4. Install dependencies with `npm install`.
5. Run `npm run dev`.

Useful checks:

- `npm test` — automated unit and source-contract tests.
- `npm run check` — static integration and configuration validation.
- `npx tsc --noEmit` — TypeScript check.
- `npm run lint` — ESLint.
- `npm run build` — production build.

## Creator access setup

There is no public registration route. The owner must create the creator user in Supabase Auth, then add that exact Auth user UUID to the private `public.creator_admins` allowlist. Follow [the owner setup and release checklist](docs/OWNER-SETUP.md).

The Creator Panel verifies the signed-in identity server-side and checks the active allowlist. Never add a user based only on an email supplied by an untrusted visitor. Never commit passwords, service-role keys, access tokens or real environment values.

## Deployment workflow

- Make and review changes on `development`.
- Require both GitHub Actions workflows to pass.
- Inspect the Vercel preview associated with the exact development commit.
- Complete anonymous and authenticated acceptance tests.
- Have the owner explicitly approve a reviewed merge to `main`.
- Deploy production only after approval and a final production-environment check.

## Security principles

- Public browser code receives only the Supabase URL and publishable key.
- Row Level Security and narrowly granted RPCs protect database access.
- Creator RPCs verify an authenticated active creator in the database.
- Drafts and historical versions remain private until explicitly published.
- Never put a Supabase secret/service-role key in browser code, Git, or chat.
- Do not create a test owner or seed credentials in the repository.

## Product requirements

- Responsive mobile and desktop experience.
- Premium, creator-led visual identity without generic AI-themed styling.
- The permanent `MADE BY ALMUDDATHTHIR` credit remains in the shared public layout.
- Public voting and idea submission do not require visitor accounts.
- Creator-only controls stay behind Supabase Auth and the active creator allowlist.

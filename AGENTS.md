# AGENTS.md — Creator-Fan-Hub (Raye2)

Persistent, repository-specific knowledge for agents working in this repo.

## Project shape

- Next.js (App Router) + Supabase (Postgres, RLS, `SECURITY DEFINER` RPCs) + TypeScript.
- UI is bilingual EN/AR. Locale comes from the `nhen_locale` cookie; components read it in a
  `useEffect` and pick a `t = isArabic ? {...} : {...}` string table. Add both languages together.
- All DB changes are forward-only SQL migrations in `supabase/migrations/` named
  `YYYYMMDDHHMMSS_description.sql`. Never edit an applied migration; add a new one.
- Verification credit requires actually running the code against a live stack, not just authoring it.

## Gates (run before every commit)

```bash
npm run check     # static repository validation (assertion count grows each batch)
npm test          # node --test, all tests/*.test.mjs
npx tsc --noEmit  # typecheck
npm run lint      # eslint (warnings are pre-existing; 0 errors expected)
npm run build     # next build
```

## Live DB verification (the important part)

```bash
npx --yes supabase@latest start          # local stack; API at http://127.0.0.1:54321
npx --yes supabase@latest db reset --no-seed   # applies every migration from scratch
npx --yes supabase@latest stop --no-backup
```

Then drive the real HTTP/PostgREST surface with real JWTs (`@supabase/supabase-js`):
create users with the service-role `auth.admin.createUser`, sign them in for `authenticated`
clients, and use a bare anon client to assert denial. Delete throwaway matrix scripts after use.
The demo anon/service keys are the standard local ones (`iss: supabase-demo`).

## Security invariants (do not weaken)

- RPCs are `SECURITY DEFINER` with `set search_path = ''` and fully-qualified `public.` refs.
  Reference `auth.uid()` as `(select auth.uid())` so the planner caches it.
- Creator-only RPCs are granted to `authenticated` and revoked from `public, anon`.
  Public read RPCs may be granted to `anon, authenticated`.
- `public.is_member_blocked(uuid)` execute is revoked from `public, anon` by design
  (locked by `tests/site.test.mjs`), so anonymous community feed reads are denied intentionally.

## Creator authorization gotcha (cost real time once)

Two different creator guards exist and they are NOT equivalent:

- `public.is_active_creator()` — true for any active row in `creator_admins`
  (roles: owner/admin/creator/editor/moderator/analyst). Its execute is revoked from anon.
- `public.can_edit_creator_content()` — true only for owner/admin/editor.
  Existing poll RPCs (`create_creator_poll`, `set_creator_poll_status`) use THIS one.

New creator-authoring RPCs must use `public.can_edit_creator_content()` to match the existing
poll/idea surface. When seeding a creator in a live test, insert
`creator_admins { active: true, role: 'owner' }` (role `creator` is NOT sufficient for
`can_edit_creator_content()`).

## Progress tracking

`docs/RAYE2-IMPLEMENTATION-PROGRESS.md` is the running log. Append a section per batch with the
concrete defects live execution caught, the behavioral-matrix result, the gate results, and a
progress estimate. Keep `main` untouched; work on `development`.

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

## Anon-policy helper revokes are an outage class (hit twice)

Several hardening migrations revoked `execute` on SECURITY DEFINER helpers from `anon`, but those
helpers are called inside **anon SELECT policies**. When that happens every anonymous read of the
affected table fails with `permission denied for function <name>` and the surface renders empty.
Observed so far: `is_active_creator`, `can_view_creator_workspace`, `is_member_blocked`, and
`private.can_moderate_community` (the last also needs `grant usage on schema private to anon`).

Rule of thumb: a helper that appears in a `for select to anon` policy must be executable by anon.
Granting is safe when the helper returns a caller-scoped answer (anon has no `auth.uid()`, so
member/creator/moderation checks return false and reveal nothing). When a policy also reads a
member-only table directly (e.g. `member_blocks`), move that read into a SECURITY DEFINER helper.

Fast way to find these: for each anon-readable table, `select * limit 1` as anon and grep the error
for `permission denied for function`. Tables that legitimately deny anon show `permission denied for
table` instead — those are fine.

## Local watch pages 404 by design

`src/app/watch/[slug]/page.tsx` requires the resolved storage public URL to be `https:`
(`if(parsedPublicUrl.protocol!=="https:")notFound()`). A local Supabase stack serves
`http://127.0.0.1:54321/storage/...`, so the watch page always 404s locally. Do not treat that as a
regression; verify watch behaviour at the RPC/RLS layer and via validator/tests instead.

## Live Supabase verification

`npx supabase@latest db reset --no-seed` reapplies the whole migration chain locally. Use it to
prove new migrations and to run behavioral matrices with the anon + service-role keys from
`supabase status`. Docker socket perms may need fixing for uid 10001 first.

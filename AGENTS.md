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

## Test-setup gotchas (cost real time)
- Profiles are auto-created on signup: do NOT insert into `member_profiles` (PK conflict on `user_id`); `update` the handle/visibility instead.
- `video_reactions.reaction` is restricted to `spark,orbit,legend,laugh,mindblown,support` (later migration overrides the original `like`), so seeding reactions with `like` fails the check.
- `raye2_cleanup_jobs` requires `requested_by` and a `reason` (3-500 chars) on insert; create a preview row directly, then queue/run via RPC.
- Native uploads: `media_items.processing_status` defaults to `uploaded`; the catalog read policy and `raye2_validate_watch_source` require `ready`, so tests must `update` it to `ready`.
- Seed users with `admin.auth.admin.createUser` (service role) and use the same JWT to `signInWithPassword` on the anon client.

## SECURITY DEFINER video-read invariant
Any `SECURITY DEFINER` function that reads `public.video_catalog` must apply `public.raye2_can_view_video(vc.media_id)` (viewer-scoped, honours `auth.uid()`), because it bypasses the catalog RLS policy. A sweep script (last definition of each function, flag those with `video_catalog` but no `raye2_can_view_video`/`raye2_video_accessible`) catches regressions; only role-scoped/self-scoped functions should remain flagged.

## Schema gotchas found this session
- `raye2_messages` uses `sender_id`, not `author_id`. A shared BEFORE INSERT trigger (`raye2_enforce_restrictions`) read `new.author_id` on it and broke ALL messaging with `42703`. When a trigger is shared across tables, resolve the actor column per `tg_table_name`.
- `raye2_platform_rules.category` is a check constraint (`roles,content,chat,groups,voice,recording,watch,watch_together,retention,storage,safety`). New rule categories need the constraint extended first.
- `creator_admins` has only `(user_id, active, created_at)` — no `email` column; inserts that include `email` silently fail schema-cache validation. Tier comes from `raye2_creator_tier` (owner/admin→combined, creator→creator, streamer→streamer, else none).
- `raye2_creator_usage` returned NULL for streams/minis/moments, making those quota checks dead (they guard on `v_used is not null`); now counts streams (`raye2_live_streams`), Mini's (`raye2_minis`) and Moments (`community_posts.is_moment`).
- `community_short_comments` insert policy requires `status='pending'` (Shorts comments are moderated), unlike `community_short_videos` which publishes instantly.

## Expiry jobs need a caller
Retention/expiry RPCs (`raye2_expire_minis`, `raye2_expire_moments`) only mark rows expired; nothing runs them automatically. `raye2_run_maintenance()` consolidates them and is invoked best-effort from `/community` (and available to a scheduled job). Scheduled posts/polls already self-heal on their own read paths.

## Raye2 Smart Advertising Director — gotchas
- Sponsor campaigns are created as **drafts** and only activated by a **trusted (service-role) delivery gate**.
  The lifecycle guard (`raye2_guard_creator_sponsor_campaign_lifecycle`) permits `auth.uid() is null`, but the
  content validator (`raye2_validate_creator_sponsor_campaign`) originally rejected it — activation was impossible.
  Both must allow the null-session gate while still validating content. Platform campaigns activate via an admin
  client (`draft` → `active`); creator campaigns activate via service-role.
- Ad placement caps must be a deterministic `union all` with an explicit priority column (`order by q.prio`),
  otherwise a plain `union all … limit 1` may return the platform row over the creator contract.
- Auto-generated `provider_event_id` must include `clock_timestamp()`/`random()`; a date-granular id makes the
  `(provider_key, provider_event_id)` unique constraint collapse distinct impressions.
- Any new `SECURITY DEFINER` function needs an explicit `grant execute` (the validator test in `tests/site.test.mjs`
  fails otherwise); `raye2_pick_ad_sponsor` is internal and is granted to `service_role` only.

## Raye2 live advertising & sponsor integrity — gotchas
- Live sponsor placement must **fail safe**: return nothing when the stream is not live, the provider cannot
  support compliant insertion, or health is offline/reconnecting. Provider capability is admin-only and audited
  (`raye2_set_live_provider_capability`); never invent it.
- The context replay bridge is DVR-gated: live replay seconds are 0 unless `live_dvr_capable` is true.
- Creator video contracts bind to a video, not a stream, so live uses platform campaigns only
  (`raye2_pick_live_ad_sponsor`).
- `v_reasons := v_reasons || 'x'` on a `text[]` is malformed in PL/pgSQL; use `array_append(v_reasons,'x')`.
- Invalid delivery events (`invalid=true`, admin-only via `raye2_flag_invalid_traffic`) must be excluded from
  every cap count (`and not e.invalid`), or an invalidated impression still consumes the daily/lifetime cap.
- Sponsor reporting must never fabricate figures: `raye2_creator_monetization_report` reports
  `payout_status='not_configured'` and `viewer_identity_data_exposed=false`.

## Raye2 community clips — gotchas
- Community clips are a distinct table from Mini's; the clip is an independent uploaded asset with preserved
  source attribution so it survives source deletion for its own lifetime.
- `media_items.allow_clipping` gates clipping; disabling it must both reject new publishing and mark existing
  clips `removed`, and the public feed must re-check it so disabled clips disappear.
- Reporting (`content_reports`) read-back after insert fails RLS for ordinary reporters (only moderators can
  select). Insert without `.select()`; verify persistence with the service role.
- When adding columns to the watch page's `video_catalog ... media_items!inner(...)` select, update the
  `tests/raye2-watch-video-access.test.mjs` exact-string assertion too.

## Raye2 achievements — gotchas
- `position` is a reserved word and cannot be a bare `returns table` column name; use `sort_position`.
- `achievement_catalog` rows with null metric/threshold keep the legacy unconditional award path; only
  criteria-bearing codes are gated by measurement and good standing.
- Anti-abuse (`raye2_member_in_good_standing`) checks active profile + not blocked by anyone + no open profile
  reports; a blocked member must never receive a trust-gated achievement.

## Raye2 events — gotchas
- Event Q&A answers are restricted to an event host (`event_hosts`) or authorized creator
  (`can_edit_creator_content`); the public read must expose the question, its author and the host answer.
- The attached event space is the event's existing group conversation (`events.conversation_id`), so chat,
  voice and Watch Together reuse `raye2_conversations`/`raye2_groups`; attaching requires membership in that
  conversation. `raye2_get_public_events` returns the group slug via a join on `conversation_id -> group_id`.
- Signup auto-creates `member_profiles` rows, so test fixtures must upsert (not insert) profiles to set a
  display name.

## Raye2 admin moderation — gotchas
- The unified queue reads both `content_reports` (target_id is text) and `raye2_safety_reports` (target_id is
  uuid); cast the uuid to text in the union so the columns line up.
- Resolution must delegate to the existing audited RPCs (`raye2_resolve_content_report`,
  `raye2_resolve_safety_report`) so audit entries and semantics stay identical; do not re-implement them.
- A `with bounded as (...)` CTE referenced only in `limit` must not be cross-joined into a `select *` — the
  extra `lim` column breaks the function's declared return type. Use `select q.*` from a subquery instead.

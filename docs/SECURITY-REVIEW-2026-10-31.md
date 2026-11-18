# Supabase security review — 2026-10-31

## Scope
Reviewed the dedicated Supabase project `scxkgybuodhuohcxpfat`, the checked-in SQL migrations, Creator Panel RPC call sites, and the current Supabase Security Advisor output. This is a source/grant review, not a penetration test or authenticated browser acceptance test.

## Verified authorization model
- Creator access is an explicit `public.creator_admins` allowlist tied to Supabase Auth user IDs.
- The internal `public.is_active_creator()` helper is not directly executable by `public`, `anon`, or `authenticated`; it is reserved for trusted function execution.
- Creator RPCs use `SECURITY DEFINER`, an empty `search_path`, and in-function authentication/active-creator checks. Media metadata operations additionally bind records and storage paths to `auth.uid()`.
- Private and public storage mutation policies bind each creator to their own UUID folder.
- Public community RPCs are intentionally separate: approved-idea reads, aggregate poll results, anonymous voting, and anonymous idea submissions. They use empty search paths, explicit grants, published feature/maintenance gates, bounded inputs, and token hashing/rate limits as applicable.
- Anonymous vote tokens are browser-generated and hashed before persistence. This limits casual duplicate submissions from one browser profile; it is not identity verification and can be bypassed by a determined visitor using another browser/profile.

## Security Advisor interpretation
- Five `rls_enabled_no_policy` INFO findings relate to private tables: `admin_audit_log`, `ideas`, `poll_votes`, `published_site_config_versions`, and `site_config_drafts`. No direct table policies are intended; access is routed through narrowly scoped RPCs and grants.
- Four anonymous SECURITY DEFINER warnings are expected for the public community RPC allowlist: `cast_public_poll_vote`, `get_public_approved_ideas`, `get_public_poll_results`, and `submit_public_idea`. Their definitions and explicit grants were reviewed. These warnings must be re-reviewed if any public function body or grant changes.
- Authenticated SECURITY DEFINER warnings include creator RPCs. They must remain guarded by active-creator checks; ordinary authenticated users without an active allowlist row should not gain creator access.
- Performance Advisor currently reports unused indexes. The project is in a clean/low-traffic state, so do not drop indexes based only on zero usage before production traffic exists.

## Test coverage added
`tests/security-definer-contracts.test.mjs` checks:
- Creator RPCs keep empty search paths and active-creator authorization.
- The internal authorization helper is not callable by client roles.
- Only the intended public community RPCs are publicly executable.
- Public voting and idea submissions remain feature-gated and bounded.
- Media metadata and storage paths remain owner-scoped.

These are migration/source contract tests. They do not replace live role-based tests with a real anonymous session and a real non-allowlisted authenticated user.

## Release blockers
1. Provision the owner's Auth account and activate exactly that user in `creator_admins`.
2. Verify a non-allowlisted signed-in account receives no Creator Panel access.
3. Verify public poll and idea flows with an anonymous browser session.
4. Verify owner media upload/publish/unpublish/delete and cross-owner denial.
5. Re-run Security Advisor after final schema changes and review every changed finding.
6. Complete mobile/desktop acceptance before production release.

No passwords, service-role keys, or other secrets belong in Git or chat.

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261111040000_raye2_account_sessions.sql"),
  read("../src/app/account/account-settings.tsx")
]);

test("members can list their own sessions without exposing network addresses", () => {
  assert.match(migration, /create or replace function public\.raye2_my_sessions\(\)/);
  assert.match(migration, /from auth\.sessions s/);
  assert.match(migration, /where s\.user_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /auth\.jwt\(\) ->> 'session_id'/);
  // The network address must never be selected or returned.
  assert.doesNotMatch(migration, /s\.ip\b|ip_address/i);
  assert.match(migration, /grant execute on function public\.raye2_my_sessions\(\) to authenticated/);
});

test("session revocation is ownership-scoped and audited", () => {
  assert.match(migration, /create or replace function public\.raye2_revoke_my_session\(p_session_id uuid\)/);
  assert.match(migration, /delete from auth\.sessions where id = p_session_id and user_id = v_uid/);
  assert.match(migration, /create or replace function public\.raye2_revoke_other_sessions\(\)/);
  assert.match(migration, /where user_id = v_uid and \(v_current is null or id <> v_current\)/);
  assert.match(migration, /'user_session_revoked'/);
  assert.match(migration, /'user_sessions_revoked_others'/);
  // Only authenticated members may call the revokers.
  assert.match(migration, /grant execute on function public\.raye2_revoke_my_session\(uuid\) to authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_revoke_other_sessions\(\) to authenticated/);
});

test("account settings surface the sessions list and controls", () => {
  assert.match(client, /raye2_my_sessions/);
  assert.match(client, /raye2_revoke_my_session/);
  assert.match(client, /raye2_revoke_other_sessions/);
  assert.match(client, /sessions: "Devices & sessions"/);
  assert.match(client, /sessions: "الأجهزة والجلسات"/);
});

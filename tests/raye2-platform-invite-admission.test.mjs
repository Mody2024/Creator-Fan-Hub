import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, community, admin] = await Promise.all([
  read("../supabase/migrations/20261126120000_raye2_platform_invite_admission.sql"),
  read("../src/app/community/community-client.tsx"),
  read("../src/app/creator/raye2/admin-client.tsx")
]);

test("platform invite table stores hashes only and is inaccessible to browser roles", () => {
  assert.match(migration, /create table if not exists public\.raye2_platform_invites/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /alter table public\.raye2_platform_invites enable row level security/);
  assert.match(migration, /revoke all on public\.raye2_platform_invites from anon, authenticated/);
  assert.doesNotMatch(migration, /grant .* on public\.raye2_platform_invites to authenticated/);
});

test("Before User Created hook fails closed and atomically consumes a matching invitation", () => {
  assert.match(migration, /function public\.raye2_before_user_created\(event jsonb\)/);
  assert.match(migration, /raw_user_meta_data'->>'raye2_access_invite'/);
  assert.match(migration, /encode\(extensions\.digest\(v_token,'sha256'\),'hex'\)/);
  assert.match(migration, /for update/);
  assert.match(migration, /v_invite\.revoked_at is not null/);
  assert.match(migration, /v_invite\.expires_at <= now\(\)/);
  assert.match(migration, /v_invite\.uses >= v_invite\.max_uses/);
  assert.match(migration, /v_invite\.email <> v_email/);
  assert.match(migration, /set uses=uses\+1/);
  assert.match(migration, /grant execute on function public\.raye2_before_user_created\(jsonb\) to supabase_auth_admin/);
  assert.match(migration, /revoke all on function public\.raye2_before_user_created\(jsonb\) from public,anon,authenticated/);
});

test("platform invite management is owner-gated and auditable", () => {
  assert.match(migration, /not public\.raye2_is_super_admin\(\)/);
  assert.match(migration, /raye2_create_platform_invite/);
  assert.match(migration, /raye2_list_platform_invites/);
  assert.match(migration, /raye2_revoke_platform_invite/);
  assert.match(migration, /platform_invite_created/);
  assert.match(migration, /platform_invite_revoked/);
});

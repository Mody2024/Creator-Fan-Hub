import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, team, settings] = await Promise.all([
  read("../supabase/migrations/20261110670000_raye2_temporary_grants_overrides.sql"),
  read("../src/app/creator/team/team-client.tsx"),
  read("../src/app/account/account-settings.tsx")
]);

test("temporary role grants honour expiry without a write", () => {
  assert.match(migration, /add column if not exists expires_at timestamptz/);
  assert.match(migration, /a\.expires_at is null or a\.expires_at > now\(\)/);
  assert.match(migration, /create or replace function public\.set_creator_admin_expiry\(/);
});

test("account-specific capability overrides are admin-managed and audited", () => {
  assert.match(migration, /create table if not exists public\.raye2_capability_overrides/);
  assert.match(migration, /create or replace function public\.raye2_effective_capability\(/);
  assert.match(migration, /raye2_set_capability_override/);
  assert.match(migration, /capability_override_set/);
});

test("members can see their own capability overrides", () => {
  assert.match(migration, /create or replace function public\.raye2_get_my_capability_overrides\(\)/);
  assert.match(settings, /rpc\("raye2_get_my_capability_overrides"\)/);
});

test("the team UI sets and shows temporary grant expiry", () => {
  assert.match(team, /set_creator_admin_expiry/);
  assert.match(team, /expiresAt/);
});

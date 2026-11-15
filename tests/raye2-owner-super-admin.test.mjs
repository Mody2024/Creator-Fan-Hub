import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, admin, page] = await Promise.all([
  read("../supabase/migrations/20261110700000_raye2_owner_super_admin_separation.sql"),
  read("../src/app/creator/raye2/admin-client.tsx"),
  read("../src/app/creator/raye2/page.tsx")
]);

test("owner and super-admin powers are separated", () => {
  assert.match(migration, /create or replace function public\.raye2_is_super_admin\(\)/);
  assert.match(migration, /create or replace function public\.raye2_admin_capabilities\(\)/);
  assert.match(migration, /a\.role = 'owner'/);
});

test("destructive cleanup and privilege overrides are owner-only", () => {
  const gates = migration.match(/raye2_is_super_admin\(\) then raise exception 'owner access required'/g) ?? [];
  assert.ok(gates.length >= 3, `expected >=3 owner gates, found ${gates.length}`);
  assert.match(migration, /create or replace function public\.raye2_run_cleanup_job\(/);
  assert.match(migration, /create or replace function public\.raye2_set_capability_override\(/);
});

test("override listing stays available to platform admins", () => {
  const body = migration.slice(migration.indexOf("create or replace function public.raye2_list_capability_overrides"));
  assert.match(body, /if not public\.raye2_is_platform_admin\(\)/);
});

test("the admin UI shows the capability matrix and gates destructive run", () => {
  assert.match(admin, /initialCaps/);
  assert.match(admin, /canRunCleanup/);
  assert.match(admin, /runOwnerOnly/);
  assert.match(page, /raye2_admin_capabilities/);
});

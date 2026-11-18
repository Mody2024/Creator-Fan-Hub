import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, page] = await Promise.all([
  read("../supabase/migrations/20261110470000_raye2_admin_dashboards_roles.sql"),
  read("../src/app/creator/raye2/admin-client.tsx"),
  read("../src/app/creator/raye2/page.tsx")
]);

test("platform health is admin-only and classifies storage against rules-engine thresholds", () => {
  assert.match(migration, /create or replace function public\.raye2_get_platform_health\(\)/);
  assert.match(migration, /if not public\.raye2_is_platform_admin\(\) then/);
  assert.match(migration, /storage\.warning\.bytes/);
  assert.match(migration, /storage\.critical\.bytes/);
  assert.match(migration, /when v_total >= v_critical then 'critical'/);
  assert.match(migration, /grant execute on function public\.raye2_get_platform_health\(\) to authenticated/);
});

test("the platform admin roster is admin-only and joins member profiles", () => {
  assert.match(migration, /create or replace function public\.raye2_list_platform_admins\(\)/);
  assert.match(migration, /left join public\.member_profiles mp on mp\.user_id = a\.user_id/);
  assert.match(migration, /grant execute on function public\.raye2_list_platform_admins\(\) to authenticated/);
});

test("the admin dashboard renders health and role-management sections", () => {
  assert.match(client, /tab === "health"/);
  assert.match(client, /tab === "roles"/);
  assert.match(client, /rpc\("set_creator_admin_role"/);
  assert.match(client, /rpc\("set_creator_admin_active"/);
  assert.match(client, /initialHealth\.map/);
  assert.match(client, /admins\.map/);
});

test("the admin page loads health and admin roster server-side", () => {
  assert.match(page, /rpc\("raye2_get_platform_health"\)/);
  assert.match(page, /rpc\("raye2_list_platform_admins"\)/);
  assert.match(page, /initialHealth=\{\(health\.data \?\? \[\]\) as HealthRow\[\]\}/);
});

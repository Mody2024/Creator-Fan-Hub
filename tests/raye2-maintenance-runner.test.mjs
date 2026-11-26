import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, hardening, community, minis, clips, moments, client] = await Promise.all([
  read("../supabase/migrations/20261110800000_raye2_maintenance_runner.sql"),
  read("../supabase/migrations/20261126160000_raye2_guard_maintenance_rpcs.sql"),
  read("../src/app/community/page.tsx"),
  read("../src/app/minis/page.tsx"),
  read("../src/app/clips/page.tsx"),
  read("../src/app/moments/page.tsx"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("the maintenance runner consolidates the expiry jobs", () => {
  assert.match(migration, /function public\.raye2_run_maintenance\(\)/);
  assert.match(migration, /public\.raye2_expire_minis\(\)/);
  assert.match(migration, /public\.raye2_expire_moments\(\)/);
});

test("maintenance and scheduled publishing require a platform admin or service role", () => {
  const handlers = migration.match(/exception when others then/g) ?? [];
  assert.ok(handlers.length >= 2, `expected best-effort handlers, found ${handlers.length}`);
  assert.match(hardening, /request\.jwt\.claim\.role/);
  assert.match(hardening, /not public\.raye2_is_platform_admin\(\)/);
  assert.match(hardening, /revoke all on function public\.raye2_run_maintenance\(\) from public, anon/);
  assert.match(hardening, /grant execute on function public\.raye2_run_maintenance\(\) to authenticated, service_role/);
  assert.match(hardening, /revoke all on function public\.raye2_sweep_message_retention\(text\) from public, anon, authenticated/);
  assert.match(hardening, /revoke all on function public\.raye2_sweep_expired_messages\(\) from public, anon, authenticated/);
  assert.match(hardening, /revoke all on function public\.raye2_expire_minis\(\) from public, anon, authenticated/);
  assert.match(hardening, /revoke all on function public\.raye2_publish_due_community_posts\(\) from public, anon/);
});

test("read paths gate global maintenance to platform admins", () => {
  assert.match(community, /raye2_is_platform_admin/);
  assert.match(community, /if \(isPlatformAdmin === true\)[\s\S]*raye2_publish_due_community_posts[\s\S]*raye2_run_maintenance/);
  assert.doesNotMatch(minis, /rpc\("raye2_run_maintenance"\)/);
  assert.match(clips, /raye2_is_platform_admin/);
  assert.match(clips, /if \(isPlatformAdmin === true\) await supabase\.rpc\("raye2_run_maintenance"\)/);
  assert.doesNotMatch(moments, /rpc\("raye2_run_maintenance"\)/);
  assert.match(client, /if \(active && !result.error && result.data === true\) void supabase\.rpc\("raye2_run_maintenance"\)/);
});

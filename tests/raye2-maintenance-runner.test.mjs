import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, community, minis, moments] = await Promise.all([
  read("../supabase/migrations/20261110800000_raye2_maintenance_runner.sql"),
  read("../src/app/community/page.tsx"),
  read("../src/app/minis/page.tsx"),
  read("../src/app/moments/page.tsx")
]);

test("the maintenance runner consolidates the expiry jobs", () => {
  assert.match(migration, /function public\.raye2_run_maintenance\(\)/);
  assert.match(migration, /public\.raye2_expire_minis\(\)/);
  assert.match(migration, /public\.raye2_expire_moments\(\)/);
});

test("each job is best-effort and the runner is callable by any reader", () => {
  const handlers = migration.match(/exception when others then/g) ?? [];
  assert.ok(handlers.length >= 2, `expected best-effort handlers, found ${handlers.length}`);
  assert.match(migration, /grant execute on function public\.raye2_run_maintenance\(\) to anon, authenticated/);
  assert.doesNotMatch(migration, /raye2_run_maintenance\(\) to anon, authenticated;\s*\n\s*revoke/);
});

test("read paths drive the sweep", () => {
  assert.match(community, /raye2_run_maintenance/);
  assert.match(minis, /raye2_run_maintenance/);
  assert.match(moments, /raye2_run_maintenance/);
});

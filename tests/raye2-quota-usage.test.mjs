import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, admin] = await Promise.all([
  read("../supabase/migrations/20261110520000_raye2_quota_usage_rejections.sql"),
  read("../src/app/creator/raye2/admin-client.tsx")
]);

test("quota usage is reported against measurable active rules only", () => {
  assert.match(migration, /create or replace function public\.raye2_get_quota_usage\(\)/);
  assert.match(migration, /create or replace function public\.raye2_quota_used\(/);
  assert.match(migration, /else null/);
  assert.match(migration, /public\.raye2_quota_used\(r\.rule_key, auth\.uid\(\)\) is not null/);
});

test("rejected attempts are logged only when the caller is genuinely over the cap", () => {
  assert.match(migration, /create or replace function public\.raye2_record_quota_rejection\(/);
  assert.match(migration, /if v_used is null or v_limit <= 0 or v_used < v_limit then/);
  assert.match(migration, /create table if not exists public\.raye2_quota_rejections/);
});

test("platform admins can read rejected-attempt totals by rule", () => {
  assert.match(migration, /create or replace function public\.raye2_get_quota_overview\(/);
  assert.match(migration, /count\(distinct q\.user_id\)/);
  assert.match(migration, /raye2_is_platform_admin\(\)/);
});

test("the admin dashboard shows quota usage and rejections", () => {
  assert.match(admin, /rpc\("raye2_get_quota_overview"/);
  assert.match(admin, /loadQuotas/);
  assert.match(admin, /quotas\.map/);
});

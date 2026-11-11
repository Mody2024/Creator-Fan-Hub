import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, admin] = await Promise.all([
  read("../supabase/migrations/20261110580000_raye2_capacity_accounting.sql"),
  read("../src/app/creator/raye2/admin-client.tsx")
]);

test("capacity limits are configurable and usage is measured from real sources", () => {
  assert.match(migration, /create table if not exists public\.raye2_capacity_limits/);
  assert.match(migration, /create or replace function public\.raye2_capacity_used\(/);
  assert.match(migration, /when 'storage_bytes' then/);
  assert.match(migration, /else null/);
});

test("backpressure refuses work before a metric is exhausted", () => {
  assert.match(migration, /create or replace function public\.raye2_assert_capacity\(/);
  assert.match(migration, /create or replace function public\.raye2_enforce_job_capacity\(\)/);
  assert.match(migration, /create trigger raye2_background_jobs_capacity/);
  assert.match(migration, /errcode='53100'/);
});

test("the admin capacity report is gated and tunable", () => {
  assert.match(migration, /create or replace function public\.raye2_get_capacity_report\(\)/);
  assert.match(migration, /create or replace function public\.raye2_set_capacity_limit\(/);
  assert.match(migration, /raye2_is_platform_admin\(\)/);
});

test("the admin dashboard surfaces capacity", () => {
  assert.match(admin, /rpc\("raye2_get_capacity_report"/);
  assert.match(admin, /loadCapacity/);
  assert.match(admin, /capacity\.map/);
});

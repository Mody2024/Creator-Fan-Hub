import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, reporter, admin] = await Promise.all([
  read("../supabase/migrations/20261110570000_raye2_telemetry.sql"),
  read("../src/app/telemetry-reporter.tsx"),
  read("../src/app/creator/raye2/admin-client.tsx")
]);

test("telemetry records client errors, API latency and system events", () => {
  assert.match(migration, /create table if not exists public\.raye2_telemetry_events/);
  assert.match(migration, /create or replace function public\.raye2_record_telemetry\(/);
  assert.match(migration, /'client_error','api_latency','realtime_quality','media_playback','background_job'/);
});

test("telemetry reports latency percentiles and is admin-gated", () => {
  assert.match(migration, /percentile_cont\(0\.95\)/);
  assert.match(migration, /create or replace function public\.raye2_get_telemetry_summary\(/);
  assert.match(migration, /raye2_is_platform_admin\(\)/);
  assert.match(migration, /create or replace function public\.raye2_prune_telemetry\(/);
});

test("the client reports uncaught errors", () => {
  assert.match(reporter, /raye2_record_telemetry/);
  assert.match(reporter, /"unhandledrejection"/);
  assert.match(reporter, /addEventListener\("error"/);
});

test("the admin dashboard surfaces telemetry", () => {
  assert.match(admin, /rpc\("raye2_list_telemetry_events"/);
  assert.match(admin, /rpc\("raye2_get_telemetry_summary"/);
  assert.match(admin, /telemetry\.map/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, admin] = await Promise.all([
  read("../supabase/migrations/20261110500000_raye2_cleanup_execution.sql"),
  read("../src/app/creator/raye2/admin-client.tsx")
]);

test("cleanup jobs have a queue/run/cancel lifecycle with audit entries", () => {
  assert.match(migration, /create or replace function public\.raye2_queue_cleanup_job\(/);
  assert.match(migration, /create or replace function public\.raye2_run_cleanup_job\(/);
  assert.match(migration, /create or replace function public\.raye2_cancel_cleanup_job\(/);
  assert.match(migration, /'cleanup_job_queued'/);
  assert.match(migration, /'cleanup_job_completed'/);
});

test("cleanup execution deletes only for delete policies and reports item and byte totals", () => {
  assert.match(migration, /create or replace function public\.raye2_cleanup_candidates\(/);
  assert.match(migration, /if v_policy\.expiry_action <> 'delete' then/);
  assert.match(migration, /archived_unsupported/);
  assert.match(migration, /'deleted_items', v_total, 'deleted_bytes', v_total_bytes/);
});

test("a retention sweep preview reports candidates and oldest entries", () => {
  assert.match(migration, /create or replace function public\.raye2_preview_retention_sweep\(\)/);
  assert.match(migration, /where p\.enabled and p\.retention_days is not null/);
  assert.match(migration, /candidates bigint, oldest timestamptz/);
});

test("the admin cleanup tab queues, runs, cancels and previews sweeps", () => {
  assert.match(admin, /"raye2_queue_cleanup_job"/);
  assert.match(admin, /"raye2_run_cleanup_job"/);
  assert.match(admin, /"raye2_cancel_cleanup_job"/);
  assert.match(admin, /rpc\("raye2_preview_retention_sweep"/);
  assert.match(admin, /loadSweep/);
});

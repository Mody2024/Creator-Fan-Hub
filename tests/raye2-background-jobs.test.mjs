import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, admin] = await Promise.all([
  read("../supabase/migrations/20261110530000_raye2_background_jobs.sql"),
  read("../src/app/creator/raye2/admin-client.tsx")
]);

test("background jobs are durable, idempotent and lease-claimed by the trusted worker only", () => {
  assert.match(migration, /create table if not exists public\.raye2_background_jobs/);
  assert.match(migration, /raye2_background_jobs_idempotency_idx/);
  assert.match(migration, /create or replace function public\.raye2_claim_background_job\(\)/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /auth\.role\(\) is distinct from 'service_role'/);
});

test("background jobs retry with backoff and then fail at the attempt ceiling", () => {
  assert.match(migration, /create or replace function public\.raye2_complete_background_job\(/);
  assert.match(migration, /if v_job\.attempts >= v_job\.max_attempts then/);
  assert.match(migration, /power\(2, v_job\.attempts\)/);
  assert.match(migration, /'queued'/);
});

test("background jobs are observable and admin-controllable", () => {
  assert.match(migration, /create or replace function public\.raye2_get_background_job_stats\(\)/);
  assert.match(migration, /stuck_running/);
  assert.match(migration, /create or replace function public\.raye2_retry_background_job\(/);
  assert.match(migration, /create or replace function public\.raye2_cancel_background_job\(/);
});

test("the admin dashboard surfaces background jobs", () => {
  assert.match(admin, /rpc\("raye2_list_background_jobs"/);
  assert.match(admin, /rpc\("raye2_get_background_job_stats"/);
  assert.match(admin, /bgJobs\.map/);
});

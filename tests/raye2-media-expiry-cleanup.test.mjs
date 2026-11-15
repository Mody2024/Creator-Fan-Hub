import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, worker] = await Promise.all([
  read("../supabase/migrations/20261111020000_raye2_media_expiry_cleanup.sql"),
  read("../scripts/raye2-media-worker.mjs")
]);

test("expired temporary media is queued for physical deletion, separately from metadata", () => {
  assert.match(migration, /create table if not exists public\.raye2_media_storage_cleanup/);
  assert.match(migration, /status text not null default 'pending' check \(status in \('pending','queued','deleted','failed'\)\)/);
  assert.match(migration, /raye2_media_storage_cleanup_object_idx/);
  // Both expiry functions now record the binary while flipping metadata status.
  assert.match(migration, /create or replace function public\.raye2_expire_minis\(\)/);
  assert.match(migration, /insert into public\.raye2_media_storage_cleanup\(bucket, storage_path, source_kind, source_id\)/);
  assert.match(migration, /'raye2-minis', d\.storage_path, 'mini', d\.id/);
  assert.match(migration, /'raye2-clips', d\.storage_path, 'community_clip', d\.id/);
});

test("cleanup is promoted into retried background jobs and observable", () => {
  assert.match(migration, /function public\.raye2_enqueue_storage_cleanup\(p_limit integer/);
  assert.match(migration, /'storage\.delete'/);
  assert.match(migration, /'storage_cleanup:' \|\| v_row\.id::text/);
  assert.match(migration, /function public\.raye2_record_storage_cleanup\(p_cleanup_id uuid, p_success boolean/);
  assert.match(migration, /function public\.raye2_get_storage_cleanup_stats\(\)/);
});

test("trusted-worker guards are enforced", () => {
  assert.match(migration, /if auth\.role\(\) is distinct from 'service_role' then/);
  assert.match(migration, /grant execute on function public\.raye2_enqueue_storage_cleanup\(integer\) to service_role/);
  assert.match(migration, /grant execute on function public\.raye2_record_storage_cleanup\(uuid,boolean,text\) to service_role/);
  assert.match(migration, /grant execute on function public\.raye2_get_storage_cleanup_stats\(\) to authenticated/);
});

test("a worker can claim only the job kinds it owns", () => {
  assert.match(migration, /create or replace function public\.raye2_claim_background_job\(p_kind text default null\)/);
  assert.match(migration, /and \(p_kind is null or j\.kind = p_kind\)/);
});

test("the media worker drains the storage-cleanup queue against Storage", () => {
  assert.match(worker, /async function drainStorageCleanup\(\)/);
  assert.match(worker, /rpc\("raye2_enqueue_storage_cleanup", \{ p_limit: 25 \}\)/);
  assert.match(worker, /rpc\("raye2_claim_background_job", \{ p_kind: "storage\.delete" \}\)/);
  assert.match(worker, /storage\.from\(bucket\)\.remove\(\[path\]\)/);
  assert.match(worker, /rpc\("raye2_record_storage_cleanup", \{ p_cleanup_id: cleanupId, p_success: ok, p_error: message \}\)/);
  assert.match(worker, /await drainStorageCleanup\(\)/);
});

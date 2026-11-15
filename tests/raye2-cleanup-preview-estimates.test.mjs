import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, ui] = await Promise.all([
  read("../supabase/migrations/20261111090000_raye2_cleanup_preview_estimates.sql"),
  read("../src/app/creator/raye2/admin-client.tsx")
]);

test("the cleanup preview computes affected records, estimated storage and exclusions", () => {
  assert.match(migration, /create or replace function public\.raye2_create_cleanup_preview\(/);
  assert.match(migration, /from public\.raye2_estimate_cleanup_scope\(p_scope, coalesce\(p_preserve_chat_history,true\), coalesce\(p_preserve_shared_memories,true\)\) e/);
  assert.match(migration, /estimated_items,estimated_bytes,result,reason/);
  assert.match(migration, /'exclusions',jsonb_build_object\(\s*'chat_history'/);
  assert.match(migration, /jsonb_build_object\('scope',p_scope,'preserve_chat_history',p_preserve_chat_history,/);
});

test("the admin UI shows the estimates as soon as the preview is created", () => {
  assert.match(ui, /from\("raye2_cleanup_jobs"\)/);
  assert.match(ui, /\.eq\("id", jobId\)\.maybeSingle\(\)/);
  assert.match(ui, /estimated_items,estimated_bytes,reason,created_at/);
});

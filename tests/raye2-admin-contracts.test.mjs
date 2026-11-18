import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [page, client, migration] = await Promise.all([
  read("../src/app/creator/raye2/page.tsx"),
  read("../src/app/creator/raye2/admin-client.tsx"),
  read("../supabase/migrations/20261103180000_raye2_community_chat_foundations.sql")
]);
test("Raye2 admin route requires an authenticated owner or admin", () => {
  assert.match(page, /supabase\.auth\.getClaims\(\)/);
  assert.match(page, /\["owner", "admin"\]\.includes\(admin\.role\)/);
  assert.match(page, /creator_admins/);
});
test("platform rules and retention are changed only through guarded RPCs", () => {
  assert.match(client, /raye2_set_platform_rule/);
  assert.match(client, /raye2_set_retention_policy/);
  assert.match(client, /reason\.trim\(\)\.length < 3/);
  assert.match(migration, /platform admin access required/);
});
test("cleanup UI creates a review request and preserves selected data", () => {
  assert.match(client, /raye2_create_cleanup_preview/);
  assert.match(client, /p_preserve_chat_history: preserveChat/);
  assert.match(client, /p_preserve_shared_memories: preserveMemories/);
  assert.match(client, /This page does not delete content/);
  assert.doesNotMatch(client, /\.delete\(/);
});
test("admin dashboard exposes storage measurements and append-only audit history", () => {
  assert.match(page, /raye2_storage_usage/);
  assert.match(page, /raye2_admin_audit_log/);
  assert.match(client, /initialStorage\.reduce/);
  assert.match(client, /Append-only administrative history/);
  assert.match(migration, /before update or delete on public\.raye2_admin_audit_log/);
});

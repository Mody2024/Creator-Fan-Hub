import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, admin] = await Promise.all([
  read("../supabase/migrations/20261110870000_raye2_admin_moderation_queue.sql"),
  read("../src/app/creator/raye2/admin-client.tsx")
]);

test("the moderation queue unifies content and safety reports", () => {
  assert.match(migration, /function public\.raye2_get_moderation_queue\(/);
  assert.match(migration, /from public\.content_reports r/);
  assert.match(migration, /from public\.raye2_safety_reports r/);
  assert.match(migration, /'content'::text as kind/);
  assert.match(migration, /'safety'::text as kind/);
});

test("the queue is scoped to moderators and platform admins", () => {
  assert.match(migration, /public\.raye2_is_platform_admin\(\) or private\.can_moderate_community\(\)/);
  assert.match(migration, /moderator or platform admin access required/);
});

test("resolution delegates to the existing audited per-kind RPCs", () => {
  assert.match(migration, /perform public\.raye2_resolve_content_report\(/);
  assert.match(migration, /perform public\.raye2_resolve_safety_report\(/);
  assert.match(migration, /content_report_' \|\| p_status/);
  assert.match(migration, /safety_report_' \|\| p_status/);
});

test("unknown report kinds are rejected", () => {
  assert.match(migration, /unknown report kind/);
});

test("the admin console exposes the moderation queue", () => {
  assert.match(admin, /raye2_get_moderation_queue/);
  assert.match(admin, /raye2_admin_resolve_report/);
  assert.match(admin, /id: "moderation"/);
});

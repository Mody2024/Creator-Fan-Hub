import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, community, admin] = await Promise.all([
  read("../supabase/migrations/20261110490000_raye2_safety_review_audit_filter.sql"),
  read("../src/app/community/community-client.tsx"),
  read("../src/app/creator/raye2/admin-client.tsx")
]);

test("safety reports can be reviewed and resolved by moderators with an audit trail", () => {
  assert.match(migration, /create or replace function public\.raye2_get_safety_report_queue\(/);
  assert.match(migration, /create or replace function public\.raye2_resolve_safety_report\(/);
  assert.match(migration, /private\.can_moderate_community\(\) or public\.raye2_is_platform_admin\(\)/);
  assert.match(migration, /'safety_report_' \|\| p_status/);
});

test("the audit log is filterable and platform-admin only", () => {
  assert.match(migration, /create or replace function public\.raye2_get_admin_audit_log\(/);
  assert.match(migration, /if not public\.raye2_is_platform_admin\(\) then/);
  assert.match(migration, /\(p_action is null or a\.action = p_action\)/);
  assert.match(migration, /\(p_actor is null or a\.actor_id = p_actor\)/);
  assert.doesNotMatch(migration, /raye2_get_admin_audit_log\(integer,text,uuid\) to anon/);
});

test("the moderation workspace surfaces the safety report queue", () => {
  assert.match(community, /rpc\("raye2_get_safety_report_queue"/);
  assert.match(community, /rpc\("raye2_resolve_safety_report"/);
  assert.match(community, /safetyQueue\.map/);
});

test("the admin audit view supports action and actor filters", () => {
  assert.match(admin, /rpc\("raye2_get_admin_audit_log"/);
  assert.match(admin, /auditAction/);
  assert.match(admin, /auditActor/);
  assert.match(admin, /loadAudit/);
});

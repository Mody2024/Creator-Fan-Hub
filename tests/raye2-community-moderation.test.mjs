import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110460000_raye2_community_moderation_toolkit.sql"),
  read("../src/app/community/community-client.tsx")
]);

test("community content can be reported through a validated RPC", () => {
  assert.match(migration, /create or replace function public\.raye2_report_community_content\(/);
  assert.match(migration, /if v_reason not in \('spam','harassment','hate','impersonation','copyright','other'\) then/);
  assert.match(migration, /grant execute on function public\.raye2_report_community_content\(text,text,text,text\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_report_community_content\(text,text,text,text\) to anon/);
});

test("moderators remove, reject and restore posts and comments with audit", () => {
  assert.match(migration, /create or replace function public\.raye2_moderate_community_post\(/);
  assert.match(migration, /create or replace function public\.raye2_moderate_community_comment\(/);
  assert.match(migration, /if not private\.can_moderate_community\(\) then/);
  assert.match(migration, /insert into public\.raye2_admin_audit_log/);
  assert.match(migration, /set status = 'resolved', resolved_at = now\(\), resolved_by = \(select auth\.uid\(\)\)/);
});

test("the moderation queue, removed content list and report resolution are moderator-only", () => {
  assert.match(migration, /create or replace function public\.raye2_get_community_moderation_queue\(/);
  assert.match(migration, /create or replace function public\.raye2_get_moderated_community_posts\(/);
  assert.match(migration, /create or replace function public\.raye2_resolve_content_report\(/);
  const guards = migration.match(/raise exception 'moderator access required'/g) ?? [];
  assert.ok(guards.length >= 5, `expected at least 5 moderator guards, got ${guards.length}`);
});

test("the community client wires reporting and the moderation workspace", () => {
  assert.match(client, /rpc\("raye2_report_community_content"/);
  assert.match(client, /rpc\("raye2_get_community_moderation_queue"/);
  assert.match(client, /rpc\("raye2_moderate_community_post"/);
  assert.match(client, /rpc\("raye2_resolve_content_report"/);
  assert.match(client, /nhen-moderation-list/);
  assert.match(client, /nhen-report-modal/);
});

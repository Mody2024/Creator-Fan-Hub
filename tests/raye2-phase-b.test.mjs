import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, invitePage] = await Promise.all([
  read("../supabase/migrations/20261103190000_raye2_invites_memories.sql"),
  read("../src/app/raye2/raye2-client.tsx"),
  read("../src/app/raye2/invite/page.tsx")
]);
test("private invites use expiring hashed tokens and manager-only revocation", () => {
  assert.match(migration, /raye2_revoke_group_invite/);
  assert.match(migration, /group_invite_created/);
  assert.match(migration, /extensions\.digest\(p_token,'sha256'\)/);
  assert.match(migration, /group manager access required/);
  assert.match(client, /raye2_create_group_invite/);
  assert.match(client, /crypto\.getRandomValues/);
  assert.match(client, /raye2_revoke_group_invite/);
  assert.match(invitePage, /raye2_join_group_invite/);
});
test("private group join requests are owner-reviewed and audited", () => {
  assert.match(migration, /raye2_group_join_requests/);
  assert.match(migration, /raye2_request_group_join/);
  assert.match(migration, /raye2_review_group_join_request/);
  assert.match(migration, /group_join_request_/);
});
test("group moderation prevents changing owner roles and protects higher roles", () => {
  assert.match(migration, /raye2_set_group_member_role/);
  assert.match(migration, /raye2_remove_group_member/);
  assert.match(migration, /v_target_role='owner'/);
  assert.match(migration, /insufficient group moderation permissions/);
});
test("Shared Memories are idempotent and only capture a member-visible group message", () => {
  assert.match(migration, /raye2_shared_memory_source_unique/);
  assert.match(migration, /raye2_save_shared_memory/);
  assert.match(migration, /c\.group_id=p_group_id/);
  assert.match(client, /raye2_save_shared_memory/);
  assert.match(client, /Shared Memories/);
});

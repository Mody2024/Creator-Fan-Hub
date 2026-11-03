import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, invitePage, realtimeMigration, notificationMigration, safetyMigration, pinsMigration, requestsMigration] = await Promise.all([
  read("../supabase/migrations/20261103190000_raye2_invites_memories.sql"),
  read("../src/app/raye2/raye2-client.tsx"),
  read("../src/app/raye2/invite/page.tsx"),
  read("../supabase/migrations/20261103200000_raye2_read_receipts.sql"),
  read("../supabase/migrations/20261103210000_raye2_notifications.sql"),
  read("../supabase/migrations/20261103220000_raye2_safety_controls.sql"),
  read("../supabase/migrations/20261103230000_raye2_search_pins.sql"),
  read("../supabase/migrations/20261103240000_raye2_message_requests.sql")
]);
test("message requests enforce recipient preferences and only create direct conversations after acceptance", () => {
  assert.match(client, /raye2_message_requests/);
  assert.match(client, /raye2_set_contact_preferences/);
  assert.match(client, /raye2_review_message_request/);
  assert.match(client, /allowMessageRequests/);
  assert.match(requestsMigration, /allow_message_requests/);
  assert.match(requestsMigration, /raye2_create_direct_conversation/);
  assert.match(requestsMigration, /raye2_review_message_request/);
  assert.match(requestsMigration, /status=.pending./);
  assert.match(requestsMigration, /member_blocks/);
});
test("conversation search and pinned messages are bounded and permission checked", () => {
  assert.match(client, /searchConversationMessages/);
  assert.match(client, /raye2_pin_message/);
  assert.match(client, /raye2_unpin_message/);
  assert.match(client, /pinnedMessages/);
  assert.match(pinsMigration, /raye2_is_conversation_member/);
  assert.match(pinsMigration, /raye2_is_group_manager/);
  assert.match(pinsMigration, /limit/);
});
test("Raye2 block and report controls reuse platform block identity and validate report targets", () => {
  assert.match(client, /member_blocks/);
  assert.match(client, /raye2_submit_safety_report/);
  assert.match(client, /reportTarget/);
  assert.match(client, /blockUser/);
  assert.match(safetyMigration, /raye2_submit_safety_report/);
  assert.match(safetyMigration, /raye2_is_conversation_member/);
  assert.match(safetyMigration, /reporter_id/);
  assert.match(safetyMigration, /target_type in/);
});
test("notifications are recipient-scoped, preference-aware and membership scoped", () => {
  assert.match(client, /raye2_notifications/);
  assert.match(client, /raye2_set_notification_preferences/);
  assert.match(client, /notificationPreferences/);
  assert.match(client, /markAllNotificationsRead/);
  assert.match(notificationMigration, /raye2_notify_conversation_message/);
  assert.match(notificationMigration, /direct_messages/);
  assert.match(notificationMigration, /group_messages/);
  assert.match(notificationMigration, /cm.user_id<>new.sender_id/);
  assert.match(notificationMigration, /cm.muted_until/);
});
test("realtime presence and typing are ephemeral and read receipts are membership guarded", () => {
  assert.match(client, /presenceState/);
  assert.match(client, /event: "typing"/);
  assert.match(client, /raye2_mark_conversation_read/);
  assert.match(realtimeMigration, /raye2_is_conversation_member/);
  assert.match(realtimeMigration, /last_read_at=v_read_at/);
});
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
test("group managers can review requests and moderate members through guarded RPCs", () => {
  assert.match(client, /raye2_review_group_join_request/);
  assert.match(client, /raye2_set_group_member_role/);
  assert.match(client, /raye2_remove_group_member/);
  assert.match(client, /manageGroup/);
  assert.match(client, /pendingRequests/);
  assert.match(client, /canChange/);
});
test("Shared Memories expose expiry warnings, preservation and manager pin controls", () => {
  assert.match(client, /expirySoon/);
  assert.match(client, /retention_mode: "preserved"/);
  assert.match(client, /pinned: !memory\.pinned/);
});
test("Shared Memories are idempotent and only capture a member-visible group message", () => {
  assert.match(migration, /raye2_shared_memory_source_unique/);
  assert.match(migration, /raye2_save_shared_memory/);
  assert.match(migration, /c\.group_id=p_group_id/);
  assert.match(client, /raye2_save_shared_memory/);
  assert.match(client, /Shared Memories/);
});

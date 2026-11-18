import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110750000_raye2_live_invite_notifications.sql"),
  read("../src/app/notifications/notifications-client.tsx")
]);

test("live_start, group_join_request and group_join_decision are allowed types", () => {
  assert.match(migration, /'mention','group_join_request','group_join_decision','live_start'\)/);
  assert.match(migration, /check \(target_type in \('profile','post','video','event','group','stream'\)\)/);
});

test("live starts notify followers only for public streams and only once", () => {
  assert.match(migration, /v_visibility <> 'public'/);
  assert.match(migration, /n\.notification_type = 'live_start' and n\.target_type = 'stream'/);
  assert.match(migration, /order by f\.created_at desc\s*\n\s*limit v_cap/);
  assert.match(migration, /create trigger raye2_live_start_notification/);
});

test("group join requests notify managers and decisions notify the requester", () => {
  assert.match(migration, /m\.role in \('owner','admin','moderator'\)/);
  assert.match(migration, /'group_join_request', 'group', v_group/);
  assert.match(migration, /'group_join_decision', 'group', v_group/);
  assert.match(migration, /create trigger raye2_group_join_decision_notification after update of status/);
});

test("helpers are best-effort and surfaced in the inbox", () => {
  const handlers = migration.match(/exception when others then/g) ?? [];
  assert.ok(handlers.length >= 3, `expected best-effort handlers, found ${handlers.length}`);
  assert.match(client, /live_start:"is live now"/);
  assert.match(client, /group_join_request:"requested to join your group"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110930000_raye2_message_delivery_receipts.sql"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("delivery is tracked per recipient with membership-scoped access", () => {
  assert.match(migration, /create table if not exists public\.raye2_message_deliveries/);
  assert.match(migration, /primary key \(message_id, user_id\)/);
  assert.match(migration, /public\.raye2_is_conversation_member\(conversation_id\)/);
  assert.match(migration, /function public\.raye2_mark_messages_delivered\(p_conversation_id uuid\)/);
});

test("receipt status exposes the other participant's delivery and read clocks for direct chats only", () => {
  assert.match(migration, /function public\.raye2_message_receipt_status\(p_conversation_id uuid\)/);
  assert.match(migration, /if v_type <> 'direct' then/);
  assert.match(migration, /cm\.last_read_at/);
});

test("the client marks delivery, subscribes and shows a receipt state on own messages", () => {
  assert.match(client, /raye2_mark_messages_delivered/);
  assert.match(client, /raye2_message_receipt_status/);
  assert.match(client, /styles\.receiptState/);
  assert.match(client, /t\.seen : .*t\.delivered : t\.sent/);
  assert.match(client, /raye2_message_deliveries/);
});

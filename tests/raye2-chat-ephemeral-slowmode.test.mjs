import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, css] = await Promise.all([
  read("../supabase/migrations/20261116210000_raye2_chat_ephemeral_slowmode.sql"),
  read("../src/app/raye2/raye2-client.tsx"),
  read("../src/app/raye2/raye2.module.css")
]);

test("disappearing windows are bounded below by the retention floor", () => {
  assert.match(migration, /add column if not exists disappearing_seconds integer/);
  assert.match(migration, /disappearing_seconds is null or disappearing_seconds in \(86400, 604800, 2592000\)/);
});

test("only a member or a group manager may set the disappearing window", () => {
  assert.match(migration, /create or replace function public\.raye2_set_conversation_disappearing\(p_conversation_id uuid, p_seconds integer\)/);
  assert.match(migration, /if auth\.uid\(\) is null or not public\.raye2_is_conversation_member\(p_conversation_id\) then/);
  assert.match(migration, /if v_group_id is not null and not public\.raye2_is_group_manager\(v_group_id\) then/);
  assert.match(migration, /disappearing window must be 1, 7 or 30 days/);
});

test("new messages are stamped server-side so a client cannot opt out", () => {
  assert.match(migration, /create or replace function public\.raye2_apply_message_expiry\(\)/);
  assert.match(migration, /create trigger raye2_messages_apply_expiry before insert on public\.raye2_messages/);
  assert.match(migration, /new\.expires_at := now\(\) \+ \(v_seconds \|\| ' seconds'\)::interval/);
});

test("group slow mode is manager-only, capped and enforced at insert", () => {
  assert.match(migration, /add column if not exists slow_mode_seconds integer not null default 0/);
  assert.match(migration, /slow_mode_seconds between 0 and 3600/);
  assert.match(migration, /create or replace function public\.raye2_set_group_slow_mode\(p_group_id uuid, p_seconds integer\)/);
  assert.match(migration, /create or replace function public\.raye2_guard_message_slow_mode\(\)/);
  assert.match(migration, /create trigger raye2_messages_slow_mode before insert on public\.raye2_messages/);
  assert.match(migration, /raise exception 'slow mode is active; wait % seconds'/);
});

test("expired messages are swept, preserved memories excluded, and folded into maintenance", () => {
  assert.match(migration, /create or replace function public\.raye2_sweep_expired_messages\(\)/);
  assert.match(migration, /where m\.expires_at is not null and m\.expires_at < now\(\)/);
  assert.match(migration, /sm\.source_message_id=m\.id and sm\.retention_mode='preserved'/);
  assert.match(migration, /'disappearing_messages_expired', v_expired/);
});

test("the chat UI exposes the disappearing control, badge and slow mode", () => {
  assert.match(client, /raye2_set_conversation_disappearing", \{ p_conversation_id: selected\.conversationId, p_seconds: seconds \}/);
  assert.match(client, /raye2_set_group_slow_mode", \{ p_group_id: selectedGroup\.id, p_seconds: seconds \}/);
  assert.match(client, /className=\{styles\.disappearingControl\}/);
  assert.match(client, /className=\{styles\.ephemeralBadge\}/);
  assert.match(client, /disappearingSeconds: conversation\.disappearing_seconds \?\? null/);
  assert.match(css, /\.page \.disappearingControl/);
  assert.match(css, /\.page \.ephemeralBadge/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [fix, original, client] = await Promise.all([
  read("../supabase/migrations/20261110770000_raye2_message_restriction_trigger_fix.sql"),
  read("../supabase/migrations/20261110510000_raye2_moderation_actions_appeals.sql"),
  read("../src/app/notifications/notifications-client.tsx")
]);

test("the original trigger read author_id for messages (the bug this fixes)", () => {
  assert.match(original, /when 'raye2_messages' then 'message'/);
  assert.match(original, /new\.author_id, v_feature/);
});

test("the fix resolves the actor per table", () => {
  assert.match(fix, /if tg_table_name = 'raye2_messages' then\s*\n\s*v_actor := new\.sender_id;/);
  assert.match(fix, /v_actor := new\.author_id;/);
  assert.match(fix, /when 'raye2_messages' then 'message'/);
});

test("the fix also guards community Shorts comments", () => {
  assert.match(fix, /when 'community_short_comments' then 'comment'/);
  assert.match(fix, /create trigger raye2_short_comments_restriction_guard before insert on public\.community_short_comments/);
});

test("notification deep links resolve stream and group targets", () => {
  assert.match(client, /n\.targetType==="stream"\)return "\/live\/"\+n\.targetId/);
  assert.match(client, /n\.targetType==="group"\)return "\/groups"/);
});

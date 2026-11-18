import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110740000_raye2_mention_notifications.sql"),
  read("../src/app/notifications/notifications-client.tsx")
]);

test("mention type is allowed and resolvable from a body", () => {
  assert.match(migration, /'event_reminder','mention'\)/);
  assert.match(migration, /create or replace function public\.raye2_mention_recipients\(/);
  assert.match(migration, /regexp_matches\(coalesce\(p_body, ''\)/);
});

test("every surface emits mention notifications", () => {
  for (const name of ["raye2_notify_mentions_post", "raye2_notify_mentions_comment", "raye2_notify_mentions_short_comment", "raye2_notify_mentions_video_comment"]) {
    assert.match(migration, new RegExp(`function public\\.${name}\\(`), `missing ${name}`);
  }
  for (const trig of ["raye2_post_mention_notification", "raye2_comment_mention_notification", "raye2_short_comment_mention_notification", "raye2_video_comment_mention_notification"]) {
    assert.match(migration, new RegExp(`create trigger ${trig} after insert`), `missing trigger ${trig}`);
  }
});

test("mentions are deduplicated and block-aware", () => {
  assert.match(migration, /n.notification_type = 'mention'/);
  assert.match(migration, /b.blocker_id = new.author_id/);
  assert.match(migration, /mp.user_id <> p_actor/);
});

test("the inbox summary and filter understand mentions", () => {
  assert.match(migration, /count\(\*\) filter \(where notification_type = 'mention'\) as mention_count/);
  assert.match(migration, /p_filter = 'mention' and n.notification_type = 'mention'/);
  assert.match(client, /mentionCount/);
  assert.match(client, /n\.type==="mention"/);
});

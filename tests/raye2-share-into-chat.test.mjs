import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, page, client] = await Promise.all([
  read("../supabase/migrations/20261111120000_raye2_share_into_chat.sql"),
  read("../src/app/watch/[slug]/page.tsx"),
  read("../src/app/watch/[slug]/watch-detail-client.tsx")
]);

test("sharing a video into chat is member-scoped and view-gated", () => {
  assert.match(migration, /create or replace function public\.raye2_share_video_to_chat\(/);
  assert.match(migration, /if not public\.raye2_is_conversation_member\(p_conversation_id\) then/);
  assert.match(migration, /and public\.raye2_can_view_video\(vc\.media_id\)/);
  assert.match(migration, /'kind','video_share'/);
  assert.match(migration, /create or replace function public\.raye2_list_shareable_conversations\(/);
});

test("the watch page can share the whole video or a timestamp into a conversation", () => {
  assert.match(page, /<WatchDetailClient slug=\{slug\}/);
  assert.match(client, /raye2_list_shareable_conversations/);
  assert.match(client, /raye2_share_video_to_chat/);
  assert.match(client, /p_start_seconds:moment/);
  assert.match(client, /shareToChat/);
});

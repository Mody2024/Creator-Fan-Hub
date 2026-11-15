import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, settings, voice, watch] = await Promise.all([
  read("../supabase/migrations/20261110660000_raye2_restriction_enforcement.sql"),
  read("../src/app/account/account-settings.tsx"),
  read("../src/app/raye2/raye2-voice-controls.tsx"),
  read("../src/app/raye2/raye2-watch-together-controls.tsx")
]);

test("voice and watch restrictions are enforced server-side", () => {
  assert.match(migration, /create or replace function public\.raye2_join_voice_session_guarded\(/);
  assert.match(migration, /create or replace function public\.raye2_join_watch_session_guarded\(/);
  assert.match(migration, /raye2_has_active_restriction\(auth\.uid\(\), 'voice'\)/);
  assert.match(migration, /raye2_has_active_restriction\(auth\.uid\(\), 'watch'\)/);
});

test("video comments enforce the comment restriction", () => {
  assert.match(migration, /raye2_video_comments_restriction_guard/);
  assert.match(migration, /raye2_enforce_video_comment_restriction/);
});

test("members can see their own restrictions and appeal", () => {
  assert.match(migration, /create or replace function public\.raye2_get_my_restrictions\(\)/);
  assert.match(settings, /rpc\("raye2_get_my_restrictions"\)/);
  assert.match(settings, /rpc\("raye2_submit_moderation_appeal"/);
});

test("the client joins guarded voice and watch sessions", () => {
  assert.match(voice, /raye2_join_voice_session_guarded/);
  assert.match(watch, /raye2_join_watch_session_guarded/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, groupControls] = await Promise.all([
  read("../supabase/migrations/20261110950000_raye2_voice_depth.sql"),
  read("../src/app/raye2/raye2-group-voice-controls.tsx")
]);

test("participants can raise a hand and mute is tracked server-side", () => {
  assert.match(migration, /add column if not exists hand_raised_at timestamptz/);
  assert.match(migration, /function public\.raye2_set_voice_hand\(p_session_id uuid,p_raised boolean\)/);
  assert.match(migration, /function public\.raye2_set_voice_mute\(p_session_id uuid,p_muted boolean\)/);
  assert.match(groupControls, /raye2_set_voice_hand/);
  assert.match(groupControls, /raye2_set_voice_mute/);
});

test("audio preferences cover push-to-talk and noise suppression", () => {
  assert.match(migration, /add column if not exists push_to_talk boolean/);
  assert.match(migration, /add column if not exists noise_suppression boolean/);
  assert.match(migration, /function public\.raye2_set_voice_audio_preferences\(\s*p_push_to_talk boolean, p_noise_suppression boolean\s*\)/);
  assert.match(groupControls, /raye2_set_voice_audio_preferences/);
});

test("moderators get bulk mute-all and clear-hands with an audit trail", () => {
  assert.match(migration, /function public\.raye2_voice_bulk_moderation\(p_session_id uuid,p_action text\)/);
  assert.match(migration, /p_action not in \('mute_all','clear_hands'\)/);
  assert.match(migration, /'voice_room_bulk_'/);
  assert.match(groupControls, /raye2_voice_bulk_moderation/);
});

test("idle voice rooms are swept by the maintenance runner", () => {
  assert.match(migration, /function public\.raye2_expire_idle_voice_rooms\(p_idle_minutes integer default 15\)/);
  assert.match(migration, /'voice_rooms_expired', v_voice/);
  assert.match(migration, /grant execute on function public\.raye2_expire_idle_voice_rooms\(integer\) to anon,authenticated/);
});

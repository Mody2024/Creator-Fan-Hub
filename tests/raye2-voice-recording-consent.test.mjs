import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = p => readFile(new URL(p, import.meta.url), "utf8");

test("the voice UI surfaces recording consent and a mandatory visible indicator", async () => {
  const ui = await read("../src/app/raye2/raye2-voice-controls.tsx");
  assert.match(ui, /raye2_request_voice_recording_consent/);
  assert.match(ui, /raye2_respond_voice_recording_consent/);
  assert.match(ui, /recordingState === "consent_granted" && <span className=\{styles\.voiceRecording\}/);
  assert.match(ui, /role="status" aria-live="polite"/);
  assert.match(ui, /respondRecordingConsent\("withdrawn"\)/);
  assert.match(ui, /respondRecordingConsent\("declined"\)/);
});

test("recording is host-initiated and off by default", async () => {
  const ui = await read("../src/app/raye2/raye2-voice-controls.tsx");
  assert.match(ui, /recordingState === "off" && role === "host" && <button/);
  assert.match(ui, /requestRecordingConsent/);
  const migration = await read("../supabase/migrations/20261104000500_raye2_voice_sessions.sql");
  assert.match(migration, /recording_state text not null default 'off'/);
  assert.match(migration, /'recording\.enabled','recording','false'::jsonb,'proposed'/);
});

test("the elapsed recording time is displayed while consent is granted", async () => {
  const ui = await read("../src/app/raye2/raye2-voice-controls.tsx");
  assert.match(ui, /const recordingClock =/);
  assert.match(ui, /\{recordingClock\}/);
});

test("group voice rooms surface the same recording consent and indicator", async () => {
  const group = await read("../src/app/raye2/raye2-group-voice-controls.tsx");
  assert.match(group, /raye2_request_voice_recording_consent/);
  assert.match(group, /raye2_respond_voice_recording_consent/);
  assert.match(group, /recordingState === "consent_granted" && <span className=\{styles\.voiceRecording\}/);
  assert.match(group, /recordingState === "off" && isVoiceHost && <button/);
  assert.match(group, /respondRecordingConsent\("withdrawn"\)/);
  assert.match(group, /const recordingClock =/);
});

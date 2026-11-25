import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, groupControls, privateControls, voiceCss] = await Promise.all([
  read("../supabase/migrations/20261110950000_raye2_voice_depth.sql"),
  read("../src/app/raye2/raye2-group-voice-controls.tsx"),
  read("../src/app/raye2/raye2-voice-controls.tsx"),
  read("../src/app/raye2/raye2.module.css")
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


test("group voice supports explicit live-only screen sharing with browser fallback", () => {
  assert.match(groupControls, /setCanShareScreen\(!!ownVoiceMembership && ownVoiceMembership\.role !== "listener"\)/);
  assert.match(groupControls, /mediaDevices\?\.getDisplayMedia/);
  assert.match(groupControls, /setScreenShareEnabled\(true, \{ audio: false \}\)/);
  assert.match(groupControls, /setScreenShareEnabled\(false\)/);
  assert.match(groupControls, /LocalTrackUnpublished/);
});

test("remote shared screens are rendered and detached when sharing ends", () => {
  assert.match(groupControls, /Track\.Source\.ScreenShare && track\.kind === Track\.Kind\.Video/);
  assert.match(groupControls, /screenShareContainerRef\.current\.appendChild\(element\)/);
  assert.match(groupControls, /groupVoiceScreenVideo/);
  assert.match(groupControls, /screenSharePrivacy/);
  assert.match(groupControls, /groupVoiceAudio[\s\S]*groupVoiceScreens[\s\S]*!connected \?/);
  assert.match(voiceCss, /\.groupVoiceScreens:empty\{display:none\}/);
  assert.match(voiceCss, /\.groupVoiceScreenVideo\{/);
});

test("push-to-talk cannot bypass mute or leave the microphone open", () => {
  assert.match(groupControls, /setMicrophoneEnabled\(pushToTalk \? false : !next\)/);
  assert.match(groupControls, /const shouldTransmit = transmitting && !muted/);
  assert.match(groupControls, /setMicrophoneEnabled\(shouldTransmit\)/);
  assert.match(groupControls, /if \(pushToTalk\) setTransmittingState\(false\)/);
});

test("private calls support live-only screen sharing without renegotiation", () => {
  assert.match(privateControls, /addTransceiver\("video", \{ direction: "sendrecv", streams: \[stream\] \}\)/);
  assert.match(privateControls, /mediaDevices\?\.getDisplayMedia/);
  assert.match(privateControls, /getDisplayMedia\(\{ video: true, audio: false \}\)/);
  assert.match(privateControls, /sender\.replaceTrack\(track\)/);
  assert.match(privateControls, /sender\?\.replaceTrack\(null\)/);
  assert.match(privateControls, /event\.track\.onended/);
  assert.match(privateControls, /event\.track\.onunmute/);
  assert.match(privateControls, /event\.track\.onmute/);
  assert.match(privateControls, /screenShareStreamRef\.current\?\.getTracks\(\)\.forEach\(track => track\.stop\(\)\)/);
  assert.match(privateControls, /privateCallScreen/);
  assert.match(privateControls, /role="status" aria-live="polite"/);
  assert.match(voiceCss, /\.privateCallScreen\{/);
});


test("unexpected group voice disconnects release the server session and clear stale room state", () => {
  assert.match(groupControls, /if \(sessionRef\.current === data\)[\s\S]*sessionRef\.current = null;[\s\S]*raye2_leave_voice_session/);
  assert.match(groupControls, /setParticipantCount\(0\);[\s\S]*setParticipants\(\[\]\);[\s\S]*setActiveSpeakers\(\[\]\)/);
  assert.match(groupControls, /setRecordingState\("off"\);[\s\S]*setMyConsent\("not_requested"\)/);
  assert.match(groupControls, /disconnected: isAr \?/);
});

test("manual group voice leave attempts server cleanup even if the transport disconnect throws", () => {
  assert.match(groupControls, /try \{ await room\.disconnect\(\); \}[\s\S]*catch \{ setError\(copy\.failed\); \}[\s\S]*raye2_leave_voice_session/);
});

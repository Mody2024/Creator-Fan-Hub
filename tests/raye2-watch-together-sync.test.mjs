import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  DRIFT_THRESHOLD_SECONDS,
  MAX_STALE_ELAPSED_SECONDS,
  sanitizePlaybackPosition,
  computeTargetPosition,
  computePlaybackDrift,
  shouldResync,
  formatPlaybackClock,
  describePlaybackState
} from "../src/lib/voice/watch-together-sync.mjs";

const component = await readFile(new URL("../src/app/raye2/raye2-watch-together-controls.tsx", import.meta.url), "utf8");
const groupVoice = await readFile(new URL("../src/app/raye2/raye2-group-voice-controls.tsx", import.meta.url), "utf8");

test("sanitizePlaybackPosition rejects negatives and non-numbers, clamps the maximum", () => {
  assert.equal(sanitizePlaybackPosition(-5), 0);
  assert.equal(sanitizePlaybackPosition("nope"), 0);
  assert.equal(sanitizePlaybackPosition(NaN), 0);
  assert.equal(sanitizePlaybackPosition(12.5), 12.5);
  assert.equal(sanitizePlaybackPosition(MAX_STALE_ELAPSED_SECONDS + 10_000), MAX_STALE_ELAPSED_SECONDS);
});

test("computeTargetPosition extrapolates only while playing", () => {
  const updatedAt = "2026-01-01T00:00:00.000Z";
  const now = Date.parse(updatedAt) + 5_000;
  assert.equal(computeTargetPosition({ positionSeconds: 100, isPlaying: false, updatedAt, now }), 100);
  assert.equal(computeTargetPosition({ positionSeconds: 100, isPlaying: true, updatedAt, now }), 105);
});

test("computeTargetPosition clamps an absurd stale elapsed time", () => {
  const updatedAt = Date.parse("2026-01-01T00:00:00.000Z");
  const now = updatedAt + (MAX_STALE_ELAPSED_SECONDS + 100_000) * 1000;
  assert.equal(computeTargetPosition({ positionSeconds: 0, isPlaying: true, updatedAt, now }), MAX_STALE_ELAPSED_SECONDS);
});

test("computeTargetPosition tolerates a missing timestamp", () => {
  assert.equal(computeTargetPosition({ positionSeconds: 42, isPlaying: true, updatedAt: null, now: Date.now() }), 42);
});

test("shouldResync fires only past the drift threshold", () => {
  assert.equal(shouldResync(10, 10 + DRIFT_THRESHOLD_SECONDS), false);
  assert.equal(shouldResync(10, 10 + DRIFT_THRESHOLD_SECONDS + 0.01), true);
  assert.equal(computePlaybackDrift(10, 12), 2);
});

test("formatPlaybackClock renders mm:ss and h:mm:ss", () => {
  assert.equal(formatPlaybackClock(0), "0:00");
  assert.equal(formatPlaybackClock(65), "1:05");
  assert.equal(formatPlaybackClock(3661), "1:01:01");
  assert.equal(formatPlaybackClock(-4), "0:00");
});

test("describePlaybackState classifies sync, catch-up and pause", () => {
  assert.equal(describePlaybackState({ isPlaying: false, drift: 9 }), "paused");
  assert.equal(describePlaybackState({ isPlaying: true, drift: 0.2 }), "synced");
  assert.equal(describePlaybackState({ isPlaying: true, drift: 4 }), "behind");
  assert.equal(describePlaybackState({ isPlaying: true, drift: -4 }), "ahead");
  assert.equal(describePlaybackState({ isPlaying: true, drift: NaN }), "unknown");
});

test("Watch Together applies the shared sync helpers and self-corrects drift", () => {
  assert.match(component, /from "@\/lib\/voice\/watch-together-sync\.mjs"/);
  assert.match(component, /computeTargetPosition\(/);
  assert.match(component, /shouldResync\(/);
  assert.match(component, /describePlaybackState\(/);
  // A guest watchdog re-syncs between host updates, and the host re-broadcasts its position.
  assert.match(component, /setInterval\(\(\) => \{[\s\S]*?shouldResync\(player\.currentTime, target\)[\s\S]*?\}, 2000\)/);
  assert.match(component, /raye2_update_watch_playback[\s\S]*?\}, 5000\)/);
  assert.match(component, /const forceResync = \(\) =>/);
});

test("Group voice honours the stored push-to-talk and noise-suppression preferences", () => {
  assert.match(groupVoice, /from\("raye2_voice_preferences"\)/);
  assert.match(groupVoice, /setMicrophoneEnabled\(false\)/);
  assert.match(groupVoice, /event\.code !== "Space"/);
  assert.match(groupVoice, /onPointerDown=\{event => \{ event\.preventDefault\(\); void transmitRef\.current\(true\)/);
  assert.match(groupVoice, /setMicrophoneEnabled\(!muted, \{ noiseSuppression: enabled/);
});

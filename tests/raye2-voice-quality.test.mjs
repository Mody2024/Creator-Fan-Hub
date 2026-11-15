import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const group = await read("../src/app/raye2/raye2-group-voice-controls.tsx");

test("group voice rooms expose connection quality and reconnect state", () => {
  assert.match(group, /RoomEvent\.ConnectionQualityChanged/);
  assert.match(group, /RoomEvent\.Reconnecting/);
  assert.match(group, /RoomEvent\.Reconnected/);
  assert.match(group, /const \[quality, setQuality\] = useState<"unknown" \| "good" \| "fair" \| "poor">\("unknown"\)/);
  assert.match(group, /const \[reconnecting, setReconnecting\] = useState\(false\)/);
});

test("the connected status reports quality and a live reconnect notice", () => {
  assert.match(group, /copy\.quality/);
  assert.match(group, /\{reconnecting && <span className=\{styles\.voiceConsent\} role="status" aria-live="polite">\{copy\.reconnecting\}<\/span>\}/);
  // Reconnect state clears when the room disconnects or reconnects.
  assert.match(group, /room\.on\(RoomEvent\.Reconnected, \(\) => setReconnecting\(false\)\)/);
});

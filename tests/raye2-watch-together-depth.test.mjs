import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, controls] = await Promise.all([
  read("../supabase/migrations/20261110940000_raye2_watch_together_depth.sql"),
  read("../src/app/raye2/raye2-watch-together-controls.tsx")
]);

test("participants have presence with pruning and host failover", () => {
  assert.match(migration, /function public\.raye2_watch_heartbeat\(p_session_id uuid\)/);
  assert.match(migration, /last_seen_at < now\(\)-interval '90 seconds'/);
  assert.match(migration, /status='left'/);
  assert.match(migration, /role='host'/);
  assert.match(controls, /raye2_watch_heartbeat/);
});

test("hosts can moderate participants and transfer control", () => {
  assert.match(migration, /function public\.raye2_remove_watch_participant\(p_session_id uuid,p_user_id uuid\)/);
  assert.match(migration, /function public\.raye2_transfer_watch_host\(p_session_id uuid,p_user_id uuid\)/);
  assert.match(migration, /cannot remove this participant/);
  assert.match(controls, /raye2_remove_watch_participant/);
  assert.match(controls, /raye2_transfer_watch_host/);
});

test("participants can request playback control and hosts resolve it", () => {
  assert.match(migration, /create table if not exists public\.raye2_watch_control_requests/);
  assert.match(migration, /function public\.raye2_request_watch_control\(p_session_id uuid\)/);
  assert.match(migration, /function public\.raye2_resolve_watch_control_request\(p_request_id uuid,p_decision text\)/);
  assert.match(migration, /set role='moderator'/);
  assert.match(controls, /raye2_request_watch_control/);
  assert.match(controls, /raye2_resolve_watch_control_request/);
});

test("expired watch sessions are swept by the maintenance runner", () => {
  assert.match(migration, /function public\.raye2_expire_watch_sessions\(\)/);
  assert.match(migration, /'watch_sessions_expired', v_watch/);
  assert.match(migration, /grant execute on function public\.raye2_expire_watch_sessions\(\) to anon,authenticated/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, studio] = await Promise.all([
  read("../supabase/migrations/20261110600000_raye2_live_streaming.sql"),
  read("../src/app/creator/creator-live-studio.tsx")
]);

test("live streaming is role-gated and quota-enforced server-side", () => {
  assert.match(migration, /create or replace function public\.raye2_start_live_stream\(/);
  assert.match(migration, /only Streamer and Creator\+Streamer roles can start live streams/);
  assert.match(migration, /weekly stream quota reached/);
  assert.match(migration, /monthly stream quota reached/);
  assert.match(migration, /concurrent stream limit reached/);
});

test("live duration and concurrency stay configurable within provider limits", () => {
  assert.match(migration, /'live\.max_duration_seconds'/);
  assert.match(migration, /'live\.max_concurrent_streams'/);
  assert.match(migration, /'live\.replay_retention_hours'/);
});

test("replay retention is logical with physical deletion queued separately", () => {
  assert.match(migration, /create or replace function public\.raye2_end_live_stream\(/);
  assert.match(migration, /create or replace function public\.raye2_expire_live_replays\(\)/);
  assert.match(migration, /'live\.replay_cleanup'/);
  assert.match(migration, /raye2_background_jobs/);
});

test("live streams are moderated and observable", () => {
  assert.match(migration, /create or replace function public\.raye2_moderate_live_stream\(/);
  assert.match(migration, /create or replace function public\.raye2_get_live_admin_overview\(\)/);
  assert.match(migration, /create or replace function public\.raye2_update_live_stream_health\(/);
  assert.match(migration, /raye2_admin_audit_log/);
});

test("the live studio starts, reports health and ends streams", () => {
  assert.match(studio, /rpc\("raye2_start_live_stream"/);
  assert.match(studio, /rpc\("raye2_end_live_stream"/);
  assert.match(studio, /rpc\("raye2_update_live_stream_health"/);
});

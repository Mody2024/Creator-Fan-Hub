import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, panel] = await Promise.all([
  read("../supabase/migrations/20261110960000_raye2_creator_analytics_depth.sql"),
  read("../src/app/creator/analytics/creator-analytics-panel.tsx")
]);

test("creator analytics reports real unique-viewer, completion and follower metrics", () => {
  assert.match(migration, /function public\.raye2_get_creator_analytics\(p_days integer default 30\)/);
  assert.match(migration, /'unique_viewers'/);
  assert.match(migration, /'completed_viewers'/);
  assert.match(migration, /'followers', v_followers/);
  assert.match(migration, /from public\.member_follows f where f\.followed_id = v_uid/);
  assert.match(panel, /raye2_get_creator_analytics/);
});

test("watch time is never fabricated", () => {
  assert.match(migration, /'watch_time_available', false/);
  assert.match(migration, /not yet instrumented/);
});

test("long videos support an owner-set expiry within the admin ceiling", () => {
  assert.match(migration, /add column if not exists expires_at timestamptz/);
  assert.match(migration, /function public\.raye2_set_video_expiry\(p_media_id uuid, p_days integer\)/);
  assert.match(migration, /least\(14, greatest\(1, public\.raye2_rule_int\('creator\.max_video_expiry_days', 14\)\)\)/);
  assert.match(migration, /'creator_video_expiry_set'/);
  assert.match(panel, /raye2_set_video_expiry/);
});

test("expired long videos are unpublished by the maintenance runner", () => {
  assert.match(migration, /function public\.raye2_expire_long_videos\(\)/);
  assert.match(migration, /'videos_expired', v_videos/);
  assert.match(migration, /grant execute on function public\.raye2_expire_long_videos\(\) to anon,authenticated/);
});

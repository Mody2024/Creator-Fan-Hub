import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, profile] = await Promise.all([
  read("../supabase/migrations/20261110850000_raye2_achievements_depth.sql"),
  read("../src/app/u/[handle]/profile-client.tsx")
]);

test("achievement criteria are published as metric and threshold", () => {
  assert.match(migration, /add column if not exists metric text/);
  assert.match(migration, /add column if not exists threshold integer/);
  assert.match(migration, /add column if not exists requires_trust boolean not null default false/);
  assert.match(migration, /'ten_posts','Community Regular'/);
});

test("achievements are never fabricated: the measured value must meet the threshold", () => {
  assert.match(migration, /v_value := public\.raye2_achievement_metric\(p_user_id, v_metric\);/);
  assert.match(migration, /if v_value < v_threshold then return; end if;/);
});

test("trust-gated achievements require good standing (anti-abuse)", () => {
  assert.match(migration, /function public\.raye2_member_in_good_standing\(/);
  assert.match(migration, /if coalesce\(v_trust,false\) and not public\.raye2_member_in_good_standing\(p_user_id\) then/);
  assert.match(migration, /from public\.member_blocks b where b\.blocked_id=p_user_id/);
});

test("new signals award achievements through triggers", () => {
  assert.match(migration, /create trigger raye2_mini_achievement after insert on public\.raye2_minis/);
  assert.match(migration, /create trigger raye2_clip_achievement after insert on public\.raye2_community_clips/);
  assert.match(migration, /create trigger raye2_poll_vote_achievement after insert on public\.community_post_poll_votes/);
  assert.match(migration, /create trigger raye2_group_achievement after insert on public\.raye2_group_members/);
});

test("transparent progress is member-scoped and shown on the profile", () => {
  assert.match(migration, /function public\.raye2_member_achievement_progress\(/);
  assert.match(migration, /only your own progress is available/);
  assert.match(profile, /raye2_member_achievement_progress/);
  assert.match(profile, /role="progressbar"/);
});

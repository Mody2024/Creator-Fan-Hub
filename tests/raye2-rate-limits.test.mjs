import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [rateLimits, recursionFix] = await Promise.all([
  read("../supabase/migrations/20261110550000_raye2_rate_limits.sql"),
  read("../supabase/migrations/20261110560000_raye2_fix_comment_policy_recursion.sql")
]);

test("high-frequency actions are rate limited server-side", () => {
  assert.match(rateLimits, /create table if not exists public\.raye2_rate_limit_counters/);
  assert.match(rateLimits, /create or replace function public\.raye2_rate_limit\(/);
  assert.match(rateLimits, /create or replace function public\.raye2_enforce_rate_limit\(\)/);
  assert.match(rateLimits, /create trigger raye2_posts_rate_limit/);
  assert.match(rateLimits, /create trigger raye2_messages_rate_limit/);
});

test("rate limits are configurable and admin-observable", () => {
  assert.match(rateLimits, /'rate\.community\.post\.hourly'/);
  assert.match(rateLimits, /create or replace function public\.raye2_get_rate_limit_usage\(\)/);
  assert.match(rateLimits, /create or replace function public\.raye2_get_rate_limit_stats\(/);
  assert.match(rateLimits, /raye2_is_platform_admin\(\)/);
});

test("comment-thread read policies avoid self-referential recursion", () => {
  assert.match(recursionFix, /create or replace function public\.raye2_comment_parent_visible\(/);
  assert.match(recursionFix, /create or replace function public\.raye2_short_comment_parent_visible\(/);
  assert.match(recursionFix, /create or replace function public\.raye2_video_comment_parent_visible\(/);
  assert.match(recursionFix, /drop policy if exists "Published comments visible" on public\.community_comments/);
  assert.doesNotMatch(recursionFix, /select 1 from public\.community_comments parent/);
});

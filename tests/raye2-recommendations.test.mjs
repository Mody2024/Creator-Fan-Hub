import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, home] = await Promise.all([
  read("../supabase/migrations/20261110640000_raye2_recommendations.sql"),
  read("../src/app/raye2/home/page.tsx")
]);

test("recommendations are explainable and privacy-safe", () => {
  assert.match(migration, /create or replace function public\.raye2_get_recommended_videos\(/);
  assert.match(migration, /based_on_watch_history/);
  assert.match(migration, /matched_category/);
  assert.match(migration, /vv\.viewer_id = \(select auth\.uid\(\)\)/);
});

test("recommendations respect exclusivity and expiry", () => {
  assert.match(migration, /vc\.exclusive_until is null or vc\.exclusive_until <= now\(\)/);
  assert.match(migration, /vc\.available_until is null or vc\.available_until > now\(\)/);
});

test("recommendation topics are owner-scoped", () => {
  assert.match(migration, /create or replace function public\.raye2_get_my_recommendation_topics\(/);
  assert.match(migration, /grant execute on function public\.raye2_get_my_recommendation_topics\(integer\) to authenticated/);
});

test("the home page surfaces recommendations with a reason", () => {
  assert.match(home, /rpc\("raye2_get_recommended_videos"/);
  assert.match(home, /based_on_watch_history/);
});

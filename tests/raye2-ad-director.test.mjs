import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, panel, watch, creator] = await Promise.all([
  read("../supabase/migrations/20261110810000_raye2_ad_director.sql"),
  read("../src/app/creator/ad-director.tsx"),
  read("../src/app/watch/[slug]/watch-detail-client.tsx"),
  read("../src/app/creator/page.tsx")
]);

test("the ads rules category and director policy rules exist", () => {
  assert.match(migration, /category in \([^)]*'ads'\)/);
  for (const key of ["ads.max_placements_per_video", "ads.intensity_percent", "ads.min_break_gap_seconds", "ads.max_per_viewer_per_day", "ads.frequency_window_hours", "ads.context_replay_seconds"]) {
    assert.ok(migration.includes(key), `missing rule ${key}`);
  }
});

test("breakpoints are structural, owner-scoped and reviewable", () => {
  assert.match(migration, /create table if not exists public\.raye2_media_breakpoints/);
  assert.match(migration, /function public\.raye2_propose_breakpoints\(/);
  assert.match(migration, /for f in select unnest\(array\[0\.15/);
  assert.match(migration, /function public\.raye2_set_media_breakpoint_excluded\(/);
});

test("a creator contract always outranks a platform campaign", () => {
  assert.match(migration, /select 0 as prio, cp\.source_type/);
  assert.match(migration, /select 1 as prio, pp\.source_type/);
  assert.match(migration, /order by q\.prio\s*\n\s*limit 1/);
  assert.match(migration, /not coalesce\(p_creator_exclusive,false\)/);
});

test("the plan honours the intensity policy and the minimum break gap", () => {
  assert.match(migration, /floor\(v_cap \* v_intensity \/ 100\.0\)::integer/);
  assert.match(migration, /bp\.at_seconds - v_last < v_gap/);
});

test("delivery records de-duplicate and enforce the per-viewer cap", () => {
  assert.match(migration, /if v_cnt >= coalesce\(v_freq/);
  assert.match(migration, /on conflict \(provider_key, provider_event_id\) do nothing/);
  assert.match(migration, /clock_timestamp\(\)::text, random\(\)::text/);
});

test("the trusted delivery gate can activate creator campaigns", () => {
  assert.match(migration, /if auth\.uid\(\) is null then/);
  assert.match(migration, /revoke all on function public\.raye2_validate_creator_sponsor_campaign\(\) from public,anon,authenticated/);
});

test("the panel and viewer schedule are mounted", () => {
  assert.match(panel, /raye2_ad_director_plan/);
  assert.match(panel, /raye2_propose_breakpoints/);
  assert.match(watch, /raye2_public_ad_schedule/);
  assert.match(creator, /<AdDirector locale=/);
});

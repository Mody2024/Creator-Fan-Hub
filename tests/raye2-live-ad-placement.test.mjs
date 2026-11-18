import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, studio] = await Promise.all([
  read("../supabase/migrations/20261110830000_raye2_live_ad_placement.sql"),
  read("../src/app/creator/creator-live-studio.tsx")
]);

test("live placement uses streamer-declared breaks only", () => {
  assert.match(migration, /create table if not exists public\.raye2_live_break_marks/);
  assert.match(migration, /function public\.raye2_mark_live_break\(/);
  assert.match(migration, /function public\.raye2_set_live_break_excluded\(/);
});

test("provider capability is admin-only and never invented", () => {
  assert.match(migration, /function public\.raye2_set_live_provider_capability\(/);
  assert.match(migration, /add column if not exists live_insertion_capable boolean not null default false/);
  assert.match(migration, /add column if not exists live_dvr_capable boolean not null default false/);
});

test("live placement fails safe when insertion is unsafe", () => {
  assert.match(migration, /if v_status <> 'live' or not v_insert or v_health in \('offline','reconnecting'\) then return; end if;/);
  assert.match(migration, /function public\.raye2_live_ad_readiness\(/);
  assert.match(migration, /array_append\(v_reasons/);
});

test("the context replay bridge needs a compliant DVR buffer", () => {
  assert.match(migration, /case when v_dvr then least\(15, greatest\(0, public\.raye2_rule_int\('ads\.context_replay_seconds', 5\)\)\) else 0 end/);
});

test("the live studio wires readiness and break marking", () => {
  assert.match(studio, /raye2_live_ad_readiness/);
  assert.match(studio, /raye2_mark_live_break/);
});

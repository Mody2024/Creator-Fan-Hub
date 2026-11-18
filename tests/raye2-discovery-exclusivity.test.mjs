import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261110690000_raye2_discovery_exclusivity_enforcement.sql");

const NAMES = [
  "raye2_get_related_videos",
  "raye2_get_topic_videos",
  "raye2_list_topics",
  "raye2_get_trending_videos",
  "raye2_get_trending_tags",
  "raye2_search",
  "raye2_get_watch_context",
  "raye2_get_continue_watching"
];

test("discovery RPCs are all recreated with the access check", () => {
  for (const name of NAMES) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\(`), `missing ${name}`);
  }
});

test("each recreated RPC gates on raye2_can_view_video", () => {
  const hits = migration.match(/public\.raye2_can_view_video\(vc\.media_id\)/g) ?? [];
  assert.ok(hits.length >= 8, `expected at least 8 gates, found ${hits.length}`);
});

test("topic functions are dropped before recreation to change the return type", () => {
  assert.match(migration, /drop function if exists public\.raye2_list_topics\(integer, integer\)/);
});

test("grants are preserved for anon and authenticated", () => {
  assert.match(migration, /grant execute on function public\.raye2_search\(text,integer\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_get_continue_watching\(integer\) to authenticated/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261110710000_raye2_creator_profile_watch_access.sql");

test("creator, profile and watch-together reads are recreated", () => {
  for (const name of ["raye2_list_creators", "raye2_get_profile_overview", "raye2_validate_watch_source"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\(`), `missing ${name}`);
  }
});

test("each recreated read gates on raye2_can_view_video", () => {
  const hits = migration.match(/public\.raye2_can_view_video\(/g) ?? [];
  assert.ok(hits.length >= 4, `expected at least 4 gates, found ${hits.length}`);
});

test("grants are preserved", () => {
  assert.match(migration, /grant execute on function public\.raye2_list_creators\(integer,text\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_validate_watch_source\(text,uuid,text\) to authenticated/);
});

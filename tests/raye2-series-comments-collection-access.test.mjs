import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261110720000_raye2_series_comments_collection_access.sql");

test("series, comment-thread and collection reads are recreated", () => {
  for (const name of ["raye2_list_series", "raye2_get_series", "raye2_get_video_comment_thread", "raye2_get_video_comment_replies", "raye2_get_collection"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\(`), `missing ${name}`);
  }
});

test("each recreated read gates on raye2_can_view_video", () => {
  const hits = migration.match(/public\.raye2_can_view_video\(/g) ?? [];
  assert.ok(hits.length >= 5, `expected at least 5 gates, found ${hits.length}`);
});

test("grants are preserved", () => {
  assert.match(migration, /grant execute on function public\.raye2_get_series\(text,integer\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_get_collection\(uuid,integer\) to authenticated/);
});

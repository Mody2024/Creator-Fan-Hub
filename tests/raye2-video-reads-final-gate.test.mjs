import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const migration = await read("../supabase/migrations/20261110730000_raye2_video_reads_final_gate.sql");

test("reaction counts, view recording and comment-parent visibility are recreated", () => {
  for (const name of ["get_video_reaction_counts", "record_video_view", "raye2_video_comment_parent_visible"]) {
    assert.match(migration, new RegExp(`create or replace function public\\.${name}\\(`), `missing ${name}`);
  }
});

test("each recreated read gates on raye2_can_view_video", () => {
  const hits = migration.match(/public\.raye2_can_view_video\(/g) ?? [];
  assert.ok(hits.length >= 3, `expected at least 3 gates, found ${hits.length}`);
});

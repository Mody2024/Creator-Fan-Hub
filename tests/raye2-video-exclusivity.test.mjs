import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, panel] = await Promise.all([
  read("../supabase/migrations/20261110610000_raye2_video_exclusivity.sql"),
  read("../src/app/creator/creator-video-exclusivity.tsx")
]);

test("video exclusivity and expiry are enforced on the catalog read path", () => {
  assert.match(migration, /create or replace function public\.raye2_video_accessible\(/);
  assert.match(migration, /create or replace function public\.raye2_can_view_video\(/);
  assert.match(migration, /create policy "Accessible videos are visible" on public\.video_catalog/);
  assert.match(migration, /exclusive_until/);
});

test("exclusivity and expiry caps are tunable and enforced", () => {
  assert.match(migration, /'video\.exclusive_max_days'/);
  assert.match(migration, /'video\.expiry_max_days'/);
  assert.match(migration, /exclusive window exceeds/);
  assert.match(migration, /availability window exceeds/);
});

test("only the owner sets exclusivity, and it is audited", () => {
  assert.match(migration, /create or replace function public\.raye2_set_video_exclusivity\(/);
  assert.match(migration, /only the owner can set exclusivity/);
  assert.match(migration, /video_exclusivity_set/);
});

test("the Creator Studio sets video exclusivity and expiry", () => {
  assert.match(panel, /rpc\("raye2_set_video_exclusivity"/);
  assert.match(panel, /rpc\("raye2_get_my_video_exclusivity"/);
});

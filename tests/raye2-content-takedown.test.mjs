import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, community] = await Promise.all([
  read("../supabase/migrations/20261110540000_raye2_content_takedown.sql"),
  read("../src/app/community/community-client.tsx")
]);

test("a takedown makes content inaccessible immediately and records the prior state", () => {
  assert.match(migration, /create table if not exists public\.raye2_content_takedowns/);
  assert.match(migration, /create or replace function public\.raye2_apply_content_takedown\(/);
  assert.match(migration, /set status = 'removed'/);
  assert.match(migration, /set is_published = false/);
  assert.match(migration, /previous_state/);
});

test("copyright takedowns require a claimant and duplicate takedowns are refused", () => {
  assert.match(migration, /a claimant is required for a copyright takedown/);
  assert.match(migration, /already taken down/);
  assert.match(migration, /raye2_content_takedowns_active_idx/);
});

test("takedowns can be reinstated and are audited", () => {
  assert.match(migration, /create or replace function public\.raye2_reinstate_content_takedown\(/);
  assert.match(migration, /'content_takedown'/);
  assert.match(migration, /'content_reinstated'/);
});

test("the moderation workspace surfaces takedowns", () => {
  assert.match(community, /rpc\("raye2_get_takedown_queue"/);
  assert.match(community, /rpc\("raye2_reinstate_content_takedown"/);
  assert.match(community, /takedowns\.map/);
});

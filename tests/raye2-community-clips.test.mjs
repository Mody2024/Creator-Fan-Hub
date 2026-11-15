import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, page, client, watch] = await Promise.all([
  read("../supabase/migrations/20261110840000_raye2_community_clips.sql"),
  read("../src/app/clips/page.tsx"),
  read("../src/app/clips/clips-client.tsx"),
  read("../src/app/watch/[slug]/watch-detail-client.tsx")
]);

test("community clips are a distinct table with attribution and expiry", () => {
  assert.match(migration, /create table if not exists public\.raye2_community_clips/);
  assert.match(migration, /attribution_text text not null/);
  assert.match(migration, /expires_at timestamptz not null/);
});

test("source creators can disable clipping and it removes existing clips", () => {
  assert.match(migration, /add column if not exists allow_clipping boolean not null default true/);
  assert.match(migration, /function public\.raye2_set_source_clipping\(/);
  assert.match(migration, /set status='removed', removed_by=v_uid, removed_reason='source clipping disabled'/);
});

test("clip publishing enforces source permission, length and range", () => {
  assert.match(migration, /function public\.raye2_publish_community_clip\(/);
  assert.match(migration, /clipping is disabled for this source/);
  assert.match(migration, /clip duration must be between 1 and % seconds/);
  assert.match(migration, /clip range is outside the source duration/);
});

test("clips can be removed, expired, reported and swept by maintenance", () => {
  assert.match(migration, /function public\.raye2_remove_community_clip\(/);
  assert.match(migration, /function public\.raye2_expire_community_clips\(/);
  assert.match(migration, /'community_clip'/);
  assert.match(migration, /'clips_expired', v_clips/);
});

test("the community clips page and owner control are wired up", () => {
  assert.match(page, /raye2_run_maintenance/);
  assert.match(client, /raye2_publish_community_clip/);
  assert.match(client, /raye2_list_community_clips/);
  assert.match(watch, /raye2_set_source_clipping/);
});

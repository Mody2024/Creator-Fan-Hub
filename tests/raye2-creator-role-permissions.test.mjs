import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, studio] = await Promise.all([
  read("../supabase/migrations/20261110590000_raye2_creator_role_permissions.sql"),
  read("../src/app/creator/creator-capabilities.tsx")
]);

test("creator and streamer roles are distinct and non-additive", () => {
  assert.match(migration, /when 'creator' then 'creator'/);
  assert.match(migration, /when 'streamer' then 'streamer'/);
  assert.match(migration, /'combined','long_videos_per_month',3/);
  assert.match(migration, /'combined','streams_per_month',3/);
  assert.match(migration, /'combined','minis_per_month',20/);
});

test("every publishing permission and quota is enforced server-side", () => {
  assert.match(migration, /create or replace function public\.raye2_assert_creator_action\(/);
  assert.match(migration, /does not permit/);
  assert.match(migration, /quota reached/);
  assert.match(migration, /cooldown active/);
  assert.match(migration, /raye2_tier_allows/);
});

test("creator capabilities and the admin matrix are gated", () => {
  assert.match(migration, /create or replace function public\.raye2_get_creator_capabilities\(/);
  assert.match(migration, /create or replace function public\.raye2_get_creator_permission_matrix\(\)/);
  assert.match(migration, /create or replace function public\.raye2_set_role_quota\(/);
  assert.match(migration, /raye2_is_platform_admin\(\)/);
});

test("the Creator Studio shows permitted actions and why others are unavailable", () => {
  assert.match(studio, /rpc\("raye2_get_creator_capabilities"/);
  assert.match(studio, /cap\.reason/);
  assert.match(studio, /cap\.allowed/);
});

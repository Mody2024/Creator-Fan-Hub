import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, page, home] = await Promise.all([
  read("../supabase/migrations/20261110780000_raye2_minis.sql"),
  read("../src/app/minis/minis-client.tsx"),
  read("../src/app/minis/page.tsx"),
  read("../src/app/raye2/home/page.tsx")
]);

test("Mini's table enforces duration, ownership path and lifetime", () => {
  assert.match(migration, /create table if not exists public\.raye2_minis/);
  assert.match(migration, /duration_seconds integer not null check \(duration_seconds between 1 and 60\)/);
  assert.match(migration, /storage_path ~ '\^\[0-9a-f-\]\{36\}\//);
  assert.match(migration, /expires_at timestamptz not null/);
});

test("publish enforces role quota for creators and a daily cap for ordinary users", () => {
  assert.match(migration, /if v_tier = 'none' then/);
  assert.match(migration, /minis\.ordinary\.daily_limit/);
  assert.match(migration, /perform public\.raye2_assert_creator_action\('publish_mini'\)/);
  assert.match(migration, /least\(60, greatest\(1, public\.raye2_rule_int\('minis\.max_duration_seconds', 15\)\)\)/);
});

test("creator usage now counts streams and Mini's (fixes the silent quota bug)", () => {
  assert.match(migration, /when 'streams_per_month' then[\s\S]*from public\.raye2_live_streams s/);
  assert.match(migration, /when 'minis_per_month' then[\s\S]*from public\.raye2_minis mn/);
});

test("expiry marks clips expired and the feed hides them", () => {
  assert.match(migration, /update public\.raye2_minis set status='expired'/);
  assert.match(migration, /mn\.expires_at > now\(\)/);
  assert.match(migration, /grant execute on function public\.raye2_expire_minis\(\) to anon, authenticated/);
});

test("the Mini feed is public and the UI uploads via the shared resumable uploader", () => {
  assert.match(migration, /grant execute on function public\.raye2_list_minis\(integer\) to anon, authenticated/);
  assert.match(client, /uploadToSupabaseStorage/);
  assert.match(client, /raye2_publish_mini/);
  assert.match(client, /raye2-minis/);
  assert.match(page, /MinisClient/);
  assert.match(home, /href="\/minis"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, component, page] = await Promise.all([
  read("../supabase/migrations/20261111060000_raye2_creator_content_library.sql"),
  read("../src/app/creator/content-library.tsx"),
  read("../src/app/creator/page.tsx")
]);

test("the content library derives every publication state for owned long videos", () => {
  for (const state of ["'taken_down'", "'processing'", "'scheduled'", "'draft'", "'expired'", "'published'"]) {
    assert.ok(migration.includes(state), `state ${state} must be derived`);
  }
  assert.match(migration, /when public\.raye2_media_is_taken_down\(m\.media_id\) then 'taken_down'/);
  assert.match(migration, /when m\.published_at is null and m\.publish_at is not null then 'scheduled'/);
  assert.match(migration, /when m\.expires_at is not null and m\.expires_at <= now\(\) then 'expired'/);
});

test("the content library is owner-scoped and exposes no moderation trail", () => {
  assert.match(migration, /where m\.owner_id = auth\.uid\(\)/);
  assert.match(migration, /m\.media_type in \('video','youtube'\)/);
  assert.match(migration, /returns table \(\s*media_id uuid/);
  assert.match(migration, /grant execute on function public\.raye2_creator_content_library\(\) to authenticated/);
  assert.match(migration, /revoke all on function public\.raye2_creator_content_library\(\) from public,anon/);
  // The takedown flag is boolean only; no claimant/evidence leaks to creators.
  assert.doesNotMatch(migration, /claimant|evidence/);
});

test("the studio surface filters by state and shows per-state counts", () => {
  assert.match(component, /raye2_creator_content_library/);
  assert.match(component, /const STATES: ContentState\[\] = \["published", "scheduled", "draft", "expired", "processing", "taken_down"\]/);
  assert.match(component, /aria-pressed=\{filter === state\}/);
  assert.match(component, /counts\[state\]/);
  assert.match(component, /href=\{`\/watch\/\$\{row\.slug\}`\}/);
  assert.match(page, /<ContentLibrary locale=\{isArabic\?"ar":"en"\} \/>/);
});

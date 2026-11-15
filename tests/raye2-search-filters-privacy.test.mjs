import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, page] = await Promise.all([
  read("../supabase/migrations/20261110980000_raye2_search_filters_privacy.sql"),
  read("../src/app/search/page.tsx")
]);

test("search supports kind, category and recency filters", () => {
  assert.match(migration, /p_kind text default null/);
  assert.match(migration, /p_category text default null/);
  assert.match(migration, /p_recency text default null/);
  assert.match(migration, /invalid recency filter/);
  assert.match(page, /p_kind:kindParam\|\|null,p_category:selectedCat\|\|null,p_recency:selectedRecency\|\|null/);
  assert.match(page, /raye2_get_search_facets/);
});

test("search respects blocks and privacy", () => {
  const blocked = migration.match(/not public\.is_member_blocked\(/g) ?? [];
  assert.ok(blocked.length >= 4, "every content source must exclude blocked members");
  assert.match(migration, /mp\.visibility = 'public'/);
  assert.match(migration, /cp\.status = 'published'/);
  assert.match(migration, /sv\.status = 'published'/);
});

test("the dead Spaces tab is backed by real group rows, and Mini's are searchable", () => {
  assert.match(migration, /'group'::text as kind/);
  assert.match(migration, /from public\.raye2_groups g/);
  assert.match(migration, /g\.visibility = 'public'/);
  assert.match(migration, /g\.status in \('active','read_only'\)/);
  assert.match(migration, /'short'::text as kind/);
  assert.match(migration, /from public\.community_short_videos sv/);
  assert.match(page, /kindMap:Record<string,string>=\{videos:"video",people:"person",posts:"post",tags:"tag",groups:"group",minis:"short",moments:"moment",events:"event"\}/);
  assert.match(page, /showMinis/);
});

test("search covers active Moments and public events and hides expired Moments", () => {
  assert.match(migration, /'moment'::text as kind/);
  assert.match(migration, /cp\.is_moment = true/);
  assert.match(migration, /cp\.expires_at is null or cp\.expires_at > now\(\)/);
  assert.match(migration, /'event'::text as kind/);
  assert.match(migration, /from public\.events e/);
  assert.match(migration, /e\.status = 'published'/);
  assert.match(page, /showMoments/);
  assert.match(page, /showEvents/);
});

test("the old unfiltered two-argument search is replaced", () => {
  assert.match(migration, /drop function if exists public\.raye2_search\(text, integer\)/);
  assert.match(migration, /grant execute on function public\.raye2_search\(text,integer,text,text,text\) to anon, authenticated/);
  assert.doesNotMatch(page, /raye2_search",\{p_query:term,p_limit:40\}/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, searchPage] = await Promise.all([
  read("../supabase/migrations/20261110300000_raye2_search_groups.sql"),
  read("../src/app/search/page.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("search groups migration replaces the unified RPC in place", () => {
  assert.match(migration, /create or replace function public\.raye2_search\(\s*p_query text,\s*p_limit integer default 30\s*\)/);
  assert.match(migration, /grant execute on function public\.raye2_search\(text,integer\) to anon, authenticated/);
  assert.match(migration, /revoke all on function public\.raye2_search\(text,integer\) from public/);
  const body = functionBody(migration, "raye2_search");
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path = ''/);
  assert.match(body, /stable/i);
});

test("search now returns public groups and keeps the existing kinds", () => {
  const body = functionBody(migration, "raye2_search");
  assert.match(body, /'group'::text as kind/);
  assert.match(body, /'video'::text as kind/);
  assert.match(body, /'person'::text as kind/);
  assert.match(body, /'post'::text as kind/);
  assert.match(body, /'tag'::text as kind/);
  assert.match(body, /g\.visibility = 'public'/);
  assert.match(body, /g\.status in \('active', 'read_only'\)/);
  assert.match(body, /union all select \* from groups/);
});

test("search excludes accounts the viewer blocked in both directions", () => {
  const body = functionBody(migration, "raye2_search");
  assert.match(body, /b\.blocker_id = \(select auth\.uid\(\)\) then b\.blocked_id/);
  assert.match(body, /else b\.blocker_id/);
  assert.match(body, /not exists \(select 1 from blocked bl where bl\.uid = mp\.user_id\)/);
  assert.match(body, /not exists \(select 1 from blocked bl where bl\.uid = cp\.author_id\)/);
});

test("discover page renders a spaces section and tab that link to group pages", () => {
  assert.match(searchPage, /groups=rows\.filter\(row=>row\.kind==="group"\)/);
  assert.match(searchPage, /showGroups=selectedType==="all"\|\|selectedType==="groups"/);
  assert.match(searchPage, /href=\{query\("groups"\)\}/);
  assert.match(searchPage, /href=\{"\/groups\/"\+group\.slug\}/);
  assert.match(searchPage, /noGroups/);
});

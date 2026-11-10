import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, searchPage] = await Promise.all([
  read("../supabase/migrations/20261110230000_raye2_unified_search.sql"),
  read("../src/app/search/page.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("unified search is a public pinned SECURITY DEFINER read RPC", () => {
  const body = functionBody(migration, "raye2_search");
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path\s*=\s*''/i);
  assert.match(body, /stable/i);
  assert.match(migration, /grant execute on function public\.raye2_search\(text,integer\) to anon, authenticated/);
  assert.match(migration, /revoke all on function public\.raye2_search\(text,integer\) from public/);
});

test("unified search covers videos, people, posts and tags in one result set", () => {
  const body = functionBody(migration, "raye2_search");
  assert.match(body, /'video'::text as kind/);
  assert.match(body, /'person'::text as kind/);
  assert.match(body, /'post'::text as kind/);
  assert.match(body, /'tag'::text as kind/);
  assert.match(body, /union all/);
});

test("unified search only exposes published content and public members", () => {
  const body = functionBody(migration, "raye2_search");
  assert.match(body, /mi\.is_published = true/);
  assert.match(body, /mi\.media_type in \('video', 'youtube'\)/);
  assert.match(body, /vc\.published_at is not null/);
  assert.match(body, /mp\.visibility = 'public'/);
  assert.match(body, /cp\.status = 'published'/);
  assert.match(body, /length\(btrim\(tag\)\) between 1 and 40/);
});

test("unified search ranks exact and prefix matches first and escapes wildcards", () => {
  const body = functionBody(migration, "raye2_search");
  assert.match(body, /when lower\(mi\.title\) = lower\(q\.raw\) then 0/);
  assert.match(body, /when mi\.title ilike q\.raw \|\| '%' then 1/);
  assert.ok(body.includes("replace(replace(replace(btrim(coalesce(p_query, '')), '\\', '\\\\'), '%', '\\%'), '_', '\\_')"), "expected wildcard escaping of \\, % and _");
  assert.match(body, /order by c\.rank asc, c\.title asc/);
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 30\), 1\), 60\)/);
});

test("the discover page searches through the unified RPC and renders a tags section", () => {
  assert.match(searchPage, /rpc\("raye2_search",\{p_query:term,p_limit:40\}\)/);
  assert.match(searchPage, /row\.kind==="video"/);
  assert.match(searchPage, /row\.kind==="person"/);
  assert.match(searchPage, /row\.kind==="post"/);
  assert.match(searchPage, /row\.kind==="tag"/);
  assert.match(searchPage, /showTags/);
  assert.match(searchPage, /href=\{query\("tags"\)\}/);
  assert.match(searchPage, /href=\{"\/topics\/"\+encodeURIComponent\(tag\.tag\)\}/);
});

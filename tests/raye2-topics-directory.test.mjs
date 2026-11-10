import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, indexPage, css] = await Promise.all([
  read("../supabase/migrations/20261110310000_raye2_topics_directory.sql"),
  read("../src/app/topics/page.tsx"),
  read("../src/app/topics/topics.css")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("topic directory replaces the list RPC in place after dropping the old signature", () => {
  assert.match(migration, /drop function if exists public\.raye2_list_topics\(integer, integer\)/);
  assert.match(migration, /create or replace function public\.raye2_list_topics\(\s*p_limit integer default 40,\s*p_min_count integer default 1\s*\)/);
  assert.match(migration, /returns table \(tag text, video_count bigint, total_views bigint, recent_video_count bigint\)/);
  assert.match(migration, /grant execute on function public\.raye2_list_topics\(integer,integer\) to anon, authenticated/);
  assert.match(migration, /revoke all on function public\.raye2_list_topics\(integer,integer\) from public/);
});

test("topic directory aggregates only published videos with view and recency counts", () => {
  const body = functionBody(migration, "raye2_list_topics");
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path = ''/);
  assert.match(body, /stable/i);
  assert.match(body, /mi\.is_published = true and mi\.media_type in \('video','youtube'\)/);
  assert.match(body, /vc\.published_at is not null/);
  assert.match(body, /cross join lateral unnest\(vc\.tags\)/);
  assert.match(body, /coalesce\(sum\(vwc\.views\), 0\)/);
  assert.match(body, /count\(\*\) filter \(where vc\.published_at > now\(\) - interval '90 days'\)/);
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 40\), 1\), 200\)/);
});

test("the topics index page lists topics with stats and a popularity filter", () => {
  assert.match(indexPage, /rpc\("raye2_list_topics",\{p_limit:120,p_min_count:minCount\}\)/);
  assert.match(indexPage, /dir=\{isArabic\?"rtl":"ltr"\}/);
  assert.match(indexPage, /className=\{minCount===2\?"active":""\}/);
  assert.match(indexPage, /href="\/topics\?min=2"/);
  assert.match(indexPage, /href=\{"\/topics\/"\+encodeURIComponent\(topic\.tag\)\}/);
  assert.match(indexPage, /recent_video_count/);
  assert.match(css, /\.raye2-topic-index-grid/);
});

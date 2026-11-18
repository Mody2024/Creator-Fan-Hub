import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, searchPage] = await Promise.all([
  read("../supabase/migrations/20261110200000_raye2_discovery_trending.sql"),
  read("../src/app/search/page.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

const trendingFunctions = [
  "raye2_get_trending_posts",
  "raye2_get_trending_videos",
  "raye2_get_trending_tags"
];

test("trending RPCs are public SECURITY DEFINER functions with pinned search_path", () => {
  for (const name of trendingFunctions) {
    const body = functionBody(migration, name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path\s*=\s*''/i, name);
    assert.match(body, /\bstable\b/i, name);
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(integer,integer\\) to anon, authenticated`), name);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(integer,integer\\) from public`), name);
  }
});

test("trending RPCs only expose published content and bound their limits", () => {
  assert.match(functionBody(migration, "raye2_get_trending_posts"), /p\.status = 'published'/);
  assert.match(functionBody(migration, "raye2_get_trending_posts"), /cc\.status = 'published'/);
  const videos = functionBody(migration, "raye2_get_trending_videos");
  assert.match(videos, /mi\.is_published = true and mi\.media_type in \('video','youtube'\)/);
  assert.match(videos, /vc\.published_at is not null/);
  assert.match(videos, /vc2\.status = 'published'/);
  for (const name of trendingFunctions) {
    assert.match(functionBody(migration, name), /least\(greatest\(coalesce\(p_(limit|window)/, name);
  }
});

test("trending scores weight engagement and decay with age", () => {
  assert.match(functionBody(migration, "raye2_get_trending_posts"), /3 \* coalesce\(r\.reaction_count, 0\) \+ 2 \* coalesce\(c\.comment_count, 0\)/);
  assert.match(functionBody(migration, "raye2_get_trending_posts"), /power\(extract\(epoch from \(now\(\) - p\.created_at\)\)/);
  assert.match(functionBody(migration, "raye2_get_trending_videos"), /power\(extract\(epoch from \(now\(\) - coalesce\(vc\.published_at, vc\.updated_at\)\)\)/);
  assert.match(functionBody(migration, "raye2_get_trending_tags"), /cross join lateral unnest\(vc\.tags\)/);
});

test("the discover page shows trending feeds when no search term is present", () => {
  assert.match(searchPage, /raye2_get_trending_videos/);
  assert.match(searchPage, /raye2_get_trending_posts/);
  assert.match(searchPage, /raye2_get_trending_tags/);
  assert.match(searchPage, /\{!term&&/);
  assert.match(searchPage, /t\.trending/);
  assert.match(searchPage, /t\.noTrending/);
});

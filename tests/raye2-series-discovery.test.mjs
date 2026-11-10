import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, indexPage, detailPage, css] = await Promise.all([
  read("../supabase/migrations/20261110250000_raye2_series_discovery.sql"),
  read("../src/app/series/page.tsx"),
  read("../src/app/series/[slug]/page.tsx"),
  read("../src/app/series/raye2-series.css")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("series discovery exposes two pinned public SECURITY DEFINER read RPCs", () => {
  for (const name of ["raye2_list_series", "raye2_get_series"]) {
    const body = functionBody(migration, name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path\s*=\s*''/i);
    assert.match(body, /stable/i);
  }
  assert.match(migration, /grant execute on function public\.raye2_list_series\(integer\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_get_series\(text,integer\) to anon, authenticated/);
});

test("series only exposes published playlists and published videos, including external embeds", () => {
  const list = functionBody(migration, "raye2_list_series");
  assert.match(list, /pl\.is_published = true/);
  assert.match(list, /mi\.is_published = true/);
  assert.match(list, /mi\.media_type in \('video', 'youtube'\)/);
  assert.match(list, /vc\.published_at is not null/);
  assert.match(list, /coalesce\(a\.video_count, 0\) > 0/);
  const detail = functionBody(migration, "raye2_get_series");
  assert.match(detail, /pl\.is_published = true/);
  assert.match(detail, /mi\.media_type in \('video', 'youtube'\)/);
});

test("series index reports real counts, runtime and a public cover path", () => {
  const list = functionBody(migration, "raye2_list_series");
  assert.match(list, /coalesce\(sum\(p\.duration_seconds\), 0\) as total_duration_seconds/);
  assert.match(list, /cover\.storage_path like 'creator-media-public\/%'/);
  assert.match(list, /least\(greatest\(coalesce\(p_limit, 40\), 1\), 100\)/);
});

test("series detail lowercases the slug, orders by position and clamps the limit", () => {
  const detail = functionBody(migration, "raye2_get_series");
  assert.match(detail, /pl\.slug = lower\(btrim\(coalesce\(p_slug, ''\)\)\)/);
  assert.match(detail, /order by vpi\.position asc/);
  assert.match(detail, /least\(greatest\(coalesce\(p_limit, 100\), 1\), 200\)/);
});

test("both series surfaces are bilingual, RTL-aware and use the RPCs", () => {
  assert.match(indexPage, /rpc\("raye2_list_series",\{p_limit:60\}\)/);
  assert.match(indexPage, /dir=\{isArabic\?"rtl":"ltr"\}/);
  assert.match(indexPage, /formatRuntime/);
  assert.match(detailPage, /rpc\("raye2_get_series",\{p_slug:slug,p_limit:200\}\)/);
  assert.match(detailPage, /dir=\{isArabic\?"rtl":"ltr"\}/);
  assert.match(detailPage, /episode\.media_type==="youtube"/);
  assert.match(css, /nhen-series-cover/);
});

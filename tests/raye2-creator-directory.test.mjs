import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, creatorsPage, homePage, searchPage] = await Promise.all([
  read("../supabase/migrations/20261110240000_raye2_creator_directory.sql"),
  read("../src/app/creators/page.tsx"),
  read("../src/app/raye2/home/page.tsx"),
  read("../src/app/search/page.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("the creator directory is a public pinned SECURITY DEFINER read RPC", () => {
  const body = functionBody(migration, "raye2_list_creators");
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path\s*=\s*''/i);
  assert.match(body, /stable/i);
  assert.match(migration, /grant execute on function public\.raye2_list_creators\(integer,text\) to anon, authenticated/);
  assert.match(migration, /revoke all on function public\.raye2_list_creators\(integer,text\) from public/);
});

test("the creator directory counts only published public creators", () => {
  const body = functionBody(migration, "raye2_list_creators");
  assert.match(body, /mi\.is_published = true/);
  assert.match(body, /mi\.media_type in \('video', 'youtube'\)/);
  assert.match(body, /vc\.published_at is not null/);
  assert.match(body, /mp\.visibility = 'public'/);
  assert.match(body, /coalesce\(vc\.published_videos, 0\) > 0/);
});

test("the creator directory supports published, followers and views sorting with a bounded limit", () => {
  const body = functionBody(migration, "raye2_list_creators");
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 24\), 1\), 60\)/);
  assert.match(body, /when p_sort = 'followers' then 'followers'/);
  assert.match(body, /when p_sort = 'views' then 'views'/);
  assert.match(body, /case when b\.sort_key = 'published' then coalesce\(vc\.published_videos, 0\) end desc nulls last/);
  assert.match(body, /case when b\.sort_key = 'followers' then coalesce\(fc\.follower_count, 0\) end desc nulls last/);
  assert.match(body, /case when b\.sort_key = 'views' then coalesce\(vw\.total_views, 0\) end desc nulls last/);
});

test("the creators page localizes, sorts and links profiles to /u/<handle>", () => {
  assert.match(creatorsPage, /rpc\("raye2_list_creators",\{p_limit:48,p_sort:selected\}\)/);
  assert.match(creatorsPage, /dir=\{isArabic\?"rtl":"ltr"\}/);
  assert.match(creatorsPage, /href=\{"\/u\/"\+creator\.handle\}/);
  assert.match(creatorsPage, /selected==="followers"/);
  assert.match(creatorsPage, /selected==="views"/);
  assert.match(creatorsPage, /type SortKey="published"\|"followers"\|"views"/);
});

test("the directory is reachable from the home and discover rails", () => {
  assert.match(homePage, /href="\/creators"/);
  assert.match(searchPage, /href="\/creators"/);
});

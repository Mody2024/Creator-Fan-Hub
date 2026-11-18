import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, page, client] = await Promise.all([
  read("../supabase/migrations/20261110260000_raye2_community_feed.sql"),
  read("../src/app/community/page.tsx"),
  read("../src/app/community/community-client.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

test("community feed exposes pinned public SECURITY DEFINER read RPCs", () => {
  for (const name of ["raye2_get_community_feed", "raye2_get_post_comments"]) {
    const body = functionBody(migration, name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path\s*=\s*''/i);
    assert.match(body, /stable/i);
  }
  assert.match(migration, /grant execute on function public\.raye2_get_community_feed\(integer,text,boolean\) to anon, authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_get_post_comments\(uuid,integer\) to anon, authenticated/);
});

test("feed returns author, reaction and comment counts and only published posts", () => {
  const body = functionBody(migration, "raye2_get_community_feed");
  assert.match(body, /p\.status = 'published'/);
  assert.match(body, /count\(\*\) as reaction_count from public\.community_reactions/);
  assert.match(body, /cc\.status = 'published'/);
  assert.match(body, /mp\.handle/);
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 40\), 1\), 80\)/);
});

test("feed supports hot ordering, following-only filtering and block exclusion", () => {
  const body = functionBody(migration, "raye2_get_community_feed");
  assert.match(body, /when p_sort = 'hot' then 'hot' else 'latest' end/);
  assert.match(body, /p_following_only or p\.author_id in \(select followed_id from followed\)/);
  assert.match(body, /not exists \(select 1 from blocked b where b\.uid = p\.author_id\)/);
  assert.match(body, /case when b\.sort_key = 'hot' then s\.hot_score end desc nulls last/);
});

test("comment thread attributes authors and only exposes published comments on published posts", () => {
  const body = functionBody(migration, "raye2_get_post_comments");
  assert.match(body, /p\.status = 'published'/);
  assert.match(body, /cc\.status = 'published'/);
  assert.match(body, /order by cc\.created_at asc/);
  assert.match(body, /least\(greatest\(coalesce\(p_limit, 50\), 1\), 100\)/);
});

test("community surfaces use the feed and comment RPCs and show counts and authors", () => {
  assert.match(page, /rpc\("raye2_get_community_feed", \{ p_limit: 40, p_sort: selectedSort, p_following_only: followingOnly \}\)/);
  assert.match(page, /commentCount: Number\(row\.comment_count\)/);
  assert.match(client, /rpc\("raye2_get_post_comments", \{ p_post_id: postId, p_limit: 50 \}\)/);
  assert.match(client, /commentCounts\[post\.id\]/);
  assert.match(client, /comment\.author_handle/);
  assert.match(client, /selectedSort==="hot"/);
});

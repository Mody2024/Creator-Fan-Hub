import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, topicPage, watchPage, watchClient, globals] = await Promise.all([
  read("../supabase/migrations/20261110210000_raye2_video_topics_related.sql"),
  read("../src/app/topics/[tag]/page.tsx"),
  read("../src/app/watch/[slug]/page.tsx"),
  read("../src/app/watch/[slug]/watch-detail-client.tsx"),
  read("../src/app/globals.css")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

const topicFunctions = [
  ["raye2_get_related_videos", "uuid,integer"],
  ["raye2_list_topics", "integer,integer"],
  ["raye2_get_topic_videos", "text,integer"]
];

test("topic and related-video RPCs are public SECURITY DEFINER functions with pinned search_path", () => {
  for (const [name, args] of topicFunctions) {
    const body = functionBody(migration, name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path\s*=\s*''/i, name);
    assert.match(body, /\bstable\b/i, name);
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\(${args.replace(/[()]/g, "\\$&")}\\) to anon, authenticated`), name);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\(${args.replace(/[()]/g, "\\$&")}\\) from public`), name);
  }
});

test("topic RPCs only expose published video/youtube media and bound their limits", () => {
  for (const [name] of topicFunctions) {
    const body = functionBody(migration, name);
    assert.match(body, /mi\.is_published = true and mi\.media_type in \('video','youtube'\)/, name);
    assert.match(body, /vc\.published_at is not null/, name);
    assert.match(body, /least\(greatest\(coalesce\(p_limit/, name);
  }
  assert.match(functionBody(migration, "raye2_get_topic_videos"), /lower\(btrim\(coalesce\(p_tag, ''\)\)\)/);
  assert.match(functionBody(migration, "raye2_get_topic_videos"), /exists \(select 1 from unnest\(vc\.tags\) tag where lower\(tag\) = b\.wanted\)/);
});

test("list-topics aggregates tags case-insensitively and drops blank or oversized tags", () => {
  const body = functionBody(migration, "raye2_list_topics");
  assert.match(body, /lower\(tag\) as tag, count\(\*\) as video_count/);
  assert.match(body, /cross join lateral unnest\(vc\.tags\)/);
  assert.match(body, /length\(btrim\(tag\)\) between 1 and 40/);
  assert.match(body, /group by lower\(tag\)/);
});

test("related videos rank by shared tags then recency and never return the source video", () => {
  const body = functionBody(migration, "raye2_get_related_videos");
  assert.match(body, /vc\.media_id <> s\.media_id/);
  assert.match(body, /order by c\.shared_tags desc, c\.published_at desc/);
  assert.match(body, /c\.shared_tags > 0 or c\.category = \(select category from source\)/);
});

test("the topic page localizes and renders published videos for a tag", () => {
  assert.match(topicPage, /cookieStore\.get\("nhen_locale"\)/);
  assert.match(topicPage, /dir=\{isArabic\?"rtl":"ltr"\}/);
  assert.match(topicPage, /raye2_get_topic_videos/);
  assert.match(topicPage, /فيديوهات بوسم/);
  assert.match(topicPage, /Videos tagged/);
});

test("the watch page loads related videos and the detail links tags to topics", () => {
  assert.match(watchPage, /raye2_get_related_videos/);
  assert.match(watchPage, /related=\{related\}/);
  assert.match(watchClient, /href=\{"\/topics\/"\+encodeURIComponent\(tag\)\}/);
  assert.match(watchClient, /raye2-detail-related/);
  assert.match(watchClient, /related:"More like this"/);
  assert.match(watchClient, /related:"المزيد كهذا"/);
  assert.match(globals, /\.raye2-detail-related-grid/);
});

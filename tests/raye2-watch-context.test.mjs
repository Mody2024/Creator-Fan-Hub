import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, watchPage, watchClient, css] = await Promise.all([
  read("../supabase/migrations/20261110320000_raye2_watch_context.sql"),
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

test("watch context is a public pinned SECURITY DEFINER read RPC", () => {
  const body = functionBody(migration, "raye2_get_watch_context");
  assert.match(body, /security definer/i);
  assert.match(body, /set search_path = ''/);
  assert.match(body, /stable/i);
  assert.match(migration, /grant execute on function public\.raye2_get_watch_context\(text\) to anon, authenticated/);
  assert.match(migration, /revoke all on function public\.raye2_get_watch_context\(text\) from public/);
});

test("watch context only resolves published videos and withholds blocked creators", () => {
  const body = functionBody(migration, "raye2_get_watch_context");
  assert.match(body, /mi\.is_published = true/);
  assert.match(body, /mi\.media_type in \('video', 'youtube'\)/);
  assert.match(body, /vc\.published_at is not null/);
  assert.match(body, /not public\.is_member_blocked\(t\.owner_id\)/);
  assert.match(body, /exists\(select 1 from public\.member_follows f2/);
});

test("watch context picks the first published playlist and counts playable episodes", () => {
  const body = functionBody(migration, "raye2_get_watch_context");
  assert.match(body, /join public\.video_playlists pl on pl\.id = vpi\.playlist_id and pl\.is_published = true/);
  assert.match(body, /order by pl\.position asc, vpi\.position asc, pl\.created_at asc/);
  assert.match(body, /limit 1/);
  assert.match(body, /episode_count/);
});

test("the watch page loads the context RPC and the client renders creator and series blocks", () => {
  assert.match(watchPage, /rpc\("raye2_get_watch_context",\{p_slug:slug\}\)/);
  assert.match(watchPage, /context=\{context\}/);
  assert.match(watchClient, /raye2_toggle_follow/);
  assert.match(watchClient, /raye2-detail-creator/);
  assert.match(watchClient, /raye2-detail-series/);
  assert.match(watchClient, /href=\{"\/u\/"\+props\.context\.creator_handle\}/);
  assert.match(watchClient, /href=\{"\/series\/"\+props\.context\.series_slug\}/);
  assert.match(css, /\.raye2-detail-creator\{/);
});

const anonFix = await read("../supabase/migrations/20261110330000_raye2_restore_anon_workspace_helper.sql");

test("the anon workspace-helper regression is repaired by re-granting execute to anon", () => {
  assert.match(anonFix, /grant execute on function public\.can_view_creator_workspace\(\) to anon/);
  assert.doesNotMatch(anonFix, /grant execute on function public\.can_view_creator_workspace\(\) to authenticated/);
});

test("the watch page disambiguates the media_items embed so the catalog read never errors", () => {
  assert.match(watchPage, /media_items!video_catalog_media_id_fkey!inner\(/);
  assert.doesNotMatch(watchPage, /media_items!inner\(/);
});

test("no public page keeps the ambiguous media_items embed", async () => {
  const pages = await Promise.all([
    read("../src/app/page.tsx"),
    read("../src/app/videos/public-videos.tsx"),
    read("../src/app/watch/page.tsx"),
    read("../src/app/raye2/home/page.tsx"),
    read("../src/app/saved/page.tsx"),
    read("../src/app/shorts/page.tsx"),
    read("../src/app/community/community-client.tsx")
  ]);
  for (const source of pages) {
    assert.doesNotMatch(source, /media_items!inner\(/);
  }
});


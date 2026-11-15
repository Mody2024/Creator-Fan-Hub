import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, more, media, page] = await Promise.all([
  read("../supabase/migrations/20261110680000_raye2_watch_library_pagination.sql"),
  read("../src/app/watch/watch-library-more.tsx"),
  read("../src/app/watch/watch-library-media.ts"),
  read("../src/app/watch/page.tsx")
]);

test("the watch library paginates by keyset cursor", () => {
  assert.match(migration, /create or replace function public\.raye2_get_watch_library_page\(/);
  assert.match(migration, /\(vc\.published_at, vc\.media_id\) < \(p_before,/);
  assert.match(migration, /order by vc\.published_at desc, vc\.media_id desc/);
});

test("the watch library page respects exclusivity and expiry", () => {
  assert.match(migration, /public\.raye2_can_view_video\(vc\.media_id\)/);
});

test("the watch library exposes load-more with states", () => {
  assert.match(more, /rpc\("raye2_get_watch_library_page"/);
  assert.match(more, /Load more videos/);
  assert.match(more, /reached the end/);
});

test("watch card media validation is shared and safe", () => {
  assert.match(media, /creator-media-public\//);
  assert.match(media, /youtube-nocookie\.com/);
  assert.match(media, /processing_status/);
  assert.match(page, /raye2_get_watch_library_page/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, more, home] = await Promise.all([
  read("../supabase/migrations/20261110650000_raye2_feed_pagination.sql"),
  read("../src/app/raye2/home/home-feed-more.tsx"),
  read("../src/app/raye2/home/page.tsx")
]);

test("the community feed paginates by keyset cursor without duplicates", () => {
  assert.match(migration, /create or replace function public\.raye2_get_community_feed_page\(/);
  assert.match(migration, /\(p\.created_at, p\.id\) < \(p_before,/);
  assert.match(migration, /order by p\.created_at desc, p\.id desc/);
});

test("the home feed exposes load-more with loading, error and end states", () => {
  assert.match(more, /rpc\("raye2_get_community_feed_page"/);
  assert.match(more, /home-feed-more-error/);
  assert.match(more, /home-feed-more-end/);
});

test("the home page mounts the paginated feed continuation", () => {
  assert.match(home, /HomeFeedMore/);
});

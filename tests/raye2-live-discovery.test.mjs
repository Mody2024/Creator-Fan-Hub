import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, livePage, detailPage, home] = await Promise.all([
  read("../supabase/migrations/20261110620000_raye2_live_discovery.sql"),
  read("../src/app/live/page.tsx"),
  read("../src/app/live/[id]/page.tsx"),
  read("../src/app/raye2/home/page.tsx")
]);

test("live discovery lists only public live streams and in-window replays", () => {
  assert.match(migration, /create or replace function public\.raye2_get_live_now\(/);
  assert.match(migration, /s\.visibility = 'public'/);
  assert.match(migration, /s\.replay_until > now\(\)/);
  assert.match(migration, /grant execute on function public\.raye2_get_live_now\(integer\) to anon, authenticated/);
});

test("live watch detail is visibility-aware for anonymous viewers", () => {
  assert.match(migration, /grant execute on function public\.raye2_get_live_stream\(uuid\) to anon/);
  assert.match(detailPage, /rpc\("raye2_get_live_stream"/);
});

test("the live route and home surface discovery", () => {
  assert.match(livePage, /rpc\("raye2_get_live_now"/);
  assert.match(home, /rpc\("raye2_get_live_now"/);
  assert.match(home, /href="\/live"/);
});

test("live read functions compare ownership null-safely", () => {
  const liveStreaming = read("../supabase/migrations/20261110600000_raye2_live_streaming.sql");
  return liveStreaming.then((src) => {
    assert.match(src, /auth\.uid\(\) is not null and v_owner = auth\.uid\(\)/);
  });
});

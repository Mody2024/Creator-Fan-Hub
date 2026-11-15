import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, page] = await Promise.all([
  read("../supabase/migrations/20261110970000_raye2_profile_identity_depth.sql"),
  read("../src/app/u/[handle]/profile-client.tsx"),
  read("../src/app/u/[handle]/page.tsx")
]);

test("profile identity gains cover, links and interests", () => {
  assert.match(migration, /add column if not exists cover_url text/);
  assert.match(migration, /add column if not exists links jsonb/);
  assert.match(migration, /add column if not exists interests text\[\]/);
  assert.match(page, /coverUrl:overview\.cover_url/);
  assert.match(page, /links:\(overview\.links/);
  assert.match(page, /interests:\(overview\.interests/);
});

test("self-service profile update is server-validated and owner-only", () => {
  assert.match(migration, /function public\.raye2_update_my_profile\(/);
  assert.match(migration, /where p\.user_id = v_uid/);
  assert.match(migration, /website must be an http\(s\) URL/);
  assert.match(migration, /at most 6 links are allowed/);
  assert.match(migration, /at most 8 interests are allowed/);
  assert.match(client, /rpc\("raye2_update_my_profile"/);
});

test("connection list excludes members blocked by or blocking the viewer", () => {
  assert.match(migration, /function public\.raye2_get_member_connections\(/);
  assert.match(migration, /\(b\.blocker_id = v_me and b\.blocked_id = p\.user_id\)/);
  assert.match(migration, /\(b\.blocker_id = p\.user_id and b\.blocked_id = v_me\)/);
  assert.doesNotMatch(migration, /b\.blocker_id = p_user_id and b\.blocked_id = p_user_id/);
});

test("profile overview returns the new identity fields with the same visibility gate", () => {
  assert.match(migration, /mp\.cover_url, mp\.links,\s+mp\.interests/);
  assert.match(migration, /grant execute on function public\.raye2_get_profile_overview\(text\) to anon, authenticated/);
  assert.match(migration, /mp\.visibility = 'public' and not public\.is_member_blocked\(mp\.user_id\)/);
});

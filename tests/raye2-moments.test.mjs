import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, page, client, home] = await Promise.all([
  read("../supabase/migrations/20261110790000_raye2_moments.sql"),
  read("../src/app/moments/page.tsx"),
  read("../src/app/moments/moments-client.tsx"),
  read("../src/app/raye2/home/page.tsx")
]);

test("Moments reuse community posts with an explicit flag and expiry", () => {
  assert.match(migration, /add column if not exists is_moment boolean not null default false/);
  assert.match(migration, /add column if not exists expires_at timestamptz/);
  assert.match(migration, /insert into public\.community_posts\(author_id, body, linked_video_id, moment_start_seconds, moment_end_seconds, is_moment, status, expires_at\)/);
});

test("publishing a Moment enforces role, a linked video and the clip cap", () => {
  assert.match(migration, /a Moment must reference a video/);
  assert.match(migration, /least\(600, greatest\(1, public\.raye2_rule_int\('moments\.max_clip_seconds', 180\)\)\)/);
  assert.match(migration, /perform public\.raye2_assert_creator_action\('publish_moment'\)/);
});

test("creator usage counts Moments (no longer NULL)", () => {
  assert.match(migration, /when 'moments_per_month' then[\s\S]*from public\.community_posts p[\s\S]*p\.is_moment = true/);
});

test("expiry removes a Moment from the feed without deleting it", () => {
  assert.match(migration, /update public\.community_posts\s*\n\s*set status='removed'/);
  assert.match(migration, /and \(p\.expires_at is null or p\.expires_at > now\(\)\)/);
  assert.match(migration, /grant execute on function public\.raye2_list_moments\(integer\) to anon, authenticated/);
});

test("the Moments page and compose widget are wired up", () => {
  assert.match(page, /raye2_list_moments/);
  assert.match(page, /MomentsClient/);
  assert.match(client, /raye2_publish_moment/);
  assert.match(client, /get_creator_media/);
  assert.match(home, /href="\/moments"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, page, client] = await Promise.all([
  read("../supabase/migrations/20261111070000_raye2_community_feed_linked_slug.sql"),
  read("../src/app/community/page.tsx"),
  read("../src/app/community/community-client.tsx")
]);

test("the community feed resolves the linked video slug and start time", () => {
  assert.match(migration, /linked_video_slug text/);
  assert.match(migration, /moment_start_seconds integer/);
  assert.match(migration, /left join public\.video_catalog vc on vc\.media_id = s\.linked_video_id/);
  // Only viewers who may open the video get a slug, so no dead or gated links are rendered.
  assert.match(migration, /public\.raye2_can_view_video\(vc\.media_id\) then vc\.slug else null end/);
});

test("the shared-moment link uses the feed slug and timestamp, not a per-session lookup", () => {
  assert.match(page, /linkedVideoSlug: row\.linked_video_slug/);
  assert.match(page, /momentStart: row\.moment_start_seconds/);
  assert.match(client, /linkedVideoSlug\?: string \| null/);
  assert.match(client, /post\.linkedVideoSlug && <Link className="nhen-action" href=\{"\/watch\/"\+post\.linkedVideoSlug\+\(post\.momentStart \? "\?t="\+post\.momentStart : ""\)\}/);
  // The old buggy lookup that produced /watch/undefined must be gone.
  assert.doesNotMatch(client, /\/watch\/"\+momentVideos\.find/);
});

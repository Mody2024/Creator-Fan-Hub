import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, page] = await Promise.all([
  read("../supabase/migrations/20261116200000_raye2_community_posts_clips.sql"),
  read("../src/app/community/community-client.tsx"),
  read("../src/app/community/page.tsx")
]);

test("community posts may link one clip and keep clip and moment mutually exclusive", () => {
  assert.match(migration, /alter table public\.community_posts add column if not exists linked_clip_id uuid references public\.raye2_community_clips\(id\) on delete set null/);
  assert.match(migration, /community_posts_clip_link_check/);
  assert.match(migration, /linked_clip_id is null\s+or \(linked_video_id is null and moment_start_seconds is null and moment_end_seconds is null\)/);
});

test("a member may only attach a clip that is live and source-permitted", () => {
  assert.match(migration, /drop policy if exists "Members publish community posts instantly" on public\.community_posts;/);
  assert.match(migration, /create policy "Members publish community posts instantly" on public\.community_posts/);
  assert.match(migration, /select 1 from public\.raye2_community_clips c\s+where c\.id=linked_clip_id and c\.status='published' and c\.expires_at > now\(\)/);
  assert.match(migration, /coalesce\(\(select m\.allow_clipping from public\.media_items m where m\.id=c\.source_media_id\), true\)/);
});

test("the feed returns a linked clip only while it is live and source-permitted", () => {
  assert.match(migration, /case when cc\.id is not null and cc\.status='published' and cc\.expires_at > now\(\)/);
  assert.match(migration, /left join public\.raye2_community_clips cc on cc\.id = s\.linked_clip_id/);
  assert.match(migration, /grant execute on function public\.raye2_get_community_feed\(integer,text,boolean,text\) to anon, authenticated;/);
});

test("the community client attaches clips and renders the permalink", () => {
  assert.match(client, /from\("raye2_community_clips"\)\.select\("id,title"\)\.eq\("clipper_id", member\.id\)/);
  assert.match(client, /if \(linkedClipId\) return \{ linked_clip_id: linkedClipId, linked_video_id: null/);
  assert.match(client, /post\.linkedClipId && <Link className="raye2-action" href=\{"\/clips\/"\+post\.linkedClipId\}/);
  assert.match(page, /linked_clip_id: string \| null/);
  assert.match(page, /linkedClipId: row\.linked_clip_id/);
});

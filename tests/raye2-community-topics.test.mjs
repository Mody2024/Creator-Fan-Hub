import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, communityPage, communityClient] = await Promise.all([
  read("../supabase/migrations/20261110440000_raye2_community_topic_channels.sql"),
  read("../src/app/community/page.tsx"),
  read("../src/app/community/community-client.tsx")
]);

test("topic channels are a curated, publicly readable set seeded with defaults", () => {
  assert.match(migration, /create table if not exists public\.community_topics/);
  assert.match(migration, /slug ~ '\^\[a-z0-9_-\]\{2,40\}\$'/);
  assert.match(migration, /grant select on public\.community_topics to anon, authenticated/);
  assert.match(migration, /create policy "Anyone reads active community topics"/);
  assert.match(migration, /on conflict \(slug\) do nothing/);
});

test("a post carries one topic and the author sets it through a guarded RPC", () => {
  assert.match(migration, /add column if not exists topic_slug text/);
  assert.match(migration, /references public\.community_topics\(slug\) on delete set null/);
  assert.match(migration, /create or replace function public\.raye2_set_post_topic\(p_post_id uuid, p_topic_slug text\)/);
  assert.match(migration, /only the author can set the topic/);
  assert.match(migration, /unknown topic/);
  assert.match(migration, /grant execute on function public\.raye2_set_post_topic\(uuid,text\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_set_post_topic\(uuid,text\) to anon/);
});

test("the topic listing counts only published posts", () => {
  assert.match(migration, /create or replace function public\.raye2_list_community_topics\(\)/);
  assert.match(migration, /where p\.topic_slug = t\.slug and p\.status = 'published'/);
  assert.match(migration, /grant execute on function public\.raye2_list_community_topics\(\) to anon, authenticated/);
});

test("the feed read filters by topic and exposes the post topic", () => {
  assert.match(migration, /drop function if exists public\.raye2_get_community_feed\(integer,text,boolean\)/);
  assert.match(migration, /p_topic text default null/);
  assert.match(migration, /p_topic is null or p\.topic_slug = p_topic/);
  assert.match(migration, /topic_slug text,/);
  assert.match(migration, /grant execute on function public\.raye2_get_community_feed\(integer,text,boolean,text\) to anon, authenticated/);
});

test("the community surfaces wire topic channels end to end", () => {
  assert.match(communityPage, /rpc\("raye2_list_community_topics"\)/);
  assert.match(communityPage, /topicSlug: row\.topic_slug/);
  assert.match(communityPage, /topics=\{topics\}/);
  assert.match(communityClient, /topics\?: CommunityTopic\[\]/);
  assert.match(communityClient, /rpc\("raye2_set_post_topic"/);
  assert.match(communityClient, /topicFilter==="all"\|\|post\.topicSlug===topicFilter/);
  assert.match(communityClient, /nhen-topic-compose/);
  assert.match(communityClient, /#\{post\.topicName\}/);
});

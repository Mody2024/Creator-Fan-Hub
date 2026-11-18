import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, feedClient, detailPage, detailClient, chatClient] = await Promise.all([
  read("../supabase/migrations/20261116190000_raye2_clip_permalink_and_share.sql"),
  read("../src/app/clips/clips-client.tsx"),
  read("../src/app/clips/[id]/page.tsx"),
  read("../src/app/clips/[id]/clip-detail-client.tsx"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("a clip permalink fetch re-checks source and clip permissions", () => {
  assert.match(migration, /create or replace function public\.raye2_get_community_clip\(p_clip_id uuid\)/);
  assert.match(migration, /c\.status='published' and c\.expires_at > now\(\)/);
  assert.match(migration, /coalesce\(\(select m\.allow_clipping from public\.media_items m where m\.id=c\.source_media_id\), true\)/);
  assert.match(migration, /or c\.clipper_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /or c\.source_owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /or private\.can_moderate_community\(\)/);
  assert.match(migration, /revoke all on function public\.raye2_get_community_clip\(uuid\) from public;/);
  assert.match(migration, /grant execute on function public\.raye2_get_community_clip\(uuid\) to anon, authenticated;/);
});

test("sharing a clip into chat is server-derived and permission-gated", () => {
  assert.match(migration, /create or replace function public\.raye2_share_clip_to_chat\(p_conversation_id uuid, p_clip_id uuid\)/);
  assert.match(migration, /if not public\.raye2_is_conversation_member\(p_conversation_id\) then/);
  assert.match(migration, /clip is not available to share/);
  assert.match(migration, /'kind','clip_share'/);
  assert.match(migration, /'\/clips\/' \|\| p_clip_id::text/);
  assert.match(migration, /revoke all on function public\.raye2_share_clip_to_chat\(uuid,uuid\) from public,anon;/);
  assert.match(migration, /grant execute on function public\.raye2_share_clip_to_chat\(uuid,uuid\) to authenticated;/);
});

test("the clip permalink page renders the pooled clip and refuses a non-live clip", () => {
  assert.match(detailPage, /raye2_get_community_clip/);
  assert.match(detailPage, /resolvePublicObjectUrls/);
  assert.match(detailPage, /clip\.status !== "published" \|\| new Date\(clip\.expires_at\)\.getTime\(\) <= Date\.now\(\)\) notFound\(\)/);
  assert.match(detailPage, /UUID\.test\(id\)/);
});

test("the permalink client offers copy, share-to-chat, report and owner remove", () => {
  assert.match(detailClient, /raye2_share_clip_to_chat/);
  assert.match(detailClient, /raye2_list_shareable_conversations/);
  assert.match(detailClient, /raye2_report_community_content/);
  assert.match(detailClient, /raye2_remove_community_clip/);
  assert.match(detailClient, /navigator\.clipboard\?\.writeText\(window\.location\.href\)/);
});

test("the feed links to the permalink and copies the canonical address", () => {
  assert.match(feedClient, /href={`\/clips\/\$\{item\.id\}`}/);
  assert.match(feedClient, /copyClipLink/);
  assert.match(feedClient, /new URL\(`\/clips\/\$\{id\}`, window\.location\.origin\)/);
});

test("chat loads and renders shared clip and video attachments as links", () => {
  assert.match(chatClient, /attachment\?: \{ kind\?: string; slug\?: string; clip_id\?: string;/);
  assert.match(chatClient, /edited_at,created_at,topic_id,attachment/);
  assert.match(chatClient, /message\.attachment\?\.kind === "clip_share"/);
  assert.match(chatClient, /message\.attachment\?\.kind === "video_share"/);
});

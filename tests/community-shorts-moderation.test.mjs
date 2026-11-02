import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const moderationPage = await readFile(new URL("../src/app/creator/community/page.tsx", import.meta.url), "utf8");
const moderationClient = await readFile(new URL("../src/app/creator/community/moderation-client.tsx", import.meta.url), "utf8");
const shortsClient = await readFile(new URL("../src/app/shorts/community-shorts-client.tsx", import.meta.url), "utf8");
const shortsMigration = await readFile(new URL("../supabase/migrations/20261101170000_nhen_member_community_shorts.sql", import.meta.url), "utf8");

test("community Shorts moderation is restricted to active creator roles", () => {
  assert.match(moderationPage, /creator_admins/);
  assert.match(moderationPage, /active",true/);
  assert.match(moderationPage, /\["owner","admin","moderator"\]/);
});

test("pending community Shorts comments enter a bounded moderation queue", () => {
  assert.match(moderationPage, /from\("community_short_comments"\)/);
  assert.match(moderationPage, /eq\("status","pending"\)/);
  assert.match(moderationPage, /limit\(100\)/);
  assert.match(moderationPage, /initialShortComments/);
});

test("moderators can publish, reject, or remove Shorts comments through the guarded queue", () => {
  assert.match(moderationClient, /kind:"short_comment"/);
  assert.match(moderationClient, /kind==="short_comment"\?"community_short_comments"/);
  assert.match(moderationClient, /moderate\("short_comment",item\.id,"published"\)/);
  assert.match(moderationClient, /moderate\("short_comment",item\.id,"rejected"\)/);
  assert.match(moderationClient, /moderate\("short_comment",item\.id,"removed"\)/);
});

test("member Shorts comments are submitted pending and only published comments are shown publicly", () => {
  assert.match(shortsClient, /from\("community_short_comments"\)\.insert\(\{short_id:shortId,author_id:userId,body,status:"pending"\}\)/);
  assert.match(shortsClient, /eq\("status","published"\)/);
  assert.match(shortsMigration, /status = 'pending'/i);
  assert.match(shortsMigration, /status = 'published'/i);
});

test("community Shorts moderation queue has English and Arabic labels", () => {
  assert.match(moderationClient, /noShortComments:/);
  assert.match(moderationClient, /shortComment:/);
  assert.match(moderationClient, /تعليقات المقاطع القصيرة/);
  assert.match(moderationClient, /SHORTS COMMENTS/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, page, homePost, homeCss] = await Promise.all([
  read("../supabase/migrations/20261110390000_raye2_notification_center_types.sql"),
  read("../src/app/notifications/notifications-client.tsx"),
  read("../src/app/notifications/page.tsx"),
  read("../src/app/raye2/home/home-feed-post.tsx"),
  read("../src/app/raye2/home/home.module.css")
]);

test("the notification summary counts every reaction and comment notification type", () => {
  assert.match(migration, /'video_comment_reaction','community_short_comment_reaction','community_comment_reaction'/);
  assert.match(migration, /'video_comment_reply','community_short_comment_reply','community_comment_reply'/);
});

test("the notifications read is filter-aware and replaces the three-argument version", () => {
  assert.match(migration, /drop function if exists public\.raye2_get_notifications\(integer,timestamptz,boolean\)/);
  assert.match(migration, /p_filter text default 'all'/);
  assert.match(migration, /p_filter = 'reaction' and n\.notification_type like '%reaction%'/);
  assert.match(migration, /p_filter = 'comment' and n\.notification_type like '%comment%' and n\.notification_type not like '%reaction%'/);
  assert.match(migration, /grant execute on function public\.raye2_get_notifications\(integer,timestamptz,boolean,text\) to authenticated/);
});

test("the notifications client localizes all eleven types and filters consistently", () => {
  assert.match(client, /replied to your Shorts comment/);
  assert.match(client, /reacted to your video comment/);
  assert.match(client, /p_filter:filter/);
  assert.match(client, /n\.type\.includes\("comment"\)&&!n\.type\.includes\("reaction"\)/);
  assert.match(page, /p_filter:"all"/);
});

test("load more is offered for any filter, not only the unfiltered view", () => {
  assert.doesNotMatch(client, /filter==="all"&&items\.length>=40/);
  assert.match(client, /items\.length>=40&&<div/);
});

test("the home feed post renders threaded comments with replies and reactions", () => {
  assert.match(homePost, /raye2_get_post_comments/);
  assert.match(homePost, /raye2_get_post_comment_replies/);
  assert.match(homePost, /raye2_toggle_post_comment_reaction/);
  assert.match(homePost, /async function sendReply\(/);
  assert.match(homePost, /styles\.commentReplies/);
  assert.match(homeCss, /\.commentReplies\{/);
  assert.match(homeCss, /\.commentActions button\.active\{/);
});

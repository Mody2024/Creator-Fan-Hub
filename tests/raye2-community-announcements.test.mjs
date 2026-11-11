import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, composer, creatorPage, notifClient] = await Promise.all([
  read("../supabase/migrations/20261110420000_raye2_community_announcements.sql"),
  read("../src/app/creator/community/announcement-composer.tsx"),
  read("../src/app/creator/community/page.tsx"),
  read("../src/app/notifications/notifications-client.tsx")
]);

test("announcements are creator-only through a guarded definer RPC", () => {
  assert.match(migration, /create or replace function public\.raye2_create_community_announcement\(/);
  assert.match(migration, /not public\.is_active_creator\(\)/);
  assert.match(migration, /values \(auth\.uid\(\), 'official', btrim\(p_body\), 'published', coalesce\(p_pin, false\), p_linked_video_id\)/);
  assert.match(migration, /grant execute on function public\.raye2_create_community_announcement\(text,uuid,boolean\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_create_community_announcement\(text,uuid,boolean\) to anon/);
  assert.match(migration, /set search_path = ''/);
});

test("announcements validate the body and any linked video", () => {
  assert.match(migration, /an announcement body is required/);
  assert.match(migration, /the linked video is unavailable/);
});

test("announcements notify the author's followers", () => {
  assert.match(migration, /create trigger community_announcement_notification/);
  assert.match(migration, /when \(new\.post_type = 'official' and new\.status = 'published'\)/);
  assert.match(migration, /'community_announcement'/);
  assert.match(migration, /from public\.member_follows f/);
});

test("the notification summary still scopes announcements out of follow/reaction/comment", () => {
  assert.match(migration, /count\(\*\) filter \(where notification_type = 'follow'\) as follow_count/);
  assert.match(migration, /'community_comment','video_comment',/);
});

test("the creator workspace mounts the composer and the inbox localizes the announcement", () => {
  assert.match(creatorPage, /import AnnouncementComposer from "\.\/announcement-composer"/);
  assert.match(creatorPage, /<AnnouncementComposer\/>/);
  assert.match(composer, /supabase\.rpc\("raye2_create_community_announcement"/);
  assert.match(composer, /p_pin:pin/);
  assert.match(notifClient, /posted an announcement/);
  assert.match(notifClient, /نشر إعلانًا رسميًا/);
});

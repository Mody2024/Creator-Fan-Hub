import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, page, css, notifClient] = await Promise.all([
  read("../supabase/migrations/20261110400000_raye2_community_polls.sql"),
  read("../src/app/community/community-client.tsx"),
  read("../src/app/community/page.tsx"),
  read("../src/app/community/raye2-community.css"),
  read("../src/app/notifications/notifications-client.tsx")
]);

test("polls are post-scoped with options and one vote per member, hidden from direct client access", () => {
  assert.match(migration, /create table if not exists public\.community_post_polls/);
  assert.match(migration, /post_id uuid not null unique references public\.community_posts\(id\) on delete cascade/);
  assert.match(migration, /create table if not exists public\.community_post_poll_votes/);
  assert.match(migration, /primary key \(poll_id, user_id\)/);
  assert.match(migration, /revoke all on public\.community_post_poll_votes from anon, authenticated/);
});

test("creation and voting are authenticated definer RPCs and the tally read is public", () => {
  assert.match(migration, /grant execute on function public\.raye2_create_community_poll\(text,jsonb,timestamptz\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_create_community_poll\(text,jsonb,timestamptz\) to anon/);
  assert.match(migration, /grant execute on function public\.raye2_vote_community_poll\(uuid,text\) to authenticated/);
  assert.match(migration, /grant execute on function public\.raye2_get_community_poll\(uuid\) to anon, authenticated/);
  assert.match(migration, /set search_path = ''/);
});

test("poll validation enforces option count, uniqueness and a future closing time", () => {
  assert.match(migration, /not between 2 and 6/);
  assert.match(migration, /options must be unique/);
  assert.match(migration, /the closing time must be in the future/);
});

test("voting refuses a second vote and hides tallies until the viewer votes", () => {
  assert.match(migration, /return query select false, 'already_voted'::text/);
  assert.match(migration, /my_vote text/);
});

test("the feed read is extended with poll data and the client renders, creates and votes on polls", () => {
  assert.match(migration, /drop function if exists public\.raye2_get_community_feed\(integer,text,boolean\)/);
  assert.match(migration, /poll_question text/);
  assert.match(page, /poll: row\.poll_id \? \{/);
  assert.match(client, /supabase\.rpc\("raye2_create_community_poll"/);
  assert.match(client, /supabase\.rpc\("raye2_vote_community_poll"/);
  assert.match(client, /nhen-poll-option/);
  assert.match(css, /\.nhen-poll-option\.is-chosen/);
});

test("poll votes notify the author through the inbox", () => {
  assert.match(migration, /'community_poll_vote'/);
  assert.match(migration, /create trigger community_poll_vote_notification/);
  assert.match(notifClient, /voted in your poll/);
  assert.match(notifClient, /صوّت في استطلاعك/);
});

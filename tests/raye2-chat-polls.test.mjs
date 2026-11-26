import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, pollComponent, css] = await Promise.all([
  read("../supabase/migrations/20261116220000_raye2_chat_polls.sql"),
  read("../src/app/raye2/raye2-client.tsx"),
  read("../src/app/raye2/raye2-message-poll.tsx"),
  read("../src/app/raye2/raye2.module.css")
]);

test("chat polls hang off a message and are member-readable only", () => {
  assert.match(migration, /create table if not exists public\.raye2_message_polls \(/);
  assert.match(migration, /message_id uuid primary key references public\.raye2_messages\(id\) on delete cascade/);
  assert.match(migration, /create policy "Raye2 members read conversation polls" on public\.raye2_message_polls for select to authenticated/);
  assert.match(migration, /revoke all on public\.raye2_message_polls, public\.raye2_message_poll_options, public\.raye2_message_poll_votes from anon, authenticated/);
  assert.match(migration, /using \(public\.raye2_is_conversation_member\(conversation_id\)\)/);
});

test("poll creation validates the question, option count and uniqueness", () => {
  assert.match(migration, /create or replace function public\.raye2_create_message_poll\(/);
  assert.match(migration, /a poll needs between 2 and 10 options/);
  assert.match(migration, /each poll option must be 1 to 80 characters/);
  assert.match(migration, /poll options must be unique/);
  assert.match(migration, /if not exists\(select 1 from public\.raye2_conversations c where c\.id=p_conversation_id and c\.status='active'/);
  assert.match(migration, /perform public\.raye2_rate_limit\('chat\.poll','rate\.chat\.message\.hourly',300,3600\)/);
});

test("voting enforces single vs multiple choice and rejects unknown options", () => {
  assert.match(migration, /create or replace function public\.raye2_vote_message_poll\(/);
  assert.match(migration, /if not v_poll\.allow_multiple and array_length\(p_option_ids,1\) <> 1 then/);
  assert.match(migration, /raise exception 'this poll accepts a single choice'/);
  assert.match(migration, /if v_count <> array_length\(p_option_ids,1\) then/);
  assert.match(migration, /if v_poll\.closed_at is not null then/);
  assert.match(migration, /delete from public\.raye2_message_poll_votes where message_id=p_message_id and user_id=auth\.uid\(\)/);
});

test("closing a poll is limited to the author or a group manager and reads expose tallies", () => {
  assert.match(migration, /create or replace function public\.raye2_close_message_poll\(/);
  assert.match(migration, /only the poll author or a group manager may close it/);
  assert.match(migration, /create or replace function public\.raye2_get_message_poll\(/);
  assert.match(migration, /'total_votes', \(select count\(\*\) from public\.raye2_message_poll_votes v where v\.message_id=v_poll\.message_id\)/);
  assert.match(migration, /'my_votes', coalesce/);
});

test("the client composes, renders and votes on polls", () => {
  assert.match(client, /rpc\("raye2_create_message_poll", \{/);
  assert.match(client, /message\.attachment\?\.kind === "poll" && supabase && <Raye2MessagePoll/);
  assert.match(client, /className=\{styles\.pollComposer\}/);
  assert.match(pollComponent, /rpc\("raye2_vote_message_poll", \{ p_message_id: messageId, p_option_ids: \[\.\.\.selected\] \}\)/);
  assert.match(pollComponent, /rpc\("raye2_close_message_poll", \{ p_message_id: messageId \}\)/);
  assert.match(css, /\.page \.pollOptions button/);
});


test("conversation polls refresh live when members vote or a poll is closed", async () => {
  const component = readFileSync("src/app/raye2/raye2-message-poll.tsx", "utf8");
  assert.match(component, /raye2:poll:/);
  assert.match(component, /table: "raye2_message_poll_votes", filter: "message_id=eq\." \+ messageId/);
  assert.match(component, /table: "raye2_message_polls", filter: "message_id=eq\." \+ messageId/);
  assert.match(component, /return \(\) => \{ void supabase\.removeChannel\(channel\); \}/);
});

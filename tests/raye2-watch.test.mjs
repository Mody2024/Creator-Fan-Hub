import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const migration = readFileSync(new URL("../supabase/migrations/20261104040000_raye2_watch_together.sql", import.meta.url), "utf8");
const plan = readFileSync(new URL("../docs/RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md", import.meta.url), "utf8");

test("Watch Together schema separates sessions, participants, queue items and votes", () => {
  for (const table of [
    "raye2_watch_sessions", "raye2_watch_participants",
    "raye2_watch_queue", "raye2_watch_votes"
  ]) {
    assert.match(migration, new RegExp("create table if not exists public\\." + table));
    assert.match(migration, new RegExp("alter table public\\." + table + " enable row level security"));
  }
  assert.match(migration, /current_position_seconds/);
  assert.match(migration, /playback_version/);
  assert.match(migration, /max_participants/);
  assert.match(migration, /expires_at/);
});

test("native Watch Together sources require a published ready Raye2 video catalog asset", () => {
  assert.match(migration, /public\.video_catalog/);
  assert.match(migration, /public\.media_items/);
  assert.match(migration, /v\.published_at is not null/);
  assert.match(migration, /m\.is_published=true/);
  assert.match(migration, /m\.processing_status='ready'/);
  assert.match(migration, /m\.media_type in \('video','youtube'\)/);
});

test("external Watch Together sources are HTTPS allowlisted and never copied into Raye2 storage", () => {
  assert.match(migration, /youtube[.]com\/watch/);
  assert.match(migration, /youtu[.]be/);
  assert.match(migration, /vimeo[.]com/);
  assert.match(migration, /p_external_url ~\* '\^https:\/\//);
  assert.doesNotMatch(migration, /insert into public\.media_items/);
});

test("Watch Together starts disabled and uses owner-configurable participant, duration and queue limits", () => {
  assert.match(migration, /'watch\.enabled','watch','false'::jsonb,'proposed'/);
  assert.match(migration, /'watch\.public_sessions\.enabled','watch','false'::jsonb,'proposed'/);
  assert.match(migration, /watch\.max_participants/);
  assert.match(migration, /watch\.session\.max_duration_seconds/);
  assert.match(migration, /watch\.queue\.max_items/);
  assert.match(migration, /least\(coalesce\(v_duration,10800\),43200\)/);
});

test("Watch Together creation checks active conversation and public-group visibility", () => {
  assert.match(migration, /raye2_create_watch_session/);
  assert.match(migration, /raye2_is_conversation_member\(p_conversation_id\)/);
  assert.match(migration, /public watch sessions require a public group/);
  assert.match(migration, /public watch sessions are disabled/);
  assert.match(migration, /video source is not eligible for Watch Together/);
});

test("private sessions are visible to their own conversation/group members, public sessions to public-group viewers", () => {
  assert.match(migration, /raye2_can_access_watch_session/);
  assert.match(migration, /raye2_is_conversation_member\(s\.conversation_id\)/);
  assert.match(migration, /raye2_is_group_member\(s\.group_id\)/);
  assert.match(migration, /s\.visibility='public'/);
  assert.match(migration, /raye2_join_watch_session/);
  assert.match(migration, /watch session invitation or membership required/);
});

test("host playback updates are server-authorized and versioned for resynchronization", () => {
  assert.match(migration, /raye2_update_watch_playback/);
  assert.match(migration, /v_role not in \('host','moderator'\)/);
  assert.match(migration, /playback_version=playback_version\+1/);
  assert.match(migration, /playback_updated_at=now\(\)/);
  assert.match(migration, /invalid playback position/);
});

test("shared queue supports add, vote, reorder, remove and host advancement by votes", () => {
  for (const fn of [
    "raye2_add_watch_queue_item", "raye2_vote_watch_queue_item",
    "raye2_advance_watch_queue", "raye2_reorder_watch_queue_item",
    "raye2_remove_watch_queue_item"
  ]) assert.match(migration, new RegExp("create or replace function public\\." + fn));
  assert.match(migration, /order by coalesce\(v\.votes,0\) desc,q\.sort_order/);
  assert.match(migration, /watch queue is full/);
  assert.match(migration, /on conflict\(queue_item_id,user_id\) do nothing/);
});

test("Watch Together Realtime topics are strict UUIDs and publishing requires joined participants", () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.%I/);
  assert.match(migration, /raye2_watch_sessions/);
  assert.match(migration, /raye2_watch_queue/);
  assert.match(migration, /raye2_can_access_watch_session/);
  assert.match(migration, /raye2_is_watch_participant/);
  assert.match(migration, /\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}/);
});

test("Watch Together access and write paths use explicit RLS and RPC grants", () => {
  assert.match(migration, /revoke all on public\.raye2_watch_sessions,public\.raye2_watch_queue/);
  assert.match(migration, /grant select on public\.raye2_watch_sessions,public\.raye2_watch_queue/);
  assert.match(migration, /security definer set search_path=''/);
  assert.match(migration, /grant execute on function public\.raye2_create_watch_session/);
  assert.match(migration, /grant execute on function public\.raye2_update_watch_playback/);
});

test("Watch Together implementation follows the product plan's sync, queue and provider boundaries", () => {
  assert.match(plan, /Shared synchronized viewing sessions/);
  assert.match(plan, /Host controls playback/);
  assert.match(plan, /Shared queue, add\/remove queue items, reorder and vote/);
  assert.match(plan, /must not download, cache or alter external audiovisual streams/);
});


test("Watch Together queue and Realtime helpers fail closed after session expiry", () => {
  assert.match(migration, /raye2_is_watch_participant/);
  assert.match(migration, /s\.status='active' and s\.expires_at>now\(\)/);
  assert.match(migration, /raye2_reorder_watch_queue_item/);
  assert.match(migration, /raye2_remove_watch_queue_item/);
});


test("Watch Together group UI lists active sessions and creates/joins via guarded RPCs", () => {
  const component = readFileSync(new URL("../src/app/raye2/raye2-watch-together-controls.tsx", import.meta.url), "utf8");
  const client = readFileSync(new URL("../src/app/raye2/raye2-client.tsx", import.meta.url), "utf8");
  assert.match(component, /raye2_create_watch_session/);
  assert.match(component, /raye2_join_watch_session/);
  assert.match(component, /raye2_leave_watch_session/);
  assert.match(component, /raye2_watch_sessions/);
  assert.match(client, /Raye2WatchTogetherControls/);
  assert.match(client, /groupVisibility=\{selectedGroup\.visibility\}/);
});

test("native Watch Together player synchronizes playback through host RPCs and realtime session updates", () => {
  const component = readFileSync(new URL("../src/app/raye2/raye2-watch-together-controls.tsx", import.meta.url), "utf8");
  assert.match(component, /raye2_update_watch_playback/);
  assert.match(component, /onPlay=\{\(\) => void updatePlayback\(true\)\}/);
  assert.match(component, /onPause=\{\(\) => void updatePlayback\(false\)\}/);
  assert.match(component, /onSeeked=\{\(\) => void updatePlayback/);
  assert.match(component, /postgres_changes/);
  assert.match(component, /playback_updated_at/);
  assert.match(component, /lastAppliedVersionRef/);
  assert.match(component, /needsPlaybackTap/);
});

test("Watch Together queue UI supports add, vote and host-controlled advance", () => {
  const component = readFileSync(new URL("../src/app/raye2/raye2-watch-together-controls.tsx", import.meta.url), "utf8");
  assert.match(component, /raye2_add_watch_queue_item/);
  assert.match(component, /raye2_vote_watch_queue_item/);
  assert.match(component, /raye2_advance_watch_queue/);
  assert.match(component, /copy\.queue/);
  assert.match(component, /copy\.vote/);
});

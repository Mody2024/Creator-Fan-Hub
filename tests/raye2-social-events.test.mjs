import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [social, events, profile, communityClient, communityPage, publicEvents, eventsPage] = await Promise.all([
  read("../supabase/migrations/20261110160000_raye2_social_graph_rpcs.sql"),
  read("../supabase/migrations/20261110170000_raye2_event_rsvps.sql"),
  read("../src/app/u/[handle]/profile-client.tsx"),
  read("../src/app/community/community-client.tsx"),
  read("../src/app/community/page.tsx"),
  read("../src/app/events/public-events.tsx"),
  read("../src/app/events/page.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

const socialFunctions = [
  "raye2_toggle_follow",
  "raye2_toggle_block",
  "raye2_get_member_connections",
  "raye2_get_mutual_followers",
  "raye2_suggest_members"
];
// raye2_get_member_connections reads another member's public lists and takes the
// target as a parameter, so it does not require an authenticated caller identity.
const callerBoundFunctions = [
  "raye2_toggle_follow",
  "raye2_toggle_block",
  "raye2_get_mutual_followers",
  "raye2_suggest_members"
];

test("social graph RPCs are guarded SECURITY DEFINER functions", () => {
  for (const name of socialFunctions) {
    const body = functionBody(social, name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path\s*=\s*''/i, name);
  }
  for (const name of callerBoundFunctions) {
    assert.match(functionBody(social, name), /auth\.uid\(\)/i, name);
    assert.match(functionBody(social, name), /is null/i, name);
    assert.match(functionBody(social, name), /errcode\s*=\s*'42501'/i, name);
  }
});

test("follow is transactional and block severs follows in both directions", () => {
  assert.match(social, /on conflict \(follower_id, followed_id\) do nothing/);
  const block = functionBody(social, "raye2_toggle_block");
  assert.match(block, /delete from public\.member_follows/);
  assert.match(block, /\(follower_id = v_me and followed_id = p_target_id\)/);
  assert.match(block, /\(follower_id = p_target_id and followed_id = v_me\)/);
});

test("connections, mutuals and suggestions respect visibility and blocks", () => {
  const conn = functionBody(social, "raye2_get_member_connections");
  assert.match(conn, /p_kind not in \('followers', 'following'\)/);
  assert.match(conn, /visibility = 'public'/);
  assert.match(conn, /from public\.member_blocks b/);
  assert.match(functionBody(social, "raye2_get_mutual_followers"), /them\.followed_id = p_user_id/);
  const suggest = functionBody(social, "raye2_suggest_members");
  assert.match(suggest, /mutual_count/);
  assert.match(suggest, /from public\.member_blocks b/);
  assert.match(suggest, /f\.follower_id = v_me and f\.followed_id = p\.user_id/);
});

test("social graph RPCs are granted to authenticated only", () => {
  for (const name of socialFunctions) {
    assert.match(social, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated`), name);
    assert.doesNotMatch(social, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (anon|public)`), name);
  }
});

test("events RSVP table enforces ownership and public feed is anon-readable", () => {
  assert.match(events, /create table if not exists public\.event_rsvps/);
  assert.match(events, /alter table public\.event_rsvps enable row level security/);
  assert.match(events, /user_id = \(select auth\.uid\(\)\)/);
  assert.match(events, /grant execute on function public\.raye2_get_public_events\(integer\) to anon, authenticated/);
  for (const name of ["raye2_set_event_rsvp", "raye2_clear_event_rsvp"]) {
    assert.match(events, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated`), name);
    assert.doesNotMatch(events, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (anon|public)`), name);
    assert.match(functionBody(events, name), /auth\.uid\(\)/i, name);
  }
  assert.match(functionBody(events, "raye2_get_public_events"), /going_count/);
});

test("profile UI uses the transactional social RPCs and shows connection lists", () => {
  assert.match(profile, /supabase\.rpc\("raye2_toggle_follow"/);
  assert.match(profile, /supabase\.rpc\("raye2_toggle_block"/);
  assert.match(profile, /supabase\.rpc\("raye2_get_member_connections"/);
  assert.match(profile, /supabase\.rpc\("raye2_get_mutual_followers"/);
  assert.match(profile, /openConnections\("followers"\)/);
  assert.match(profile, /connectionList/);
});

test("community suggestions use the mutual-ranked RPC and follow via RPC", () => {
  assert.match(communityPage, /supabase\.rpc\("raye2_suggest_members"/);
  assert.match(communityClient, /supabase\.rpc\("raye2_toggle_follow"/);
});

test("events UI RSVPs through the RPCs and a dedicated route exists", () => {
  assert.match(publicEvents, /supabase\.rpc\("raye2_set_event_rsvp"/);
  assert.match(publicEvents, /supabase\.rpc\("raye2_clear_event_rsvp"/);
  assert.match(publicEvents, /public-event-rsvp/);
  assert.match(eventsPage, /raye2_get_public_events/);
  assert.match(eventsPage, /<PublicEvents/);
});

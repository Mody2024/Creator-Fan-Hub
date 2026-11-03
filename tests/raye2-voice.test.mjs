import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [voice, foundations, plan, client] = await Promise.all([
  read("../supabase/migrations/20261103270000_raye2_voice_sessions.sql"),
  read("../supabase/migrations/20261103180000_raye2_community_chat_foundations.sql"),
  read("../docs/RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("voice control plane separates private calls from group rooms and starts with recording off", () => {
  assert.match(voice, /session_type in \('private_call','group_room'\)/);
  assert.match(voice, /recording_state text not null default 'off'/);
  assert.match(voice, /recording_consent text not null default 'not_requested'/);
  assert.match(voice, /voice\.private_call\.enabled/);
  assert.match(voice, /voice\.group_room\.enabled/);
  assert.match(voice, /recording\.enabled/);
});

test("private call creation requires a direct conversation, an active feature flag and no account block", () => {
  assert.match(voice, /private calls require a direct conversation/);
  assert.match(voice, /voice feature is not enabled by the platform owner/);
  assert.match(voice, /public\.member_blocks/);
  assert.match(voice, /raye2_is_conversation_member/);
  assert.match(voice, /'private_call',p_conversation_id,auth\.uid\(\),'ringing'/);
});

test("group voice sessions require an active member of the associated group", () => {
  assert.match(voice, /raye2_is_group_member\(v_conversation\.group_id\)/);
  assert.match(voice, /group voice is unavailable/);
  assert.match(voice, /'group_room',p_conversation_id,v_group_id/);
  assert.match(voice, /voice\.group_room\.max_participants/);
  assert.match(voice, /for update/);
});

test("voice invitation, joining, decline and leave are guarded server-side", () => {
  for (const fn of [
    "raye2_create_voice_session", "raye2_join_voice_session",
    "raye2_decline_voice_invitation", "raye2_leave_voice_session"
  ]) {
    assert.ok(voice.includes("create or replace function public." + fn + "("));
    assert.ok(voice.includes("grant execute on function public." + fn));
    assert.ok(voice.includes("revoke all on function public." + fn));
  }
  assert.match(voice, /voice invitation required/);
  assert.match(voice, /voice room is locked/);
  assert.match(voice, /voice session is full/);
});

test("voice moderation requires a real participant role or group manager permission", () => {
  assert.match(voice, /v_actor_role is null or/);
  assert.match(voice, /voice room moderator access required/);
  assert.match(voice, /'lock','unlock','remove','promote_cohost'/);
  assert.match(voice, /voice_room_moderated/);
});

test("recording consent is optional, explicit, unanimous and stops on decline or withdrawal", () => {
  assert.match(voice, /recording is disabled by platform policy/);
  assert.match(voice, /recording_consent='pending'/);
  assert.match(voice, /recording_consent<>'accepted'/);
  assert.match(voice, /if p_decision in \('declined','withdrawn'\) then/);
  assert.match(voice, /recording_state='stopped'/);
  assert.match(voice, /recording_state='consent_granted'/);
  assert.doesNotMatch(voice, /recording_state in \('consent_pending','consent_granted','stopped'\)/);
  assert.match(voice, /raye2_voice_recording_consent_events/);
});

test("a late joiner resets consent to pending before recording can be considered approved", () => {
  assert.match(voice, /recording_state=case when recording_state='consent_granted' then 'consent_pending'/);
  assert.match(voice, /if v_session\.recording_state in \('consent_pending','consent_granted'\) then/);
  assert.match(voice, /values\(p_session_id,auth\.uid\(\),'requested'\)/);
});

test("private voice signaling is limited to invited or joined participants", () => {
  assert.match(voice, /raye2_can_access_voice_topic/);
  assert.match(voice, /extension in \('broadcast','presence'\)/);
  assert.match(voice, /raye2_can_access_voice_topic\(realtime\.topic\(\),false\)/);
  assert.match(voice, /raye2_can_access_voice_topic\(realtime\.topic\(\),true\)/);
  assert.doesNotMatch(voice, /create table[^;]*realtime\./i);
  assert.doesNotMatch(voice, /alter table realtime\.messages enable row level security/i);
});

test("voice data is read-only through direct client grants and uses RLS", () => {
  for (const table of [
    "raye2_voice_sessions", "raye2_voice_participants",
    "raye2_voice_recording_consent_events"
  ]) {
    assert.ok(voice.includes("alter table public." + table + " enable row level security"));
  }
  assert.match(voice, /revoke all on public\.raye2_voice_sessions,public\.raye2_voice_participants/);
  assert.match(voice, /grant select on public\.raye2_voice_sessions,public\.raye2_voice_participants/);
  assert.match(voice, /security definer set search_path=''/);
});

test("voice signaling helper avoids recursive participant-table RLS and validates topic UUIDs", () => {
  assert.match(voice, /raye2_can_access_voice_session/);
  assert.match(voice, /raye2_can_access_voice_topic/);
  assert.doesNotMatch(voice, /select 1 from public\.raye2_voice_participants own/);
  assert.match(voice, /\[0-9a-fA-F\]\{8\}-\[0-9a-fA-F\]\{4\}/);
});

test("session duration is owner-configurable within a safe technical ceiling", () => {
  assert.match(voice, /voice\.session\.max_duration_seconds/);
  assert.match(voice, /make_interval\(secs=>v_duration\)/);
  assert.match(voice, /least\(coalesce\(v_duration,10800\),43200\)/);
});

test("voice implementation remains aligned with the confirmed plan and does not claim transport is complete", () => {
  assert.match(plan, /private one-to-one voice calls/);
  assert.match(plan, /group voice rooms/);
  assert.match(plan, /every participant has actively consented/);
  assert.match(plan, /WebRTC with an SFU for multi-participant rooms/);
  assert.match(foundations, /voice_recordings/);
  assert.match(client, /getSupabaseBrowserClient/);
});

test("voice sessions and consent events publish for realtime invitation and room refresh", () => {
  assert.match(voice, /alter publication supabase_realtime add table public\\.%I/);
  assert.match(voice, /'raye2_voice_sessions'/);
  assert.match(voice, /'raye2_voice_participants'/);
  assert.match(voice, /'raye2_voice_recording_consent_events'/);
});

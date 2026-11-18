import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, ui, invitePage] = await Promise.all([
  read("../supabase/migrations/20261116180000_raye2_watch_scheduled_and_invites.sql"),
  read("../src/app/raye2/raye2-watch-together-controls.tsx"),
  read("../src/app/raye2/watch-invite/page.tsx")
]);

test("watch sessions gain an optional bounded scheduled start", () => {
  assert.match(migration, /add column if not exists scheduled_for timestamptz/);
  assert.match(migration, /check \(scheduled_for is null or \(scheduled_for > created_at - interval '1 minute' and scheduled_for < created_at \+ interval '90 days'\)\)/);
  assert.match(migration, /p_scheduled_for timestamptz default null/);
  assert.match(migration, /scheduled start must be within 90 days/);
  assert.match(migration, /create or replace function public\.raye2_watch_session_started\(p_session_id uuid\)/);
});

test("watch invite links store only a token hash and are host-scoped", () => {
  assert.match(migration, /create table if not exists public\.raye2_watch_session_invites/);
  assert.match(migration, /token_hash text not null unique/);
  assert.match(migration, /encode\(extensions\.digest\(p_token,'sha256'\),'hex'\)/);
  assert.match(migration, /create or replace function public\.raye2_create_watch_session_invite/);
  assert.match(migration, /v_role:=public\.raye2_watch_role\(p_session_id\);/);
  assert.match(migration, /if v_role is null or v_role not in \('host','moderator'\) then/);
  assert.match(migration, /'watch_invite_created'/);
  assert.match(migration, /'watch_invite_revoked'/);
});

test("invite redemption is atomic against expiry, use limit, full room and unstarted session", () => {
  assert.match(migration, /create or replace function public\.raye2_join_watch_session_invite\(p_token text\)/);
  assert.match(migration, /for update;/);
  assert.match(migration, /v_invite\.revoked_at is not null or v_invite\.expires_at<=now\(\)/);
  assert.match(migration, /v_invite\.max_uses is not null and v_invite\.uses>=v_invite\.max_uses/);
  assert.match(migration, /v_count>=v_session\.max_participants/);
  assert.match(migration, /if not public\.raye2_watch_session_started\(v_session\.id\) then/);
  assert.match(migration, /update public\.raye2_watch_session_invites set uses=uses\+1/);
  assert.match(migration, /on conflict\(session_id,user_id\) do update set status='joined'/);
});

test("watch invite table is RLS-locked and only readable by session members", () => {
  assert.match(migration, /alter table public\.raye2_watch_session_invites enable row level security/);
  assert.match(migration, /revoke all on public\.raye2_watch_session_invites from anon,authenticated/);
  assert.match(migration, /using \(public\.raye2_can_access_watch_session\(session_id\)\)/);
  assert.match(migration, /revoke all on function public\.raye2_join_watch_session_invite\(text\) from public,anon/);
});

test("guarded join keeps the watch restriction check and refuses an unstarted session", () => {
  assert.match(migration, /create or replace function public\.raye2_join_watch_session_guarded\(p_session_id uuid\)/);
  assert.match(migration, /public\.raye2_has_active_restriction\(auth\.uid\(\), 'watch'\)/);
  assert.match(migration, /if not public\.raye2_watch_session_started\(p_session_id\) then/);
  assert.match(migration, /this watch session has not started yet/);
});

test("the watch panel wires scheduling and private invite links", () => {
  assert.match(ui, /p_scheduled_for: scheduled/);
  assert.match(ui, /type="datetime-local"/);
  assert.match(ui, /copy\.startsIn/);
  assert.match(ui, /raye2_create_watch_session_invite/);
  assert.match(ui, /raye2_revoke_watch_session_invite/);
  assert.match(ui, /"\/raye2\/watch-invite"/);
  assert.match(ui, /styles\.watchInvite/);
});

test("the watch invite page redeems the token through the guarded RPC", () => {
  assert.match(invitePage, /raye2_join_watch_session_invite/);
  assert.match(invitePage, /getSupabaseBrowserClient/);
  assert.match(invitePage, /token\.length < 32/);
  assert.match(invitePage, /Your invite will be kept while you sign in/);
});

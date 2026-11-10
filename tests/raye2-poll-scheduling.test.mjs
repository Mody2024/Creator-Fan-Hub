import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, pollManagement, publishedPolls] = await Promise.all([
  read("../supabase/migrations/20261110190000_raye2_poll_scheduling_lifecycle.sql"),
  read("../src/app/creator/poll-management.tsx"),
  read("../src/app/vote/published-polls.tsx")
]);

function functionBody(sql, name) {
  const start = sql.indexOf(`create or replace function public.${name}(`);
  assert.ok(start >= 0, `missing function definition: ${name}`);
  const end = sql.indexOf("$fn$;", start);
  assert.ok(end > start, `missing function terminator: ${name}`);
  return sql.slice(start, end + 4);
}

const creatorFunctions = [
  "raye2_update_creator_poll",
  "raye2_schedule_creator_poll",
  "raye2_delete_creator_poll"
];

test("poll lifecycle RPCs are guarded SECURITY DEFINER functions with pinned search_path", () => {
  for (const name of [...creatorFunctions, "raye2_open_due_polls"]) {
    const body = functionBody(migration, name);
    assert.match(body, /security definer/i, name);
    assert.match(body, /set search_path\s*=\s*''/i, name);
  }
  for (const name of creatorFunctions) {
    assert.match(functionBody(migration, name), /public\.can_edit_creator_content\(\)/i, name);
    assert.match(functionBody(migration, name), /errcode\s*=\s*'42501'/i, name);
  }
});

test("polls can only be edited, scheduled or deleted before they open and before any vote", () => {
  for (const name of ["raye2_update_creator_poll", "raye2_schedule_creator_poll", "raye2_delete_creator_poll"]) {
    const body = functionBody(migration, name);
    assert.match(body, /v_status not in \('draft','scheduled'\)/i, name);
  }
  assert.match(functionBody(migration, "raye2_update_creator_poll"), /exists \(select 1 from public\.poll_votes where poll_id = p_poll_id\)/i);
  assert.match(functionBody(migration, "raye2_delete_creator_poll"), /already_voted/);
});

test("scheduling requires a future time and consistent open/close ordering", () => {
  const body = functionBody(migration, "raye2_schedule_creator_poll");
  assert.match(body, /p_starts_at <= now\(\)/i);
  assert.match(body, /scheduled time must be in the future/);
  assert.match(body, /v_ends is not null and v_ends <= p_starts_at/);
});

test("the due-poll promoter respects the one-open-poll invariant", () => {
  const body = functionBody(migration, "raye2_open_due_polls");
  assert.match(body, /if exists \(select 1 from public\.polls where status = 'open'\) then\s*return 0;/i);
  assert.match(body, /status = 'scheduled'[\s\S]*starts_at <= now\(\)/i);
  assert.match(body, /order by p2\.starts_at asc\s*limit 1/i);
  assert.match(migration, /grant execute on function public\.raye2_open_due_polls\(\) to anon, authenticated/);
  assert.match(migration, /revoke all on function public\.raye2_open_due_polls\(\) from public/);
});

test("creator poll lifecycle RPCs are granted to authenticated only", () => {
  for (const name of creatorFunctions) {
    assert.match(migration, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to authenticated`), name);
    assert.match(migration, new RegExp(`revoke all on function public\\.${name}\\([^)]*\\) from public, anon`), name);
    assert.doesNotMatch(migration, new RegExp(`grant execute on function public\\.${name}\\([^)]*\\) to (anon|public)`), name);
  }
});

test("the creator poll panel wires scheduling, deletion and lazy auto-open", () => {
  assert.match(pollManagement, /\.rpc\("raye2_schedule_creator_poll"/);
  assert.match(pollManagement, /\.rpc\("raye2_delete_creator_poll"/);
  assert.match(pollManagement, /\.rpc\("raye2_open_due_polls"\)/);
  assert.match(pollManagement, /t\.schedule/);
  assert.match(pollManagement, /t\.deletePoll/);
});

test("the public vote page promotes due polls before reading results", () => {
  assert.match(publishedPolls, /await supabase\.rpc\("raye2_open_due_polls"\)/);
  assert.match(publishedPolls, /get_public_poll_results/);
});

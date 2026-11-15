import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client, page] = await Promise.all([
  read("../supabase/migrations/20261110860000_raye2_event_spaces_qa.sql"),
  read("../src/app/events/public-events.tsx"),
  read("../src/app/events/page.tsx")
]);

test("event Q&A is a guarded table, not a direct client write", () => {
  assert.match(migration, /create table if not exists public\.event_qa/);
  assert.match(migration, /revoke all on public\.event_qa from anon, authenticated/);
  assert.match(migration, /function public\.raye2_ask_event_question\(/);
});

test("only an event host or authorized creator can answer", () => {
  assert.match(migration, /function public\.raye2_can_answer_event\(/);
  assert.match(migration, /host or creator access required/);
  assert.match(migration, /from public\.event_hosts h where h\.event_id=p_event_id and h\.user_id=\(select auth\.uid\(\)\)/);
});

test("questions are refused on non-published events and removable by author or host", () => {
  assert.match(migration, /questions are not open for this event/);
  assert.match(migration, /function public\.raye2_remove_event_question\(/);
  assert.match(migration, /not allowed to remove this question/);
});

test("an event can attach a community space it belongs to", () => {
  assert.match(migration, /add column if not exists conversation_id uuid references public\.raye2_conversations/);
  assert.match(migration, /function public\.raye2_attach_event_space\(/);
  assert.match(migration, /you must belong to the room you attach/);
});

test("the public events read exposes the attached space slug", () => {
  assert.match(migration, /space_group_slug text/);
  assert.match(migration, /left join public\.raye2_groups g on g\.id = c\.group_id/);
  assert.match(page, /space_group_slug/);
  assert.match(client, /raye2_ask_event_question/);
  assert.match(client, /raye2_list_event_questions/);
});

test("event questions are reportable community content", () => {
  assert.match(migration, /'event_question'/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, ui] = await Promise.all([
  read("../supabase/migrations/20261111100000_raye2_watch_reactions.sql"),
  read("../src/app/raye2/raye2-watch-together-controls.tsx")
]);

test("watch reactions are participant-scoped, rate-limited and view-gated", () => {
  assert.match(migration, /create table if not exists public\.raye2_watch_reactions/);
  assert.match(migration, /reaction text not null check \(reaction in \('spark','orbit','legend','laugh','mindblown','support'\)\)/);
  assert.match(migration, /if not public\.raye2_is_watch_participant\(p_session_id\) then/);
  assert.match(migration, /interval '1 minute'\) >= 20/);
  assert.match(migration, /using \(public\.raye2_can_access_watch_session\(session_id\)\)/);
  assert.match(migration, /and public\.raye2_can_access_watch_session\(p_session_id\)/);
});

test("reactions are delivered live and wired into the watch panel", () => {
  assert.match(migration, /alter publication supabase_realtime add table public\.%I/);
  assert.match(migration, /array\['raye2_watch_reactions'\]/);
  assert.match(ui, /raye2_list_watch_reactions/);
  assert.match(ui, /raye2_send_watch_reaction/);
  assert.match(ui, /table: "raye2_watch_reactions"/);
  assert.match(ui, /copy\.reactions/);
});

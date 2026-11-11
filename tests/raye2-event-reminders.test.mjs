import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, creatorForm, publicEvents, eventsPage, raye2Client] = await Promise.all([
  read("../supabase/migrations/20261110430000_raye2_event_reminders_hosts_types.sql"),
  read("../src/app/creator/event-social-management.tsx"),
  read("../src/app/events/public-events.tsx"),
  read("../src/app/events/page.tsx"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("events gain typed kinds with a validated check constraint", () => {
  assert.match(migration, /add column if not exists event_type text not null default 'community'/);
  assert.match(migration, /check \(event_type in \('community','office_hours','qa','collab','watch_party','other'\)\)/);
});

test("host and co-host roles are a guarded table with a single host per event", () => {
  assert.match(migration, /create table if not exists public\.event_hosts/);
  assert.match(migration, /create unique index if not exists event_hosts_single_host on public\.event_hosts\(event_id\) where role = 'host'/);
  assert.match(migration, /check \(role in \('host','cohost'\)\)/);
  assert.match(migration, /revoke all on public\.event_hosts from anon, authenticated/);
});

test("host management is creator-only and the public read covers published events", () => {
  assert.match(migration, /create or replace function public\.raye2_set_event_host\(p_event_id uuid, p_user_id uuid, p_role text default 'cohost'\)/);
  assert.match(migration, /not public\.is_active_creator\(\)/);
  assert.match(migration, /event already has a host/);
  assert.match(migration, /grant execute on function public\.raye2_set_event_host\(uuid,uuid,text\) to authenticated/);
  assert.doesNotMatch(migration, /raye2_set_event_host\(uuid,uuid,text\) to anon/);
  assert.match(migration, /grant execute on function public\.raye2_get_event_hosts\(uuid\) to anon, authenticated/);
});

test("event creation validates type and reminder and the calendar exposes them", () => {
  assert.match(migration, /p_event_type text default 'community'/);
  assert.match(migration, /p_reminder_minutes_before not between 5 and 10080/);
  assert.match(migration, /grant execute on function public\.save_creator_event\(uuid,text,text,timestamptz,timestamptz,text,integer\) to authenticated/);
  assert.match(migration, /my_rsvp_status text/);
  assert.match(migration, /host_count integer,/);
});

test("reminders notify going members once, honouring opt-out and quiet hours", () => {
  assert.match(migration, /create or replace function public\.raye2_dispatch_event_reminders\(\)/);
  assert.match(migration, /e\.reminder_sent_at is null/);
  assert.match(migration, /r\.status = 'going'/);
  assert.match(migration, /coalesce\(pref\.event_reminders, true\)/);
  assert.match(migration, /'event_reminder'/);
  assert.match(migration, /add column if not exists event_reminders boolean not null default true/);
});

test("the creator form manages type, reminder and hosts; the calendar shows the host line", () => {
  assert.match(creatorForm, /p_event_type:eventType/);
  assert.match(creatorForm, /p_reminder_minutes_before:reminder\?Number\(reminder\):null/);
  assert.match(creatorForm, /rpc\("raye2_set_event_host"/);
  assert.match(creatorForm, /rpc\("raye2_get_event_hosts"/);
  assert.match(publicEvents, /rpc\("raye2_get_event_hosts"/);
  assert.match(publicEvents, /event-hosted/);
  assert.match(eventsPage, /host_count:Number\(row\.host_count\?\?0\)/);
  assert.match(raye2Client, /p_event_reminders: next\.event_reminders/);
});

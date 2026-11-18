import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, studio] = await Promise.all([
  read("../supabase/migrations/20261111050000_raye2_video_scheduling.sql"),
  read("../src/app/creator/video-studio.tsx")
]);

test("scheduled watch pages stay private until their go-live time", () => {
  assert.match(migration, /alter table public\.video_catalog add column if not exists publish_at timestamptz/);
  // A page can never be both published and scheduled.
  assert.match(migration, /check \(publish_at is null or published_at is null\)/);
  assert.match(migration, /create or replace function public\.raye2_publish_due_videos\(\)/);
  assert.match(migration, /where published_at is null and publish_at is not null and publish_at <= now\(\)/);
  assert.match(migration, /set published_at = now\(\), publish_at = null/);
});

test("scheduling reuses the same processing and visibility gates as publishing", () => {
  assert.match(migration, /if \(coalesce\(p_publish,false\) or p_publish_at is not null\) and v_media\.media_type<>'youtube'/);
  assert.match(migration, /if \(coalesce\(p_publish,false\) or p_publish_at is not null\) and not v_media\.is_published/);
  assert.match(migration, /a scheduled go-live time must be in the future/);
  assert.match(migration, /a watch page cannot be published and scheduled at the same time/);
  // The save RPC keeps its original positional signature and appends the new parameter.
  assert.match(migration, /p_publish boolean default false,\n p_publish_at timestamptz default null/);
  assert.match(migration, /grant execute on function public\.save_raye2_video_catalog\(uuid,text,text,text,text\[\],integer,boolean,boolean,boolean,timestamptz\) to authenticated/);
});

test("scheduled promotion runs from the shared maintenance runner", () => {
  assert.match(migration, /v_videos := public\.raye2_publish_due_videos\(\)/);
  assert.match(migration, /'scheduled_videos_published', v_videos/);
  assert.match(migration, /grant execute on function public\.raye2_run_maintenance\(\) to anon, authenticated/);
});

test("video studio offers scheduling and shows scheduled state", () => {
  assert.match(studio, /datetime-local/);
  assert.match(studio, /p_publish_at:publishAtIso\?\?null/);
  assert.match(studio, /scheduleGoLive/);
  assert.match(studio, /cancelSchedule/);
  assert.match(studio, /scheduledStatus/);
  assert.match(studio, /scheduledStatus:"SCHEDULED"/);
});

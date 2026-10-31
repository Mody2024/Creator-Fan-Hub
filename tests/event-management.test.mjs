import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("creator can finish a published event and public calendar labels it completed", async () => {
  const [admin, migration, publicView] = await Promise.all([
    read("../src/app/creator/event-social-management.tsx"),
    read("../supabase/migrations/20261026001500_creator_events_and_socials.sql"),
    read("../src/app/events/public-events.tsx")
  ]);
  assert.ok(admin.includes('next:"published"|"draft"|"cancelled"|"completed"'));
  assert.ok(admin.includes('eventStatus(e.event_id,"completed")'));
  assert.ok(admin.includes("Mark completed"));
  assert.ok(migration.includes("('published','cancelled','completed','draft')"));
  assert.ok(publicView.includes('event.status==="completed"'));
  assert.ok(publicView.includes("COMPLETED"));
});

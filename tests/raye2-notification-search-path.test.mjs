import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

test("notification helper functions pin an empty search path", () => {
  const migration = readFileSync("supabase/migrations/20261126150000_raye2_notification_search_path_hardening.sql", "utf8");
  assert.match(migration, /alter function public\.raye2_in_quiet_hours\([\s\S]*?\) set search_path = '';/i);
  assert.match(migration, /alter function public\.raye2_notification_category\(text\)\s+set search_path = '';/i);
});

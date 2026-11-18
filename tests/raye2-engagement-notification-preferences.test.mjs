import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, account] = await Promise.all([
  read("../supabase/migrations/20261110760000_raye2_engagement_notification_preferences.sql"),
  read("../src/app/account/account-settings.tsx")
]);

test("preference RPCs exist and are authenticated-only", () => {
  for (const name of ["raye2_get_my_engagement_notification_preferences", "raye2_set_engagement_notification_preferences", "raye2_notification_category", "raye2_in_quiet_hours", "raye2_engagement_should_deliver"]) {
    assert.match(migration, new RegExp(`function public\\.${name}\\(`), `missing ${name}`);
  }
  assert.match(migration, /grant execute on function public\.raye2_set_engagement_notification_preferences\(text\[\],boolean,time,time,text\) to authenticated/);
});

test("categories are validated against a fixed set", () => {
  assert.match(migration, /v_cats <@ array\['follow','reactions','comments','mentions','announcements','events','live','groups'\]/);
  assert.match(migration, /raise exception 'unknown notification category'/);
});

test("quiet hours are timezone-aware and wrap past midnight", () => {
  assert.match(migration, /at time zone coalesce\(nullif\(p_tz, ''\), 'UTC'\)/);
  assert.match(migration, /if p_start < p_end then\s*\n\s*return v_local >= p_start and v_local < p_end;\s*\n\s*end if;\s*\n\s*return v_local >= p_start or v_local < p_end;/);
});

test("muting is enforced in the inbox and summary", () => {
  const gates = migration.match(/not \(public\.raye2_notification_category\(n\.notification_type\) = any\(m\.cats\)\)/g) ?? [];
  assert.ok(gates.length >= 2, `expected inbox+summary gates, found ${gates.length}`);
  assert.match(account, /raye2_set_engagement_notification_preferences/);
  assert.match(account, /raye2_get_my_engagement_notification_preferences/);
  assert.match(account, /quiet_hours_timezone/);
});

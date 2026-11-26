import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, client] = await Promise.all([
  read("../supabase/migrations/20261110920000_raye2_message_retention.sql"),
  read("../src/app/raye2/raye2-client.tsx")
]);

test("message retention is an automatic sweep over enabled policies", () => {
  assert.match(migration, /function public\.raye2_sweep_message_retention\(p_category text\)/);
  assert.match(migration, /not v_policy\.enabled or v_policy\.retention_days is null or v_policy\.expiry_action <> 'delete'/);
  assert.match(migration, /p_category not in \('direct_messages','group_messages'\)/);
});

test("the sweep protects preserved memories and non-active groups", () => {
  assert.match(migration, /sm\.retention_mode='preserved'/);
  assert.match(migration, /g\.status='active'/);
});

test("the sweep is folded into the guarded maintenance runner", () => {
  assert.match(migration, /raye2_sweep_message_retention\('direct_messages'\)/);
  assert.match(migration, /raye2_sweep_message_retention\('group_messages'\)/);
  assert.match(migration, /'direct_messages_expired', v_direct, 'group_messages_expired', v_group/);
  assert.match(client, /raye2_is_platform_admin/);
  assert.match(client, /if \(active && !error && data === true\) void supabase\.rpc\("raye2_run_maintenance"\)/);
});

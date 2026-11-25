import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("launch media gate verifies active platform admins on the server", async () => {
  const source = await readFile(new URL("../src/app/raye2-shell/coming-soon.tsx", import.meta.url), "utf8");
  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /isRaye2PlatformAdmin/);
  const helper = await readFile(new URL("../src/lib/raye2-admin.ts", import.meta.url), "utf8");
  assert.match(helper, /supabase\.auth\.getClaims\(\)/);
  assert.match(helper, /from\("creator_admins"\)/);
  assert.match(helper, /eq\("active", true\)/);
  assert.match(helper, /admin\?\.role === "owner" \|\| admin\?\.role === "admin"/);
  assert.match(source, /return <ComingSoon feature=\{feature\} \/>/);
  assert.doesNotMatch(source, /adminBypass\s*=/);
});

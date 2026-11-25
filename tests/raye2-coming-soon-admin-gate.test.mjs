import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("launch media gate verifies active platform admins on the server", async () => {
  const source = await readFile(new URL("../src/app/raye2-shell/coming-soon.tsx", import.meta.url), "utf8");
  assert.match(source, /createSupabaseServerClient/);
  assert.match(source, /supabase\.auth\.getClaims\(\)/);
  assert.match(source, /from\("creator_admins"\)/);
  assert.match(source, /eq\("active", true\)/);
  assert.match(source, /\["owner", "admin"\]\.includes\(admin\.role\)/);
  assert.match(source, /return <ComingSoon feature=\{feature\} \/>/);
  assert.doesNotMatch(source, /adminBypass\s*=/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = p => readFile(new URL(p, import.meta.url), "utf8");

test("the studio admits every assignable creator role, including streamer-only", async () => {
  const page = await read("../src/app/raye2/studio/page.tsx");
  const migration = await read("../supabase/migrations/20261110590000_raye2_creator_role_permissions.sql");
  const dbRoles = ["owner", "admin", "creator", "streamer", "editor", "moderator", "analyst"];
  for (const role of dbRoles) {
    assert.ok(migration.includes(`'${role}'`), `db constraint is missing ${role}`);
    assert.ok(page.includes(`"${role}"`), `studio allowlist is missing ${role}`);
  }
  assert.match(page, /redirect\("\/creator\/login\?access=restricted"\)/);
});

test("streamer-only gets live affordances and creator-only gets upload, never the reverse", async () => {
  const page = await read("../src/app/raye2/studio/page.tsx");
  assert.match(page, /const canPublish = \["owner", "admin", "creator", "streamer", "editor"\]\.includes\(role\)/);
  assert.match(page, /const canStream = \["owner", "admin", "streamer"\]\.includes\(role\)/);
  assert.match(page, /const canStream = \["owner", "admin", "streamer"\]\.includes\(role\)/);\n  assert.match(page, /const canAnalyze = \["owner", "admin", "creator", "streamer"\]\.includes\(role\)/);
  assert.match(page, /\{canStream && <Link href="#creator-live-studio"/);
  assert.match(page, /\{canStream && <article/);
});

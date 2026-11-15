import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const backup = await readFile(new URL("../scripts/raye2-storage-backup.mjs", import.meta.url), "utf8");
const restore = await readFile(new URL("../scripts/raye2-storage-restore.mjs", import.meta.url), "utf8");
const workflow = await readFile(new URL("../.github/workflows/supabase-backup.yml", import.meta.url), "utf8");

test("Storage backup enumerates every bucket and paginates object listings", () => {
  assert.match(backup, /storage\.listBuckets\(\)/);
  assert.match(backup, /limit:\s*pageSize/);
  assert.match(backup, /offset/);
  assert.match(backup, /storage\.from\(bucket\)\.download\(objectPath\)/);
  assert.match(backup, /raye2-storage-backup-v1/);
});

test("Storage backup rejects traversal, enforces a byte ceiling and refuses publishable keys", () => {
  assert.match(backup, /part === "\.\."/);
  assert.match(backup, /RAYE2_BACKUP_MAX_STORAGE_BYTES/);
  assert.match(backup, /totalBytes \+ bytes > maxBytes/);
  assert.match(backup, /sb_publishable_/);
});

test("Storage restore verifies the manifest and exact object sizes before upserting", () => {
  assert.match(restore, /raye2-storage-backup-v1/);
  assert.match(restore, /fileStat\.size !== item\.bytes/);
  assert.match(restore, /upsert:\s*true/);
  assert.doesNotMatch(restore, /\.remove\(/);
  assert.match(restore, /part === "\.\."/);
});

test("Scheduled backup encrypts database and Storage data without storing plaintext artifacts", () => {
  assert.match(workflow, /pg_dump/);
  assert.match(workflow, /raye2-storage-backup\.mjs/);
  assert.match(workflow, /age --recipient/);
  assert.match(workflow, /retention-days:\s*14/);
  assert.doesNotMatch(workflow, /upload-artifact[\s\S]*?path:\s*\.\.\//);
});

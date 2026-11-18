import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const component = await readFile(new URL("../src/app/creator/publishing-history.tsx", import.meta.url), "utf8");

test("publishing history validates each server-provided version row before rendering", () => {
  assert.ok(component.includes("function isVersionRow(value: unknown): value is VersionRow"));
  assert.ok(component.includes("Number.isSafeInteger(row.version)"));
  assert.ok(component.includes("typeof row.maintenance_mode === \"boolean\""));
  assert.ok(component.includes("!payload.versions.every(isVersionRow)"));
});

test("publishing history clears stale snapshots after a failed or malformed reload", () => {
  assert.ok(component.includes("setVersions([]);\n      setStatus(error instanceof Error ? error.message"));
  assert.ok(component.includes("The publishing history response was invalid. Refresh and try again."));
});

test("restore does not claim success without a valid new draft revision", () => {
  assert.ok(component.includes("!Number.isSafeInteger(payload.revision) || (payload.revision as number) < 1"));
  assert.ok(component.includes("Restore could not be confirmed. Refresh the draft before continuing."));
  assert.ok(component.includes("will not publish it or change the live website"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

test("CI builds the isolated Raye2 media worker image without publishing it", async () => {
  const workflow = await readFile(new URL("../.github/workflows/ci.yml", import.meta.url), "utf8");
  assert.ok(workflow.includes("build-media-worker-image:"));
  assert.ok(workflow.includes("docker/setup-buildx-action@v3"));
  assert.ok(workflow.includes("docker/build-push-action@v6"));
  assert.ok(workflow.includes("file: Dockerfile.raye2-media-worker"));
  assert.ok(workflow.includes("push: false"));
  assert.ok(workflow.includes("tags: raye2-media-worker:ci"));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("creator dashboard quick navigation points to all six real management panels", async () => {
  const [page, settings, polls, ideas, events, media, history] = await Promise.all([
    read("../src/app/creator/page.tsx"),
    read("../src/app/creator/creator-settings.tsx"),
    read("../src/app/creator/poll-management.tsx"),
    read("../src/app/creator/idea-moderation-queue.tsx"),
    read("../src/app/creator/event-social-management.tsx"),
    read("../src/app/creator/media-library.tsx"),
    read("../src/app/creator/publishing-history.tsx")
  ]);
  for (const id of ["creator-settings","creator-polls","creator-ideas","creator-events-socials","creator-media","creator-history"]) {
    assert.ok(page.includes(`href="#${id}"`), `dashboard link missing for ${id}`);
  }
  for (const [source,id] of [[settings,"creator-settings"],[polls,"creator-polls"],[ideas,"creator-ideas"],[events,"creator-events-socials"],[media,"creator-media"],[history,"creator-history"]]) {
    assert.ok(source.includes(`id="${id}"`), `management panel target missing: ${id}`);
  }
  assert.ok(page.includes("06 ACTIVE AREAS"));
  assert.ok(!page.includes("More control, coming next."));
});

test("creator settings always leave loading state after auth, RPC, or network failures", async () => {
  const source = await read("../src/app/creator/creator-settings.tsx");
  const loadStart = source.indexOf("const load = useCallback(async () => {");
  const loadEnd = source.indexOf("\n  }, [router]);", loadStart);
  assert.ok(loadStart >= 0 && loadEnd > loadStart);
  const loader = source.slice(loadStart, loadEnd);
  assert.ok(loader.includes("try {"));
  assert.ok(loader.includes("catch {"));
  assert.ok(loader.includes("finally {"));
  assert.ok(loader.includes("setBusy(false);"));
  assert.ok(loader.includes("if (userError) throw userError;"));
  assert.ok(loader.includes("if (adminError) throw adminError;"));
  assert.ok(loader.includes("if (error) throw error;"));
  assert.ok(loader.includes("Number.isSafeInteger(Number(data[0].draft_revision))"));
});

test("creator settings warns before reload when there are unsaved edits", async () => {
  const source = await read("../src/app/creator/creator-settings.tsx");
  assert.ok(source.includes("Discard your unsaved changes and reload the saved draft?"));
  assert.ok(source.includes("beforeunload"));
});

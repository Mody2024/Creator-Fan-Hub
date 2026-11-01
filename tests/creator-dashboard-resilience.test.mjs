import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("creator dashboard quick navigation points to all ten management areas", async () => {
  const [page, settings, polls, ideas, events, media, history, studio] = await Promise.all([
    read("../src/app/creator/page.tsx"),
    read("../src/app/creator/creator-settings.tsx"),
    read("../src/app/creator/poll-management.tsx"),
    read("../src/app/creator/idea-moderation-queue.tsx"),
    read("../src/app/creator/event-social-management.tsx"),
    read("../src/app/creator/media-library.tsx"),
    read("../src/app/creator/publishing-history.tsx"),
    read("../src/app/creator/video-studio.tsx")
  ]);
  for (const id of ["creator-settings","creator-polls","creator-ideas","creator-events-socials","creator-media","creator-history","creator-video-studio"]) {
    assert.ok(page.includes(`href="#${id}"`), `dashboard link missing for ${id}`);
  }
  for (const [source,id] of [[settings,"creator-settings"],[polls,"creator-polls"],[ideas,"creator-ideas"],[events,"creator-events-socials"],[media,"creator-media"],[history,"creator-history"],[studio,"creator-video-studio"]]) {
    assert.ok(source.includes(`id="${id}"`), `management panel target missing: ${id}`);
  }
  assert.ok(page.includes("10 ACTIVE AREAS"));
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

test("site publishing verifies that each selected asset is public and has a compatible media type", async () => {
  const source = await read("../src/app/creator/creator-settings.tsx");
  assert.ok(source.includes('{ id: draft.identity.logoMediaId, label: "logo", allowed: ["image"] }'));
  assert.ok(source.includes('{ id: draft.identity.mascotMediaId, label: "mascot", allowed: ["image", "sprite"] }'));
  assert.ok(source.includes('{ id: draft.identity.narrationMediaId, label: "narration", allowed: ["audio"] }'));
  assert.ok(source.includes('{ id: draft.hero.mediaId, label: "hero background", allowed: ["image", "video"] }'));
  assert.ok(source.includes('!stored || !stored.is_published || !asset.allowed.includes(stored.media_type)'));
});

test("team permission changes always recover from RPC and network failures", async () => {
  const source = await read("../src/app/creator/team/team-client.tsx");
  assert.ok(source.includes('if(error)throw error;'));
  assert.ok(source.includes('finally {setBusy(false);}'));
  assert.ok(source.includes('Refresh the roster to confirm the current permissions.'));
  assert.ok(source.includes('Refresh the roster to confirm the current status.'));
  assert.ok(source.includes('if(!supabase||busy||member.role==="owner"||!roles.includes(next))return;'));
});

test("invitation link copying reports clipboard failure instead of silently failing", async () => {
  const source = await read("../src/app/creator/team/team-client.tsx");
  assert.ok(source.includes('async function copyInvite()'));
  assert.ok(source.includes('Clipboard access is unavailable. Select and copy the invitation link manually.'));
  assert.ok(source.includes('onClick={()=>void copyInvite()}'));
});

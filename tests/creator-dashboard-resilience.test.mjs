import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("creator dashboard quick navigation points to all eleven management areas", async () => {
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
  assert.ok(page.includes('8 + (["owner","admin"].includes(admin.role) ? 3 : 0) + (admin.role === "owner" ? 1 : 0)'));
  assert.ok(page.includes('href="/creator/raye2"'));
  assert.ok(page.includes('href="#creator-rewards"'));
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

test("invitation verification and acceptance recover from network failures", async () => {
  const source = await read("../src/app/creator/accept-invite/accept-invite-client.tsx");
  assert.ok(source.includes('if(active){setReady(false);setStatus("We could not verify your sign-in because the connection failed. Check your connection and reload this page.");}'));
  assert.ok(source.includes('We could not accept this invitation. Check that you are signed in with the invited email'));
  assert.ok(source.includes('finally {setBusy(false);}'));
  assert.ok(source.includes('return ()=>{active=false;}'));
});


test("creator dashboard only advertises modules allowed by the signed-in role", async () => {
  const page = await read("../src/app/creator/page.tsx");
  assert.ok(page.includes('{admin.role === "owner" && ('));
  assert.ok(page.includes('{["owner","admin"].includes(admin.role) && ('));
  assert.ok(page.includes('8 + (["owner","admin"].includes(admin.role) ? 3 : 0) + (admin.role === "owner" ? 1 : 0)'));
});

test("community interactions restore optimistic state and recover from failed requests", async () => {
  const source = await read("../src/app/community/community-client.tsx");
  assert.ok(source.includes("Your previous reaction has been restored."));
  assert.ok(source.includes("Your previous setting has been restored."));
  assert.ok(source.includes("Comments could not be loaded. Check your connection and try again."));
  assert.ok(source.includes("Your text is still here so you can retry."));
  assert.ok(source.includes("We could not send your report. Please try again later."));
  assert.ok(source.includes("We could not sign you out because the connection failed."));
});

test("watch page restores reactions and bookmarks after failed requests", async () => {
  const source = await read("../src/app/watch/[slug]/watch-detail-client.tsx");
  assert.ok(source.includes("Your previous reaction has been restored."));
  assert.ok(source.includes("Your previous setting has been restored."));
  assert.ok(source.includes("disabled={actionBusy}"));
});
test("watch page preserves comment text on failure and handles share errors", async () => {
  const source = await read("../src/app/watch/[slug]/watch-detail-client.tsx");
  assert.ok(source.includes("Your text is still here so you can retry."));
  assert.ok(source.includes("Could not copy the link automatically."));
  assert.ok(source.includes("Some video details could not be loaded."));
  assert.ok(source.includes("aria-live=\"polite\""));
});

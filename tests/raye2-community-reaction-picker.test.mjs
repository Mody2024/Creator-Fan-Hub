import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [client, styles] = await Promise.all([
  readFile(new URL("../src/app/community/community-client.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/community/raye2-community.css", import.meta.url), "utf8"),
]);

test("community reaction picker has an explicit controlled open state for touch devices", () => {
  assert.ok(client.includes("reactionMenuFor"));
  assert.ok(client.includes('aria-expanded={reactionMenuFor===post.id}'));
  assert.ok(client.includes('onClick={()=>setReactionMenuFor(current=>current===post.id?null:post.id)}'));
  assert.ok(styles.includes(".nhen-reaction-picker.is-open .nhen-reaction-menu"));
});

test("community reaction picker supports Escape and closes when focus leaves", () => {
  assert.ok(client.includes('if(event.key==="Escape")'));
  assert.ok(client.includes("setReactionMenuFor(null)"));
  assert.ok(client.includes("event.currentTarget.contains(event.relatedTarget as Node|null)"));
});

test("selecting a reaction closes the menu before persisting the selection", () => {
  assert.ok(client.includes("async function react(postId: string, reaction: string) {\n    setReactionMenuFor(null);"));
});

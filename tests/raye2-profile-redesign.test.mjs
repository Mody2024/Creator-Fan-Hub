
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const client=await readFile(new URL("../src/app/u/[handle]/profile-client.tsx",import.meta.url),"utf8");
const profileLayout=await readFile(new URL("../src/app/u/layout.tsx",import.meta.url),"utf8");
const shellTop=await readFile(new URL("../src/app/raye2-shell/shell-top.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../src/app/u/[handle]/profile.module.css",import.meta.url),"utf8");
test("Raye2 profile has connected content section navigation",()=>{
 assert.ok(client.includes("profileTabs"));
 assert.ok(client.includes('id="profile-videos"'));
 assert.ok(client.includes('id="profile-shorts"'));
 assert.ok(client.includes('id="profile-posts"'));
});
test("Raye2 profile uses shared branded responsive shell and accessible search",()=>{
  // The profile header was replaced by the shared shell: the section layout supplies a top bar with accessible search.
  assert.ok(profileLayout.includes("<ShellFrame>"));
  assert.ok(shellTop.includes("aria-label={t.search}"));
 assert.ok(css.includes(".profileTabs"));
 assert.ok(css.includes("@media(max-width:720px)"));
 assert.ok(css.includes(".page[dir=\"rtl\"]"));
});

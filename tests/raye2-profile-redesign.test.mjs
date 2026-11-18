
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const client=await readFile(new URL("../src/app/u/[handle]/profile-client.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../src/app/u/[handle]/profile.module.css",import.meta.url),"utf8");
test("Raye2 profile has connected content section navigation",()=>{
 assert.ok(client.includes("profileTabs"));
 assert.ok(client.includes('id="profile-videos"'));
 assert.ok(client.includes('id="profile-shorts"'));
 assert.ok(client.includes('id="profile-posts"'));
});
test("Raye2 profile uses shared branded responsive shell and accessible search",()=>{
 assert.ok(client.includes('aria-label={isArabic?"بحث":"Search creators and videos"}'));
 assert.ok(client.includes("brandGlyph"));
 assert.ok(css.includes(".profileTabs"));
 assert.ok(css.includes("@media(max-width:720px)"));
 assert.ok(css.includes(".page[dir=\"rtl\"]"));
});


import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const page=await readFile(new URL("../src/app/raye2/studio/page.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../src/app/raye2/studio/studio.module.css",import.meta.url),"utf8");
test("Raye2 Creator Studio has direct role-aware publishing workflow shortcuts",()=>{
 assert.ok(page.includes('href="/creator#creator-media"'));
 assert.ok(page.includes('href="/creator#creator-video-studio"'));
 assert.ok(page.includes('href="/creator/analytics"'));
 assert.ok(page.includes("{canPublish &&"));
 assert.ok(page.includes("{canAnalyze &&"));
});
test("Creator Studio recent media uses server-authorized library data and shows processing state",()=>{
 assert.ok(page.includes("get_creator_media"));
 assert.ok(page.includes("recentMedia"));
 assert.ok(page.includes("processing_status"));
 assert.ok(page.includes("statusFailed"));
 assert.ok(page.includes("statusWaiting"));
});
test("Creator Studio workflow is responsive and reduced-motion aware",()=>{
 assert.ok(css.includes(".workflow"));
 assert.ok(css.includes("@media(max-width:850px)"));
 assert.ok(css.includes("@media(max-width:560px)"));
 assert.ok(css.includes("prefers-reduced-motion"));
});

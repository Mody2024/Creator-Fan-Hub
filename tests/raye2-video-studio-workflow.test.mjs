
import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const source=await readFile(new URL("../src/app/creator/video-studio.tsx",import.meta.url),"utf8");
const css=await readFile(new URL("../src/app/globals.css",import.meta.url),"utf8");
test("Raye2 video studio shows asset readiness metrics and catalog filtering",()=>{
 assert.ok(source.includes("raye2-video-overview"));
 assert.ok(source.includes("readySources"));
 assert.ok(source.includes("processingSources"));
 assert.ok(source.includes("draftVideos"));
 assert.ok(source.includes("catalogSearch"));
 assert.ok(source.includes("catalogFilter"));
 assert.ok(source.includes("aria-pressed={selected===v.media_id}"));
});
test("video catalog filtering searches title metadata and keeps draft/public filters distinct",()=>{
 assert.ok(source.includes("searchable.includes(query)"));
 assert.ok(source.includes('catalogFilter==="published"?!!video.published_at:!video.published_at'));
 assert.ok(css.includes(".raye2-video-filters button.active"));
 assert.ok(css.includes("@media(max-width:850px){.raye2-creator-shell .raye2-video-overview"));
});

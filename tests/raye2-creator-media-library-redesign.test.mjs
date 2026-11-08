import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const css=await readFile(new URL("../src/app/globals.css",import.meta.url),"utf8");
const media=await readFile(new URL("../src/app/creator/media-library.tsx",import.meta.url),"utf8");
test("Raye2 media library styling covers upload, storage health and processing-aware asset management",()=>{
 for(const cls of [".media-upload-layout",".media-processing-summary",".media-filters",".media-row",".media-preview",".media-details",".media-processing-failed"])assert.ok(css.includes(".raye2-creator-shell .media-library "+cls));
 assert.ok(media.includes("processing_status"));
 assert.ok(media.includes("uploadProgress"));
 assert.ok(media.includes("retryProcessing"));
});
test("Raye2 media library stays responsive and scoped to the creator shell",()=>{
 assert.ok(css.includes("@media(max-width:980px){.raye2-creator-shell .media-library"));
 assert.ok(css.includes("@media(max-width:620px){.raye2-creator-shell .media-library"));
 assert.ok(css.includes(".raye2-creator-shell .media-library[dir=rtl]"));
});

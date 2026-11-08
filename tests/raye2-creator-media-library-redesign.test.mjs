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

test("media library exposes truthful resumable upload stages and pause messaging",()=>{
 assert.ok(source.includes('useState<"idle"|"preparing"|"uploading"|"saving">("idle")'));
 assert.ok(source.includes('setUploadStage("preparing")'));
 assert.ok(source.includes('setUploadStage("uploading")'));
 assert.ok(source.includes('setUploadStage("saving")'));
 assert.ok(source.includes('interrupted?"Upload paused.'));
 assert.ok(source.includes("media-upload-progress"));
 assert.ok(source.includes("t.stopUpload"));
 assert.ok(source.includes("setUploadStage(\"idle\")"));
});

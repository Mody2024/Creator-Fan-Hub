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
 assert.ok(media.includes('useState<"idle"|"preparing"|"uploading"|"saving">("idle")'));
 assert.ok(media.includes('setUploadStage("preparing")'));
 assert.ok(media.includes('setUploadStage("uploading")'));
 assert.ok(media.includes('setUploadStage("saving")'));
 assert.ok(media.includes('interrupted?"Upload paused.'));
 assert.ok(media.includes("media-upload-progress"));
 assert.ok(media.includes("t.stopUpload"));
 assert.ok(media.includes("setUploadStage(\"idle\")"));
});

test("creator publication moves the complete HLS package with its source and updates only the managed master path",()=>{
 assert.ok(media.includes("async function copyHlsPackage"));
 assert.ok(media.includes("reserve_nhen_media_upload"));
 assert.ok(media.includes("master/master.m3u8"));
 assert.ok(media.includes("nextHlsPackage.masterPath"));
 assert.ok(media.includes("oldHlsCleanupError"));
 assert.ok(media.includes("Adaptive video destination cleanup failed."));
});

test("publication rollback never deletes committed media, and cleans staged source, thumbnail and HLS objects",()=>{
 const catchBlock=media.slice(media.indexOf("} catch(e) {",media.indexOf("async function setPublished")),media.indexOf("finally {",media.indexOf("async function setPublished")));
 assert.match(media,/let databaseSaved = false/);
 assert.match(media,/databaseSaved = true/);
 assert.match(catchBlock,/if\(!databaseSaved\)/);
 assert.match(catchBlock,/remove\(\[nextPath\]\)/);
 assert.match(catchBlock,/remove\(\[previousParts\.join\("\/"\)\]\)/);
 assert.match(catchBlock,/remove\(nextHlsPackage\.copiedPaths\)/);
 assert.ok(catchBlock.indexOf("if(!databaseSaved)")<catchBlock.indexOf("remove([nextPath])"));
});

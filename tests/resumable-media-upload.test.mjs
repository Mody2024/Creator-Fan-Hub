import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const helper=await readFile(new URL("../src/lib/supabase/resumable-upload.ts",import.meta.url),"utf8");
const library=await readFile(new URL("../src/app/creator/media-library.tsx",import.meta.url),"utf8");

test("resumable helper supports every file type advertised by the media library",()=>{
 for(const mime of ["image/jpeg","image/png","image/webp","image/gif","video/mp4","video/webm","audio/mpeg","audio/mp4","audio/wav","audio/ogg"]) assert.ok(helper.includes('"'+mime+'"'));
});

test("resumable uploads validate the bucket and object path before network work",()=>{
 assert.ok(helper.includes("ALLOWED_BUCKETS.has(bucketName)"));
 assert.ok(helper.includes("Invalid media object path."));
 assert.ok(helper.includes("MIME_EXTENSIONS[file.type]"));
});

test("long uploads refresh an expiring session token before requests",()=>{
 assert.ok(helper.includes("onBeforeRequest: async request"));
 assert.ok(helper.includes("client.auth.getSession()"));
 assert.ok(helper.includes("client.auth.refreshSession()"));
 assert.ok(helper.includes('request.setHeader("authorization"'));
});

test("paused uploads preserve the TUS resource and same-file fingerprint",()=>{
 assert.ok(helper.includes('upload.abort(false)'));
 assert.ok(helper.includes("upload.findPreviousUploads()"));
 assert.ok(helper.includes("upload?.resumeFromPreviousUpload(matchingUpload)"));
 assert.ok(helper.includes("sourceFile.lastModified, sourceFile.type"));
 assert.ok(helper.includes("removeFingerprintOnSuccess: true"));
});

test("media library exposes pause control and keeps interrupted upload session",()=>{
 assert.ok(library.includes("new AbortController()"));
 assert.ok(library.includes("signal:controller.signal"));
 assert.ok(library.includes("Pause upload"));
 assert.ok(library.includes("Upload interrupted. Your resumable session is retained"));
 assert.ok(library.includes("reuse_nhen_media_upload_reservation"));
});

test("creator media upload UI distinguishes preparation, transfer, metadata save and resumable pause",()=>{
 assert.match(mediaLibrary,/uploadStage==="preparing"\?t\.uploadPreparing/);
 assert.match(mediaLibrary,/uploadStage==="saving"\?t\.uploadSaving/);
 assert.match(mediaLibrary,/uploadStage==="uploading"/);
 assert.match(mediaLibrary,/Upload paused\. Your resumable session is retained/);
});

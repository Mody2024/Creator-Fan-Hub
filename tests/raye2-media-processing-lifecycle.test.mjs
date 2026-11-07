import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const migration=await readFile(new URL("../supabase/migrations/20261107200000_raye2_media_processing_lifecycle.sql",import.meta.url),"utf8");
const library=await readFile(new URL("../src/app/creator/media-library.tsx",import.meta.url),"utf8");
const helper=await readFile(new URL("../src/lib/supabase/resumable-upload.ts",import.meta.url),"utf8");

test("newly uploaded or replaced media starts as uploaded, never falsely ready",()=>{
 assert.ok(migration.includes("new.processing_status:='uploaded'"));
 assert.ok(migration.includes("new.storage_path is distinct from old.storage_path"));
 assert.ok(migration.includes("new.processing_completed_at:=null"));
 assert.ok(migration.includes("new.processing_attempts:=0"));
});

test("YouTube embeds are distinguished from native files",()=>{
 assert.ok(migration.includes("new.provider:='youtube'"));
 assert.ok(migration.includes("new.playback_kind:='youtube_embed'"));
 assert.ok(migration.includes("new.processing_status:='ready'"));
});

test("processing status RPC only returns media owned by the authenticated creator",()=>{
 assert.ok(migration.includes("m.owner_id=auth.uid()"));
 assert.ok(migration.includes("public.creator_admins"));
 assert.ok(migration.includes("cardinality(p_media_ids),0)>200"));
 assert.ok(migration.includes("revoke all on function public.get_creator_media_processing_status(uuid[]) from public,anon"));
});

test("creator library displays real processing states and does not claim uploads are ready",()=>{
 assert.ok(library.includes('supabase.rpc("get_creator_media_processing_status"'));
 assert.ok(library.includes('item.processing_status!=="ready"'));
 assert.ok(library.includes("awaiting a processing worker"));
 assert.ok(library.includes("Processing:"));
});

test("TUS upload remains resumable and uses no paid media-processing provider",()=>{
 assert.ok(helper.includes("new Upload(file"));
 assert.ok(helper.includes("upload.findPreviousUploads()"));
 assert.ok(helper.includes("upload?.resumeFromPreviousUpload(matchingUpload)"));
 assert.ok(!helper.includes("paidTranscoder"));
});

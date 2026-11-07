import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const queue=await readFile(new URL("../supabase/migrations/20261107210000_raye2_self_hosted_media_worker_queue.sql",import.meta.url),"utf8");
const reservation=await readFile(new URL("../supabase/migrations/20261107211000_raye2_worker_storage_reservation_binding.sql",import.meta.url),"utf8");
const worker=await readFile(new URL("../scripts/raye2-media-worker.mjs",import.meta.url),"utf8");
const packageJson=JSON.parse(await readFile(new URL("../package.json",import.meta.url),"utf8"));
const lifecycle=await readFile(new URL("../supabase/migrations/20261107200000_raye2_media_processing_lifecycle.sql",import.meta.url),"utf8");
const library=await readFile(new URL("../src/app/creator/media-library.tsx",import.meta.url),"utf8");
const publishGate=await readFile(new URL("../supabase/migrations/20261107220000_raye2_processing_gated_media_publication.sql",import.meta.url),"utf8");


test("only trusted service role can claim and complete processing jobs",()=>{
 assert.ok(queue.includes("auth.role() is distinct from 'service_role'"));
 assert.ok(queue.includes("grant execute on function public.claim_raye2_media_processing_job() to service_role"));
 assert.ok(queue.includes("grant execute on function public.complete_raye2_media_processing_job"));
 assert.ok(queue.includes("for update skip locked limit 1"));
});

test("processing leases prevent stale workers and cap automatic retries",()=>{
 assert.ok(queue.includes("processing_attempts<5"));
 assert.ok(queue.includes("processing_lease_until<now()"));
 assert.ok(queue.includes("processing_lease_token=v_token"));
 assert.ok(queue.includes("m.processing_lease_token=p_lease_token"));
 assert.ok(queue.includes("processing_lease_until=now()+interval '20 minutes'"));
});

test("worker thumbnail capacity is reserved against the shared free storage ceiling",()=>{
 assert.ok(queue.includes("reserve_raye2_worker_thumbnail_capacity"));
 assert.ok(queue.includes("v_used+v_reserved+p_bytes>v_quota"));
 assert.ok(queue.includes("grant execute on function public.reserve_raye2_worker_thumbnail_capacity"));
 assert.ok(reservation.includes("candidate.user_id=v_owner"));
 assert.ok(reservation.includes("candidate.expected_bytes=v_bytes"));
 assert.ok(reservation.includes("auth.role()='service_role'"));
});

test("storage trigger accepts worker writes only with owner-bound reservation metadata",()=>{
 assert.ok(reservation.includes("split_part(new.name,'/',1)"));
 assert.ok(reservation.includes("candidate.bucket_id=new.bucket_id"));
 assert.ok(reservation.includes("candidate.expires_at>now()"));
 assert.ok(reservation.includes("grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated,service_role"));
});

test("worker extracts image, video and audio metadata and creates WebP thumbnails",()=>{
 assert.ok(worker.includes("sharp(sourcePath"));
 assert.ok(worker.includes("probeMedia(sourcePath)"));
 assert.ok(worker.includes('"ffprobe"'));
 assert.ok(worker.includes('"ffmpeg"'));
 assert.ok(worker.includes(".webp"));
 assert.ok(worker.includes("durationSeconds"));
});

test("thumbnail writes are owner-scoped, quota-reserved, and replace only after a successful commit",()=>{
 assert.ok(worker.includes("reserve_raye2_worker_thumbnail_capacity"));
 assert.ok(worker.includes("metadata: { ownerId, purpose: 'raye2-thumbnail', mediaId }"));
 assert.ok(worker.includes("upsert: false"));
 assert.ok(worker.includes("previous_thumbnail_path"));
 assert.ok(worker.includes("complete_raye2_media_processing_job"));
});

test("worker runs locally through the package script and does not require a hosted paid processor",()=>{
 assert.equal(packageJson.scripts["media:worker"],"node scripts/raye2-media-worker.mjs");
 assert.ok(worker.includes("SUPABASE_SERVICE_ROLE_KEY"));
 assert.ok(worker.includes("RAYE2_WORKER_POLL_MS"));
 assert.ok(!worker.includes("paidTranscoder"));
});

test("processing status exposes thumbnail path and creator library renders it",()=>{
 assert.ok(lifecycle.includes("checksum_sha256 text,thumbnail_path text"));
 assert.ok(library.includes("thumbnail_path?:string|null"));
 assert.ok(library.includes("const previewPath=item.thumbnail_path??item.storage_path"));
});
test("worker accepts both legacy JWT and current server-only Supabase secret keys",()=>{
 assert.ok(worker.includes('SERVICE_ROLE_KEY.startsWith("sb_secret_")'));
 assert.ok(worker.includes('SERVICE_ROLE_KEY.startsWith("sb_publishable_")'));
});

test("native creator media cannot be published before trusted processing is ready",()=>{
 assert.ok(publishGate.includes("v_media.processing_status is distinct from 'ready'"));
 assert.ok(publishGate.includes("native media must finish processing before publication"));
 assert.ok(library.includes("item.processing_status !== \"ready\""));
});
test("visibility moves preserve a verified asset state without resetting its processing job",()=>{
 assert.ok(lifecycle.includes("old.processing_status='ready'"));
 assert.ok(lifecycle.includes("new.is_published is distinct from old.is_published"));
 assert.ok(lifecycle.includes("new.metadata is not distinct from old.metadata"));
});
test("creator library accepts safe nested thumbnail object paths and refreshes active jobs",()=>{
 assert.ok(library.includes('path.split("/").length<2'));
 assert.ok(library.includes("path.split(\"/\").every(segment"));
 assert.ok(library.includes("window.setInterval"));
});

test("creator library handles public media previews and removes private thumbnails on asset deletion",()=>{
 assert.ok(library.includes('item.is_published && item.thumbnail_path?.startsWith("creator-media-private/")'));
 assert.ok(library.includes('userData.user.id+"/thumbnails/"'));
 assert.ok(library.includes("thumbnailCleanupError"));
});

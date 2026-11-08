import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

const queue=await readFile(new URL("../supabase/migrations/20261107210000_raye2_self_hosted_media_worker_queue.sql",import.meta.url),"utf8");
const heartbeatMigration=await readFile(new URL("../supabase/migrations/20261107270000_raye2_media_processing_lease_heartbeat.sql",import.meta.url),"utf8");
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
 assert.ok(worker.includes("probeMedia(sourcePath, job.media_type)"));
 assert.ok(worker.includes('"ffprobe"'));
 assert.ok(worker.includes('"ffmpeg"'));
 assert.ok(worker.includes(".webp"));
 assert.ok(worker.includes("durationSeconds"));
});

test("thumbnail writes are owner-scoped, quota-reserved, and replace only after a successful commit",()=>{
 assert.ok(worker.includes("reserve_raye2_worker_thumbnail_capacity"));
 assert.ok(worker.includes('metadata: { ownerId, purpose: "raye2-thumbnail", mediaId }'));
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
 assert.ok(library.includes("thumbnail_path?: string|null"));
 assert.ok(library.includes("const previewPath=item.is_published && item.thumbnail_path?.startsWith"));
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

test("worker rejects media with missing or invalid primary streams and bounds processing duration",()=>{
 assert.ok(worker.includes("streams.find(stream => stream.codec_type === expectedType && (expectedType !== \"video\" || Number(stream.disposition?.attached_pic ?? 0) !== 1))"));
 assert.ok(worker.includes("Uploaded ${expectedType} file contains no ${expectedType} stream."));
 assert.ok(worker.includes("duration > 21600"));
 assert.ok(worker.includes("width > 7680 || height > 4320"));
 assert.ok(worker.includes("channels > 8"));
});

test("video thumbnails use a duration-aware frame instead of always sampling at one second",()=>{
 assert.ok(worker.includes("durationSeconds = null"));
 assert.ok(worker.includes("Math.min(30, Math.max(0.5, durationSeconds * 0.1))"));
 assert.ok(worker.includes("sourcePath, workDir, extracted.durationSeconds"));
});

test("worker subprocess execution has bounded output and an enforced timeout",()=>{
 assert.ok(worker.includes("MAX_PROCESS_OUTPUT_BYTES = 2 * 1024 * 1024"));
 assert.ok(worker.includes("child.kill(\"SIGKILL\")"));
 assert.ok(worker.includes("exceeded its ${timeoutMs} ms execution limit"));
 assert.ok(worker.includes("exceeded the ${MAX_PROCESS_OUTPUT_BYTES}-byte output limit"));
});

test("worker drains its current job on shutdown and backs off repeated queue failures",()=>{
 assert.ok(worker.includes('process.once("SIGINT"'));
 assert.ok(worker.includes('process.once("SIGTERM"'));
 assert.ok(worker.includes("finishing the current job before exit"));
 assert.ok(worker.includes("consecutiveQueueErrors"));
 assert.ok(worker.includes("Math.min(POLL_MS * (2 ** consecutiveQueueErrors), 60000)"));
 assert.ok(worker.includes("stopped cleanly"));
});

test("worker validates decoded image formats and enforces image dimension and pixel ceilings",()=>{
 assert.ok(worker.includes('new Set(["jpeg", "png", "webp", "gif", "avif", "tiff"])'));
 assert.ok(worker.includes("width > 8192 || height > 8192"));
 assert.ok(worker.includes("width * height > 40000000"));
 assert.ok(worker.includes('failOn: "error"'));
});

test("worker removes only its own newly uploaded thumbnail when completion is rejected",()=>{
 assert.ok(worker.includes("async function removeWorkerThumbnail(ownerId, thumbnailPath, mediaId)"));
 assert.ok(worker.includes("const expectedPrefix = `${ownerId}/thumbnails/${mediaId}-`"));
 assert.ok(worker.includes("if (!completedSuccessfully && result?.thumbnailPath)"));
 assert.ok(worker.includes("await removeWorkerThumbnail(job.owner_id, result.thumbnailPath, job.media_id)"));
 assert.ok(worker.includes("await removeWorkerThumbnail(job.owner_id, job.previous_thumbnail_path, job.media_id)"));
});

test("ffprobe falls back to the primary stream duration when container duration is absent",()=>{
 assert.ok(worker.includes("sample_rate,duration"));
 assert.ok(worker.includes("const formatDuration = Number(parsed.format?.duration)"));
 assert.ok(worker.includes("const streamDuration = Number(expectedStream.duration)"));
 assert.ok(worker.includes(": streamDuration;"));
});

test("worker fingerprints the exact downloaded source and persists SHA-256 through the lease completion RPC",()=>{
 assert.ok(worker.includes('import { createHash } from "node:crypto"'));
 assert.ok(worker.includes('createHash("sha256").update(sourceBytes).digest("hex")'));
 assert.ok(worker.includes("sourceSha256,"));
 assert.ok(worker.includes("p_result_metadata: result.metadata"));
});

test("video validation and poster extraction ignore attached cover-art streams",()=>{
 assert.ok(worker.includes("disposition=attached_pic"));
 assert.ok(worker.includes('expectedType !== "video" || Number(stream.disposition?.attached_pic ?? 0) !== 1'));
 assert.ok(worker.includes('"0:V:0"'));
});

test("long-running media jobs renew their active lease and refuse stale completion",()=>{
 assert.ok(heartbeatMigration.includes("renew_raye2_media_processing_lease"));
 assert.ok(heartbeatMigration.includes("processing_lease_until>now()"));
 assert.ok(heartbeatMigration.includes("processing_lease_until=now()+interval '20 minutes'"));
 assert.ok(heartbeatMigration.includes("grant execute on function public.renew_raye2_media_processing_lease(uuid,uuid) to service_role"));
 assert.ok(worker.includes("const LEASE_HEARTBEAT_MS = 5 * 60 * 1000"));
 assert.ok(worker.includes('rpc("renew_raye2_media_processing_lease"'));
 assert.ok(worker.includes("if (heartbeat.hasLostLease())"));
});

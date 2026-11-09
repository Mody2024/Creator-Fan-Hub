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

test("lease heartbeat serializes renewals and fails closed when ownership cannot be confirmed",()=>{
 assert.ok(worker.includes("let renewalInFlight = null"));
 assert.ok(worker.includes("let stopPromise = null"));
 assert.ok(worker.includes("setTimeout(async () =>"));
 assert.ok(worker.includes("await renewalInFlight"));
 assert.ok(worker.includes("if (stopPromise) return stopPromise"));
 assert.ok(worker.includes("leaseLost = true"));
 assert.ok(worker.includes("refusing stale completion"));
});


test("manual media retry is owner-scoped, private-only, bounded, and never marks media ready",async()=>{
 const migration=await readFile(new URL("../supabase/migrations/20261107280000_raye2_creator_media_processing_retry.sql",import.meta.url),"utf8");
 assert.ok(migration.includes("manual_processing_retries between 0 and 2"));
 assert.ok(migration.includes("m.id=p_media_id and m.owner_id=v_user"));
 assert.ok(migration.includes("v_media.media_type not in ('video','image','sprite','audio')"));
 assert.ok(migration.includes("or v_media.is_published"));
 assert.ok(migration.includes("v_media.processing_status<>'failed'"));
 assert.ok(migration.includes("v_media.manual_processing_retries>=2"));
 assert.ok(migration.includes("processing_status='uploaded'"));
 assert.ok(migration.includes("processing_attempts=0"));
 assert.ok(migration.includes("grant execute on function public.retry_raye2_media_processing(uuid) to authenticated"));
 assert.ok(!migration.includes("processing_status='ready'"));
});

test("creator media library exposes processing summaries, filters, and a manual retry action",()=>{
 assert.ok(library.includes("type ProcessingFilter ="));
 assert.ok(library.includes("const processingCounts = useMemo"));
 assert.ok(library.includes('value={processingFilter}'));
 assert.ok(library.includes('supabase.rpc("retry_raye2_media_processing"'));
 assert.ok(library.includes('item.processing_status==="failed"'));
 assert.ok(library.includes("This asset has reached its manual retry limit."));
});


test("creator cannot publish native media until the processing worker marks it ready",()=>{
 assert.ok(library.includes("publishNeedsReady"));
 assert.ok(library.includes('disabled={busy||(!item.is_published&&item.media_type!=="youtube"&&item.processing_status!=="ready")}'));
 assert.ok(library.includes('item.media_type!=="youtube"&&item.processing_status!=="ready"?t.publishNeedsReady:undefined'));
});

test("self-hosted worker has an isolated minimal runtime image and secret-safe container setup",async()=>{
 const dockerfile=await readFile(new URL("../Dockerfile.raye2-media-worker",import.meta.url),"utf8");
 const workerPackage=JSON.parse(await readFile(new URL("../worker.package.json",import.meta.url),"utf8"));
 const dockerignore=await readFile(new URL("../.dockerignore",import.meta.url),"utf8");
 assert.ok(dockerfile.includes("COPY worker.package.json ./package.json"));
 assert.ok(dockerfile.includes("apt-get install -y --no-install-recommends ffmpeg"));
 assert.ok(dockerfile.includes("USER node"));
 assert.ok(dockerfile.includes('CMD ["node", "scripts/raye2-media-worker.mjs"]'));
 assert.ok(workerPackage.dependencies["@supabase/supabase-js"]);
 assert.ok(workerPackage.dependencies.sharp);
 assert.equal(workerPackage.dependencies.next,undefined);
 assert.ok(dockerignore.includes(".env"));
 assert.ok(dockerignore.includes("node_modules"));
});

test("video worker creates bounded 360p and 720p adaptive HLS renditions with audio when present",()=>{
 assert.ok(worker.includes("MAX_HLS_DURATION_SECONDS = 3600"));
 assert.ok(worker.includes('name: "360p", maxWidth: 640, maxHeight: 360'));
 assert.ok(worker.includes('name: "720p", maxWidth: 1280, maxHeight: 720'));
 assert.ok(worker.includes('"libx264"'));
 assert.ok(worker.includes('"-hls_time", "6"'));
 assert.ok(worker.includes('"hls_playlist_type", "vod"'));
 assert.ok(worker.includes('...(hasAudio ? ["-c:a", "aac"'));
 assert.ok(worker.includes('"-an"'));
 assert.ok(worker.includes("master/master.m3u8"));
 assert.ok(worker.includes("hlsSkippedReason"));
});
test("HLS storage writes are owner-bound, quota-reserved, path-validated and rolled back on partial failure",()=>{
 assert.ok(worker.includes("async function storeHlsObject"));
 assert.ok(worker.includes("MAX_HLS_OBJECT_BYTES = 25 * 1024 * 1024"));
 assert.ok(worker.includes("reserve_raye2_worker_thumbnail_capacity"));
 assert.ok(worker.includes('purpose: "raye2-hls"'));
 assert.ok(worker.includes("const uploaded = []"));
 assert.ok(worker.includes("partial HLS output cleanup failed"));
 assert.ok(worker.includes("async function removeWorkerHls"));
 assert.ok(worker.includes("generated HLS package needs orphan cleanup"));
 assert.ok(worker.includes("const hlsMasterPath = result?.metadata?.processing?.hls?.masterPath"));
});

test("visibility-only HLS master path updates preserve trusted ready processing state",async()=>{
 const migration=await readFile(new URL("../supabase/migrations/20261109460000_raye2_preserve_ready_hls_on_visibility_move.sql",import.meta.url),"utf8");
 assert.ok(migration.includes("old.processing_status='ready'"));
 assert.ok(migration.includes("new.is_published is distinct from old.is_published"));
 assert.ok(migration.includes("(new.metadata #- '{processing,hls,masterPath}') is not distinct from"));
 assert.ok(migration.includes("(old.metadata #- '{processing,hls,masterPath}')"));
});

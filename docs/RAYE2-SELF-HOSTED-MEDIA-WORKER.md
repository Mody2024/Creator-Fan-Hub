# Raye2 self-hosted media worker

## Purpose

Raye2 uses a self-hosted Node worker instead of a paid transcoding API or paid queue. The worker claims uploaded media jobs from Supabase, validates and inspects the source, generates thumbnails, and packages supported video into adaptive HLS renditions.

The worker is **not hosted by Vercel**. Run it on an always-on computer/server you control. It can run on a free local machine, but jobs pause whenever that machine is offline. Do not put the Supabase service-role key in browser code, a public repository, or a Vercel client environment variable.

## Requirements

- Node.js 22 (same major version as the application).
- The isolated worker runtime dependencies declared in `worker.package.json`.
- `ffprobe` for video/audio metadata extraction.
- `ffmpeg` for video thumbnail extraction and HLS packaging.
- A reachable Supabase project with the complete worker, media-lifecycle, storage-reservation and HLS-pointer migrations applied.
- A server-only `service_role` key.

## Environment

Set these variables in the private shell/service environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret, never commit it.
- `RAYE2_WORKER_POLL_MS` — optional polling interval; defaults to 10000 ms.

## Run

```sh
npm install --no-save --no-package-lock @supabase/supabase-js@2.57.4 sharp@0.35.5
npm run media:worker
```

### Container build

The repository includes a dedicated worker image, separate from the Next.js app dependency tree:

```sh
docker build -f Dockerfile.raye2-media-worker -t raye2-media-worker .
docker run --restart unless-stopped --env-file .env.raye2-worker raye2-media-worker
```

Create `.env.raye2-worker` on the private host only; include the Supabase URL and server-only service-role key. Never commit this file or pass the secret as a public build argument. The image runs as the unprivileged `node` user and includes FFmpeg/FFprobe.

The Dockerfile runs `scripts/raye2-hls-smoke-check.mjs` during image construction. The latest GitHub Actions run successfully built this image with `push: false`; this proves the container build and standalone FFmpeg HLS smoke test passed. It does **not** mean the image was published, deployed, connected to Supabase, or processed a real creator upload.

Run under a process supervisor on a machine you control if you need continuous processing. Stop it with the normal process signal. The worker polls when the queue is empty and backs off after errors.

## Job safety

- Database claims use row locks with `SKIP LOCKED`, a random lease token, and a 20-minute lease.
- Expired leases can be reclaimed. Failures are recorded; jobs are retried after a delay up to five attempts.
- Only the service role can claim or complete jobs.
- Completion requires the matching lease token, preventing a stale worker from overwriting a newer result.
- Source media is restricted to the owner's managed media folders and the existing 50 MiB per-file cap.
- The worker calculates a SHA-256 fingerprint from the exact downloaded source bytes; the trusted completion RPC stores it in `media_items.checksum_sha256` only when the matching processing lease completes successfully.
- Thumbnail and HLS writes require owner-bound storage reservations under the project's conservative 750 MiB total storage ceiling.
- Thumbnail and HLS paths are versioned by lease token; previous objects are removed only after the new job result commits.
- Orphaned generated objects are not silently deleted by the worker.

## Current processing scope and limits

- Images/sprites: inspect dimensions and format; generate WebP thumbnails using `sharp`.
- Video: inspect streams, duration and codecs with `ffprobe`; attempt a WebP poster with `ffmpeg`.
- Video processing includes an HLS packaging path with 360p and 720p renditions, subject to the worker's 60-minute duration cap and per-object storage limits.
- HLS playlists and segments are uploaded to the creator's managed private/public bucket, and the master playlist pointer is validated against the media owner, media ID and publication visibility by the corresponding database trigger.
- Video validation ignores attached cover-art streams, and poster extraction explicitly maps a real video track so cover images cannot be mistaken for playable footage.
- Audio: inspect duration, streams and codec metadata with `ffprobe`.
- The HLS smoke test creates a test video, packages both renditions, checks playlist completion, verifies segments and probes video/audio dimensions. It is a media-tool smoke test, not an end-to-end Supabase queue/storage test.
- Live ingest, live streaming transport and always-on hosting are separate provider/deployment tasks; this worker does not implement them.
- A free local worker means zero service fees, not zero electricity, bandwidth, or hardware cost. If no always-on machine is available, processing pauses until the worker is started again.

## Required migrations and deployment order

The worker depends on the media-processing lifecycle, lease-based queue, storage-reservation binding, processing-gated publication, lease heartbeat, HLS pointer validation and creator retry migrations. In the current development repository these include:

- `20261107200000_raye2_media_processing_lifecycle.sql`
- `20261107210000_raye2_self_hosted_media_worker_queue.sql`
- `20261107211000_raye2_worker_storage_reservation_binding.sql`
- `20261107220000_raye2_processing_gated_media_publication.sql`
- `20261107230000_raye2_gate_watch_catalog_on_processing.sql`
- `20261107270000_raye2_media_processing_lease_heartbeat.sql`
- `20261107280000_raye2_creator_media_processing_retry.sql`
- `20261109470000_raye2_validate_managed_hls_pointer.sql`

1. Replay the full migration chain against an isolated local Supabase instance first.
2. Verify the storage reservation trigger permits worker writes only with a matching owner/bucket/byte reservation.
3. Apply the reviewed migrations to the development Supabase project and verify every expected column, function, trigger and policy.
4. Set the service-role key only in the worker's private environment.
5. Run a small image, audio and video test asset and verify status, metadata, thumbnail, HLS master/segments, quota accounting, lease recovery and failure handling.
6. Only then enable the worker for the development preview. Do not run it against production during development.

**Current live-project warning (2026-11-15):** the connected development Supabase project has not applied the worker queue migrations listed above. The queue RPCs and lease/thumbnail columns are absent. Do not start this worker against that project until the migration chain has been reviewed and applied.

## Completion and lease-loss cleanup

- The worker validates the exact owner/media thumbnail and HLS paths before cleanup.
- If a worker stores output but its completion RPC fails or the processing lease expires, it removes only the output created for that job attempt. This prevents uncommitted generated objects from accumulating in free storage.
- Previous thumbnails and HLS objects are removed only after the database confirms that the replacement result was committed.
- Cleanup failures are logged for manual orphan review; the worker never deletes arbitrary creator media paths.

## Processing lease renewal

- Each claimed job starts a five-minute heartbeat while processing. The trusted worker extends the matching active lease by another 20 minutes.
- Renewal requires the service role, matching media ID and lease token, and a lease that has not already expired. Renewals are serialized; the next timer is scheduled only after the previous request finishes.
- If renewal is rejected or cannot be confirmed, the worker fails closed and refuses to publish output under uncertain ownership. Shutdown/normal completion cancels the timer and waits for any in-flight renewal.

## Creator recovery controls

- The Creator Media Library shows counts for waiting, processing, ready and failed assets, and can filter by processing state.
- Owners, admins and assigned creators can request a retry for their own failed private assets. The request is audited, limited to two manual retries per asset, and only requeues the item; it never marks a file ready.
- The trusted worker remains the only component allowed to process media and complete a processing lease.

## Container image and dependency isolation

- `Dockerfile.raye2-media-worker` packages the queue consumer independently from Next.js.
- `worker.package.json` pins the Supabase server client and Sharp runtime; FFmpeg/FFprobe are installed from the Debian package repository in the image.
- `.dockerignore` excludes local environment files, Git metadata, Next.js output and local dependencies from the build context.
- The container runs as the unprivileged Node user and uses a process-liveness health check. A healthy process is not proof that Supabase connectivity or queue processing is healthy.
- The current CI image build includes the HLS smoke test and passed on 2026-11-15. The image was not pushed to a registry or deployed as a long-running worker.

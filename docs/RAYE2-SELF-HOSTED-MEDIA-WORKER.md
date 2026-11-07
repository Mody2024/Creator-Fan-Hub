# Raye2 self-hosted media worker

## Purpose

Raye2 uses a self-hosted Node worker instead of a paid transcoding API or paid queue. The worker claims uploaded media jobs from Supabase, validates and inspects the source, generates image/video thumbnails when the required local tools are present, and records the result.

The worker is **not hosted by Vercel**. Run it on an always-on computer/server you control. It can run on a free local machine, but jobs pause whenever that machine is offline. Do not put the Supabase service-role key in browser code, a public repository, or a Vercel client environment variable.

## Requirements

- Node.js 22 (same major version as the application).
- Project dependencies installed with the repository lockfile.
- `ffprobe` for video/audio metadata extraction.
- `ffmpeg` for video thumbnail extraction. If it is unavailable or cannot decode a source, the worker records a thumbnail skip reason where possible; it does not claim a transcode occurred.
- A reachable Supabase project with the Raye2 migrations applied.
- A server-only `service_role` key.

## Environment

Set these variables in the private shell/service environment:

- `NEXT_PUBLIC_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY` — server-only secret, never commit it.
- `RAYE2_WORKER_POLL_MS` — optional polling interval; defaults to 10000 ms.

## Run

```sh
npm install
npm run media:worker
```

Run under a process supervisor on a machine you control if you need continuous processing. Stop it with the normal process signal. The worker polls when the queue is empty and backs off after errors.

## Job safety

- Database claims use row locks with `SKIP LOCKED`, a random lease token, and a 20-minute lease.
- Expired leases can be reclaimed. Failures are recorded; jobs are retried after a delay up to five attempts.
- Only the service role can claim or complete jobs.
- Completion requires the matching lease token, preventing a stale worker from overwriting a newer result.
- Source media is restricted to the owner's managed media folders and the existing 50 MiB per-file cap.
- Thumbnail writes require a separate, owner-bound reservation under the project's conservative 750 MiB total storage ceiling.
- Thumbnail paths are versioned by lease token; the old thumbnail is removed only after the new job result commits.
- Orphaned generated objects are not silently deleted by the worker.

## Current processing scope and limits

- Images/sprites: inspect dimensions and format; generate WebP thumbnails using the existing `sharp` dependency.
- Video: inspect streams, duration and codecs with `ffprobe`; attempt a WebP poster with `ffmpeg`.
- Audio: inspect duration, streams and codec metadata with `ffprobe`.
- **No video transcoding, adaptive HLS/DASH packaging, CDN, live ingest, or always-on hosting is included yet.** This batch makes upload processing real, but does not claim that an MP4 is converted into streaming renditions.
- A free local worker means zero service fees, not zero electricity, bandwidth, or hardware cost. If no always-on machine is available, processing pauses until the worker is started again.

## Deployment order

1. Apply the migrations in chronological order to an isolated local Supabase instance first.
2. Verify the storage reservation trigger permits worker thumbnail writes only with a matching owner/bucket/byte reservation.
3. Set the service-role key only in the worker's private environment.
4. Run a small image, audio, and video test asset and verify status, metadata, thumbnail, quota accounting, and failure recovery.
5. Only then consider enabling the worker for the development preview. Do not run it against production during development.
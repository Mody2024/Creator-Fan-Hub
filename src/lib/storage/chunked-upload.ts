"use client";

import { planPartRetry, planResume, shouldUseMultipart, SINGLE_SHOT_THRESHOLD_BYTES } from "@/lib/storage/multipart-upload.mjs";

export class MultipartUnavailableError extends Error {
  constructor(reason: string) {
    super(reason);
    this.name = "MultipartUnavailableError";
  }
}

type SignedPart = { partNumber: number; length: number; url: string };

type ChunkedUploadOptions = {
  bucketId: string;
  objectKey: string;
  file: File;
  assetClass?: string;
  mediaId?: string | null;
  contentType?: string;
  onProgress?: (percentage: number) => void;
  signal?: AbortSignal;
};

const ROUTE = "/api/raye2/storage/multipart";
const HASH_LIMIT_BYTES = 512 * 1024 * 1024;

async function callRoute<T>(payload: Record<string, unknown>, signal?: AbortSignal): Promise<T> {
  const response = await fetch(ROUTE, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal,
  });
  const data = await response.json().catch(() => null) as { error?: string; code?: string } | null;
  if (!response.ok) {
    // Server explicitly reports it cannot serve the pooled path — let the caller fall back.
    if (response.status === 503 || data?.code === "no_capacity" || data?.code === "unconfigured" || data?.code === "unavailable") {
      throw new MultipartUnavailableError(data?.error ?? "Pooled multipart storage is unavailable.");
    }
    throw new Error(data?.error ?? "The chunked upload request failed.");
  }
  return data as T;
}

async function sha256Of(file: File): Promise<string | null> {
  if (file.size > HASH_LIMIT_BYTES || typeof crypto === "undefined" || !crypto.subtle) return null;
  try {
    const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
    return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

async function putPart(url: string, blob: Blob, signal?: AbortSignal): Promise<string> {
  let attempt = 1;
  for (;;) {
    try {
      const response = await fetch(url, { method: "PUT", body: blob, signal });
      if (!response.ok) throw new Error(`Part upload failed with status ${response.status}.`);
      const etag = response.headers.get("etag") ?? response.headers.get("ETag");
      if (!etag) throw new Error("The storage provider did not return a part ETag.");
      return etag.replace(/"/g, "");
    } catch (error) {
      if (signal?.aborted) throw error;
      const retry = planPartRetry(attempt);
      if (!retry.retry) throw error;
      attempt += 1;
      await new Promise(resolve => setTimeout(resolve, retry.delayMs));
    }
  }
}

/** True when a file is large enough to prefer the pooled multipart path. */
export function prefersChunkedUpload(file: File): boolean {
  return shouldUseMultipart(file.size, { threshold: SINGLE_SHOT_THRESHOLD_BYTES });
}

/**
 * Upload one file through the pooled multipart route: reserve -> signed parts -> complete -> dedup.
 * Throws MultipartUnavailableError when the pooled path cannot serve the request so the caller can
 * fall back to the Supabase TUS path. Real upload failures throw a normal Error.
 */
export async function uploadChunkedToPool({ bucketId, objectKey, file, assetClass = "video", mediaId = null, contentType, onProgress, signal }: ChunkedUploadOptions): Promise<{ objectId: string; deduplicated: boolean }> {
  const idempotencyKey = `chunked:${crypto.randomUUID()}`;
  const started = await callRoute<{ uploadId: string; partSize: number; partCount: number; parts: SignedPart[] }>({
    action: "begin",
    bucketId,
    objectKey,
    assetClass,
    contentType: contentType ?? file.type,
    totalBytes: file.size,
    idempotencyKey,
  }, signal);

  const plan = { parts: Array.from({ length: started.partCount }, (_, index) => ({ partNumber: index + 1, offset: index * started.partSize, length: Math.min(started.partSize, file.size - index * started.partSize) })), partCount: started.partCount, partSize: started.partSize };
  const signedByNumber = new Map(started.parts.map(part => [part.partNumber, part.url]));
  const uploaded: Array<{ partNumber: number; etag: string }> = [];

  const report = () => onProgress?.(planResume(plan, uploaded).progressPercent);

  for (const part of plan.parts) {
    let url = signedByNumber.get(part.partNumber);
    if (!url) {
      const signed = await callRoute<{ parts: SignedPart[] }>({ action: "sign", uploadId: started.uploadId, partNumbers: [part.partNumber] }, signal);
      url = signed.parts[0]?.url;
      if (!url) throw new Error("The storage provider did not sign the requested part.");
    }
    const etag = await putPart(url, file.slice(part.offset, part.offset + part.length), signal);
    await callRoute({ action: "part", uploadId: started.uploadId, partNumber: part.partNumber, etag, bytes: part.length }, signal);
    uploaded.push({ partNumber: part.partNumber, etag });
    report();
  }

  const sha256 = await sha256Of(file);
  const done = await callRoute<{ objectId: string }>({ action: "complete", uploadId: started.uploadId, sha256, contentType: contentType ?? file.type, mediaId }, signal);
  onProgress?.(100);
  return { objectId: done.objectId, deduplicated: false };
}

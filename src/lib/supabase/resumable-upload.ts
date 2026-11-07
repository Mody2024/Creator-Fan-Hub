"use client";

import { Upload } from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";

type ResumableUploadOptions = {
  client: SupabaseClient;
  bucketName: string;
  objectName: string;
  file: File;
  onProgress?: (percentage: number) => void;
  signal?: AbortSignal;
};

const ALLOWED_BUCKETS = new Set(["creator-media-private", "creator-media-public", "nhen-community-shorts"]);
const MIME_EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "audio/ogg": "ogg",
};

/**
 * Uploads to Supabase Storage with resumable TUS chunks.
 * The bearer token is refreshed before each request so long uploads survive
 * ordinary access-token expiry. Aborting pauses the local transfer without
 * terminating the server resource, allowing the same file to resume later.
 */
export async function uploadToSupabaseStorage({
  client,
  bucketName,
  objectName,
  file,
  onProgress,
  signal,
}: ResumableUploadOptions): Promise<void> {
  if (!ALLOWED_BUCKETS.has(bucketName)) throw new Error("Unsupported media storage bucket.");
  if (!/^[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(objectName)) {
    throw new Error("Invalid media object path.");
  }
  if (!MIME_EXTENSIONS[file.type]) throw new Error("This file type is not supported for resumable upload.");
  if (signal?.aborted) throw new DOMException("Upload paused.", "AbortError");

  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!configuredUrl || !publishableKey) throw new Error("Supabase Storage is not configured.");

  const configuredHost = new URL(configuredUrl).hostname;
  const projectRef = configuredHost.split(".")[0];
  const endpoint = configuredHost.endsWith(".supabase.co")
    ? `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
    : `${configuredUrl.endsWith("/") ? configuredUrl.slice(0, -1) : configuredUrl}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    let upload: Upload | null = null;
    const cleanup = () => signal?.removeEventListener("abort", pauseUpload);
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (error) reject(error);
      else {
        onProgress?.(100);
        resolve();
      }
    };
    const pauseUpload = () => {
      if (!upload) {
        finish(new DOMException("Upload paused. Select the same file to resume.", "AbortError"));
        return;
      }
      void upload.abort(false).finally(() => {
        finish(new DOMException("Upload paused. Select the same file to resume.", "AbortError"));
      });
    };

    upload = new Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: { apikey: publishableKey, "x-upsert": "false" },
      onBeforeRequest: async request => {
        const { data, error } = await client.auth.getSession();
        if (error) throw error;
        let session = data.session;
        if (!session?.access_token || (session.expires_at && session.expires_at * 1000 < Date.now() + 60_000)) {
          const refreshed = await client.auth.refreshSession();
          if (refreshed.error || !refreshed.data.session?.access_token) {
            throw refreshed.error ?? new Error("Your session expired. Sign in again to continue uploading.");
          }
          session = refreshed.data.session;
        }
        request.setHeader("authorization", `Bearer ${session.access_token}`);
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName,
        objectName,
        contentType: file.type,
        cacheControl: "3600",
        metadata: JSON.stringify({ originalName: file.name, size: file.size, mimeType: file.type }),
      },
      fingerprint: (sourceFile, options) => Promise.resolve([
        options.endpoint, bucketName, objectName, sourceFile.name,
        sourceFile.size, sourceFile.lastModified, sourceFile.type,
      ].join("::")),
      onProgress: (uploadedBytes, totalBytes) => {
        if (totalBytes > 0) onProgress?.(Math.min(100, Math.round(uploadedBytes / totalBytes * 100)));
      },
      onError: error => finish(error),
      onSuccess: () => finish(),
    });

    signal?.addEventListener("abort", pauseUpload, { once: true });
    void upload.findPreviousUploads().then(previousUploads => {
      if (settled) return;
      const matchingUpload = previousUploads
        .filter(previous => previous.metadata?.bucketName === bucketName && previous.metadata?.objectName === objectName)
        .sort((a, b) => Date.parse(b.creationTime) - Date.parse(a.creationTime))[0];
      if (matchingUpload) upload?.resumeFromPreviousUpload(matchingUpload);
      upload?.start();
    }).catch(error => finish(error instanceof Error ? error : new Error("Could not resume the previous upload.")));
  });
}

export type ResumableUploadSession = {
  objectName: string;
  getReservationId: () => string | null;
  saveReservation: (id: string) => void;
  clear: () => void;
};

/** Reuses the same object path after a reload so TUS can resume the same file. */
export function getResumableUploadSession(
  userId: string,
  bucketName: string,
  file: File,
): ResumableUploadSession {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(userId) || !ALLOWED_BUCKETS.has(bucketName)) {
    throw new Error("Invalid upload owner or storage bucket.");
  }
  const extension = MIME_EXTENSIONS[file.type];
  if (!extension) throw new Error("This file type is not supported for resumable upload.");
  const identity = [userId, bucketName, file.name, file.size, file.lastModified, file.type].join("|");
  const key = "nhen-tus-session:" + encodeURIComponent(identity);
  const createObjectName = () => {
    const originalBase = file.name.replace(/\.[^.]*$/, "");
    const safeBase = originalBase.normalize("NFKD").replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(-80) || "asset";
    return userId + "/" + crypto.randomUUID() + "-" + safeBase + "." + extension;
  };
  let saved: { objectName?: string; reservationId?: string } = {};
  try {
    const raw = localStorage.getItem(key);
    if (raw) saved = JSON.parse(raw) as typeof saved;
  } catch {
    saved = {};
  }
  const savedLeaf = typeof saved.objectName === "string" && saved.objectName.startsWith(userId + "/")
    ? saved.objectName.slice(userId.length + 1)
    : "";
  const validSavedObjectName = /^[A-Za-z0-9_-]+\.[A-Za-z0-9]+$/.test(savedLeaf) && savedLeaf.endsWith("." + extension);
  const objectName = validSavedObjectName ? saved.objectName as string : createObjectName();
  const persist = (reservationId?: string) => {
    try {
      localStorage.setItem(key, JSON.stringify({ objectName, ...(reservationId ? { reservationId } : {}) }));
    } catch {
      // Upload still works without persistent resume metadata in restricted browsers.
    }
  };
  persist(saved.reservationId);
  return {
    objectName,
    getReservationId: () => typeof saved.reservationId === "string" ? saved.reservationId : null,
    saveReservation: id => {
      saved = { objectName, reservationId: id };
      persist(id);
    },
    clear: () => {
      try { localStorage.removeItem(key); } catch { /* storage may be unavailable */ }
    },
  };
}

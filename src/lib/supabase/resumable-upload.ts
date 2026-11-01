"use client";

import { Upload } from "tus-js-client";
import type { SupabaseClient } from "@supabase/supabase-js";

type ResumableUploadOptions = {
  client: SupabaseClient;
  bucketName: string;
  objectName: string;
  file: File;
  onProgress?: (percentage: number) => void;
};

/**
 * Uploads a file to Supabase Storage using TUS.
 * Upload URLs are fingerprinted by bucket + object path so a retry cannot
 * accidentally resume a different asset that happens to share a filename.
 */
export async function uploadToSupabaseStorage({
  client,
  bucketName,
  objectName,
  file,
  onProgress,
}: ResumableUploadOptions): Promise<void> {
  const { data: { session }, error: sessionError } = await client.auth.getSession();
  if (sessionError || !session?.access_token) {
    throw sessionError ?? new Error("Your session expired. Sign in again before uploading.");
  }

  const configuredUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configuredUrl) throw new Error("Supabase Storage is not configured.");

  const configuredHost = new URL(configuredUrl).hostname;
  const projectRef = configuredHost.split(".")[0];
  const endpoint = configuredHost.endsWith(".supabase.co")
    ? `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`
    : `${configuredUrl.replace(/\\/$/, "")}/storage/v1/upload/resumable`;

  await new Promise<void>((resolve, reject) => {
    let settled = false;
    const upload = new Upload(file, {
      endpoint,
      retryDelays: [0, 3000, 5000, 10000, 20000],
      headers: {
        authorization: `Bearer ${session.access_token}`,
        apikey: client.supabaseKey,
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: 6 * 1024 * 1024,
      metadata: {
        bucketName,
        objectName,
        contentType: file.type || "application/octet-stream",
        cacheControl: "3600",
        metadata: JSON.stringify({ originalName: file.name, size: file.size }),
      },
      fingerprint: (sourceFile, options) => Promise.resolve([
        options.endpoint,
        bucketName,
        objectName,
        sourceFile.name,
        sourceFile.size,
        sourceFile.lastModified,
      ].join("::")),
      onProgress: (uploaded, total) => {
        if (total > 0) onProgress?.(Math.min(100, Math.round(uploaded / total * 100)));
      },
      onError: error => {
        if (settled) return;
        settled = true;
        reject(error);
      },
      onSuccess: () => {
        if (settled) return;
        settled = true;
        onProgress?.(100);
        resolve();
      },
    });

    void upload.findPreviousUploads().then(previousUploads => {
      const matchingUpload = previousUploads
        .filter(previous => previous.metadata?.bucketName === bucketName && previous.metadata?.objectName === objectName)
        .sort((a, b) => Date.parse(b.creationTime) - Date.parse(a.creationTime))[0];
      if (matchingUpload) upload.resumeFromPreviousUpload(matchingUpload);
      upload.start();
    }).catch(error => {
      if (settled) return;
      settled = true;
      reject(error);
    });
  });
}

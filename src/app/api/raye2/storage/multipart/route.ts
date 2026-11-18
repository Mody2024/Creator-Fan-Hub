import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createStorageProviderForId } from "@/lib/storage/s3-compatible-provider.mjs";
import { selectStorageProvider, StorageCapacityError } from "@/lib/storage/provider-policy.mjs";
import { buildCompletionManifest, planUploadParts } from "@/lib/storage/multipart-upload.mjs";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ASSET_CLASSES = new Set(["video", "mini", "moment", "stream_replay", "thumbnail", "chat_attachment", "voice_recording", "memory", "other"]);
const PUBLIC_BUCKETS = new Set(["creator-media-public", "raye2-community-shorts", "raye2-minis", "raye2-clips"]);
const PRIVATE_BUCKETS = new Set(["creator-media-private"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const OBJECT_KEY = /^[A-Za-z0-9_-]+\/[A-Za-z0-9_./-]{1,1000}$/;
const FIRST_BATCH_PARTS = 20;

type ServiceClient = NonNullable<ReturnType<typeof createSupabaseServiceClient>>;
type PoolProvider = {
  provider: string;
  providerKind: string;
  enabled: boolean;
  health: string;
  capacityVerified: boolean;
  capacityBytes: number;
  usedBytes: number;
  reservedBytes: number;
  safetyReserveBytes: number;
  maxBytes: number | null;
  bucketByVisibility: { public: string | null; private: string | null };
};
type Adapter = {
  capabilities: { multipartUploads: boolean };
  createMultipartUpload: (input: Record<string, unknown>) => Promise<{ uploadId: string }>;
  signUploadPart: (input: { bucket: string; key: string; uploadId: string; partNumber: number; expiresInSeconds: number }) => Promise<string>;
  completeMultipartUpload: (input: { bucket: string; key: string; uploadId: string; parts: Array<{ partNumber: number; etag: string }> }) => Promise<unknown>;
  abortMultipartUpload: (input: { bucket: string; key: string; uploadId: string }) => Promise<void>;
  headObject?: (input: { bucket: string; key: string }) => Promise<{ sizeBytes: number; contentType?: string | null; etag?: string | null } | null>;
};

function adapterFor(providerId: string): Adapter | null {
  const adapter = createStorageProviderForId(providerId);
  if (!adapter) return null;
  return adapter as unknown as Adapter;
}

function visibilityFor(bucketId: string): "public" | "private" | null {
  if (PUBLIC_BUCKETS.has(bucketId)) return "public";
  if (PRIVATE_BUCKETS.has(bucketId)) return "private";
  return null;
}

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

async function loadPool(service: ServiceClient): Promise<PoolProvider[]> {
  const { data, error } = await service
    .from("raye2_storage_providers")
    .select("provider_id,provider_kind,enabled,health,capacity_bytes,used_bytes,reserved_bytes,safety_reserve_bytes,max_managed_bytes,capacity_verified_at,public_bucket,private_bucket");
  if (error || !Array.isArray(data)) return [];
  const freshAfter = Date.now() - 15 * 60 * 1000;
  return data.map(row => ({
    provider: row.provider_id,
    providerKind: row.provider_kind ?? row.provider_id,
    enabled: row.enabled === true,
    health: String(row.health ?? "unknown"),
    capacityVerified: typeof row.capacity_verified_at === "string" && Date.parse(row.capacity_verified_at) >= freshAfter,
    capacityBytes: Number(row.capacity_bytes ?? 0),
    usedBytes: Number(row.used_bytes ?? 0),
    reservedBytes: Number(row.reserved_bytes ?? 0),
    safetyReserveBytes: Number(row.safety_reserve_bytes ?? 0),
    maxBytes: row.max_managed_bytes == null ? null : Number(row.max_managed_bytes),
    bucketByVisibility: { public: row.public_bucket ?? null, private: row.private_bucket ?? null },
  }));
}

async function signPartBatch(adapter: Adapter, bucketId: string, objectKey: string, uploadRef: string, parts: Array<{ partNumber: number; length: number }>) {
  const signed = [];
  for (const part of parts) {
    const url = await adapter.signUploadPart({ bucket: bucketId, key: objectKey, uploadId: uploadRef, partNumber: part.partNumber, expiresInSeconds: 3600 });
    signed.push({ partNumber: part.partNumber, length: part.length, url });
  }
  return signed;
}

async function loadUpload(service: ServiceClient, ownerId: string, uploadId: unknown) {
  if (typeof uploadId !== "string" || !UUID.test(uploadId)) return null;
  const { data, error } = await service
    .from("raye2_multipart_uploads")
    .select("upload_id,owner_id,reservation_id,provider_id,bucket_id,object_key,upload_ref,total_bytes,part_size_bytes,part_count,uploaded_parts,upload_state,expires_at")
    .eq("upload_id", uploadId)
    .maybeSingle();
  if (error || !data || data.owner_id !== ownerId) return null;
  return data;
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("unconfigured", "Storage service is not configured.", 503);
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const ownerId = claims?.claims?.sub;
  if (claimsError || typeof ownerId !== "string") return fail("unauthenticated", "Sign in required.", 401);

  const service = createSupabaseServiceClient();
  if (!service) return fail("unconfigured", "Storage service is not configured.", 503);

  const parsed = await readBoundedJson(request, 64 * 1024);
  if (!parsed.ok) return fail("bad_request", parsed.error, parsed.status);
  const body = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("bad_request", "Invalid request.", 400);
  const payload = body as Record<string, unknown>;

  switch (payload.action) {
    case "begin": return beginUpload(service, ownerId, payload);
    case "sign": return signParts(service, ownerId, payload);
    case "part": return recordPart(service, ownerId, payload);
    case "complete": return completeUpload(service, ownerId, payload);
    case "abort": return abortUpload(service, ownerId, payload);
    default: return fail("bad_request", "Unsupported multipart action.", 400);
  }
}

async function beginUpload(service: ServiceClient, ownerId: string, payload: Record<string, unknown>) {
  const { assetClass, bucketId, objectKey, contentType, totalBytes, idempotencyKey } = payload;
  if (typeof assetClass !== "string" || !ASSET_CLASSES.has(assetClass)) return fail("bad_request", "Unsupported asset class.", 400);
  if (typeof bucketId !== "string") return fail("bad_request", "Unsupported storage bucket.", 400);
  const visibility = visibilityFor(bucketId);
  if (visibility === null) return fail("bad_request", "Unsupported storage bucket.", 400);
  if (typeof objectKey !== "string" || !OBJECT_KEY.test(objectKey) || objectKey.includes("..")) return fail("bad_request", "Invalid object path.", 400);
  const key = objectKey;
  if (typeof contentType !== "string" || contentType.length < 3 || contentType.length > 128) return fail("bad_request", "Invalid content type.", 400);
  if (!Number.isSafeInteger(totalBytes) || (totalBytes as number) < 1 || (totalBytes as number) > 107374182400) return fail("bad_request", "Invalid upload size.", 400);
  if (typeof idempotencyKey !== "string" || idempotencyKey.length < 8 || idempotencyKey.length > 200) return fail("bad_request", "Invalid upload request key.", 400);
  if (!key.startsWith(ownerId + "/")) return fail("forbidden", "Upload path is outside your folder.", 403);

  const { data: allowanceData, error: allowanceError } = await service.rpc("raye2_storage_allowance_for", { p_user_id: ownerId });
  if (allowanceError) return fail("unavailable", "Could not load your storage allowance.", 503);
  const allowance = Array.isArray(allowanceData) ? allowanceData[0] : allowanceData;
  if (!allowance) return fail("forbidden", "No storage allowance is configured for this account.", 403);
  const maxFileBytes = Number(allowance.max_file_bytes ?? 0);
  if ((totalBytes as number) > maxFileBytes) {
    return fail("file_too_large", `This file exceeds your ${Math.floor(maxFileBytes / (1024 * 1024))} MB per-file limit.`, 422);
  }

  const pool = await loadPool(service);
  let selection;
  try {
    selection = selectStorageProvider({ assetClass, visibility, expectedBytes: totalBytes as number, providers: pool });
  } catch (error) {
    if (error instanceof StorageCapacityError) return fail("no_capacity", "No verified pooled storage is available yet.", 503);
    return fail("bad_request", "Could not route this upload.", 400);
  }

  const adapter = adapterFor(selection.provider);
  if (!adapter || !adapter.capabilities.multipartUploads) return fail("unavailable", "The selected storage provider is not configured on this server.", 503);

  const plan = planUploadParts(totalBytes as number);
  const { data: reservationRows, error: reserveError } = await service.rpc("raye2_reserve_storage", {
    p_owner_id: ownerId,
    p_provider_id: selection.provider,
    p_asset_class: assetClass,
    p_role_key: String(allowance.role_key ?? "user"),
    p_expected_bytes: totalBytes,
    p_idempotency_key: idempotencyKey,
    p_expires_in_seconds: 86400,
  });
  if (reserveError) {
    const status = reserveError.code === "53100" ? 507 : reserveError.code === "55000" ? 503 : 500;
    return fail("reserve_failed", reserveError.code === "53100" ? "Your storage allowance or the platform pool is full." : "Could not reserve storage.", status);
  }
  const reservation = Array.isArray(reservationRows) ? reservationRows[0] : reservationRows;
  if (!reservation?.reservation_id) return fail("reserve_failed", "Could not reserve storage.", 500);

  const started = await adapter.createMultipartUpload({ bucket: bucketId, key: objectKey, contentType, expectedBytes: totalBytes as number, visibility, expiresInSeconds: 600 });

  const { data: uploadId, error: beginError } = await service.rpc("raye2_begin_multipart_upload", {
    p_owner_id: ownerId,
    p_reservation_id: reservation.reservation_id,
    p_provider_id: selection.provider,
    p_bucket_id: bucketId,
    p_object_key: objectKey,
    p_upload_ref: started.uploadId,
    p_total_bytes: totalBytes,
    p_part_size_bytes: plan.partSize,
    p_part_count: plan.partCount,
  });
  if (beginError || typeof uploadId !== "string") {
    await adapter.abortMultipartUpload({ bucket: bucketId, key: objectKey, uploadId: started.uploadId }).catch(() => {});
    return fail("reserve_failed", "Could not start the multipart upload.", 500);
  }

  const parts = await signPartBatch(adapter, bucketId, objectKey, started.uploadId, plan.parts.slice(0, FIRST_BATCH_PARTS));
  return NextResponse.json({ uploadId, reservationId: reservation.reservation_id, providerId: selection.provider, bucketId, objectKey, partSize: plan.partSize, partCount: plan.partCount, parts });
}

async function signParts(service: ServiceClient, ownerId: string, payload: Record<string, unknown>) {
  const upload = await loadUpload(service, ownerId, payload.uploadId);
  if (!upload) return fail("not_found", "Multipart upload not found.", 404);
  if (upload.upload_state !== "active") return fail("conflict", "This upload is no longer active.", 409);
  const adapter = adapterFor(upload.provider_id);
  if (!adapter) return fail("unavailable", "The storage provider is not configured on this server.", 503);
  const requested = (Array.isArray(payload.partNumbers) ? payload.partNumbers : [])
    .filter((value): value is number => Number.isInteger(value) && value >= 1 && value <= upload.part_count)
    .slice(0, FIRST_BATCH_PARTS);
  if (!requested.length) return fail("bad_request", "No valid part numbers were requested.", 400);
  const plan = planUploadParts(upload.total_bytes);
  const parts = plan.parts.filter(part => requested.includes(part.partNumber));
  return NextResponse.json({ parts: await signPartBatch(adapter, upload.bucket_id, upload.object_key, upload.upload_ref, parts) });
}

async function recordPart(service: ServiceClient, ownerId: string, payload: Record<string, unknown>) {
  const upload = await loadUpload(service, ownerId, payload.uploadId);
  if (!upload) return fail("not_found", "Multipart upload not found.", 404);
  const { partNumber, bytes } = payload;
  const etag = typeof payload.etag === "string" ? payload.etag.replace(/"/g, "") : "";
  if (!Number.isInteger(partNumber) || !etag || etag.length > 200 || !Number.isSafeInteger(bytes) || (bytes as number) < 1) {
    return fail("bad_request", "Invalid part record.", 400);
  }
  const { data, error } = await service.rpc("raye2_record_upload_part", { p_upload_id: upload.upload_id, p_part_number: partNumber, p_etag: etag, p_bytes: bytes });
  if (error) return fail("part_failed", "Could not record the uploaded part.", error.code === "55000" ? 409 : 500);
  return NextResponse.json({ uploadedParts: data });
}

async function completeUpload(service: ServiceClient, ownerId: string, payload: Record<string, unknown>) {
  const upload = await loadUpload(service, ownerId, payload.uploadId);
  if (!upload) return fail("not_found", "Multipart upload not found.", 404);
  const { data: reservation, error: reservationError } = await service
    .from("raye2_storage_reservations")
    .select("reservation_state,object_id")
    .eq("reservation_id", upload.reservation_id)
    .maybeSingle();
  if (reservationError || !reservation) return fail("reservation_unavailable", "Could not verify the upload reservation.", 503);

  // A previous request may have committed the object successfully but failed
  // before marking the multipart ledger complete. Recover from the durable
  // reservation record instead of completing the provider upload twice.
  if (upload.upload_state === "completed") {
    if (typeof reservation.object_id !== "string") return fail("completion_unverified", "The completed upload has no verified storage object.", 409);
    return NextResponse.json({ objectId: reservation.object_id, alreadyCompleted: true });
  }
  if (upload.upload_state !== "active") return fail("conflict", "This upload is no longer active.", 409);
  if (reservation.reservation_state === "consumed" && typeof reservation.object_id === "string") {
    const { error: finishError } = await service.rpc("raye2_finish_multipart_upload", {
      p_upload_id: upload.upload_id,
      p_object_id: reservation.object_id,
      p_upload_state: "completed",
    });
    if (finishError) return fail("completion_recovery_failed", "The uploaded object is safe, but its upload record could not be finalized. Retry completion.", 503);
    return NextResponse.json({ objectId: reservation.object_id, alreadyCompleted: true, recovered: true });
  }
  if (reservation.reservation_state !== "active") return fail("reservation_finalized", "This upload reservation is no longer active.", 409);

  const recorded = Array.isArray(upload.uploaded_parts) ? upload.uploaded_parts : [];
  let manifest;
  try {
    manifest = buildCompletionManifest(recorded.map(part => ({ partNumber: Number(part.partNumber), etag: String(part.etag) })));
  } catch {
    return fail("incomplete", "Not all parts have been uploaded yet.", 409);
  }
  if (manifest.length !== upload.part_count) return fail("incomplete", "Not all parts have been uploaded yet.", 409);

  const adapter = adapterFor(upload.provider_id);
  if (!adapter) return fail("unavailable", "The storage provider is not configured on this server.", 503);
  // Recover when the provider completed the multipart upload but the
  // database commit failed. Replaying CompleteMultipartUpload is not safe.
  let existingObject: { sizeBytes: number; contentType?: string | null; etag?: string | null } | null = null;
  if (adapter.headObject) {
    try {
      existingObject = await adapter.headObject({ bucket: upload.bucket_id, key: upload.object_key });
    } catch {
      return fail("provider_verification_failed", "Could not verify whether the upload already completed. Retry safely in a moment.", 503);
    }
  }
  if (existingObject) {
    if (existingObject.sizeBytes !== Number(upload.total_bytes)) {
      return fail("provider_object_mismatch", "A stored object exists at this upload path but its size does not match the reservation.", 409);
    }
  } else {
    await adapter.completeMultipartUpload({ bucket: upload.bucket_id, key: upload.object_key, uploadId: upload.upload_ref, parts: manifest });
  }

  const sha256 = typeof payload.sha256 === "string" && /^[a-f0-9]{64}$/.test(payload.sha256) ? payload.sha256 : null;
  const { data: objectId, error: commitError } = await service.rpc("raye2_commit_storage_object", {
    p_reservation_id: upload.reservation_id,
    p_bucket_id: upload.bucket_id,
    p_object_key: upload.object_key,
    p_size_bytes: upload.total_bytes,
    p_mime_type: typeof payload.contentType === "string" ? payload.contentType : "application/octet-stream",
    p_checksum_sha256: sha256,
    p_etag: null,
    p_visibility: visibilityFor(upload.bucket_id) ?? "private",
    p_media_id: typeof payload.mediaId === "string" && UUID.test(payload.mediaId) ? payload.mediaId : null,
  });
  if (commitError || typeof objectId !== "string") return fail("commit_failed", "Upload finished but could not be recorded.", 500);

  if (sha256) {
    await service.rpc("raye2_register_storage_object", { p_object_id: objectId, p_sha256: sha256, p_idempotency_key: "dedup:" + upload.upload_id });
  }
  const { error: finishError } = await service.rpc("raye2_finish_multipart_upload", {
    p_upload_id: upload.upload_id,
    p_object_id: objectId,
    p_upload_state: "completed",
  });
  if (finishError) return fail("completion_finalize_failed", "The object is stored and recorded. Retry completion to safely finalize the upload.", 503);

  return NextResponse.json({ objectId, sha256 });
}

async function abortUpload(service: ServiceClient, ownerId: string, payload: Record<string, unknown>) {
  const upload = await loadUpload(service, ownerId, payload.uploadId);
  if (!upload) return fail("not_found", "Multipart upload not found.", 404);
  if (upload.upload_state === "active") {
    const adapter = adapterFor(upload.provider_id);
    if (adapter) await adapter.abortMultipartUpload({ bucket: upload.bucket_id, key: upload.object_key, uploadId: upload.upload_ref }).catch(() => {});
    try {
      await service.rpc("raye2_release_storage_reservation", { p_reservation_id: upload.reservation_id });
    } catch {
      // The reservation expires on its own if release fails.
    }
    await service.rpc("raye2_finish_multipart_upload", { p_upload_id: upload.upload_id, p_object_id: null, p_upload_state: "aborted" });
  }
  return NextResponse.json({ ok: true });
}

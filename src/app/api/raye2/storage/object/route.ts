import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createStorageProviderForId } from "@/lib/storage/s3-compatible-provider.mjs";
import { planObjectDelivery } from "@/lib/storage/object-delivery.mjs";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const TTL_SECONDS = 600;

type Adapter = {
  capabilities: { publicDelivery: boolean };
  createSignedDownload: (object: { bucket: string; key: string }, expiresInSeconds: number) => Promise<string>;
  deleteObject: (object: { bucket: string; key: string }) => Promise<void>;
  getPublicUrl: (object: { bucket: string; key: string }) => string;
};

function adapterFor(providerId: string): Adapter | null {
  const adapter = createStorageProviderForId(providerId);
  return adapter ? (adapter as unknown as Adapter) : null;
}

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("unconfigured", "Storage service is not configured.", 503);
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const ownerId = claims?.claims?.sub;
  if (claimsError || typeof ownerId !== "string") return fail("unauthenticated", "Sign in required.", 401);

  const service = createSupabaseServiceClient();
  if (!service) return fail("unconfigured", "Storage service is not configured.", 503);

  const parsed = await readBoundedJson(request, 16 * 1024);
  if (!parsed.ok) return fail("bad_request", parsed.error, parsed.status);
  const payload = (parsed.value ?? {}) as Record<string, unknown>;

  switch (payload.action) {
    case "sign": return signDelivery(service, ownerId, payload);
    case "delete": return deleteObject(service, ownerId, payload);
    default: return fail("bad_request", "Unsupported storage action.", 400);
  }
}

async function signDelivery(service: NonNullable<ReturnType<typeof createSupabaseServiceClient>>, ownerId: string, payload: Record<string, unknown>) {
  if (typeof payload.objectId !== "string" || !UUID.test(payload.objectId)) return fail("bad_request", "Invalid object id.", 400);
  const { data, error } = await service
    .from("raye2_storage_objects")
    .select("object_id,owner_id,provider_id,bucket_id,object_key,visibility,object_state")
    .eq("object_id", payload.objectId)
    .maybeSingle();
  if (error || !data) return fail("not_found", "Storage object not found.", 404);
  if (data.owner_id !== ownerId) return fail("forbidden", "This object does not belong to you.", 403);
  if (data.object_state !== "active" && data.object_state !== "verified") return fail("conflict", "This object is not available.", 409);
  if (data.provider_id === "supabase") return fail("unsupported", "This object is delivered by the legacy storage path.", 409);

  const adapter = adapterFor(String(data.provider_id));
  if (!adapter) return fail("unavailable", "The storage provider is not configured on this server.", 503);

  const delivery = planObjectDelivery(
    { providerId: data.provider_id, bucketId: data.bucket_id, visibility: data.visibility },
    { providerHasPublicBase: adapter.capabilities.publicDelivery },
  );
  try {
    if (!delivery.requiresSigning) {
      return NextResponse.json({ url: adapter.getPublicUrl({ bucket: String(data.bucket_id), key: String(data.object_key) }), kind: "public_url", expiresInSeconds: null });
    }
    const url = await adapter.createSignedDownload({ bucket: String(data.bucket_id), key: String(data.object_key) }, TTL_SECONDS);
    return NextResponse.json({ url, kind: "signed_url", expiresInSeconds: TTL_SECONDS });
  } catch {
    return fail("unavailable", "Could not create a playback URL for this object.", 503);
  }
}

async function deleteObject(service: NonNullable<ReturnType<typeof createSupabaseServiceClient>>, ownerId: string, payload: Record<string, unknown>) {
  if (typeof payload.objectId !== "string" || !UUID.test(payload.objectId)) return fail("bad_request", "Invalid object id.", 400);
  const { data: requested, error } = await service.rpc("raye2_request_object_deletion", { p_object_id: payload.objectId });
  if (error) return fail(error.code === "22023" ? "not_found" : "delete_failed", "Could not delete this object.", error.code === "22023" ? 404 : 500);
  const row = Array.isArray(requested) ? requested[0] : requested;
  if (!row) return fail("not_found", "Storage object not found.", 404);
  if (row.already_deleted) return NextResponse.json({ ok: true, alreadyDeleted: true });

  if (row.provider_id === "supabase") {
    const { error: removeError } = await service.storage.from(String(row.bucket_id)).remove([String(row.object_key)]);
    if (removeError) return fail("delete_failed", "Could not remove the stored file.", 500);
  } else {
    const adapter = adapterFor(String(row.provider_id));
    if (adapter) {
      try { await adapter.deleteObject({ bucket: String(row.bucket_id), key: String(row.object_key) }); }
      catch { return fail("delete_failed", "Could not remove the stored file.", 500); }
    }
  }
  await service.rpc("raye2_mark_storage_object_deleted", { p_object_id: payload.objectId, p_idempotency_key: "owner-delete:" + payload.objectId });
  return NextResponse.json({ ok: true });
}

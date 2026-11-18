import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createByosAdapter, interpretProbe } from "@/lib/storage/byos-probe.mjs";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function fail(code: string, message: string, status: number) {
  return NextResponse.json({ error: message, code }, { status });
}

/** Resolve a connection's credentials from a server-held environment variable, by name only. */
function readSecret(secretRef: string): { accessKeyId: string; secretAccessKey: string } | null {
  const accessKeyId = process.env[secretRef + "_ACCESS_KEY_ID"];
  const secretAccessKey = process.env[secretRef + "_SECRET_ACCESS_KEY"];
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey };
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return fail("unconfigured", "Storage service is not configured.", 503);
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const ownerId = claims?.claims?.sub;
  if (claimsError || typeof ownerId !== "string") return fail("unauthenticated", "Sign in required.", 401);

  const service = createSupabaseServiceClient();
  if (!service) return fail("unconfigured", "Storage service is not configured.", 503);

  const parsed = await readBoundedJson(request, 8 * 1024);
  if (!parsed.ok) return fail("bad_request", parsed.error, parsed.status);
  const payload = (parsed.value ?? {}) as Record<string, unknown>;
  if (typeof payload.connectionId !== "string" || !UUID.test(payload.connectionId)) return fail("bad_request", "Invalid connection id.", 400);

  const { data: connection, error } = await service
    .from("raye2_byos_connections")
    .select("connection_id,owner_id,provider_id,endpoint,region,bucket_id,path_style,secret_ref,connection_state")
    .eq("connection_id", payload.connectionId)
    .maybeSingle();
  if (error || !connection) return fail("not_found", "Connection not found.", 404);
  if (connection.owner_id !== ownerId) return fail("forbidden", "This connection does not belong to you.", 403);

  const secret = readSecret(String(connection.secret_ref));
  if (!secret) {
    await service.rpc("raye2_set_byos_connection_state", { p_connection_id: connection.connection_id, p_state: "failed", p_error: "Server credentials for this connection are not configured." });
    return fail("unconfigured", "This connection has no server credentials configured yet.", 503);
  }

  let adapter;
  try {
    adapter = createByosAdapter(
      { providerId: connection.provider_id, endpoint: connection.endpoint, region: connection.region, bucketId: connection.bucket_id, pathStyle: connection.path_style },
      secret,
    );
  } catch {
    return fail("bad_request", "This connection's configuration is invalid.", 400);
  }

  let probe;
  try {
    const listed = await (adapter as unknown as { listObjects: (input: Record<string, unknown>) => Promise<{ objects?: unknown[] }> }).listObjects({ bucket: String(connection.bucket_id), maxKeys: 1 });
    probe = (interpretProbe as unknown as (input: Record<string, unknown>) => { state: string; lastError: string | null; listedKeys: number })({ ok: true, listedKeys: Array.isArray(listed?.objects) ? listed.objects.length : 0 });
  } catch (error) {
    probe = (interpretProbe as unknown as (input: Record<string, unknown>) => { state: string; lastError: string | null; listedKeys: number })({ ok: false, error });
  }

  await service.rpc("raye2_set_byos_connection_state", { p_connection_id: connection.connection_id, p_state: probe.state, p_error: probe.lastError });
  return NextResponse.json({ state: probe.state, listedKeys: probe.listedKeys });
}

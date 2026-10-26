import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

async function authorizedClient() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return { response: NextResponse.json({ error: "Backend is not configured." }, { status: 503 }) };
  const { data, error } = await supabase.auth.getClaims();
  if (error || typeof data?.claims?.sub !== "string") {
    return { response: NextResponse.json({ error: "Sign in required." }, { status: 401 }) };
  }
  return { supabase };
}

export async function GET() {
  const auth = await authorizedClient();
  if ("response" in auth) return auth.response;
  const { data, error } = await auth.supabase.rpc("get_creator_publish_history", { p_limit: 20 });
  if (error) {
    const status = error.code === "42501" ? 403 : 500;
    return NextResponse.json({ error: status === 403 ? "Creator access is not enabled for this account." : "Could not load publishing history." }, { status });
  }
  return NextResponse.json({ versions: data ?? [] });
}

export async function POST(request: NextRequest) {
  const auth = await authorizedClient();
  if ("response" in auth) return auth.response;
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const version = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).version : null;
  if (!Number.isSafeInteger(version) || (version as number) < 1) {
    return NextResponse.json({ error: "A valid published version is required." }, { status: 400 });
  }
  const { data, error } = await auth.supabase.rpc("restore_site_config_version", { p_version: version });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "P0002" ? 404 : error.code === "22023" ? 400 : 500;
    return NextResponse.json({ error: status === 403 ? "Creator access is not enabled for this account." : status === 404 ? "That published version no longer exists." : status === 400 ? "Invalid published version." : "Could not restore this version to the draft." }, { status });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, revision: row?.new_revision, restoredVersion: row?.restored_version, savedAt: row?.saved_at });
}

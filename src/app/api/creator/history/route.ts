import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const dynamic = "force-dynamic";

type PublishHistoryRow = {
  version: number;
  published_at: string;
  published_by: string | null;
  maintenance_mode: boolean;
  site_name: string;
  hero_title: string;
};

function isPublishHistoryRow(value: unknown): value is PublishHistoryRow {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const row = value as Record<string, unknown>;
  return Number.isSafeInteger(row.version) && (row.version as number) > 0
    && typeof row.published_at === "string" && Number.isFinite(Date.parse(row.published_at))
    && (row.published_by === null || typeof row.published_by === "string")
    && typeof row.maintenance_mode === "boolean"
    && typeof row.site_name === "string"
    && typeof row.hero_title === "string";
}

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
  if (!Array.isArray(data) || data.length > 20 || !data.every(isPublishHistoryRow)) {
    return NextResponse.json({ error: "Publishing history data could not be validated. Refresh and try again." }, { status: 500 });
  }
  return NextResponse.json({ versions: data });
}

export async function POST(request: NextRequest) {
  const auth = await authorizedClient();
  if ("response" in auth) return auth.response;
  const parsed = await readBoundedJson(request, 8 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body: unknown = parsed.value;
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
  if (!row || !Number.isSafeInteger(row.new_revision) || (row.new_revision as number) < 1 || !Number.isSafeInteger(row.restored_version) || (row.restored_version as number) < 1 || typeof row.saved_at !== "string" || !Number.isFinite(Date.parse(row.saved_at))) {
    return NextResponse.json({ error: "Restore could not be confirmed. Reload the draft history before continuing." }, { status: 500 });
  }
  return NextResponse.json({ ok: true, revision: row.new_revision, restoredVersion: row.restored_version, savedAt: row.saved_at });
}

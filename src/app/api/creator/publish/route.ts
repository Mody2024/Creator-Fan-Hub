import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 }); }
  const revision = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).revision : null;
  if (!Number.isSafeInteger(revision) || (revision as number) < 1) {
    return NextResponse.json({ error: "A valid draft revision is required." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("publish_site_config", { p_expected_revision: revision });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "40001" ? 409 : 500;
    return NextResponse.json({ error: status === 403 ? "Creator access is not enabled for this account." : status === 409 ? "The draft changed. Reload and try again." : "Publishing failed." }, { status });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, version: row?.published_version, publishedAt: row?.published_at });
}

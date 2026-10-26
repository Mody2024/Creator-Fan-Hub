import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { validateSiteConfig } from "@/lib/site-config.mjs";
import { readBoundedJson } from "@/lib/read-bounded-json";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }
  const { data, error } = await supabase.rpc("get_site_config_draft");
  if (error) return NextResponse.json({ error: error.code === "42501" ? "Creator access is not enabled for this account." : "Could not load draft." }, { status: error.code === "42501" ? 403 : 500 });
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return NextResponse.json({ error: "Draft not found." }, { status: 404 });
  return NextResponse.json({ config: row.draft, revision: row.draft_revision, updatedAt: row.updated_at });
}

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = await readBoundedJson(request, 128 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body: unknown = parsed.value;
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  const payload = body as Record<string, unknown>;
  const revision = payload.revision;
  if (!Number.isSafeInteger(revision) || (revision as number) < 1) return NextResponse.json({ error: "A valid draft revision is required." }, { status: 400 });
  const validation = validateSiteConfig(payload.config);
  if (!validation.ok) return NextResponse.json({ error: "Configuration validation failed.", issues: validation.errors }, { status: 422 });

  const { data, error } = await supabase.rpc("save_site_config_draft", {
    p_config: validation.value,
    p_expected_revision: revision
  });
  if (error) {
    const status = error.code === "42501" ? 403 : error.code === "40001" ? 409 : error.code === "22023" ? 422 : 500;
    return NextResponse.json({ error: status === 403 ? "Creator access is not enabled for this account." : status === 409 ? "This draft changed elsewhere. Reload before saving." : status === 422 ? "The database rejected this configuration." : "Could not save the draft." }, { status });
  }
  const row = Array.isArray(data) ? data[0] : data;
  return NextResponse.json({ ok: true, revision: row?.new_revision, updatedAt: row?.saved_at });
}

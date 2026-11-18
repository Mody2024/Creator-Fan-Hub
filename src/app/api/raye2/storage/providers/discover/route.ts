import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseServiceClient } from "@/lib/supabase/service";
import { createConfiguredStorageProviders } from "@/lib/storage/s3-compatible-provider.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_CAPACITY_BYTES = 8 * 1024 * 1024 * 1024;
const SAFETY_RESERVE_BYTES = 256 * 1024 * 1024;
// Lower priority number is preferred first. R2 leads public video, B2 leads private/attachments;
// other pooled providers sit behind them and still act as failover/overflow capacity.
const DEFAULT_PRIORITY: Record<string, number> = {
  cloudflare_r2: 10,
  backblaze_b2: 20,
  tigris: 30,
  filebase: 40,
  storj: 50,
};

/**
 * Reconcile the provider registry with the providers actually configured in this deployment's
 * environment. Only a platform administrator may trigger it. Rows that already exist keep their
 * usage counters; the sync refreshes identity/config columns only.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Storage service is not configured.", code: "unconfigured" }, { status: 503 });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const actorId = claims?.claims?.sub;
  if (claimsError || typeof actorId !== "string") return NextResponse.json({ error: "Sign in required.", code: "unauthenticated" }, { status: 401 });

  const { data: isAdmin, error: adminError } = await supabase.rpc("raye2_is_platform_admin");
  if (adminError || isAdmin !== true) return NextResponse.json({ error: "Platform administrator required.", code: "forbidden" }, { status: 403 });

  const service = createSupabaseServiceClient();
  if (!service) return NextResponse.json({ error: "Storage service is not configured.", code: "unconfigured" }, { status: 503 });

  const configured = createConfiguredStorageProviders(process.env);
  if (!configured.length) return NextResponse.json({ discovered: 0, providers: [] });

  const payload = configured.map(provider => {
    const kind = provider.providerKind ?? provider.id.replace(/_[a-z0-9]+$/, "");
    return {
      provider_id: provider.id,
      provider_kind: kind,
      enabled: true,
      priority: DEFAULT_PRIORITY[kind] ?? 100,
      health: "unverified",
      capacity_bytes: DEFAULT_CAPACITY_BYTES,
      safety_reserve_bytes: SAFETY_RESERVE_BYTES,
      max_managed_bytes: null,
      public_bucket: provider.publicBucket ?? "",
      private_bucket: provider.privateBucket ?? "",
    };
  });

  const { data: count, error: syncError } = await service.rpc("raye2_sync_storage_providers", { p_providers: payload });
  if (syncError) return NextResponse.json({ error: "Could not reconcile the provider registry.", code: "sync_failed" }, { status: 500 });
  return NextResponse.json({ discovered: Number(count ?? payload.length), providers: payload.map(item => item.provider_id) });
}

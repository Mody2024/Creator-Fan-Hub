
import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createConfiguredStorageProviders } from "@/lib/storage/s3-compatible-provider.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Performs a read-only connectivity/permission check against both configured buckets.
 * Never returns endpoints, access keys, secret keys, object names, or raw provider errors.
 */
export async function POST() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Storage service is not configured." }, { status: 503 });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const actorId = claims?.claims?.sub;
  if (claimsError || typeof actorId !== "string") return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  const { data: isAdmin, error: adminError } = await supabase.rpc("raye2_is_platform_admin");
  if (adminError || isAdmin !== true) return NextResponse.json({ error: "Platform administrator required." }, { status: 403 });

  let providers;
  try {
    providers = createConfiguredStorageProviders(process.env);
  } catch {
    return NextResponse.json({ error: "A storage provider configuration is invalid. Check server environment settings." }, { status: 500 });
  }

  const results = await Promise.all(providers.map(async provider => {
    const checks = await Promise.all([
      ["public", provider.publicBucket],
      ["private", provider.privateBucket],
    ].map(async ([visibility, bucket]) => {
      try {
        // The runtime adapter accepts an explicit bucket; its inferred JS declaration omits it.
        const listObjects = provider.listObjects as unknown as (options: {
          bucket: string; prefix?: string; maxKeys?: number;
        }) => Promise<{ objects: unknown[] }>;
        const result = await listObjects({ bucket, prefix: "", maxKeys: 1 });
        return { visibility, ok: true, canList: true, sampleCount: result.objects.length };
      } catch {
        return { visibility, ok: false, canList: false };
      }
    }));
    return {
      providerId: provider.id,
      providerKind: provider.providerKind ?? "s3-compatible",
      ok: checks.every(check => check.ok),
      checks,
    };
  }));

  return NextResponse.json({
    testedAt: new Date().toISOString(),
    configured: results.length,
    verified: results.filter(result => result.ok).length,
    providers: results,
    note: "Read-only bucket listing test. Upload and playback still require a separate end-to-end test.",
  });
}

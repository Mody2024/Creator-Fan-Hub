import { createClient } from "@supabase/supabase-js";
import { createConfiguredStorageProviders } from "../src/lib/storage/s3-compatible-provider.mjs";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const MAX_PAGES = 500;
const MAX_OBJECTS = 500_000;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the reconcile environment.");
}
if (SERVICE_ROLE_KEY.startsWith("sb_publishable_") || (!SERVICE_ROLE_KEY.startsWith("eyJ") && !SERVICE_ROLE_KEY.startsWith("sb_secret_"))) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY must be the server-only service_role secret.");
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});

async function measureProvider(provider, buckets) {
  let usedBytes = 0;
  let objectCount = 0;
  for (const bucket of buckets.filter(Boolean)) {
    let token = null;
    let pages = 0;
    do {
      const page = await provider.listObjects({ bucket, maxKeys: 1000, continuationToken: token });
      for (const object of page.objects) {
        usedBytes += object.sizeBytes;
        objectCount += 1;
      }
      if (objectCount > MAX_OBJECTS) throw new Error(`Object count exceeded ${MAX_OBJECTS} for ${provider.id}; aborting reconciliation.`);
      token = page.nextContinuationToken;
      pages += 1;
    } while (token && pages < MAX_PAGES);
  }
  return { usedBytes, objectCount };
}

async function main() {
  const providers = createConfiguredStorageProviders(process.env);
  if (!providers.length) {
    console.error("[raye2-reconcile] No R2/B2 providers are configured in this environment; nothing to reconcile.");
    return;
  }

  const { data: rows, error } = await supabase
    .from("raye2_storage_providers")
    .select("provider_id,capacity_bytes,public_bucket,private_bucket");
  if (error) throw error;
  const known = new Map((rows ?? []).map(row => [row.provider_id, row]));

  for (const provider of providers) {
    const row = known.get(provider.id);
    if (!row) {
      console.error(`[raye2-reconcile] Provider ${provider.id} is configured in env but absent from the database; skipping.`);
      continue;
    }
    try {
      const { usedBytes, objectCount } = await measureProvider(provider, [row.public_bucket, row.private_bucket]);
      const capacityBytes = Number(row.capacity_bytes ?? 0);
      const health = capacityBytes > 0 && usedBytes <= capacityBytes ? "healthy" : "degraded";
      const { error: reconcileError } = await supabase.rpc("raye2_reconcile_storage_provider", {
        p_provider_id: provider.id,
        p_used_bytes: usedBytes,
        p_capacity_bytes: capacityBytes,
        p_idempotency_key: `reconcile:${provider.id}:${Math.floor(Date.now() / 60000)}`,
        p_health: health,
      });
      if (reconcileError) throw reconcileError;
      console.log(`[raye2-reconcile] ${provider.id}: used=${usedBytes} capacity=${capacityBytes} objects=${objectCount} health=${health}`);
    } catch (providerError) {
      console.error(`[raye2-reconcile] ${provider.id} failed:`, providerError instanceof Error ? providerError.message : providerError);
      await supabase.rpc("raye2_reconcile_storage_provider", {
        p_provider_id: provider.id,
        p_used_bytes: 0,
        p_capacity_bytes: Number(row.capacity_bytes ?? 0),
        p_idempotency_key: `reconcile:${provider.id}:fail:${Math.floor(Date.now() / 60000)}`,
        p_health: "unavailable",
      }).then(() => {}, () => {});
    }
  }

  const { data: ceiling, error: ceilingError } = await supabase.rpc("raye2_sync_platform_ceiling", {
    p_idempotency_key: `ceiling:${Math.floor(Date.now() / 60000)}`,
  });
  if (ceilingError) throw ceilingError;
  console.log(`[raye2-reconcile] platform ceiling is now ${ceiling} bytes.`);

  // Keep the registry in step with the providers actually configured in this environment. A newly
  // configured provider is discovered here; existing rows keep their usage counters.
  const syncPayload = providers.map(provider => ({
    provider_id: provider.id,
    provider_kind: provider.providerKind ?? provider.id.replace(/_\d+$/, ""),
    enabled: true,
    priority: provider.providerKind === "cloudflare_r2" ? 10 : 20,
    health: "healthy",
    capacity_bytes: Number(known.get(provider.id)?.capacity_bytes ?? 8 * 1024 * 1024 * 1024),
    safety_reserve_bytes: 256 * 1024 * 1024,
    max_managed_bytes: null,
    public_bucket: known.get(provider.id)?.public_bucket ?? "",
    private_bucket: known.get(provider.id)?.private_bucket ?? "",
  }));
  const { data: discovered, error: discoverError } = await supabase.rpc("raye2_sync_storage_providers", { p_providers: syncPayload });
  if (discoverError) console.error("[raye2-reconcile] provider discovery failed:", discoverError.message);
  else console.log(`[raye2-reconcile] registry synced for ${discovered ?? syncPayload.length} provider(s).`);
}

await main();

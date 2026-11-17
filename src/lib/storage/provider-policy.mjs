const PROVIDER_ORDER = {
  public_video: ["cloudflare_r2", "backblaze_b2", "supabase"],
  private_asset: ["backblaze_b2", "cloudflare_r2", "supabase"],
  chat_attachment: ["backblaze_b2", "cloudflare_r2", "supabase"],
  voice_recording: ["backblaze_b2", "cloudflare_r2", "supabase"],
  thumbnail: ["cloudflare_r2", "backblaze_b2", "supabase"],
  memory: ["backblaze_b2", "cloudflare_r2", "supabase"],
};

export class StorageCapacityError extends Error {
  constructor(assetClass, attemptedProviders) {
    super(`No enabled storage provider has verified safe capacity for ${assetClass}.`);
    this.name = "StorageCapacityError";
    this.code = "RAYE2_STORAGE_CAPACITY_EXHAUSTED";
    this.assetClass = assetClass;
    this.attemptedProviders = attemptedProviders;
  }
}

function safeRemaining(provider) {
  const values = [
    provider.capacityBytes,
    provider.usedBytes,
    provider.reservedBytes,
    provider.safetyReserveBytes,
  ];
  if (values.some(value => !Number.isSafeInteger(value) || value < 0)) return null;
  const hardRemaining = provider.capacityBytes - provider.usedBytes - provider.reservedBytes - provider.safetyReserveBytes;
  if (hardRemaining < 0) return 0;
  if (provider.maxBytes !== undefined) {
    if (!Number.isSafeInteger(provider.maxBytes) || provider.maxBytes < 0) return null;
    return Math.max(0, Math.min(hardRemaining, provider.maxBytes - provider.usedBytes - provider.reservedBytes));
  }
  return hardRemaining;
}

function providerKind(provider) {
  return typeof provider.providerKind === "string" && provider.providerKind ? provider.providerKind : provider.provider;
}

export function selectStorageProvider({
  assetClass,
  visibility = "private",
  expectedBytes,
  providers,
  preferredProvider,
  excludedProviders = [],
}) {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 1) {
    throw new TypeError("expectedBytes must be a positive safe integer.");
  }
  if (!Array.isArray(providers)) throw new TypeError("providers must be an array.");
  if (!["private", "public"].includes(visibility)) throw new TypeError("visibility must be private or public.");
  if (!["video", "mini", "moment", "stream_replay", "thumbnail", "chat_attachment", "voice_recording", "memory", "other"].includes(assetClass)) {
    throw new TypeError("assetClass is not supported.");
  }
  if (providers.some(provider => !provider || typeof provider.provider !== "string")
    || new Set(providers.map(provider => provider.provider)).size !== providers.length) {
    throw new TypeError("providers must contain unique provider identifiers.");
  }
  const routeClass = visibility === "public" && ["video", "mini", "moment", "stream_replay"].includes(assetClass)
    ? "public_video"
    : assetClass === "thumbnail" ? "thumbnail"
    : assetClass === "memory" ? "memory"
    : assetClass === "chat_attachment" ? "chat_attachment"
    : assetClass === "voice_recording" ? "voice_recording"
    : "private_asset";
  const order = PROVIDER_ORDER[routeClass];
  const excluded = new Set(excludedProviders);
  const usable = provider => provider && provider.enabled === true && provider.health === "healthy"
    && provider.capacityVerified === true && !excluded.has(provider.provider);

  // Group instances by kind so several pooled instances of the same provider can be routed.
  const byKind = new Map();
  for (const provider of providers) {
    const kind = providerKind(provider);
    if (!byKind.has(kind)) byKind.set(kind, []);
    byKind.get(kind).push(provider);
  }

  const attemptedProviders = [];
  const considerInstance = provider => {
    attemptedProviders.push(provider.provider);
    const remaining = safeRemaining(provider);
    if (remaining === null || remaining < expectedBytes) return null;
    return {
      provider: provider.provider,
      providerKind: providerKind(provider),
      bucket: provider.bucketByVisibility?.[visibility] ?? provider.defaultBucket ?? null,
      safeRemainingBytes: remaining,
    };
  };

  // An explicit preferred instance (any kind) is tried first, e.g. to keep a user's data on one pool.
  if (preferredProvider) {
    const preferred = providers.find(provider => provider.provider === preferredProvider);
    if (usable(preferred)) {
      const chosen = considerInstance(preferred);
      if (chosen) return chosen;
    }
  }

  const kinds = [...order, ...[...byKind.keys()].filter(kind => !order.includes(kind))];
  for (const kind of kinds) {
    if (excluded.has(kind)) continue;
    const instances = (byKind.get(kind) || []).filter(usable);
    // Within one provider kind, prefer the least-full instance that still has room.
    instances.sort((a, b) => (safeRemaining(b) ?? -1) - (safeRemaining(a) ?? -1));
    for (const instance of instances) {
      const chosen = considerInstance(instance);
      if (chosen) return chosen;
    }
  }
  throw new StorageCapacityError(assetClass, attemptedProviders);
}

/** Aggregate pooled capacity across enabled providers, mirroring raye2_storage_capacity_summary. */
export function summarizeProviderPool(providers, { includeUnverified = false } = {}) {
  if (!Array.isArray(providers)) throw new TypeError("providers must be an array.");
  let capacityBytes = 0;
  let usedBytes = 0;
  let reservedBytes = 0;
  let verifiedCapacityBytes = 0;
  let enabledCount = 0;
  let verifiedCount = 0;
  for (const provider of providers) {
    if (!provider || provider.enabled !== true) continue;
    enabledCount += 1;
    const capacity = Number.isSafeInteger(provider.capacityBytes) ? provider.capacityBytes : 0;
    const used = Number.isSafeInteger(provider.usedBytes) ? provider.usedBytes : 0;
    const reserved = Number.isSafeInteger(provider.reservedBytes) ? provider.reservedBytes : 0;
    capacityBytes += capacity;
    usedBytes += used;
    reservedBytes += reserved;
    if (provider.capacityVerified === true) {
      verifiedCount += 1;
      verifiedCapacityBytes += capacity;
    }
  }
  const effectiveCapacityBytes = includeUnverified ? capacityBytes : verifiedCapacityBytes;
  return {
    enabledCount,
    verifiedCount,
    capacityBytes,
    verifiedCapacityBytes,
    usedBytes,
    reservedBytes,
    availableBytes: Math.max(0, effectiveCapacityBytes - usedBytes - reservedBytes),
  };
}

export function assertUserQuotaAvailable({ usedBytes, reservedBytes, quotaBytes, expectedBytes }) {
  for (const [name, value] of Object.entries({ usedBytes, reservedBytes, quotaBytes, expectedBytes })) {
    if (!Number.isSafeInteger(value) || value < 0) throw new TypeError(`${name} must be a non-negative safe integer.`);
  }
  if (expectedBytes < 1) throw new TypeError("expectedBytes must be greater than zero.");
  const availableBytes = Math.max(0, quotaBytes - usedBytes - reservedBytes);
  if (expectedBytes > availableBytes) {
    const error = new Error("Your Raye2 storage allocation does not have enough available space for this upload.");
    error.code = "RAYE2_USER_QUOTA_EXCEEDED";
    error.availableBytes = availableBytes;
    throw error;
  }
  return { availableBytes, remainingAfterReservationBytes: availableBytes - expectedBytes };
}

export function buildStorageReservationKey({ userId, assetId, attemptId }) {
  for (const [name, value] of Object.entries({ userId, assetId, attemptId })) {
    if (typeof value !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(value)) {
      throw new TypeError(`${name} is invalid.`);
    }
  }
  return `raye2-storage:${userId}:${assetId}:${attemptId}`;
}

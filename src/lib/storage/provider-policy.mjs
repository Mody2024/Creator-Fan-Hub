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
  const routeClass = visibility === "public" && ["video", "mini", "moment", "stream_replay"].includes(assetClass)
    ? "public_video"
    : assetClass === "thumbnail" ? "thumbnail"
    : assetClass === "memory" ? "memory"
    : assetClass === "chat_attachment" ? "chat_attachment"
    : assetClass === "voice_recording" ? "voice_recording"
    : "private_asset";
  const order = PROVIDER_ORDER[routeClass];
  const byName = new Map(providers.map(provider => [provider.provider, provider]));
  const excluded = new Set(excludedProviders);
  const candidates = [
    ...(preferredProvider ? [preferredProvider] : []),
    ...order,
  ].filter((name, index, all) => all.indexOf(name) === index && !excluded.has(name));
  const attemptedProviders = [];
  for (const name of candidates) {
    const provider = byName.get(name);
    if (!provider || provider.enabled !== true || provider.health !== "healthy" || provider.capacityVerified !== true) continue;
    attemptedProviders.push(name);
    const remaining = safeRemaining(provider);
    if (remaining !== null && remaining >= expectedBytes) {
      return {
        provider: name,
        bucket: provider.bucketByVisibility?.[visibility] ?? provider.defaultBucket ?? null,
        safeRemainingBytes: remaining,
      };
    }
  }
  throw new StorageCapacityError(assetClass, attemptedProviders);
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

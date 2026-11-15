export type Raye2StorageProviderId = "supabase" | "cloudflare_r2" | "backblaze_b2";
export type Raye2AssetClass =
  | "video" | "mini" | "moment" | "stream_replay" | "thumbnail"
  | "chat_attachment" | "voice_recording" | "memory" | "other";
export type Raye2ObjectVisibility = "private" | "public";

export type StorageObjectIdentity = {
  bucket: string;
  key: string;
};

export type StorageUploadRequest = {
  bucket: string;
  key: string;
  contentType: string;
  expectedBytes: number;
  checksumSha256?: string;
  visibility: Raye2ObjectVisibility;
  expiresInSeconds: number;
};

export type StorageObjectMetadata = StorageObjectIdentity & {
  sizeBytes: number;
  contentType: string | null;
  checksumSha256: string | null;
  etag: string | null;
};

export type StorageProviderCapabilities = {
  resumableUploads: boolean;
  multipartUploads: boolean;
  signedDownloads: boolean;
  serverSideCopy: boolean;
  sha256Verification: boolean;
  publicDelivery: boolean;
};

export type Raye2StorageProvider = {
  readonly id: Raye2StorageProviderId;
  readonly capabilities: StorageProviderCapabilities;
  createSignedUpload(request: StorageUploadRequest): Promise<{ url: string; headers: Record<string, string> }>;
  createSignedDownload(object: StorageObjectIdentity, expiresInSeconds: number): Promise<string>;
  getPublicUrl?(object: StorageObjectIdentity): string;
  headObject(object: StorageObjectIdentity): Promise<StorageObjectMetadata | null>;
  copyObject(source: StorageObjectIdentity, destination: StorageObjectIdentity): Promise<StorageObjectMetadata>;
  deleteObject(object: StorageObjectIdentity): Promise<void>;
};

/**
 * Server-only provider contract. Implementations must keep credentials outside
 * browser bundles, verify upload completion server-side, and never silently
 * exceed the provider's configured free-capacity safety ceiling.
 */
export type StorageProviderConfiguration = {
  id: Raye2StorageProviderId;
  enabled: boolean;
  health: "healthy" | "degraded" | "unavailable" | "unknown";
  capacityBytes: number;
  usedBytes: number;
  reservedBytes: number;
  safetyReserveBytes: number;
  capacityVerifiedAt: string | null;
  /** True only when the latest provider reconciliation is recent and complete. */
  capacityVerified: boolean;
  /** Optional stricter Raye2-managed ceiling below the provider allowance. */
  maxBytes?: number | null;
  bucketByVisibility?: Partial<Record<Raye2ObjectVisibility, string>>;
};

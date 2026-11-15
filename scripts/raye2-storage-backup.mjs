import { createClient } from "@supabase/supabase-js";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const outputRoot = resolve(process.argv[2] ?? "backup/storage");
const maxBytes = Number(process.env.RAYE2_BACKUP_MAX_STORAGE_BYTES ?? 1024 * 1024 * 1024);
const pageSize = 100;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the private backup environment.");
}
if (serviceRoleKey.startsWith("sb_publishable_") || (!serviceRoleKey.startsWith("eyJ") && !serviceRoleKey.startsWith("sb_secret_"))) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY must be a server-only service-role secret.");
}
if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
  throw new Error("RAYE2_BACKUP_MAX_STORAGE_BYTES must be a positive safe integer.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
const objects = [];
let totalBytes = 0;

function safeSegments(value, label) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/")) {
    throw new Error(`Unsafe ${label} in Storage listing.`);
  }
  const segments = value.split("/");
  if (segments.some(part => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe ${label} path segment.`);
  }
  return segments;
}

function targetPath(bucket, objectPath) {
  const bucketSegments = safeSegments(bucket, "bucket name");
  const objectSegments = safeSegments(objectPath, "object path");
  const destination = resolve(outputRoot, ...bucketSegments, ...objectSegments);
  const rel = relative(outputRoot, destination);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error("Storage backup path escaped the destination directory.");
  }
  return destination;
}

async function listFolder(bucket, prefix = "") {
  for (let offset = 0; ; offset += pageSize) {
    const { data, error } = await supabase.storage.from(bucket).list(prefix, {
      limit: pageSize,
      offset,
      sortBy: { column: "name", order: "asc" },
    });
    if (error) throw new Error(`Cannot list bucket ${bucket}: ${error.message}`);
    if (!data?.length) break;

    for (const entry of data) {
      if (!entry?.name || entry.name.includes("/") || entry.name.includes("\\") || entry.name === "." || entry.name === "..") {
        throw new Error(`Storage returned an unsafe object name in bucket ${bucket}.`);
      }
      const objectPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      const isFolder = entry.id == null && entry.metadata == null;
      if (isFolder) {
        await listFolder(bucket, objectPath);
        continue;
      }

      const { data: blob, error: downloadError } = await supabase.storage.from(bucket).download(objectPath);
      if (downloadError || !blob) {
        throw new Error(`Cannot download ${bucket}/${objectPath}: ${downloadError?.message ?? "empty response"}`);
      }
      const bytes = blob.size;
      if (!Number.isSafeInteger(bytes) || bytes < 0 || totalBytes + bytes > maxBytes) {
        throw new Error(`Storage backup exceeded its configured ${maxBytes}-byte safety ceiling.`);
      }
      const destination = targetPath(bucket, objectPath);
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(await blob.arrayBuffer()), { flag: "wx", mode: 0o600 });
      totalBytes += bytes;
      objects.push({
        bucket,
        path: objectPath,
        bytes,
        contentType: blob.type || entry.metadata?.mimetype || "application/octet-stream",
        cacheControl: entry.metadata?.cacheControl ?? null,
      });
    }

    if (data.length < pageSize) break;
  }
}

const { data: buckets, error: bucketsError } = await supabase.storage.listBuckets();
if (bucketsError) throw new Error(`Cannot enumerate Storage buckets: ${bucketsError.message}`);
await mkdir(outputRoot, { recursive: true });

for (const bucket of buckets ?? []) {
  if (!bucket?.name) throw new Error("Storage returned a bucket without a name.");
  await listFolder(bucket.name);
}

const manifest = {
  format: "raye2-storage-backup-v1",
  createdAt: new Date().toISOString(),
  bucketNames: (buckets ?? []).map(bucket => bucket.name),
  objectCount: objects.length,
  totalBytes,
  objects,
};
await writeFile(resolve(outputRoot, "manifest.json"), JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 });
process.stdout.write(`Encrypted-backup input ready: ${objects.length} objects, ${totalBytes} bytes across ${buckets?.length ?? 0} buckets.\n`);

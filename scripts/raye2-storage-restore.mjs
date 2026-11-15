import { createClient } from "@supabase/supabase-js";
import { readFile, stat } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const backupRoot = resolve(process.argv[2] ?? "backup/storage");

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the private restore environment.");
}
if (serviceRoleKey.startsWith("sb_publishable_") || (!serviceRoleKey.startsWith("eyJ") && !serviceRoleKey.startsWith("sb_secret_"))) {
  throw new Error("SUPABASE_SERVICE_ROLE_KEY must be a server-only service-role secret.");
}

function safeSegments(value, label) {
  if (typeof value !== "string" || !value || value.includes("\\") || value.startsWith("/")) {
    throw new Error(`Unsafe ${label} in backup manifest.`);
  }
  const segments = value.split("/");
  if (segments.some(part => !part || part === "." || part === "..")) {
    throw new Error(`Unsafe ${label} path segment.`);
  }
  return segments;
}

const manifestPath = resolve(backupRoot, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
if (manifest.format !== "raye2-storage-backup-v1" || !Array.isArray(manifest.objects)) {
  throw new Error("Unsupported or invalid Raye2 Storage backup manifest.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
});
let restored = 0;

for (const item of manifest.objects) {
  const bucket = safeSegments(item.bucket, "bucket")[0];
  const objectSegments = safeSegments(item.path, "object path");
  const filePath = resolve(backupRoot, bucket, ...objectSegments);
  const rel = relative(backupRoot, filePath);
  if (!rel || rel.startsWith(`..${sep}`) || rel === ".." || isAbsolute(rel)) {
    throw new Error("Restore path escaped the backup directory.");
  }
  const fileStat = await stat(filePath);
  if (!fileStat.isFile() || fileStat.size !== item.bytes) {
    throw new Error(`Backup file missing or size mismatch: ${bucket}/${item.path}`);
  }
  const bytes = await readFile(filePath);
  const { error } = await supabase.storage.from(bucket).upload(item.path, bytes, {
    upsert: true,
    contentType: item.contentType || "application/octet-stream",
    ...(item.cacheControl ? { cacheControl: String(item.cacheControl) } : {}),
  });
  if (error) throw new Error(`Cannot restore ${bucket}/${item.path}: ${error.message}`);
  restored += 1;
}

process.stdout.write(`Restored ${restored} Storage objects. No objects absent from the backup were deleted.\n`);

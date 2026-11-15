import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const dir = new URL("../supabase/migrations/", import.meta.url);
const files = (await readdir(dir)).filter(name => name.endsWith(".sql")).sort();
const sources = await Promise.all(files.map(async name => [name, await readFile(new URL(name, dir), "utf8")]));
const all = sources.map(([, sql]) => sql).join("\n");

function securityDefinerBlocks(sql) {
  const blocks = [];
  const re = /create\s+(?:or\s+replace\s+)?function\s+([\w.]+)\s*\([^)]*\)\s*([\s\S]*?)\$\$;/gi;
  let match;
  while ((match = re.exec(sql)) !== null) blocks.push({ name: match[1], head: match[2].toLowerCase() });
  return blocks;
}

test("every SECURITY DEFINER function pins an empty search_path", () => {
  const offenders = [];
  for (const [name, sql] of sources) {
    for (const block of securityDefinerBlocks(sql)) {
      if (block.head.includes("security definer") && !block.head.includes("set search_path")) {
        offenders.push(`${name}: ${block.name}`);
      }
    }
  }
  assert.deepEqual(offenders, [], `SECURITY DEFINER functions must set search_path: ${offenders.join(", ")}`);
});

test("every public function is fail-closed with an explicit REVOKE", () => {
  const defined = [...all.matchAll(/create\s+(?:or\s+replace\s+)?function\s+public\.(\w+)\s*\(/gi)].map(m => m[1]);
  const unique = [...new Set(defined)];
  const missing = unique.filter(name =>
    !new RegExp(`revoke\\s+[^;]*function\\s+public\\.${name}\\s*\\(`, "i").test(all)
  );
  assert.deepEqual(missing, [], `public functions missing a REVOKE: ${missing.join(", ")}`);
});

test("no privileged helper is granted to anon", () => {
  // anon may only reach intentionally public read/expiry helpers, never admin or moderation entry points.
  const privileged = [
    "raye2_queue_cleanup_job", "raye2_run_cleanup_job", "raye2_cancel_cleanup_job",
    "raye2_preview_retention_sweep", "raye2_report_community_content",
    "raye2_moderate_community_post", "raye2_sweep_message_retention",
    "raye2_set_group_status", "raye2_transfer_group_ownership", "raye2_leave_group"
  ];
  for (const name of privileged) {
    assert.doesNotMatch(all, new RegExp(`grant\\s+execute\\s+on\\s+function\\s+public\\.${name}\\s*\\([^)]*\\)\\s+to[^;]*\\banon\\b`, "i"),
      `${name} must not be granted to anon`);
  }
});

test("admin entry points verify the platform admin role", () => {
  const adminGated = [
    "raye2_queue_cleanup_job", "raye2_run_cleanup_job", "raye2_cancel_cleanup_job",
    "raye2_preview_retention_sweep"
  ];
  for (const name of adminGated) {
    const start = all.indexOf(`function public.${name}(`);
    assert.ok(start >= 0, `missing function ${name}`);
    const body = all.slice(start, all.indexOf("$$;", start));
    assert.match(body, /raye2_is_platform_admin\(\)/, `${name} must check raye2_is_platform_admin()`);
  }
});

test("every Raye2 table enables row level security", () => {
  const tables = [...new Set([...all.matchAll(/create table if not exists public\.(raye2_\w+)/gi)].map(m => m[1]))];
  const missing = tables.filter(table =>
    !new RegExp(`alter table public\\.${table}\\s+enable row level security`, "i").test(all)
  );
  assert.deepEqual(missing, [], `Raye2 tables missing RLS: ${missing.join(", ")}`);
});

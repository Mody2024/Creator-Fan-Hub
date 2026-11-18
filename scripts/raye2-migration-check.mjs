#!/usr/bin/env node
// Applies every repository migration, in order, against a real PostgreSQL server that is
// preloaded with Supabase-compatible stand-ins (scripts/raye2-stub-supabase.sql). This is the
// "isolated validation" the storage migrations require before production: it proves the SQL
// parses, plans and applies in dependency order, and that the schema and grants are coherent.
//
// Usage:
//   node scripts/raye2-migration-check.mjs                 # spins up a throwaway cluster
//   RAYE2_PG_DSN=postgres://... node scripts/raye2-migration-check.mjs   # use an existing server
//   RAYE2_PGBIN=/usr/lib/postgresql/17/bin node ...        # point at a specific install
//
// The throwaway cluster is created under the OS temp dir and removed on exit. No production
// database is ever touched.

import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const migrationsDir = join(root, "supabase", "migrations");
const stubFile = join(root, "scripts", "raye2-stub-supabase.sql");
const postChecksFile = join(root, "scripts", "raye2-migration-postchecks.sql");
const rlsMatrixFile = join(root, "scripts", "raye2-rls-matrix.sql");

function fail(message) {
  console.error(`\n✖ migration check failed: ${message}`);
  process.exit(1);
}

function findPgBin() {
  if (process.env.RAYE2_PGBIN) return process.env.RAYE2_PGBIN;
  const base = "/usr/lib/postgresql";
  if (existsSync(base)) {
    const versions = readdirSync(base).sort().reverse();
    for (const version of versions) {
      const bin = join(base, version, "bin");
      if (existsSync(join(bin, "initdb"))) return bin;
    }
  }
  const which = spawnSync("sh", ["-c", "command -v initdb || command -v psql"], { encoding: "utf8" });
  if (which.status === 0 && which.stdout.trim()) return resolve(which.stdout.trim(), "..");
  return null;
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", ...options });
}

function psql(bin, dsn, extraArgs) {
  const result = run(join(bin, "psql"), [dsn, "-q", "-v", "ON_ERROR_STOP=1", ...extraArgs]);
  if (result.status !== 0) {
    const target = extraArgs[extraArgs.length - 1];
    fail(`psql ${extraArgs[0]} ${target}\n${result.stdout ?? ""}${result.stderr ?? ""}`);
  }
  return result.stdout ?? "";
}

const migrations = readdirSync(migrationsDir).filter(name => name.endsWith(".sql")).sort();
if (migrations.length === 0) fail("no migrations found");

const externalDsn = process.env.RAYE2_PG_DSN;
let bin = findPgBin();
let clusterDir = null;
let dsn = externalDsn;
let started = false;

function cleanup() {
  if (started && clusterDir) {
    run(join(bin, "pg_ctl"), ["-D", clusterDir, "-m", "immediate", "stop"]);
  }
  if (clusterDir && existsSync(clusterDir)) rmSync(clusterDir, { recursive: true, force: true });
}
process.on("exit", cleanup);
process.on("SIGINT", () => { cleanup(); process.exit(130); });

if (externalDsn && !bin) {
  fail("RAYE2_PG_DSN is set but no PostgreSQL client (psql) was found; set RAYE2_PGBIN.");
}

if (!externalDsn) {
  if (!bin) {
    console.error("• PostgreSQL server binaries were not found and RAYE2_PG_DSN is unset.");
    console.error("  Skipping the live migration check (install PostgreSQL or set RAYE2_PG_DSN).");
    process.exit(0);
  }
  clusterDir = mkdtempSync(join(tmpdir(), "raye2-pg-"));
  const port = String(5500 + (process.pid % 500));
  let result = run(join(bin, "initdb"), ["-D", clusterDir, "-U", "postgres", "--auth=trust"]);
  if (result.status !== 0) fail(`initdb: ${result.stderr ?? result.stdout}`);
  const socketDir = join(clusterDir, "sock");
  run("mkdir", ["-p", socketDir]);
  result = run(join(bin, "pg_ctl"), [
    "-D", clusterDir, "-l", join(clusterDir, "server.log"), "-w",
    "-o", `-p ${port} -c listen_addresses='' -c unix_socket_directories='${socketDir}'`,
    "start"
  ]);
  if (result.status !== 0) fail(`pg_ctl start: ${result.stderr ?? result.stdout}`);
  started = true;
  dsn = `postgresql://postgres@/postgres?host=${socketDir}&port=${port}`;
}

psql(bin, dsn, ["-f", stubFile]);
for (const migration of migrations) {
  psql(bin, dsn, ["-f", join(migrationsDir, migration)]);
}
psql(bin, dsn, ["-f", postChecksFile]);
psql(bin, dsn, ["-f", rlsMatrixFile]);

const mode = externalDsn ? "external server" : "throwaway cluster";
console.log(`✓ applied ${migrations.length} migrations, post-checks and the RLS matrix on ${mode}`);

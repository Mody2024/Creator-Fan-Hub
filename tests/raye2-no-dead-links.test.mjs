import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const root = new URL("..", import.meta.url).pathname;

async function walk(dir, filter) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = dir.replace(/\/$/, "") + "/" + entry.name;
    if (entry.isDirectory()) out.push(...(await walk(full, filter)));
    else if (filter(entry.name)) out.push(full);
  }
  return out;
}

// Every App Router route segment, including dynamic ones.
async function routeTemplates() {
  const files = await walk(root + "src/app", name => name === "page.tsx" || name === "route.ts");
  const routes = new Set();
  for (const file of files) {
    const rel = file.slice((root + "src/app").length).replace(/\/page\.tsx$/, "").replace(/\/route\.ts$/, "");
    routes.add(rel === "" ? "/" : rel);
  }
  return routes;
}

function resolves(pathname, routes) {
  const clean = pathname.split("?")[0].split("#")[0];
  if (clean === "" || clean === "/") return routes.has("/");
  const parts = clean.replace(/\/$/, "").split("/").filter(Boolean);
  for (const route of routes) {
    const routeParts = route.split("/").filter(Boolean);
    if (routeParts.length !== parts.length) continue;
    if (routeParts.every((segment, i) => (segment.startsWith("[") && segment.endsWith("]")) || segment === parts[i])) return true;
  }
  return false;
}

test("every static internal link points at a real route (no dead links)", async () => {
  const routes = await routeTemplates();
  const tsx = await walk(root + "src", name => name.endsWith(".tsx"));
  const dead = [];
  for (const file of tsx) {
    const text = await readFile(file, "utf8");
    // Static literal hrefs only; template/dynamic hrefs are checked by their own tests.
    for (const match of text.matchAll(/href="(\/[^"{}]*)"/g)) {
      const target = match[1];
      if (target.startsWith("/api") || target.startsWith("/_next")) continue;
      if (!resolves(target, routes)) dead.push(file.slice(root.length) + " -> " + target);
    }
  }
  assert.deepEqual(dead, []);
});

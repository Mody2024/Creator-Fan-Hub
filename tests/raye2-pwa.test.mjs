import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("Raye2 has a standalone bilingual-ready install manifest", async () => {
  const manifest = JSON.parse(await read("../public/manifest.webmanifest"));
  assert.equal(manifest.name, "Raye2 — Communication & Communities");
  assert.equal(manifest.short_name, "Raye2");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.scope, "/");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#0b0b0d");
  assert.equal(manifest.theme_color, "#0b0b0d");
  assert.ok(manifest.icons.some(icon => icon.src === "/icon.png" && icon.sizes === "512x512"));
  assert.ok(manifest.shortcuts.some(shortcut => shortcut.url === "/raye2"));
  assert.ok(manifest.shortcuts.some(shortcut => shortcut.url === "/groups"));
});

test("the service worker never caches navigations or private application surfaces", async () => {
  const worker = await read("../public/sw.js");
  assert.match(worker, /request\.mode === "navigate"/);
  assert.match(worker, /fetch\(request\)\.catch/);
  assert.match(worker, /url\.pathname\.startsWith\("\/api\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/auth\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/creator\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/raye2\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/groups\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/_next\/static\/"\)/);
  assert.match(worker, /url\.pathname\.startsWith\("\/brand\/"\)/);
  assert.doesNotMatch(worker, /cache\.put\(request, response\.clone\(\)\)[\s\S]{0,100}request\.mode === "navigate"/);
});

test("service-worker registration is production-only and progressive", async () => {
  const registration = await read("../src/app/raye2-shell/pwa-register.tsx");
  const layout = await read("../src/app/layout.tsx");
  assert.match(registration, /process\.env\.NODE_ENV !== "production"/);
  assert.match(registration, /navigator\.serviceWorker\.register\("\/sw\.js"/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layout, /<PwaRegister \/>/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = p => readFile(new URL(p, import.meta.url), "utf8");

const PRODUCT_SURFACES = [
  "../src/app/page.tsx",
  "../src/app/saved/page.tsx",
  "../src/app/notifications/page.tsx",
  "../src/app/notifications/notifications-client.tsx",
  "../src/app/shorts/page.tsx",
  "../src/app/shorts/community-shorts-client.tsx",
  "../src/app/videos/public-videos.tsx",
  "../src/app/watch/page.tsx",
  "../src/app/creator/team/team-client.tsx",
  "../src/app/creator/accept-invite/page.tsx",
  "../src/app/creator/accept-invite/accept-invite-client.tsx"
];

test("no predecessor NHEN/Nhen?/Creator Fan Hub labels remain on Raye2 product surfaces", async () => {
  for (const file of PRODUCT_SURFACES) {
    const source = await read(file);
    assert.doesNotMatch(source, /\bNHEN\b/, `${file} still contains NHEN`);
    assert.doesNotMatch(source, /Nhen\?/, `${file} still contains Nhen?`);
    assert.doesNotMatch(source, /Nhenbit/, `${file} still contains Nhenbit`);
    assert.doesNotMatch(source, /نهين/, `${file} still contains the predecessor Arabic label`);
  }
});

test("the uploaded logo is the only visible brand mark", async () => {
  const home = await read("../src/app/page.tsx");
  assert.match(home, /config\.logoUrl \? <img className="site-logo-image" src=\{config\.logoUrl\} alt="" \/> : null/);
  assert.doesNotMatch(home, /portal-wordmark|رايق/);
});

test("the brand mark integrates into favicon, app icons and the installable app shell", async () => {
  const { existsSync } = await import("node:fs");
  const layout = await read("../src/app/layout.tsx");
  assert.ok(existsSync(new URL("../src/app/icon.png", import.meta.url)));
  assert.ok(existsSync(new URL("../src/app/apple-icon.png", import.meta.url)));
  assert.ok(existsSync(new URL("../src/app/favicon.ico", import.meta.url)));
  assert.match(layout, /\/icon\.png/);
  assert.match(layout, /\/apple-icon\.png/);
  assert.match(layout, /\/favicon\.ico/);
  assert.match(layout, /manifest: "\/manifest\.webmanifest"/);
  assert.match(layout, /<PwaRegister \/>/);
  assert.match(layout, /<RouteTransition \/>/);
  assert.ok(existsSync(new URL("../public/manifest.webmanifest", import.meta.url)));
  assert.ok(existsSync(new URL("../public/sw.js", import.meta.url)));
  assert.ok(existsSync(new URL("../public/offline.html", import.meta.url)));
});

test("page shells share one content-width token instead of per-route widths", async () => {
  const design = await read("../src/app/raye2-design-system.css");
  const notifications = await read("../src/app/notifications/raye2-notifications.css");
  const series = await read("../src/app/series/raye2-series.css");
  assert.match(design, /--raye2-ds-content:1320px/);
  assert.match(design, /--raye2-ds-reading:900px/);
  assert.doesNotMatch(design, /min\(100%,(850px|900px|1050px|1100px|1360px)\)/);
  assert.match(notifications, /min\(1320px,100%\)/);
  assert.match(series, /min\(1320px,100%\)/);
});

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

test("the uploaded logo is the identity and the wordmark is only a fallback", async () => {
  const home = await read("../src/app/page.tsx");
  assert.match(home, /config\.logoUrl \? <img className="site-logo-image" src=\{config\.logoUrl\} alt="Raye2" \/> : <span className="portal-wordmark">/);
});

test("the brand mark integrates into favicon, app icons and a branded loading state", async () => {
  const { existsSync } = await import("node:fs");
  const layout = await read("../src/app/layout.tsx");
  const loading = await read("../src/app/loading.tsx");
  assert.ok(existsSync(new URL("../src/app/icon.png", import.meta.url)));
  assert.ok(existsSync(new URL("../src/app/apple-icon.png", import.meta.url)));
  assert.ok(existsSync(new URL("../src/app/favicon.ico", import.meta.url)));
  assert.match(layout, /\/icon\.png/);
  assert.match(layout, /\/apple-icon\.png/);
  assert.match(layout, /\/favicon\.ico/);
  assert.match(loading, /raye2-app-loading/);
  assert.match(loading, /aria-busy="true"/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");

test("group creation is a three-step bilingual flow", async () => {
  const client = await read("../src/app/raye2/raye2-client.tsx");
  const styles = await read("../src/app/raye2/raye2.module.css");

  assert.match(client, /useState<1 \| 2 \| 3>\(1\)/);
  assert.match(client, /basicsTitle: "Start your group"/);
  assert.match(client, /basicsTitle: "ابدأ مجموعتك"/);
  assert.match(client, /privacyTitle: "Choose privacy"/);
  assert.match(client, /privacyTitle: "اختر الخصوصية"/);
  assert.match(client, /reviewTitle: "Review your setup"/);
  assert.match(client, /reviewTitle: "راجع إعداداتك"/);
  assert.match(client, /role="progressbar"/);
  assert.match(client, /groupCreateStep === 1/);
  assert.match(client, /groupCreateStep === 2/);
  assert.match(client, /groupCreateStep === 3/);
  assert.match(client, /aria-pressed=\{groupVisibility === "public"\}/);
  assert.match(client, /aria-pressed=\{groupVisibility === "private"\}/);
  assert.match(client, /supabase\.rpc\("raye2_create_group"/);
  assert.match(styles, /\.groupWizardTrack\[data-step="2"\]/);
  assert.match(styles, /\.groupWizardOptions/);
  assert.match(styles, /\.groupWizardReview/);
});

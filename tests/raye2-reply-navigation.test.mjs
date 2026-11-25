import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("src/app/raye2/raye2-client.tsx", "utf8");
const css = readFileSync("src/app/raye2/raye2.module.css", "utf8");

test("reply references can navigate to their original message", () => {
  assert.match(client, /id=\{\x60raye2-message-\$\{message\.id\}\x60\}/);
  assert.match(client, /message\.parent_message_id && \(parent \? <button/);
  assert.match(client, /scrollIntoView\(\{ behavior: "smooth", block: "center" \}\)/);
  assert.match(client, /View original/);
  assert.match(client, /عرض الأصل/);
});

test("reply navigation remains accessible and handles unloaded parents", () => {
  assert.match(client, /type="button" className=\{styles\.replyQuoteButton\}/);
  assert.match(client, /Original message is outside the loaded history/);
  assert.match(client, /الرسالة الأصلية خارج السجل المحمّل/);
  assert.match(css, /\.replyQuoteButton:focus-visible/);
  assert.match(css, /\.replyQuoteMissing/);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("src/app/raye2/raye2-client.tsx", "utf8");
const css = readFileSync("src/app/raye2/raye2.module.css", "utf8");

test("grouped replies can be opened in a focused thread panel", () => {
  assert.match(client, /const \[activeThreadRoot, setActiveThreadRoot\] = useState<Message \| null>\(null\)/);
  assert.match(client, /activeThreadReplies = activeThreadRoot \? currentMessages\.filter\(message => message\.parent_message_id === activeThreadRoot\.id\)/);
  assert.match(client, /message\.parent_message_id === null && messages\.some\(item => item\.parent_message_id === message\.id\)/);
  assert.match(client, /aria-label=\{isAr \? "سلسلة الردود" : "Message thread"\}/);
  assert.match(client, /Reply in thread/);
  assert.match(client, /الرد في السلسلة/);
});

test("thread panel handles empty replies, closes and resets on conversation switch", () => {
  assert.match(client, /No replies yet\. Start the conversation\./);
  assert.match(client, /لا توجد ردود بعد\. ابدأ المحادثة\./);
  assert.match(client, /setActiveThreadRoot\(null\); \}, \[selectedId\]\)/);
  assert.match(client, /setActiveThreadRoot\(null\)\}>×/);
  assert.match(css, /\.threadPanel\{/);
  assert.match(css, /\.threadReplies\{/);
  assert.match(css, /\.threadReplyAction:disabled/);
});

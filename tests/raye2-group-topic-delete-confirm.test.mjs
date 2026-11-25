import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../src/app/raye2/raye2-client.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../src/app/raye2/raye2.module.css", import.meta.url), "utf8");

test("group topic deletion requires an explicit confirmation", () => {
  assert.match(client, /const \[pendingDeleteTopicId, setPendingDeleteTopicId\] = useState<string \| null>\(null\)/);
  assert.match(client, /onClick=\{\(\) => setPendingDeleteTopicId\(topic\.id\)\}/);
  assert.match(client, /pendingDeleteTopicId === topic\.id \? <span className=\{styles\.topicDeleteConfirm\}/);
  assert.match(client, /isAr \? "تأكيد" : "Confirm"/);
  assert.match(client, /isAr \? "إلغاء" : "Cancel"/);
  assert.match(client, /onClick=\{\(\) => void deleteGroupTopic\(topic\.id\)\}/);
  assert.match(client, /setPendingDeleteTopicId\(null\)/);
  assert.match(css, /\.topicDeleteConfirm/);
});

test("pending delete confirmation resets when switching groups", () => {
  const start = client.indexOf("const groupId = selectedGroup?.id;");
  const effect = client.slice(start, start + 800);
  assert.match(effect, /setPendingDeleteTopicId\(null\)/);
});

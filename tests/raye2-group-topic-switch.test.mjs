import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const client = await readFile(new URL("../src/app/raye2/raye2-client.tsx", import.meta.url), "utf8");

test("switching groups clears the previous group's topic filter and manager draft", () => {
  const effectStart = client.indexOf("const groupId = selectedGroup?.id;");
  assert.notEqual(effectStart, -1);
  const effect = client.slice(effectStart, effectStart + 700);
  assert.match(effect, /setGroupTopics\(\[\]\)/);
  assert.match(effect, /setActiveTopicId\(null\)/);
  assert.match(effect, /setShowTopicManage\(false\)/);
  assert.match(effect, /setNewTopicName\(""\)/);
  assert.ok(effect.indexOf("setActiveTopicId(null)") < effect.indexOf('supabase.rpc("raye2_list_group_topics"'));
});

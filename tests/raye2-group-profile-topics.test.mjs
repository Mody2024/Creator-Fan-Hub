import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const client = readFileSync("src/app/raye2/raye2-client.tsx", "utf8");
const migration = readFileSync("supabase/migrations/20261116230000_raye2_group_profile_and_moderation_log.sql", "utf8");

assert.match(client, /const \[profileTopics, setProfileTopics\] = useState\(" "\)/);
assert.match(client, /groupTopics:"Topics \(comma-separated\)"/);
assert.match(client, /groupTopics:"المواضيع \(افصل بينها بفواصل\)"/);
assert.match(client, /setProfileTopics\(\(selectedGroup\.topics \?\? \[\]\)\.join\(", "\)\)/);
assert.match(client, /p_topics: profileTopics\.split\(","\)/);
assert.match(client, /\.slice\(0, 12\)/);
assert.match(client, /value=\{profileTopics\} onChange=\{event => setProfileTopics\(event\.target\.value\)\}/);
assert.match(migration, /array_length\(p_topics,1\) > 12/);
assert.match(migration, /char_length\(btrim\(t\)\) <= 40/);

console.log("Raye2 group profile topic editor checks passed.");

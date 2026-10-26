import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const required = [
  ["document language", /<html lang="en">/],
  ["responsive viewport", /name="viewport"/],
  ["main landmark", /<main\b/],
  ["ideas section", /id="ideas"/],
  ["voting section", /id="vote"/],
  ["community section", /id="community"/],
  ["latest content section", /id="latest"/],
  ["theme selector", /id="theme"/],
  ["guided tour", /id="tour"/],
  ["reduced motion support", /prefers-reduced-motion:\s*reduce/],
  ["permanent creator signature", /MADE BY ALMUDDATHTHIR/],
  ["honest demo poll disclosure", /Demo only[^<]*no vote is sent or stored/],
  ["honest submission disclosure", /does not send or save your idea/i],
  ["safe external URL constraint in schema docs", /https:\/\//]
];

const failures = [];
for (const [label, pattern] of required) {
  if (!pattern.test(label === "safe external URL constraint in schema docs" ? await readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8") : html)) {
    failures.push(label);
  }
}

if (!/<form\b[^>]*id="idea-form"/.test(html)) failures.push("idea submission form");
if (!/aria-live="polite"/.test(html)) failures.push("live status announcement");
if (!/aria-pressed/.test(html)) failures.push("accessible poll selection state");

if (failures.length) {
  console.error("Static site checks failed:");
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Static site checks passed (${required.length + 3} assertions).`);
}

import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const failures = [];
const check = (label, condition) => { if (!condition) failures.push(label); };

const [page, config, poll, editor, packageJson] = await Promise.all([
  read("../src/app/page.tsx"),
  read("../src/lib/public-site-config.ts"),
  read("../src/app/vote/published-polls.tsx"),
  read("../src/app/creator/creator-settings.tsx"),
  read("../package.json")
]);

check("homepage imports published poll component", page.includes('import PublishedPolls from "@/app/vote/published-polls"'));
check("homepage renders published poll component", page.includes("<PublishedPolls />"));
check("homepage reads published configuration", page.includes("getPublicSiteConfig"));
check("public configuration uses published snapshot", config.includes('.from("published_site_config")') && config.includes('.select("published")'));
check("public configuration validates accent color", config.includes("/^#[0-9a-fA-F]{6}$/"));
check("poll display uses aggregate RPC", poll.includes('rpc("get_public_poll_results")'));
check("poll display does not expose voter data", !poll.includes("voter_token") && !poll.includes("voter_hash"));
check("creator editor uses guarded draft RPC", editor.includes('rpc("get_site_config_draft")') && editor.includes('rpc("save_site_config_draft"'));
check("creator editor has explicit draft/publish actions", editor.includes("Save draft") && editor.includes("Save & publish"));
check("creator editor has maintenance mode", editor.includes('update("maintenance","enabled"'));
check("package defines build script", /"build"\s*:\s*"next build"/.test(packageJson));
check("package defines lint script", /"lint"\s*:\s*"eslint \\."/.test(packageJson) || packageJson.includes('"lint": "eslint ."' ));

if (failures.length) {
  console.error("Repository validation failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exitCode = 1;
} else {
  console.log("Repository validation passed (12 assertions).");
}

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const directory = readFileSync("src/app/groups/page.tsx", "utf8");
const detail = readFileSync("src/app/groups/[slug]/page.tsx", "utf8");
const styles = readFileSync("src/app/groups/groups.css", "utf8");

assert.match(directory, /createSpace:"Create a space"/);
assert.match(directory, /createSpace:"أنشئ مساحة"/);
assert.match(directory, /href="\/raye2"/);
assert.match(directory, /Create and manage your group inside Raye2\./);
assert.match(detail, /group\.visibility==="public"&&!canViewRoster/);
assert.match(detail, /openRaye2:"Open Raye2 to join"/);
assert.match(detail, /openRaye2:"افتح Raye2 للانضمام"/);
assert.match(detail, /href="\/raye2"/);
assert.match(styles, /\.raye2-groups-create-link/);
assert.match(styles, /:focus-visible/);

console.log("Raye2 public group entry-point checks passed.");

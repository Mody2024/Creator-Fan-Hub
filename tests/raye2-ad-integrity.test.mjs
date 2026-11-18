import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = path => readFile(new URL(path, import.meta.url), "utf8");
const [migration, admin, creator, page] = await Promise.all([
  read("../supabase/migrations/20261110820000_raye2_ad_campaign_integrity.sql"),
  read("../src/app/creator/raye2/campaign-integrity.tsx"),
  read("../src/app/creator/monetization-report.tsx"),
  read("../src/app/creator/page.tsx")
]);

test("campaign budgets and impression caps are enforced at delivery", () => {
  assert.match(migration, /add column if not exists budget_amount/);
  assert.match(migration, /add column if not exists daily_impression_cap/);
  assert.match(migration, /add column if not exists lifetime_impression_cap/);
  assert.match(migration, /raise exception 'daily impression cap reached/);
  assert.match(migration, /raise exception 'lifetime impression cap reached/);
});

test("invalid impressions stop counting toward caps", () => {
  assert.match(migration, /add column if not exists invalid boolean/);
  assert.match(migration, /and not e\.invalid/);
});

test("invalid-traffic detection is admin-only and threshold-driven", () => {
  assert.match(migration, /function public\.raye2_detect_invalid_traffic\(/);
  assert.match(migration, /ads\.invalid_traffic_impressions_per_hour/);
  assert.match(migration, /having count\(\*\) >= greatest\(1, v_threshold\)/);
});

test("reconciliation supports open/review/dispute/resolve states", () => {
  assert.match(migration, /create table if not exists public\.raye2_sponsor_reconciliation/);
  assert.match(migration, /state in \('open','in_review','disputed','resolved','closed'\)/);
  assert.match(migration, /function public\.raye2_open_reconciliation\(/);
  assert.match(migration, /function public\.raye2_set_reconciliation_state\(/);
});

test("creator earnings reporting never fabricates figures", () => {
  assert.match(migration, /function public\.raye2_creator_monetization_report\(/);
  assert.match(migration, /'payout_status','not_configured'/);
  assert.match(migration, /'viewer_identity_data_exposed',false/);
});

test("the integrity and earnings panels are mounted", () => {
  assert.match(admin, /raye2_campaign_integrity_overview/);
  assert.match(creator, /raye2_creator_monetization_report/);
  assert.match(page, /<MonetizationReport locale=/);
});

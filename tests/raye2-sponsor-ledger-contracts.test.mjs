import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const migration=await readFile(new URL("../supabase/migrations/20261107160000_raye2_sponsor_delivery_and_revenue_ledgers.sql",import.meta.url),"utf8");

test("delivery telemetry separates all three sponsor sources and stays service-role only",()=>{
 for(const source of ["creator_contract","platform_campaign","external_network"])assert.ok(migration.includes("'"+source+"'"));
 assert.ok(migration.includes("enable row level security"));
 assert.ok(migration.includes("grant select,insert on public.raye2_sponsor_delivery_events to service_role"));
 assert.ok(migration.includes("revoke all on public.raye2_sponsor_delivery_events from public,anon,authenticated"));
 assert.ok(migration.includes("unique(provider_key,provider_event_id)"));
});

test("revenue ledger records net adjustments and keeps sponsor revenue sources separate",()=>{
 for(const field of ["gross_amount","provider_deductions","refunds","invalid_traffic_adjustments","other_adjustments","net_received","platform_share","creator_share","status","received_at"])assert.ok(migration.includes(field));
 assert.ok(migration.includes("unique(provider_key,provider_transaction_id)"));
 assert.ok(migration.includes("provider_deductions+refunds+invalid_traffic_adjustments+other_adjustments<=gross_amount"));
 assert.ok(migration.includes("net_received=gross_amount-provider_deductions-refunds-invalid_traffic_adjustments-other_adjustments"));
 assert.ok(migration.includes("new.net_received<>new.gross_amount-new.provider_deductions-new.refunds-new.invalid_traffic_adjustments-new.other_adjustments"));
});

test("70/30 applies only to external network net receipts, never contracted or platform sponsorships",()=>{
 assert.ok(migration.includes("round(new.net_received*0.70,2)"));
 assert.ok(migration.includes("round(new.net_received*0.30,2)"));
 assert.ok(migration.includes("source_type<>'external_network' and platform_share=0 and creator_share=0"));
 assert.ok(migration.includes("contracted and platform sponsor revenue must remain in separate ledgers"));
});

test("estimated or provider-reported values are not silently represented as received",()=>{
 assert.ok(migration.includes("'estimated','provider_reported','received','adjusted','reversed'"));
 assert.ok(migration.includes("received revenue requires a verified received timestamp"));
 assert.ok(migration.includes("A future trusted server/provider adapter must"));
 assert.ok(migration.includes("verify provider signatures before receipt"));
});

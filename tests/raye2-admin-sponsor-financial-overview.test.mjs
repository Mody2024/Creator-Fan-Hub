import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
const read=path=>readFile(new URL(path,import.meta.url),"utf8");
const [migration,component,admin]=await Promise.all([
 read("../supabase/migrations/20261107330000_raye2_admin_sponsor_financial_overview.sql"),
 read("../src/app/creator/raye2/platform-revenue-overview.tsx"),
 read("../src/app/creator/raye2/admin-client.tsx")
]);
test("platform revenue report is restricted to platform administrators",()=>{
 assert.ok(migration.includes("security definer"));
 assert.ok(migration.includes("if not public.raye2_is_platform_admin()"));
 assert.ok(migration.includes("revoke all on function public.raye2_admin_sponsor_financial_overview() from public,anon,authenticated"));
 assert.ok(migration.includes("grant execute on function public.raye2_admin_sponsor_financial_overview() to authenticated"));
});
test("finance report separates received and unconfirmed amounts by source and currency",()=>{
 for(const field of ["source_type","currency","status","verified_received","unconfirmed_net","platform_share_received","creator_share_received"])assert.ok(migration.includes(field));
 assert.ok(migration.includes("status='received'"));
 assert.ok(migration.includes("status in ('estimated','provider_reported')"));
 assert.ok(migration.includes("'payment_execution_enabled',false"));
 assert.ok(migration.includes("'viewer_identity_data_exposed',false"));
});
test("admin UI displays sponsor delivery and finance without claiming payment execution",()=>{
 assert.ok(component.includes("Platform sponsorship revenue"));
 assert.ok(component.includes("confirmed received"));
 assert.ok(component.includes("unconfirmed"));
 assert.ok(component.includes("Payment execution: disabled"));
 assert.ok(component.includes("No earnings are assumed"));
 assert.ok(component.includes("raye2-platform-finance-and-delivery.csv"));
 assert.ok(component.includes("Revenue by source and status"));
 assert.ok(component.includes("const revenueRows=rows.map"));
 assert.ok(component.includes("const deliveryRows=report.delivery_by_source_event.map"));
 assert.ok(component.includes("const campaignRows=["));
 assert.ok(component.includes("/^\\s*[=+@-]/.test(text)"));
 assert.ok(component.includes('const csv="\\uFEFF"'));
 assert.ok(component.includes('.join("\\r\\n")'));
 assert.ok(component.includes("Amounts are grouped by currency and must not be added across currencies."));
});
test("Raye2 admin page exposes a dedicated revenue tab",()=>{
 assert.ok(admin.includes('"revenue"'));
 assert.ok(admin.includes("PlatformRevenueOverview"));
 assert.ok(admin.includes('tab === "revenue"'));
});

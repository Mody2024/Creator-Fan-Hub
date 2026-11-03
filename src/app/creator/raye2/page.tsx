import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import Raye2AdminClient, { type RuleRow, type RetentionRow, type CleanupRow, type StorageRow, type AuditRow } from "./admin-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Raye2 Admin — Platform Rules & Retention" };

export default async function Raye2AdminPage() {
  const [supabase, cookieStore] = await Promise.all([createSupabaseServerClient(), cookies()]);
  const locale = cookieStore.get("nhen_locale")?.value === "ar" ? "ar" : "en";
  if (!supabase) redirect("/creator/login?setup=required");
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/creator/login");
  const { data: admin, error: adminError } = await supabase.from("creator_admins").select("role").eq("user_id", userId).eq("active", true).maybeSingle();
  if (adminError || !admin || !["owner", "admin"].includes(admin.role)) redirect("/creator/login?access=restricted");

  const [rules, retention, jobs, storage, audit] = await Promise.all([
    supabase.from("raye2_platform_rules").select("rule_key,category,rule_value,status,description,updated_at").order("category").order("rule_key"),
    supabase.from("raye2_retention_policies").select("category,retention_days,warning_days,expiry_action,enabled,preserve_shared_memories,updated_at").order("category"),
    supabase.from("raye2_cleanup_jobs").select("id,status,scope,preserve_chat_history,preserve_shared_memories,estimated_items,estimated_bytes,reason,created_at").order("created_at", { ascending: false }).limit(30),
    supabase.from("raye2_storage_usage").select("id,owner_id,group_id,storage_class,object_count,bytes_used,measured_at").order("measured_at", { ascending: false }).limit(500),
    supabase.from("raye2_admin_audit_log").select("id,actor_id,action,target_type,target_id,reason,details,created_at").order("created_at", { ascending: false }).limit(50)
  ]);
  return <Raye2AdminClient locale={locale} initialRules={(rules.data ?? []) as RuleRow[]} initialRetention={(retention.data ?? []) as RetentionRow[]} initialJobs={(jobs.data ?? []) as CleanupRow[]} initialStorage={(storage.data ?? []) as StorageRow[]} initialAudit={(audit.data ?? []) as AuditRow[]} />;
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";
import PlatformSponsorManagement from "./platform-sponsor-management";
import PlatformRevenueOverview from "./platform-revenue-overview";
import CampaignIntegrity from "./campaign-integrity";

export type RuleRow = { rule_key: string; category: string; rule_value: unknown; status: "proposed" | "active" | "disabled"; description: string; updated_at: string };
export type RetentionRow = { category: string; retention_days: number | null; warning_days: number; expiry_action: "archive" | "delete"; enabled: boolean; preserve_shared_memories: boolean; updated_at: string };
export type CleanupRow = { id: string; status: string; scope: string[]; preserve_chat_history: boolean; preserve_shared_memories: boolean; estimated_items: number | null; estimated_bytes: number | null; reason: string; created_at: string };
export type SweepRow = { category: string; retention_days: number | null; expiry_action: string; candidates: number; oldest: string | null };
export type QuotaRow = { rule_key: string; category: string; limit_value: number; rejections: number; distinct_users: number; last_rejected: string | null };
export type JobRow = { job_id: string; kind: string; status: string; priority: number; attempts: number; max_attempts: number; last_error: string | null; run_at: string; created_at: string };
export type JobStats = { by_status?: Record<string, number>; by_kind?: Record<string, number>; oldest_queued_at?: string | null; failed_last_24h?: number; stuck_running?: number };
export type CleanupStats = { by_status?: Record<string, number>; pending?: number; failed?: number; deleted?: number; oldest_pending_at?: string | null };
export type TelemetrySummary = { window_hours?: number; by_type?: Record<string, number>; by_severity?: Record<string, number>; errors?: number; latency_p50_ms?: number | null; latency_p95_ms?: number | null };
export type TelemetryRow = { event_id: number; event_type: string; surface: string; severity: string; message: string; duration_ms: number | null; created_at: string };
export type CapacityRow = { metric: string; unit: string; limit_value: number; used: number | null; usage_percent: number | null; state: string; headroom: number | null; enabled: boolean };
export type StorageRow = { id: string; owner_id: string | null; group_id: string | null; storage_class: string; object_count: number; bytes_used: number; measured_at: string };
export type StorageProviderRow = {provider_key:string;provider_kind:string;enabled:boolean;billing_mode:string;capacity_bytes:number;monthly_write_ops_limit:number;monthly_read_ops_limit:number;monthly_egress_bytes_limit:number;hard_stop_percent:number;adapter_ready:boolean;zero_cost_verified:boolean;used_bytes:number;reserved_bytes:number;monthly_egress_bytes:number;monthly_read_ops:number;reconciled_at:string|null;snapshot_fresh:boolean};
export type StoragePolicyRow = {target_total_capacity_bytes:number;monthly_upload_target_bytes:number;monthly_upload_hard_limit_bytes:number;actual_verified_capacity_bytes:number;free_only:boolean;updated_at:string};
export type AuditRow = { id: number; actor_id: string | null; action: string; target_type: string; target_id: string | null; reason: string; details: Record<string, unknown>; created_at: string };
export type HealthRow = { metric: string; value: number; state: "ok" | "warning" | "critical" };
export type AdminRow = { user_id: string; handle: string | null; display_name: string | null; role: string; active: boolean; created_at: string };
export type CapRow = { capability: string; required_role: string; allowed: boolean; description: string };

type Locale = "en" | "ar";
const bytes = (value: number) => value < 1024 ? value + " B" : value < 1024 ** 2 ? (value / 1024).toFixed(1) + " KB" : value < 1024 ** 3 ? (value / 1024 ** 2).toFixed(1) + " MB" : (value / 1024 ** 3).toFixed(2) + " GB";

export default function Raye2AdminClient({ locale, initialRules, initialRetention, initialJobs, initialStorage, initialAudit, initialHealth, initialAdmins, initialCaps }: {
  locale: Locale; initialRules: RuleRow[]; initialRetention: RetentionRow[]; initialJobs: CleanupRow[]; initialStorage: StorageRow[]; initialAudit: AuditRow[]; initialHealth: HealthRow[]; initialAdmins: AdminRow[]; initialCaps: CapRow[];
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [tab, setTab] = useState<"rules" | "retention" | "cleanup" | "storage" | "audit" | "sponsors" | "revenue" | "health" | "roles" | "quotas" | "jobs" | "telemetry" | "capacity" | "live" | "integrity" | "moderation">("rules");
  const [modQueue, setModQueue] = useState<Array<{kind:string;report_id:string;target_type:string;target_id:string;reason:string;details:string;status:string;created_at:string;reporter_handle:string|null;target_preview:string|null}>>([]);
  const [modStatus, setModStatus] = useState<"open"|"reviewing"|"resolved"|"dismissed">("open");
  const [modNote, setModNote] = useState("");
  const [rules, setRules] = useState(initialRules);
  const [retention, setRetention] = useState(initialRetention);
  const [jobs, setJobs] = useState(initialJobs);
  const [admins, setAdmins] = useState(initialAdmins);
  const [caps] = useState(initialCaps);
  const canRunCleanup = caps.some(item => item.capability === "run_cleanup" && item.allowed);
  const [sweep, setSweep] = useState<SweepRow[]>([]);
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
  const [bgJobs, setBgJobs] = useState<JobRow[]>([]);
  const [bgJobStats, setBgJobStats] = useState<JobStats>({});
  const [cleanupStats, setCleanupStats] = useState<CleanupStats>({});
  const [telemetry, setTelemetry] = useState<TelemetryRow[]>([]);
  const [telemetrySummary, setTelemetrySummary] = useState<TelemetrySummary>({});
  const [capacity, setCapacity] = useState<CapacityRow[]>([]);
  const [liveOverview, setLiveOverview] = useState<Record<string, number> | null>(null);
  const [audit, setAudit] = useState(initialAudit);
  const [auditAction, setAuditAction] = useState("");
  const [auditActor, setAuditActor] = useState("");
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [storageUserId,setStorageUserId] = useState("");
  const [storageUserGiB,setStorageUserGiB] = useState("1");
  const [storageRoleTier,setStorageRoleTier] = useState<"creator"|"streamer"|"combined">("creator");
  const [storageRoleGiB,setStorageRoleGiB] = useState("20");
  const [storageProviders,setStorageProviders] = useState<StorageProviderRow[]>([]);
  const [storagePolicy,setStoragePolicy] = useState<StoragePolicyRow|null>(null);
  const [storageTargetGiB,setStorageTargetGiB] = useState("10");
  const [storageMonthlyGiB,setStorageMonthlyGiB] = useState("10");
  const [storageMonthlyHardGiB,setStorageMonthlyHardGiB] = useState("10");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [scope, setScope] = useState<string[]>(["temporary_uploads", "failed_encodes", "voice_recordings", "watch_sessions"]);
  const [preserveChat, setPreserveChat] = useState(true);
  const [preserveMemories, setPreserveMemories] = useState(true);
  const isAr = locale === "ar";
  const t = isAr ? {
    eyebrow:"RAYE2 / تحكم المنصة", title:"قواعد واضحة. تحكم آمن.", intro:"إدارة الحدود والاحتفاظ والتنظيف من مكان واحد. التغييرات الحساسة تمر عبر عمليات محمية وسجل تدقيق.", back:"العودة إلى Raye2", rules:"القواعد", retention:"الاحتفاظ", cleanup:"معاينة التنظيف", storage:"التخزين", audit:"سجل التدقيق", status:"الحالة", category:"التصنيف", value:"القيمة (JSON)", save:"حفظ القاعدة", description:"الوصف", proposed:"مقترح", active:"مفعّل", disabled:"معطّل", reason:"سبب التغيير (مطلوب)", days:"أيام الاحتفاظ", warning:"أيام التنبيه قبل الانتهاء", action:"الإجراء عند الانتهاء", archive:"أرشفة", delete:"حذف", enabled:"تفعيل السياسة", preserve:"حماية الذكريات المشتركة", saveRetention:"حفظ سياسة الاحتفاظ", scope:"الفئات المطلوب مراجعتها", preserveChat:"استثناء سجل المحادثات", preserveMemories:"استثناء الذكريات المشتركة", preview:"إنشاء طلب معاينة", previewNote:"هذا يسجل طلب مراجعة فقط. لا يتم حذف أي محتوى من هذه الصفحة، ويُحسب عدد العناصر والمساحة المقدّرة وقت المعاينة.", request:"الطلبات الأخيرة", items:"العناصر", recovered:"المساحة المقدّرة", storageNote:"هذه لقطات قياس مخزنة، وليست عدّادًا لحظيًا أو ضمانًا للسعة المتاحة.",storageRoleTitle:"الحصة الافتراضية حسب الدور",storageUserTitle:"تخصيص مساحة لحساب",storageRoleLabel:"الدور",storageUserId:"معرّف الحساب",storageGiB:"المساحة الدائمة (GiB)",storageApply:"تطبيق الحصة",storageReset:"إعادة إلى حصة الدور",storageQuotaNote:"هذه حدود تخزين دائمة وليست حدود الرفع الشهرية. السعة الفعلية تظل هي الحد النهائي.",storageReason:"سبب التغيير للتدقيق",storagePolicyTitle:"سياسة التخزين العامة",storageProviderTitle:"مزودو التخزين",storageTarget:"هدف السعة الدائمة (GiB)",storageMonthly:"هدف الرفع الشهري (GiB)",storageMonthlyHard:"الحد الصارم للرفع الشهري (GiB)",storageActual:"السعة الفعلية المؤكدة",storageLoad:"تحديث لوحة التخزين",storageProviderReady:"المحول جاهز",storageZeroCost:"تم التحقق من التكلفة الصفرية",storageSnapshot:"قياس الاستخدام حديث",storageQuarantine:"تعطيل المزود",storageEnable:"تفعيل المزود",storageNotReady:"لا يمكن التفعيل: يلزم جاهزية المحول والتحقق من التكلفة الصفرية وحداثة قياس الاستخدام.", objects:"ملفات", used:"المساحة", noRows:"لا توجد بيانات بعد.", saved:"تم حفظ التغيير.", error:"تعذر تنفيذ العملية. تحقق من الصلاحيات والاتصال.", reasonRequired:"اكتب سببًا واضحًا قبل الحفظ.", selectScope:"اختر فئة واحدة على الأقل.", requestOnly:"طلب معاينة — لا حذف", created:"تم تسجيل طلب المعاينة.", ownerGuard:"هذه الصفحة متاحة للمالك والمسؤول فقط.", sponsors:"رعاة المنصة",revenue:"الإيرادات والرعايات",health:"صحة المنصة",roles:"الأدوار والوصول",stateOk:"جيد",stateWarning:"تحذير",stateCritical:"حرج",roleChanged:"تم تحديث الدور.",roleChangeError:"تعذر تحديث الدور.",suspend:"إيقاف",reactivate:"إعادة تفعيل",accessActive:"نشط",accessSuspended:"موقوف",role:"الدور",healthNote:"عدّادات مجمّعة للمنصة. يُصنّف التخزين وفق الحدود المعرّفة في محرك القواعد.",noHealth:"لا توجد بيانات صحة بعد.",ownerOnly:"تعيين الأدوار متاح للمالك فقط.",caps:"مصفوفة الصلاحيات",capsNote:"ما يمكنك فعله بهذا الدور، وما يتطلب المالك.",capsRequired:"يتطلب",capsYes:"مسموح",capsNo:"مقيد",runOwnerOnly:"تنفيذ الحذف متاح للمالك فقط.",auditFilter:"تصفية سجل التدقيق",auditAction:"الإجراء",auditActor:"معرّف الفاعل",auditApply:"تصفية",auditClear:"مسح",auditEmpty:"لا توجد سجلات مطابقة.",auditFail:"تعذر تحميل سجل التدقيق.",queueJob:"جدولة",runJob:"تنفيذ",cancelJob:"إلغاء",jobQueued:"تمت جدولة المهمة.",jobRan:"تم تنفيذ المهمة.",jobCancelled:"تم إلغاء المهمة.",jobError:"تعذر تحديث المهمة.",sweep:"معاينة الاحتفاظ",sweepNote:"ما الذي ستحذفه السياسات المفعّلة الآن.",sweepCategory:"الفئة",sweepCandidates:"المرشحون",sweepNone:"لا توجد سياسات احتفاظ مفعّلة.",sweepOldest:"الأقدم",quotas:"الحصص",quotaNote:"الاستخدام والمحاولات المرفوضة لكل قاعدة نشطة قابلة للقياس.",quotaRule:"القاعدة",quotaLimit:"الحد",quotaRejections:"المرفوضة",quotaUsers:"حسابات متأثرة",quotaLast:"آخر رفض",quotaEmpty:"لا توجد حصص قابلة للقياس.",quotaLoad:"تحديث الحصص",jobs:"المهام",jobsNote:"مهام الخلفية الدائمة: قائمة الانتظار وإعادة المحاولة والفشل والركود.",jobsEmpty:"لا توجد مهام بعد.",jobsLoad:"تحديث المهام",jobsQueued:"قيد الانتظار",jobsRunning:"قيد التنفيذ",jobsFailed:"فاشلة",jobsStuck:"عالقة",cleanupPending:"تنظيف معلّق",cleanupFailed:"تنظيف فاشل",cleanupDeleted:"محذوف",jobsRetry:"إعادة المحاولة",jobsCancel:"إلغاء",jobsByStatus:"حسب الحالة",jobsByKind:"حسب النوع",jobsAttempts:"المحاولات",jobsRetried:"تمت إعادة جدولة المهمة.",jobsCancelled:"تم إلغاء المهمة.",jobsError:"تعذر تحديث المهمة.",telemetry:"القياس",telemetryNote:"أخطاء العميل وزمن استجابة الواجهة البرمجية وجودة الوقت الحقيقي.",telemetryEmpty:"لا توجد أحداث قياس.",telemetryLoad:"تحديث القياس",telemetryErrors:"أخطاء",telemetryP50:"الوسيط (مللي ثانية)",telemetryP95:"الشريحة 95 (مللي ثانية)",telemetryByType:"حسب النوع",telemetrySeverity:"حسب الخطورة",telemetryPrune:"تقليم القديم",telemetryPruned:"تم تقليم الأحداث القديمة.",telemetryError:"تعذر تحميل القياس.",capacity:"السعة",capacityNote:"حدود المزود والاستخدام الحالي والمهلة المتبقية لكل مقياس.",capacityEmpty:"لا توجد حدود سعة.",capacityLoad:"تحديث السعة",capacityUsage:"الاستخدام",capacityLimit:"الحد",capacityHeadroom:"المتبقي",capacityState:"الحالة",capacityError:"تعذر تحميل السعة.",live:"البث",liveNote:"البث النشط والإعادات وصحة الاتصال.",liveLoad:"تحديث البث",liveLive:"مباشر الآن",liveReplay:"إعادات",liveModerated:"موقوف للمراجعة",liveDegraded:"متدهور",liveReplayHours:"الاحتفاظ بالإعادة (س)",liveMaxDuration:"أقصى مدة (ث)",liveMaxConcurrent:"أقصى تزامن",liveError:"تعذر تحميل نظرة البث.",modQueue:"قائمة المراجعة",modNote:"ملاحظة الحل",modLoad:"تحديث القائمة",modEmpty:"لا توجد تقارير بهذه الحالة.",modResolve:"حل",modDismiss:"تجاهل",modReview:"قيد المراجعة",modResolved:"تم تحديث التقرير.",modError:"تعذر تحميل القائمة أو تحديثها.",modContent:"محتوى",modSafety:"سلامة",modReporter:"المُبلِّغ"
  } : {
    eyebrow:"RAYE2 / PLATFORM CONTROL", title:"Clear rules. Safer control.", intro:"Manage limits, retention and cleanup in one place. Sensitive changes use guarded operations and an audit trail.", back:"Back to Raye2", rules:"Rules", retention:"Retention", cleanup:"Cleanup review", storage:"Storage", audit:"Audit log", status:"Status", category:"Category", value:"Value (JSON)", save:"Save rule", description:"Description", proposed:"Proposed", active:"Active", disabled:"Disabled", reason:"Reason for this change (required)", days:"Retention days", warning:"Warning days before expiry", action:"Expiry action", archive:"Archive", delete:"Delete", enabled:"Enable policy", preserve:"Protect Shared Memories", saveRetention:"Save retention policy", scope:"Categories to review", preserveChat:"Exclude chat history", preserveMemories:"Exclude Shared Memories", preview:"Create review request", previewNote:"This records a review request only. This page does not delete content; affected records and estimated storage are computed at review time.", request:"Recent requests", items:"Estimated items", recovered:"Estimated recovery", storageNote:"These are stored measurement snapshots, not a live counter or a promise of available capacity.",storageRoleTitle:"Role storage defaults",storageUserTitle:"Individual account override",storageRoleLabel:"Role",storageUserId:"Account user ID",storageGiB:"Persistent storage (GiB)",storageApply:"Apply quota",storageReset:"Reset to role default",storageQuotaNote:"These are permanent storage allowances, not monthly upload limits. Actual capacity still limits every account.",storageReason:"Audit reason",storagePolicyTitle:"Global storage policy",storageProviderTitle:"Storage providers",storageTarget:"Persistent capacity target (GiB)",storageMonthly:"Monthly upload target (GiB)",storageMonthlyHard:"Monthly upload hard stop (GiB)",storageActual:"Verified physical capacity",storageLoad:"Refresh storage control room",storageProviderReady:"Adapter ready",storageZeroCost:"Zero-cost verified",storageSnapshot:"Usage snapshot fresh",storageQuarantine:"Disable provider",storageEnable:"Enable provider",storageNotReady:"Cannot enable: adapter, zero-cost approval and fresh usage snapshot are required.", objects:"Objects", used:"Used", noRows:"No data yet.", saved:"Change saved.", error:"The operation failed. Check permissions and connection.", reasonRequired:"Enter a clear reason before saving.", selectScope:"Select at least one category.", requestOnly:"Review request — no deletion", created:"Review request recorded.", ownerGuard:"This page is restricted to owners and admins.", sponsors:"Platform sponsors",revenue:"Revenue & finance",health:"Platform health",roles:"Roles & access",stateOk:"OK",stateWarning:"Warning",stateCritical:"Critical",roleChanged:"Role updated.",roleChangeError:"Could not update the role.",suspend:"Suspend",reactivate:"Reactivate",accessActive:"Active",accessSuspended:"Suspended",role:"Role",healthNote:"Aggregate platform counters. Storage is classified against the thresholds in the rules engine.",noHealth:"No health data yet.",ownerOnly:"Role assignment is restricted to the owner.",caps:"Capability matrix",capsNote:"What your role may do, and what requires the owner.",capsRequired:"Requires",capsYes:"Allowed",capsNo:"Restricted",runOwnerOnly:"Running a deletion is restricted to the owner.",auditFilter:"Filter audit log",auditAction:"Action",auditActor:"Actor ID",auditApply:"Apply",auditClear:"Clear",auditEmpty:"No matching entries.",auditFail:"Could not load the audit log.",queueJob:"Queue",runJob:"Run",cancelJob:"Cancel",jobQueued:"Job queued.",jobRan:"Job completed.",jobCancelled:"Job cancelled.",jobError:"Could not update the job.",sweep:"Retention sweep",sweepNote:"What enabled policies would remove right now.",sweepCategory:"Category",sweepCandidates:"Candidates",sweepNone:"No retention policies are enabled.",sweepOldest:"Oldest",quotas:"Quotas",quotaNote:"Usage and rejected attempts per measurable active rule.",quotaRule:"Rule",quotaLimit:"Limit",quotaRejections:"Rejected",quotaUsers:"Accounts",quotaLast:"Last rejected",quotaEmpty:"No measurable quotas.",quotaLoad:"Refresh quotas",jobs:"Jobs",jobsNote:"Durable background jobs: backlog, retries, failures and stuck leases.",jobsEmpty:"No jobs yet.",jobsLoad:"Refresh jobs",jobsQueued:"Queued",jobsRunning:"Running",jobsFailed:"Failed",jobsStuck:"Stuck",cleanupPending:"Cleanup pending",cleanupFailed:"Cleanup failed",cleanupDeleted:"Deleted",jobsRetry:"Retry",jobsCancel:"Cancel",jobsByStatus:"By status",jobsByKind:"By kind",jobsAttempts:"Attempts",jobsRetried:"Job requeued.",jobsCancelled:"Job cancelled.",jobsError:"Could not update the job.",telemetry:"Telemetry",telemetryNote:"Client errors, API latency and realtime quality.",telemetryEmpty:"No telemetry events.",telemetryLoad:"Refresh telemetry",telemetryErrors:"Errors",telemetryP50:"Median (ms)",telemetryP95:"p95 (ms)",telemetryByType:"By type",telemetrySeverity:"By severity",telemetryPrune:"Prune old",telemetryPruned:"Old events pruned.",telemetryError:"Could not load telemetry.",capacity:"Capacity",capacityNote:"Provider limits, current usage and headroom per metric.",capacityEmpty:"No capacity limits.",capacityLoad:"Refresh capacity",capacityUsage:"Usage",capacityLimit:"Limit",capacityHeadroom:"Headroom",capacityState:"State",capacityError:"Could not load capacity.",live:"Live",liveNote:"Active streams, replays and connection health.",liveLoad:"Refresh live",liveLive:"Live now",liveReplay:"Replays",liveModerated:"Moderated",liveDegraded:"Degraded",liveReplayHours:"Replay retention (h)",liveMaxDuration:"Max duration (s)",liveMaxConcurrent:"Max concurrent",liveError:"Could not load live overview.",modQueue:"Moderation queue",modNote:"Resolution note",modLoad:"Refresh queue",modEmpty:"No reports in this state.",modResolve:"Resolve",modDismiss:"Dismiss",modReview:"Reviewing",modResolved:"Report updated.",modError:"Could not load or update the queue.",modContent:"Content",modSafety:"Safety",modReporter:"Reporter"
  };
  const categories = ["direct_messages","group_messages","inactive_groups","voice_rooms","voice_recordings","voice_messages","chat_attachments","watch_sessions","temporary_uploads","failed_encodes","moments","minis","shared_memories"];
  const storageTotals = useMemo(() => initialStorage.reduce((acc, row) => {
    const item = acc[row.storage_class] ?? { objects: 0, bytes: 0 };
    item.objects += Number(row.object_count) || 0; item.bytes += Number(row.bytes_used) || 0; acc[row.storage_class] = item; return acc;
  }, {} as Record<string, { objects: number; bytes: number }>), [initialStorage]);

  async function saveRule(rule: RuleRow) {
    if (!supabase || busy) return;
    if (reason.trim().length < 3) { setNotice(t.reasonRequired); return; }
    let value: unknown;
    try { value = JSON.parse(jsonDrafts[rule.rule_key] ?? JSON.stringify(rule.rule_value)); }
    catch { setNotice("Invalid JSON. Use a valid JSON value."); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_set_platform_rule", {
      p_rule_key: rule.rule_key, p_category: rule.category, p_value: value, p_status: rule.status,
      p_description: rule.description, p_reason: reason.trim()
    });
    if (error) setNotice(t.error);
    else { setRules(current => current.map(item => item.rule_key === rule.rule_key ? { ...item, rule_value: value, updated_at: new Date().toISOString() } : item)); setNotice(t.saved); setReason(""); }
    setBusy(false);
  }

  async function saveRetention(item: RetentionRow) {
    if (!supabase || busy) return;
    if (reason.trim().length < 3) { setNotice(t.reasonRequired); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_set_retention_policy", {
      p_category: item.category, p_retention_days: item.retention_days, p_warning_days: item.warning_days,
      p_expiry_action: item.expiry_action, p_enabled: item.enabled,
      p_preserve_shared_memories: item.preserve_shared_memories, p_reason: reason.trim()
    });
    if (error) setNotice(t.error);
    else { setRetention(current => current.map(row => row.category === item.category ? { ...item, updated_at: new Date().toISOString() } : row)); setNotice(t.saved); setReason(""); }
    setBusy(false);
  }

  async function createPreview() {
    if (!supabase || busy) return;
    if (!scope.length) { setNotice(t.selectScope); return; }
    if (reason.trim().length < 3) { setNotice(t.reasonRequired); return; }
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_create_cleanup_preview", {
      p_scope: scope, p_preserve_chat_history: preserveChat, p_preserve_shared_memories: preserveMemories, p_reason: reason.trim()
    });
    if (error) setNotice(t.error);
    else {
      const jobId = String(data);
      const { data: row } = await supabase.from("raye2_cleanup_jobs")
        .select("id,status,scope,preserve_chat_history,preserve_shared_memories,estimated_items,estimated_bytes,reason,created_at")
        .eq("id", jobId).maybeSingle();
      const created = (row ?? { id: jobId, status: "preview", scope, preserve_chat_history: preserveChat, preserve_shared_memories: preserveMemories, estimated_items: null, estimated_bytes: null, reason: reason.trim(), created_at: new Date().toISOString() }) as CleanupRow;
      setJobs(current => [created, ...current]);
      setNotice(t.created); setReason("");
    }
    setBusy(false);
  }

  async function changeRole(userId: string, role: string) {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("set_creator_admin_role", { p_user_id: userId, p_role: role });
    if (error) setNotice(t.roleChangeError);
    else { setAdmins(current => current.map(item => item.user_id === userId ? { ...item, role } : item)); setNotice(t.roleChanged); }
    setBusy(false);
  }

  async function toggleActive(userId: string, active: boolean) {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("set_creator_admin_active", { p_user_id: userId, p_active: active });
    if (error) setNotice(t.roleChangeError);
    else { setAdmins(current => current.map(item => item.user_id === userId ? { ...item, active } : item)); setNotice(t.roleChanged); }
    setBusy(false);
  }

  async function loadAudit() {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_get_admin_audit_log", {
      p_limit: 50,
      p_action: auditAction.trim() || null,
      p_actor: auditActor.trim() || null
    });
    if (error) setNotice(t.auditFail);
    else setAudit((data ?? []) as AuditRow[]);
    setBusy(false);
  }

  async function jobAction(jobId: string, action: "queue" | "run" | "cancel") {
    if (!supabase || busy) return;
    if (reason.trim().length < 3) { setNotice(t.reasonRequired); return; }
    setBusy(true); setNotice("");
    const rpc = action === "queue" ? "raye2_queue_cleanup_job" : action === "run" ? "raye2_run_cleanup_job" : "raye2_cancel_cleanup_job";
    const { error } = await supabase.rpc(rpc, { p_job_id: jobId, p_reason: reason.trim() });
    if (error) setNotice(t.jobError);
    else {
      const status = action === "queue" ? "queued" : action === "run" ? "completed" : "cancelled";
      setJobs(current => current.map(item => item.id === jobId ? { ...item, status } : item));
      setNotice(action === "queue" ? t.jobQueued : action === "run" ? t.jobRan : t.jobCancelled);
      setReason("");
    }
    setBusy(false);
  }

  async function loadCapacity() {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_get_capacity_report");
    if (error) setNotice(t.capacityError);
    else setCapacity((data ?? []) as CapacityRow[]);
    setBusy(false);
  }

  async function saveStorageRoleQuota() {
    if(!supabase || busy) return;
    if(reason.trim().length<3) { setNotice(t.reasonRequired); return; }
    const gib=Number(storageRoleGiB);
    if(!Number.isFinite(gib)||gib<0||gib>1024) { setNotice("Role storage must be between 0 and 1024 GiB until more verified capacity is provisioned."); return; }
    setBusy(true); setNotice("");
    const {error}=await supabase.rpc("raye2_set_role_quota",{p_tier:storageRoleTier,p_metric:"storage_bytes",p_limit:Math.round(gib*1024**3)});
    if(error) setNotice(t.error);
    else { setNotice(t.saved); setReason(""); }
    setBusy(false);
  }

  async function saveStorageUserQuota(reset=false) {
    if(!supabase || busy) return;
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(storageUserId.trim())) { setNotice("Enter a valid account UUID."); return; }
    if(reason.trim().length<3) { setNotice(t.reasonRequired); return; }
    const gib=Number(storageUserGiB);
    if(!reset&&(!Number.isFinite(gib)||gib<0||gib>1024)) { setNotice("Account storage must be between 0 and 1024 GiB until more verified capacity is provisioned."); return; }
    setBusy(true); setNotice("");
    const {error}=await supabase.rpc("raye2_admin_set_user_storage_quota",{
      p_user_id:storageUserId.trim(),
      p_quota_bytes:reset?null:Math.round(gib*1024**3),
      p_reason:reason.trim()
    });
    if(error) setNotice(t.error);
    else { setNotice(t.saved); setReason(""); }
    setBusy(false);
  }

  async function loadStorageControlRoom() {
    if(!supabase || busy) return;
    setBusy(true); setNotice("");
    const [{data:providerData,error:providerError},{data:policyData,error:policyError}] = await Promise.all([
      supabase.rpc("raye2_admin_list_storage_providers"),
      supabase.rpc("raye2_admin_get_storage_policy")
    ]);
    if(providerError || policyError) setNotice(t.error);
    else {
      setStorageProviders((providerData??[]) as StorageProviderRow[]);
      const policy=((policyData??[]) as StoragePolicyRow[])[0]??null;
      setStoragePolicy(policy);
      if(policy) {
        setStorageTargetGiB((Number(policy.target_total_capacity_bytes)/1024**3).toString());
        setStorageMonthlyGiB((Number(policy.monthly_upload_target_bytes)/1024**3).toString());
        setStorageMonthlyHardGiB((Number(policy.monthly_upload_hard_limit_bytes)/1024**3).toString());
      }
    }
    setBusy(false);
  }

  async function saveGlobalStoragePolicy() {
    if(!supabase || busy) return;
    if(reason.trim().length<3) { setNotice(t.reasonRequired); return; }
    const target=Number(storageTargetGiB), monthly=Number(storageMonthlyGiB), hard=Number(storageMonthlyHardGiB);
    const maxGiB=1024**2;
    if(![target,monthly,hard].every(v=>Number.isFinite(v)&&v>=1&&v<=maxGiB) || monthly>hard) {
      setNotice("Use values from 1 GiB to 1 PiB; monthly upload target cannot exceed its hard stop."); return;
    }
    setBusy(true); setNotice("");
    const {error}=await supabase.rpc("raye2_admin_set_storage_policy",{
      p_target_total_capacity_bytes:Math.round(target*1024**3),
      p_monthly_upload_target_bytes:Math.round(monthly*1024**3),
      p_monthly_upload_hard_limit_bytes:Math.round(hard*1024**3),
      p_reason:reason.trim()
    });
    if(error) setNotice(t.error);
    else { setNotice(t.saved); setReason(""); }
    setBusy(false);
    if(!error) await loadStorageControlRoom();
  }

  async function setStorageProviderEnabled(provider:StorageProviderRow,enabled:boolean) {
    if(!supabase || busy) return;
    if(reason.trim().length<3) { setNotice(t.reasonRequired); return; }
    setBusy(true); setNotice("");
    const {error}=await supabase.rpc("raye2_admin_set_storage_provider_enabled",{
      p_provider_key:provider.provider_key,p_enabled:enabled,p_reason:reason.trim()
    });
    if(error) setNotice(enabled?t.storageNotReady:t.error);
    else { setNotice(t.saved); setReason(""); }
    setBusy(false);
    if(!error) await loadStorageControlRoom();
  }

  async function loadLive() {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_get_live_admin_overview");
    if (error) setNotice(t.liveError);
    else setLiveOverview((data ?? {}) as Record<string, number>);
    setBusy(false);
  }

  async function loadTelemetry() {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const [{ data: list, error: le }, { data: summary, error: se }] = await Promise.all([
      supabase.rpc("raye2_list_telemetry_events", { p_limit: 50 }),
      supabase.rpc("raye2_get_telemetry_summary", { p_hours: 24 })
    ]);
    if (le || se) setNotice(t.telemetryError);
    else { setTelemetry((list ?? []) as TelemetryRow[]); setTelemetrySummary((summary ?? {}) as TelemetrySummary); }
    setBusy(false);
  }

  async function pruneTelemetry() {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_prune_telemetry", { p_days: 30 });
    if (error) setNotice(t.telemetryError);
    else { setNotice(t.telemetryPruned); await loadTelemetry(); }
    setBusy(false);
  }

  async function loadBgJobs() {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const [{ data: list, error: le }, { data: stats, error: se }, { data: cleanup, error: ce }] = await Promise.all([
      supabase.rpc("raye2_list_background_jobs", { p_limit: 50 }),
      supabase.rpc("raye2_get_background_job_stats"),
      supabase.rpc("raye2_get_storage_cleanup_stats")
    ]);
    if (le || se) setNotice(t.jobsError);
    else { setBgJobs((list ?? []) as JobRow[]); setBgJobStats((stats ?? {}) as JobStats); if (!ce) setCleanupStats((cleanup ?? {}) as CleanupStats); }
    setBusy(false);
  }

  async function bgJobControl(jobId: string, action: "retry" | "cancel") {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const rpc = action === "retry" ? "raye2_retry_background_job" : "raye2_cancel_background_job";
    const { error } = await supabase.rpc(rpc, { p_job_id: jobId, p_reason: action === "retry" ? "manual retry" : "manual cancel" });
    if (error) setNotice(t.jobsError);
    else { setNotice(action === "retry" ? t.jobsRetried : t.jobsCancelled); await loadBgJobs(); }
    setBusy(false);
  }

  async function loadQuotas() {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_get_quota_overview", { p_limit: 100 });
    if (error) setNotice(t.error);
    else setQuotas((data ?? []) as QuotaRow[]);
    setBusy(false);
  }

  async function loadSweep() {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_preview_retention_sweep");
    if (error) setNotice(t.jobError);
    else setSweep((data ?? []) as SweepRow[]);
    setBusy(false);
  }

  const updateRetention = (category: string, patch: Partial<RetentionRow>) => setRetention(current => current.map(item => item.category === category ? { ...item, ...patch } : item));
  async function loadModQueue(status = modStatus) {
    if (!supabase) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_get_moderation_queue", { p_limit: 100, p_status: status });
    setBusy(false);
    if (error) { setNotice(t.modError); return; }
    setModQueue((data ?? []) as typeof modQueue);
  }
  async function resolveReport(kind: string, id: string, status: string) {
    if (!supabase) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_admin_resolve_report", { p_kind: kind, p_report_id: id, p_status: status, p_note: modNote });
    setBusy(false);
    if (error) { setNotice(t.modError); return; }
    setNotice(t.modResolved); setModNote("");
    await loadModQueue();
  }
  const tabs = [{ id: "health", label: t.health }, { id: "rules", label: t.rules }, { id: "retention", label: t.retention }, { id: "cleanup", label: t.cleanup }, { id: "storage", label: t.storage }, { id: "roles", label: t.roles }, { id: "audit", label: t.audit }, { id: "quotas", label: t.quotas }, { id: "jobs", label: t.jobs }, { id: "telemetry", label: t.telemetry }, { id: "capacity", label: t.capacity }, { id: "live", label: t.live }, { id: "sponsors", label: t.sponsors }, { id: "revenue", label: t.revenue }, { id: "integrity", label: isAr ? "نزاهة الحملات" : "Campaign integrity" }, { id: "moderation", label: isAr ? "قائمة المراجعة" : "Moderation queue" }] as const;
  return <main className={styles.page} dir={isAr ? "rtl" : "ltr"} lang={locale}>
    <header className={styles.header}><Link href="/raye2" className={styles.brand}>RAYE<span>2</span></Link><div><span className={styles.dot}/>{t.eyebrow}</div><Link href="/creator">{t.back}</Link></header>
    <section className={styles.intro}><span>{t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p></section>
    <nav className={styles.tabs} aria-label="Raye2 admin sections">{tabs.map(item => <button key={item.id} className={tab === item.id ? styles.active : ""} onClick={() => setTab(item.id)}>{item.label}</button>)}</nav>
    <section className={styles.content}>
      {tab === "health" && <><div className={styles.sectionHead}><h2>{t.health}</h2><p>{t.healthNote}</p></div>{initialHealth.length===0 ? <p>{t.noHealth}</p> : <div className={styles.storageGrid}>{initialHealth.map(row => <article className={styles.card} key={row.metric}><span>{row.metric}</span><strong className={row.state==="ok"?styles.ok:row.state==="warning"?styles.warning:styles.critical}>{row.metric.startsWith("storage_") ? bytes(row.value) : row.value.toLocaleString()}</strong><small>{row.state==="ok"?t.stateOk:row.state==="warning"?t.stateWarning:t.stateCritical}</small></article>)}</div>}</>}
      {tab === "rules" && <><div className={styles.sectionHead}><h2>{t.rules}</h2><p>{t.status}: {t.proposed} · {t.active} · {t.disabled}</p></div>
        {rules.map(rule => <article className={styles.card} key={rule.rule_key}><div className={styles.cardHead}><div><span>{rule.category}</span><h3>{rule.rule_key}</h3><p>{rule.description}</p></div><select value={rule.status} onChange={event => setRules(current => current.map(item => item.rule_key === rule.rule_key ? { ...item, status: event.target.value as RuleRow["status"] } : item))}><option value="proposed">{t.proposed}</option><option value="active">{t.active}</option><option value="disabled">{t.disabled}</option></select></div><label>{t.value}<textarea rows={2} value={jsonDrafts[rule.rule_key] ?? JSON.stringify(rule.rule_value)} onChange={event => setJsonDrafts(current => ({ ...current, [rule.rule_key]: event.target.value }))}/></label><button className={styles.action} disabled={busy} onClick={() => void saveRule(rule)}>{t.save}</button></article>)}
      </>}
      {tab === "retention" && <><div className={styles.sectionHead}><h2>{t.retention}</h2><p>{t.preserve}</p></div>
        {retention.map(item => <article className={styles.card} key={item.category}><div className={styles.cardHead}><div><span>RETENTION POLICY</span><h3>{item.category}</h3></div><label className={styles.toggle}><input type="checkbox" checked={item.enabled} onChange={event => updateRetention(item.category, { enabled: event.target.checked })}/>{t.enabled}</label></div><div className={styles.fields}><label>{t.days}<input type="number" min="1" max="3650" value={item.retention_days ?? ""} placeholder="∞" onChange={event => updateRetention(item.category, { retention_days: event.target.value ? Number(event.target.value) : null })}/></label><label>{t.warning}<input type="number" min="0" max="365" value={item.warning_days} onChange={event => updateRetention(item.category, { warning_days: Number(event.target.value) })}/></label><label>{t.action}<select value={item.expiry_action} onChange={event => updateRetention(item.category, { expiry_action: event.target.value as RetentionRow["expiry_action"] })}><option value="archive">{t.archive}</option><option value="delete">{t.delete}</option></select></label></div><label className={styles.toggle}><input type="checkbox" checked={item.preserve_shared_memories} onChange={event => updateRetention(item.category, { preserve_shared_memories: event.target.checked })}/>{t.preserve}</label><button className={styles.action} disabled={busy} onClick={() => void saveRetention(item)}>{t.saveRetention}</button></article>)}
      </>}
      {tab === "cleanup" && <><div className={styles.sectionHead}><h2>{t.cleanup}</h2><p>{t.previewNote}</p></div><article className={styles.card}><div className={styles.cardHead}><div><h3>{t.sweep}</h3><p>{t.sweepNote}</p></div><button className={styles.action} disabled={busy} onClick={() => void loadSweep()}>{t.sweep}</button></div>{sweep.length===0 ? null : <div className={styles.storageGrid}>{sweep.map(row => <article className={styles.card} key={row.category}><span>{row.category}</span><strong>{row.candidates}</strong><small>{t.sweepCandidates} · {row.oldest ? new Date(row.oldest).toLocaleString(isAr ? "ar-EG" : "en") : "—"}</small></article>)}</div>}</article><article className={styles.card}><div className={styles.scopeGrid}>{categories.map(category => <label key={category} className={styles.toggle}><input type="checkbox" checked={scope.includes(category)} onChange={event => setScope(current => event.target.checked ? [...current, category] : current.filter(item => item !== category))}/>{category}</label>)}</div><hr/><label className={styles.toggle}><input type="checkbox" checked={preserveChat} onChange={event => setPreserveChat(event.target.checked)}/>{t.preserveChat}</label><label className={styles.toggle}><input type="checkbox" checked={preserveMemories} onChange={event => setPreserveMemories(event.target.checked)}/>{t.preserveMemories}</label><label>{t.reason}<textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={500}/></label><p className={styles.warning}>{t.requestOnly}</p><button className={styles.action} disabled={busy || !scope.length} onClick={() => void createPreview()}>{t.preview}</button></article><div className={styles.sectionHead}><h2>{t.request}</h2></div>{jobs.map(job => <article className={styles.card} key={job.id}><div className={styles.cardHead}><h3>{job.status.toUpperCase()}</h3><time>{new Date(job.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</time></div><p>{job.scope.join(" · ")}</p><small>{job.preserve_chat_history ? t.preserveChat : ""} {job.preserve_shared_memories ? t.preserveMemories : ""}</small><div className={styles.metrics}><span>{t.items}: {job.estimated_items ?? "—"}</span><span>{t.recovered}: {job.estimated_bytes == null ? "—" : bytes(job.estimated_bytes)}</span></div><p>{job.reason}</p><div style={{display:"flex",gap:8,marginTop:10}}>{["preview","failed"].includes(job.status) && <button className={styles.action} disabled={busy} onClick={() => void jobAction(job.id, "queue")}>{t.queueJob}</button>}{["queued","running"].includes(job.status) && <button className={styles.action} disabled={busy || !canRunCleanup} title={canRunCleanup ? undefined : t.runOwnerOnly} onClick={() => void jobAction(job.id, "run")}>{t.runJob}</button>}{["preview","queued"].includes(job.status) && <button className={styles.action} disabled={busy} onClick={() => void jobAction(job.id, "cancel")}>{t.cancelJob}</button>}</div></article>)}</>}
      {tab === "storage" && <><div className={styles.sectionHead}><h2>{t.storage}</h2><p>{t.storageNote}</p><button className={styles.action} disabled={busy} onClick={()=>void loadStorageControlRoom()}>{t.storageLoad}</button></div>
        <div className={styles.storageGrid}>{Object.entries(storageTotals).map(([category,total])=><article className={styles.card} key={category}><span>{category}</span><strong>{bytes(total.bytes)}</strong><small>{total.objects.toLocaleString()} {t.objects}</small></article>)}</div>{!Object.keys(storageTotals).length&&<p>{t.noRows}</p>}
        <article className={styles.card}><h3>{t.storagePolicyTitle}</h3><p>{t.storageQuotaNote}</p>{storagePolicy&&<div className={styles.metrics}><span>{t.storageActual}: {bytes(Number(storagePolicy.actual_verified_capacity_bytes))}</span><span>{t.used}: {bytes(Number(storagePolicy.target_total_capacity_bytes))} target</span></div>}<div className={styles.fields}><label>{t.storageTarget}<input type="number" min="1" max="1048576" step="1" value={storageTargetGiB} onChange={e=>setStorageTargetGiB(e.target.value)}/></label><label>{t.storageMonthly}<input type="number" min="1" max="1048576" step="1" value={storageMonthlyGiB} onChange={e=>setStorageMonthlyGiB(e.target.value)}/></label><label>{t.storageMonthlyHard}<input type="number" min="1" max="1048576" step="1" value={storageMonthlyHardGiB} onChange={e=>setStorageMonthlyHardGiB(e.target.value)}/></label></div><label>{t.storageReason}<textarea rows={2} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><button className={styles.action} disabled={busy} onClick={()=>void saveGlobalStoragePolicy()}>{t.storageApply}</button></article>
        <article className={styles.card}><h3>{t.storageProviderTitle}</h3>{storageProviders.length===0?<p>{t.noRows}</p>:storageProviders.map(provider=><div className={styles.card} key={provider.provider_key}><div className={styles.cardHead}><div><h4>{provider.provider_key}</h4><small>{provider.provider_kind} · {provider.billing_mode}</small></div><strong className={provider.enabled?styles.ok:styles.warning}>{provider.enabled?t.active:t.disabled}</strong></div><div className={styles.metrics}><span>{bytes(Number(provider.used_bytes)+Number(provider.reserved_bytes))} / {bytes(Number(provider.capacity_bytes))}</span><span>{provider.hard_stop_percent}% safety stop</span><span>{provider.monthly_read_ops.toLocaleString()} / {provider.monthly_read_ops_limit.toLocaleString()} reads</span><span>{bytes(Number(provider.monthly_egress_bytes))} / {bytes(Number(provider.monthly_egress_bytes_limit))} egress</span></div><small>{t.storageProviderReady}: {provider.adapter_ready?"Yes":"No"} · {t.storageZeroCost}: {provider.zero_cost_verified?"Yes":"No"} · {t.storageSnapshot}: {provider.snapshot_fresh?"Yes":"No"}</small><div style={{display:"flex",gap:8,marginTop:8}}><button className={styles.action} disabled={busy||(!provider.enabled&&(!provider.adapter_ready||!provider.zero_cost_verified||!provider.snapshot_fresh))} title={!provider.enabled&&(!provider.adapter_ready||!provider.zero_cost_verified||!provider.snapshot_fresh)?t.storageNotReady:undefined} onClick={()=>void setStorageProviderEnabled(provider,!provider.enabled)}>{provider.enabled?t.storageQuarantine:t.storageEnable}</button></div></div>)}</article>
        <article className={styles.card}><h3>{t.storageRoleTitle}</h3><p>{t.storageQuotaNote}</p><div className={styles.fields}><label>{t.storageRoleLabel}<select value={storageRoleTier} onChange={e=>setStorageRoleTier(e.target.value as typeof storageRoleTier)}><option value="creator">Creator</option><option value="streamer">Streamer</option><option value="combined">Creator + Streamer</option></select></label><label>{t.storageGiB}<input type="number" min="0" max="1024" step="0.25" value={storageRoleGiB} onChange={e=>setStorageRoleGiB(e.target.value)}/></label></div><label>{t.storageReason}<textarea rows={2} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><button className={styles.action} disabled={busy} onClick={()=>void saveStorageRoleQuota()}>{t.storageApply}</button></article>
        <article className={styles.card}><h3>{t.storageUserTitle}</h3><label>{t.storageUserId}<input value={storageUserId} onChange={e=>setStorageUserId(e.target.value)} placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"/></label><label>{t.storageGiB}<input type="number" min="0" max="1024" step="0.25" value={storageUserGiB} onChange={e=>setStorageUserGiB(e.target.value)}/></label><label>{t.storageReason}<textarea rows={2} value={reason} onChange={e=>setReason(e.target.value)} maxLength={500}/></label><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className={styles.action} disabled={busy||!storageUserId.trim()} onClick={()=>void saveStorageUserQuota(false)}>{t.storageApply}</button><button className={styles.action} disabled={busy||!storageUserId.trim()} onClick={()=>void saveStorageUserQuota(true)}>{t.storageReset}</button></div></article>
      </>}
      {tab === "quotas" && <><div className={styles.sectionHead}><h2>{t.quotas}</h2><p>{t.quotaNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadQuotas()}>{t.quotaLoad}</button></div>{quotas.length===0 ? <p>{t.quotaEmpty}</p> : <div className={styles.storageGrid}>{quotas.map(row => <article className={styles.card} key={row.rule_key}><span>{row.rule_key}</span><strong>{row.rejections.toLocaleString()}</strong><small>{t.quotaRejections} · {t.quotaLimit} {row.limit_value} · {row.distinct_users} {t.quotaUsers}{row.last_rejected ? ` · ${t.quotaLast} ${new Date(row.last_rejected).toLocaleString(isAr ? "ar-EG" : "en")}` : ""}</small></article>)}</div>}</>}
      {tab === "jobs" && <><div className={styles.sectionHead}><h2>{t.jobs}</h2><p>{t.jobsNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadBgJobs()}>{t.jobsLoad}</button></div><div className={styles.metrics}><span>{t.jobsQueued}: {bgJobStats.by_status?.queued ?? 0}</span><span>{t.jobsRunning}: {bgJobStats.by_status?.running ?? 0}</span><span>{t.jobsFailed}: {bgJobStats.by_status?.failed ?? 0}</span><span>{t.jobsStuck}: {bgJobStats.stuck_running ?? 0}</span><span>{t.cleanupPending}: {cleanupStats.pending ?? 0}</span><span>{t.cleanupFailed}: {cleanupStats.failed ?? 0}</span><span>{t.cleanupDeleted}: {cleanupStats.deleted ?? 0}</span></div>{bgJobs.length===0 ? <p>{t.jobsEmpty}</p> : <div className={styles.storageGrid}>{bgJobs.map(job => <article className={styles.card} key={job.job_id}><div className={styles.cardHead}><h3>{job.kind}</h3><span className={styles.warning}>{job.status}</span></div><small>{t.jobsAttempts}: {job.attempts}/{job.max_attempts} · {new Date(job.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</small>{job.last_error ? <p className={styles.warning}>{job.last_error}</p> : null}<div style={{display:"flex",gap:8,marginTop:8}}>{job.status === "failed" && <button className={styles.action} disabled={busy} onClick={() => void bgJobControl(job.job_id, "retry")}>{t.jobsRetry}</button>}{["queued","running","failed"].includes(job.status) && <button className={styles.action} disabled={busy} onClick={() => void bgJobControl(job.job_id, "cancel")}>{t.jobsCancel}</button>}</div></article>)}</div>}</>}
      {tab === "telemetry" && <><div className={styles.sectionHead}><h2>{t.telemetry}</h2><p>{t.telemetryNote}</p><div style={{display:"flex",gap:8}}><button className={styles.action} disabled={busy} onClick={() => void loadTelemetry()}>{t.telemetryLoad}</button><button className={styles.action} disabled={busy} onClick={() => void pruneTelemetry()}>{t.telemetryPrune}</button></div></div><div className={styles.metrics}><span>{t.telemetryErrors}: {telemetrySummary.errors ?? 0}</span><span>{t.telemetryP50}: {telemetrySummary.latency_p50_ms ?? "—"}</span><span>{t.telemetryP95}: {telemetrySummary.latency_p95_ms ?? "—"}</span></div>{telemetry.length===0 ? <p>{t.telemetryEmpty}</p> : <div className={styles.storageGrid}>{telemetry.map(ev => <article className={styles.card} key={ev.event_id}><div className={styles.cardHead}><h3>{ev.event_type}</h3><span className={ev.severity==="error"||ev.severity==="critical"?styles.critical:ev.severity==="warning"?styles.warning:styles.ok}>{ev.severity}</span></div><small>{ev.surface || "—"}{ev.duration_ms!=null ? ` · ${ev.duration_ms} ms` : ""} · {new Date(ev.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</small><p>{ev.message}</p></article>)}</div>}</>}
      {tab === "capacity" && <><div className={styles.sectionHead}><h2>{t.capacity}</h2><p>{t.capacityNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadCapacity()}>{t.capacityLoad}</button></div>{capacity.length===0 ? <p>{t.capacityEmpty}</p> : <div className={styles.storageGrid}>{capacity.map(row => <article className={styles.card} key={row.metric}><span>{row.metric}</span><strong className={row.state==="critical"?styles.critical:row.state==="warning"?styles.warning:styles.ok}>{row.used ?? "—"}{row.usage_percent!=null ? ` (${row.usage_percent}%)` : ""}</strong><small>{t.capacityLimit} {row.limit_value.toLocaleString()} {row.unit} · {t.capacityHeadroom} {row.headroom ?? "—"} · {row.enabled ? t.active : t.disabled}</small></article>)}</div>}</>}
      {tab === "live" && <><div className={styles.sectionHead}><h2>{t.live}</h2><p>{t.liveNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadLive()}>{t.liveLoad}</button></div>{!liveOverview ? <p>{t.noRows}</p> : <div className={styles.metrics}><span>{t.liveLive}: {liveOverview.live ?? 0}</span><span>{t.liveReplay}: {liveOverview.replay ?? 0}</span><span>{t.liveModerated}: {liveOverview.moderated ?? 0}</span><span>{t.liveDegraded}: {liveOverview.degraded ?? 0}</span><span>{t.liveReplayHours}: {liveOverview.replay_retention_hours ?? "—"}</span><span>{t.liveMaxDuration}: {liveOverview.max_duration_seconds ?? "—"}</span><span>{t.liveMaxConcurrent}: {liveOverview.max_concurrent_streams ?? "—"}</span></div>}</>}
      {tab === "sponsors" && <PlatformSponsorManagement />}
      {tab === "revenue" && <PlatformRevenueOverview />}
      {tab === "integrity" && <CampaignIntegrity isArabic={isAr} />}
      {tab === "moderation" && <><div className={styles.sectionHead}><h2>{t.modQueue}</h2><p>{t.modContent} · {t.modSafety}</p><div style={{display:"flex",gap:8,alignItems:"center"}}><select value={modStatus} onChange={e=>{const v=e.target.value as typeof modStatus;setModStatus(v);void loadModQueue(v)}} aria-label={t.modQueue}>{["open","reviewing","resolved","dismissed"].map(s=><option key={s} value={s}>{s}</option>)}</select><button className={styles.action} disabled={busy} onClick={()=>void loadModQueue()}>{t.modLoad}</button></div></div>
        <label>{t.modNote}<input value={modNote} onChange={e=>setModNote(e.target.value)} maxLength={500}/></label>
        {modQueue.length===0 ? <p>{t.modEmpty}</p> : <div className={styles.storageGrid}>{modQueue.map(row=><article className={styles.card} key={row.kind+row.report_id}><div className={styles.cardHead}><h3>{row.kind==="safety"?t.modSafety:t.modContent} · {row.reason}</h3><span className={row.status==="open"?styles.warning:styles.ok}>{row.status}</span></div><small>{row.target_type} · {t.modReporter}: {row.reporter_handle??"—"} · {new Date(row.created_at).toLocaleString(isAr?"ar-EG":"en")}</small>{row.target_preview?<p>{row.target_preview}</p>:null}{row.details?<p className={styles.warning}>{row.details}</p>:null}<div style={{display:"flex",gap:8,marginTop:8}}><button className={styles.action} disabled={busy} onClick={()=>void resolveReport(row.kind,row.report_id,"reviewing")}>{t.modReview}</button><button className={styles.action} disabled={busy} onClick={()=>void resolveReport(row.kind,row.report_id,"resolved")}>{t.modResolve}</button><button className={styles.action} disabled={busy} onClick={()=>void resolveReport(row.kind,row.report_id,"dismissed")}>{t.modDismiss}</button></div></article>)}</div>}
      </>}
      {tab === "roles" && <><article className={styles.card}><div className={styles.cardHead}><div><h3>{t.caps}</h3><p>{t.capsNote}</p></div></div><div className={styles.metrics}>{caps.map(item => <span key={item.capability}>{item.capability} · {t.capsRequired} {item.required_role} · {item.allowed ? t.capsYes : t.capsNo}</span>)}</div></article><div className={styles.sectionHead}><h2>{t.roles}</h2><p>{t.ownerOnly}</p></div>{admins.map(item => <article className={styles.card} key={item.user_id}><div className={styles.cardHead}><div><span>{item.active?t.accessActive:t.accessSuspended}</span><h3>{item.display_name ?? item.handle ?? item.user_id}</h3><p>@{item.handle ?? "—"}</p></div><label>{t.role}<select value={item.role} disabled={busy || item.role === "owner"} onChange={event => void changeRole(item.user_id, event.target.value)}><option value="admin">admin</option><option value="creator">creator</option><option value="streamer">streamer</option><option value="editor">editor</option><option value="moderator">moderator</option><option value="analyst">analyst</option>{item.role === "owner" && <option value="owner">owner</option>}</select></label></div>{item.role !== "owner" && <button className={styles.action} disabled={busy} onClick={() => void toggleActive(item.user_id, !item.active)}>{item.active ? t.suspend : t.reactivate}</button>}</article>)}</>}
      {tab === "audit" && <><div className={styles.sectionHead}><h2>{t.audit}</h2><p>Append-only administrative history.</p></div><article className={styles.card}><b>{t.auditFilter}</b><div className={styles.fields}><label>{t.auditAction}<input value={auditAction} onChange={event => setAuditAction(event.target.value)} placeholder="safety_report_resolved"/></label><label>{t.auditActor}<input value={auditActor} onChange={event => setAuditActor(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000"/></label></div><div style={{display:"flex",gap:8}}><button className={styles.action} disabled={busy} onClick={() => void loadAudit()}>{t.auditApply}</button><button className={styles.action} onClick={() => { setAuditAction(""); setAuditActor(""); }}>{t.auditClear}</button></div></article>{!audit.length && <p>{t.auditEmpty}</p>}{audit.map(entry => <article className={styles.card} key={entry.id}><div className={styles.cardHead}><h3>{entry.action}</h3><time>{new Date(entry.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</time></div><p>{entry.target_type} · {entry.target_id ?? "—"}</p><p>{entry.reason}</p><pre>{JSON.stringify(entry.details, null, 2)}</pre></article>)}</>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
    </section>
    <footer className={styles.footer}>RAYE2 ADMIN · {t.ownerGuard} · NO AUTOMATIC DELETION FROM THIS SCREEN</footer>
  </main>;
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";
import PlatformSponsorManagement from "./platform-sponsor-management";
import PlatformRevenueOverview from "./platform-revenue-overview";
import CampaignIntegrity from "./campaign-integrity";
import ByosConnections from "./byos-connections";
import StorageProviders from "./storage-providers";
import YouTubeChannelSources from "./youtube-channel-sources";
import ShellBrand from "@/app/raye2-shell/shell-brand";

type ScheduledAppearanceEvent = { id: string; name: string; enabled: boolean; startsAt: string; endsAt: string; accent: string; displayFont: string; chalkTexture: string; theme: string; colorMode: string };
type SiteConfigDraft = { [key: string]: unknown; appearance?: { [key: string]: unknown; eventThemes?: ScheduledAppearanceEvent[] } };
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
export type AuditRow = { id: number; actor_id: string | null; action: string; target_type: string; target_id: string | null; reason: string; details: Record<string, unknown>; created_at: string };
export type HealthRow = { metric: string; value: number; state: "ok" | "warning" | "critical" };
export type AdminRow = { user_id: string; handle: string | null; display_name: string | null; role: string; active: boolean; created_at: string };
export type MemberDirectoryRow = { user_id: string; handle: string | null; display_name: string | null; avatar_url: string | null; visibility: string; created_at: string; updated_at: string; restrictions: Array<{ action: string; feature: string; reason: string; status: string; expires_at: string | null; created_at: string }> };
export type CapRow = { capability: string; required_role: string; allowed: boolean; description: string };
export type FabricRow = { section: string; key: string; label: string; value_numeric: number | null; value_text: string | null; enabled: boolean; detail: string };

type Locale = "en" | "ar";
type TabId = "members" | "appearance" | "rules" | "retention" | "cleanup" | "storage" | "audit" | "sponsors" | "revenue" | "health" | "roles" | "quotas" | "jobs" | "telemetry" | "capacity" | "fabric" | "providers" | "byos" | "live" | "integrity" | "moderation" | "channels";
const bytes = (value: number) => value < 1024 ? value + " B" : value < 1024 ** 2 ? (value / 1024).toFixed(1) + " KB" : value < 1024 ** 3 ? (value / 1024 ** 2).toFixed(1) + " MB" : (value / 1024 ** 3).toFixed(2) + " GB";

export default function Raye2AdminClient({ locale, logoUrl, initialRules, initialRetention, initialJobs, initialStorage, initialAudit, initialHealth, initialAdmins, initialCaps, initialFabric, initialMembers }: {
  locale: Locale; logoUrl: string | null; initialRules: RuleRow[]; initialRetention: RetentionRow[]; initialJobs: CleanupRow[]; initialStorage: StorageRow[]; initialAudit: AuditRow[]; initialHealth: HealthRow[]; initialAdmins: AdminRow[]; initialCaps: CapRow[]; initialFabric: FabricRow[]; initialMembers: MemberDirectoryRow[];
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [tab, setTab] = useState<TabId>("health");
  const [siteDraft, setSiteDraft] = useState<SiteConfigDraft | null>(null);
  const [siteRevision, setSiteRevision] = useState<number | null>(null);
  const [siteBusy, setSiteBusy] = useState(false);
  const [assetBusy, setAssetBusy] = useState(false);
  const [restoreVersion, setRestoreVersion] = useState("1");
  const [eventName, setEventName] = useState("");
  const [eventStartsAt, setEventStartsAt] = useState("");
  const [eventEndsAt, setEventEndsAt] = useState("");
  const [eventAccent, setEventAccent] = useState("#7dd3fc");
  const [eventFont, setEventFont] = useState("Fredericka the Great");
  const [eventTheme, setEventTheme] = useState("obsidian");
  const [previewEventId, setPreviewEventId] = useState<string | null>(null);
  const scheduledEvents: ScheduledAppearanceEvent[] = Array.isArray(siteDraft?.appearance?.eventThemes) ? siteDraft.appearance.eventThemes : [];
  const [navSearch, setNavSearch] = useState("");
  const [roleSearch, setRoleSearch] = useState("");
  const [modQueue, setModQueue] = useState<Array<{kind:string;report_id:string;target_type:string;target_id:string;reason:string;details:string;status:string;created_at:string;reporter_handle:string|null;target_preview:string|null}>>([]);
  const [modStatus, setModStatus] = useState<"open"|"reviewing"|"resolved"|"dismissed">("open");
  const [modNote, setModNote] = useState("");
  const [rules, setRules] = useState(initialRules);
  const [retention, setRetention] = useState(initialRetention);
  const [jobs, setJobs] = useState(initialJobs);
  const [admins, setAdmins] = useState(initialAdmins);
  const [memberSearch, setMemberSearch] = useState("");
  const [memberStatusFilter, setMemberStatusFilter] = useState("all");
  const filteredMembers = useMemo(() => { const query = memberSearch.trim().toLowerCase(); return initialMembers.filter(member => { const matchesQuery = !query || [member.handle, member.display_name, member.user_id].some(value => String(value ?? "").toLowerCase().includes(query)); const activeRestrictions = member.restrictions.filter(item => item.status === "active" && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now())); const matchesStatus = memberStatusFilter === "all" || (memberStatusFilter === "restricted" ? activeRestrictions.length > 0 : activeRestrictions.length === 0); return matchesQuery && matchesStatus; }); }, [initialMembers, memberSearch, memberStatusFilter]);
  const filteredAdmins = useMemo(() => { const query = roleSearch.trim().toLowerCase(); if (!query) return admins; return admins.filter(item => [item.handle, item.display_name, item.user_id, item.role, item.active ? "active" : "suspended"].some(value => String(value ?? "").toLowerCase().includes(query))); }, [admins, roleSearch]);
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
  const [fabric, setFabric] = useState<FabricRow[]>(initialFabric);
  const [fabricAllowanceRole, setFabricAllowanceRole] = useState("user");
  const [fabricAllowanceBytes, setFabricAllowanceBytes] = useState("2147483648");
  const [fabricOverrideUser, setFabricOverrideUser] = useState("");
  const [fabricOverrideBytes, setFabricOverrideBytes] = useState("21474836480");
  const [fabricCeilingBytes, setFabricCeilingBytes] = useState("786432000");
  const [liveOverview, setLiveOverview] = useState<Record<string, number> | null>(null);
  const [audit, setAudit] = useState(initialAudit);
  const [auditAction, setAuditAction] = useState("");
  const [auditActor, setAuditActor] = useState("");
  const [jsonDrafts, setJsonDrafts] = useState<Record<string, string>>({});
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [scope, setScope] = useState<string[]>(["temporary_uploads", "failed_encodes", "voice_recordings", "watch_sessions"]);
  const [preserveChat, setPreserveChat] = useState(true);
  const [preserveMemories, setPreserveMemories] = useState(true);
  const isAr = locale === "ar";
  const t = isAr ? {
    eyebrow:"RAYE2 / تحكم المنصة", title:"قواعد واضحة. تحكم آمن.", intro:"إدارة الحدود والاحتفاظ والتنظيف من مكان واحد. التغييرات الحساسة تمر عبر عمليات محمية وسجل تدقيق.", back:"العودة إلى Raye2", rules:"القواعد", retention:"الاحتفاظ", cleanup:"معاينة التنظيف", storage:"التخزين", audit:"سجل التدقيق", status:"الحالة", category:"التصنيف", value:"القيمة (JSON)", save:"حفظ القاعدة", description:"الوصف", proposed:"مقترح", active:"مفعّل", disabled:"معطّل", reason:"سبب التغيير (مطلوب)", days:"أيام الاحتفاظ", warning:"أيام التنبيه قبل الانتهاء", action:"الإجراء عند الانتهاء", archive:"أرشفة", delete:"حذف", enabled:"تفعيل السياسة", preserve:"حماية الذكريات المشتركة", saveRetention:"حفظ سياسة الاحتفاظ", scope:"الفئات المطلوب مراجعتها", preserveChat:"استثناء سجل المحادثات", preserveMemories:"استثناء الذكريات المشتركة", preview:"إنشاء طلب معاينة", previewNote:"هذا يسجل طلب مراجعة فقط. لا يتم حذف أي محتوى من هذه الصفحة، ويُحسب عدد العناصر والمساحة المقدّرة وقت المعاينة.", request:"الطلبات الأخيرة", items:"العناصر", recovered:"المساحة المقدّرة", storageNote:"هذه لقطات قياس مخزنة، وليست عدّادًا لحظيًا أو ضمانًا للسعة المتاحة.", objects:"ملفات", used:"المساحة", noRows:"لا توجد بيانات بعد.", saved:"تم حفظ التغيير.", error:"تعذر تنفيذ العملية. تحقق من الصلاحيات والاتصال.", reasonRequired:"اكتب سببًا واضحًا قبل الحفظ.", selectScope:"اختر فئة واحدة على الأقل.", requestOnly:"طلب معاينة — لا حذف", created:"تم تسجيل طلب المعاينة.", ownerGuard:"هذه الصفحة متاحة للمالك والمسؤول فقط.", sponsors:"رعاة المنصة",revenue:"الإيرادات والرعايات",health:"صحة المنصة",roles:"الأدوار والوصول",stateOk:"جيد",stateWarning:"تحذير",stateCritical:"حرج",roleChanged:"تم تحديث الدور.",roleChangeError:"تعذر تحديث الدور.",suspend:"إيقاف",reactivate:"إعادة تفعيل",accessActive:"نشط",accessSuspended:"موقوف",role:"الدور",healthNote:"عدّادات مجمّعة للمنصة. يُصنّف التخزين وفق الحدود المعرّفة في محرك القواعد.",noHealth:"لا توجد بيانات صحة بعد.",ownerOnly:"تعيين الأدوار متاح للمالك فقط.",caps:"مصفوفة الصلاحيات",capsNote:"ما يمكنك فعله بهذا الدور، وما يتطلب المالك.",capsRequired:"يتطلب",capsYes:"مسموح",capsNo:"مقيد",runOwnerOnly:"تنفيذ الحذف متاح للمالك فقط.",auditFilter:"تصفية سجل التدقيق",auditAction:"الإجراء",auditActor:"معرّف الفاعل",auditApply:"تصفية",auditClear:"مسح",auditEmpty:"لا توجد سجلات مطابقة.",auditFail:"تعذر تحميل سجل التدقيق.",queueJob:"جدولة",runJob:"تنفيذ",cancelJob:"إلغاء",jobQueued:"تمت جدولة المهمة.",jobRan:"تم تنفيذ المهمة.",jobCancelled:"تم إلغاء المهمة.",jobError:"تعذر تحديث المهمة.",sweep:"معاينة الاحتفاظ",sweepNote:"ما الذي ستحذفه السياسات المفعّلة الآن.",sweepCategory:"الفئة",sweepCandidates:"المرشحون",sweepNone:"لا توجد سياسات احتفاظ مفعّلة.",sweepOldest:"الأقدم",quotas:"الحصص",quotaNote:"الاستخدام والمحاولات المرفوضة لكل قاعدة نشطة قابلة للقياس.",quotaRule:"القاعدة",quotaLimit:"الحد",quotaRejections:"المرفوضة",quotaUsers:"حسابات متأثرة",quotaLast:"آخر رفض",quotaEmpty:"لا توجد حصص قابلة للقياس.",quotaLoad:"تحديث الحصص",jobs:"المهام",jobsNote:"مهام الخلفية الدائمة: قائمة الانتظار وإعادة المحاولة والفشل والركود.",jobsEmpty:"لا توجد مهام بعد.",jobsLoad:"تحديث المهام",jobsQueued:"قيد الانتظار",jobsRunning:"قيد التنفيذ",jobsFailed:"فاشلة",jobsStuck:"عالقة",cleanupPending:"تنظيف معلّق",cleanupFailed:"تنظيف فاشل",cleanupDeleted:"محذوف",jobsRetry:"إعادة المحاولة",jobsCancel:"إلغاء",jobsByStatus:"حسب الحالة",jobsByKind:"حسب النوع",jobsAttempts:"المحاولات",jobsRetried:"تمت إعادة جدولة المهمة.",jobsCancelled:"تم إلغاء المهمة.",jobsError:"تعذر تحديث المهمة.",telemetry:"القياس",telemetryNote:"أخطاء العميل وزمن استجابة الواجهة البرمجية وجودة الوقت الحقيقي.",telemetryEmpty:"لا توجد أحداث قياس.",telemetryLoad:"تحديث القياس",telemetryErrors:"أخطاء",telemetryP50:"الوسيط (مللي ثانية)",telemetryP95:"الشريحة 95 (مللي ثانية)",telemetryByType:"حسب النوع",telemetrySeverity:"حسب الخطورة",telemetryPrune:"تقليم القديم",telemetryPruned:"تم تقليم الأحداث القديمة.",telemetryError:"تعذر تحميل القياس.",capacity:"السعة",capacityNote:"حدود المزود والاستخدام الحالي والمهلة المتبقية لكل مقياس.",capacityEmpty:"لا توجد حدود سعة.",capacityLoad:"تحديث السعة",capacityUsage:"الاستخدام",capacityLimit:"الحد",capacityHeadroom:"المتبقي",capacityState:"الحالة",capacityError:"تعذر تحميل السعة.",fabric:"نسيج التخزين",fabricNote:"مزودون ضمن الطبقة المجانية، وحصص شهرية لكل دور، وتجاوزات لكل حساب، وسقف المنصة.",fabricEmpty:"لا توجد بيانات لنسيج التخزين.",fabricLoad:"تحديث",fabricProvider:"المزودون",fabricAllowance:"الحصص الشهرية",fabricOverride:"تجاوزات الحسابات",fabricSetting:"سقف المنصة",fabricEnabled:"مفعّل",fabricDisabled:"معطّل",fabricRole:"الدور",fabricBytes:"بايت / شهر",fabricUser:"معرّف الحساب",fabricSave:"حفظ",fabricCeiling:"السقف (بايت)",fabricError:"تعذر تحميل أو تحديث نسيج التخزين.",fabricOwnerOnly:"تعديل نسيج التخزين متاح للمالك أو المسؤول فقط.",live:"البث",liveNote:"البث النشط والإعادات وصحة الاتصال.",liveLoad:"تحديث البث",liveLive:"مباشر الآن",liveReplay:"إعادات",liveModerated:"موقوف للمراجعة",liveDegraded:"متدهور",liveReplayHours:"الاحتفاظ بالإعادة (س)",liveMaxDuration:"أقصى مدة (ث)",liveMaxConcurrent:"أقصى تزامن",liveError:"تعذر تحميل نظرة البث.",modQueue:"قائمة المراجعة",modNote:"ملاحظة الحل",modLoad:"تحديث القائمة",modEmpty:"لا توجد تقارير بهذه الحالة.",modResolve:"حل",modDismiss:"تجاهل",modReview:"قيد المراجعة",modResolved:"تم تحديث التقرير.",modError:"تعذر تحميل القائمة أو تحديثها.",modContent:"محتوى",modSafety:"سلامة",modReporter:"المُبلِّغ"
  } : {
    eyebrow:"RAYE2 / PLATFORM CONTROL", title:"Clear rules. Safer control.", intro:"Manage limits, retention and cleanup in one place. Sensitive changes use guarded operations and an audit trail.", back:"Back to Raye2", rules:"Rules", retention:"Retention", cleanup:"Cleanup review", storage:"Storage", audit:"Audit log", status:"Status", category:"Category", value:"Value (JSON)", save:"Save rule", description:"Description", proposed:"Proposed", active:"Active", disabled:"Disabled", reason:"Reason for this change (required)", days:"Retention days", warning:"Warning days before expiry", action:"Expiry action", archive:"Archive", delete:"Delete", enabled:"Enable policy", preserve:"Protect Shared Memories", saveRetention:"Save retention policy", scope:"Categories to review", preserveChat:"Exclude chat history", preserveMemories:"Exclude Shared Memories", preview:"Create review request", previewNote:"This records a review request only. This page does not delete content; affected records and estimated storage are computed at review time.", request:"Recent requests", items:"Estimated items", recovered:"Estimated recovery", storageNote:"These are stored measurement snapshots, not a live counter or a promise of available capacity.", objects:"Objects", used:"Used", noRows:"No data yet.", saved:"Change saved.", error:"The operation failed. Check permissions and connection.", reasonRequired:"Enter a clear reason before saving.", selectScope:"Select at least one category.", requestOnly:"Review request — no deletion", created:"Review request recorded.", ownerGuard:"This page is restricted to owners and admins.", sponsors:"Platform sponsors",revenue:"Revenue & finance",health:"Platform health",roles:"Roles & access",stateOk:"OK",stateWarning:"Warning",stateCritical:"Critical",roleChanged:"Role updated.",roleChangeError:"Could not update the role.",suspend:"Suspend",reactivate:"Reactivate",accessActive:"Active",accessSuspended:"Suspended",role:"Role",healthNote:"Aggregate platform counters. Storage is classified against the thresholds in the rules engine.",noHealth:"No health data yet.",ownerOnly:"Role assignment is restricted to the owner.",caps:"Capability matrix",capsNote:"What your role may do, and what requires the owner.",capsRequired:"Requires",capsYes:"Allowed",capsNo:"Restricted",runOwnerOnly:"Running a deletion is restricted to the owner.",auditFilter:"Filter audit log",auditAction:"Action",auditActor:"Actor ID",auditApply:"Apply",auditClear:"Clear",auditEmpty:"No matching entries.",auditFail:"Could not load the audit log.",queueJob:"Queue",runJob:"Run",cancelJob:"Cancel",jobQueued:"Job queued.",jobRan:"Job completed.",jobCancelled:"Job cancelled.",jobError:"Could not update the job.",sweep:"Retention sweep",sweepNote:"What enabled policies would remove right now.",sweepCategory:"Category",sweepCandidates:"Candidates",sweepNone:"No retention policies are enabled.",sweepOldest:"Oldest",quotas:"Quotas",quotaNote:"Usage and rejected attempts per measurable active rule.",quotaRule:"Rule",quotaLimit:"Limit",quotaRejections:"Rejected",quotaUsers:"Accounts",quotaLast:"Last rejected",quotaEmpty:"No measurable quotas.",quotaLoad:"Refresh quotas",jobs:"Jobs",jobsNote:"Durable background jobs: backlog, retries, failures and stuck leases.",jobsEmpty:"No jobs yet.",jobsLoad:"Refresh jobs",jobsQueued:"Queued",jobsRunning:"Running",jobsFailed:"Failed",jobsStuck:"Stuck",cleanupPending:"Cleanup pending",cleanupFailed:"Cleanup failed",cleanupDeleted:"Deleted",jobsRetry:"Retry",jobsCancel:"Cancel",jobsByStatus:"By status",jobsByKind:"By kind",jobsAttempts:"Attempts",jobsRetried:"Job requeued.",jobsCancelled:"Job cancelled.",jobsError:"Could not update the job.",telemetry:"Telemetry",telemetryNote:"Client errors, API latency and realtime quality.",telemetryEmpty:"No telemetry events.",telemetryLoad:"Refresh telemetry",telemetryErrors:"Errors",telemetryP50:"Median (ms)",telemetryP95:"p95 (ms)",telemetryByType:"By type",telemetrySeverity:"By severity",telemetryPrune:"Prune old",telemetryPruned:"Old events pruned.",telemetryError:"Could not load telemetry.",capacity:"Capacity",capacityNote:"Provider limits, current usage and headroom per metric.",capacityEmpty:"No capacity limits.",capacityLoad:"Refresh capacity",capacityUsage:"Usage",capacityLimit:"Limit",capacityHeadroom:"Headroom",capacityState:"State",capacityError:"Could not load capacity.",fabric:"Storage fabric",fabricNote:"Free-tier providers, per-role monthly allowances, per-account overrides and the platform ceiling.",fabricEmpty:"No storage fabric data.",fabricLoad:"Refresh",fabricProvider:"Providers",fabricAllowance:"Monthly allowances",fabricOverride:"Per-account overrides",fabricSetting:"Platform ceiling",fabricEnabled:"Enabled",fabricDisabled:"Disabled",fabricRole:"Role",fabricBytes:"Bytes / month",fabricUser:"Account ID",fabricSave:"Save",fabricCeiling:"Ceiling (bytes)",fabricError:"Could not load or update the storage fabric.",fabricOwnerOnly:"Only an owner or admin may change the storage fabric.",live:"Live",liveNote:"Active streams, replays and connection health.",liveLoad:"Refresh live",liveLive:"Live now",liveReplay:"Replays",liveModerated:"Moderated",liveDegraded:"Degraded",liveReplayHours:"Replay retention (h)",liveMaxDuration:"Max duration (s)",liveMaxConcurrent:"Max concurrent",liveError:"Could not load live overview.",modQueue:"Moderation queue",modNote:"Resolution note",modLoad:"Refresh queue",modEmpty:"No reports in this state.",modResolve:"Resolve",modDismiss:"Dismiss",modReview:"Reviewing",modResolved:"Report updated.",modError:"Could not load or update the queue.",modContent:"Content",modSafety:"Safety",modReporter:"Reporter"
  };
  const categories = ["direct_messages","group_messages","inactive_groups","voice_rooms","voice_recordings","voice_messages","chat_attachments","watch_sessions","temporary_uploads","failed_encodes","moments","minis","shared_memories"];
  const storageTotals = useMemo(() => initialStorage.reduce((acc, row) => {
    const item = acc[row.storage_class] ?? { objects: 0, bytes: 0 };
    item.objects += Number(row.object_count) || 0; item.bytes += Number(row.bytes_used) || 0; acc[row.storage_class] = item; return acc;
  }, {} as Record<string, { objects: number; bytes: number }>), [initialStorage]);

  async function loadSiteDraft() {
    if (!supabase || siteBusy) return;
    setSiteBusy(true);
    const { data, error } = await supabase.rpc("raye2_admin_get_site_config_draft");
    if (error || !data?.[0]) setNotice(isAr ? "تعذر تحميل إعدادات المظهر." : "Could not load appearance settings.");
    else { setSiteDraft(data[0].draft); setSiteRevision(Number(data[0].draft_revision)); }
    setSiteBusy(false);
  }
  async function uploadAppearanceAsset(file: File | undefined, kind: "logo" | "background" | "font") {
    if (!file || !supabase || assetBusy) return;
    const isFont = kind === "font";
    const allowed = isFont
      ? ["font/woff2", "font/woff", "font/ttf", "font/otf", "application/font-woff", "application/x-font-ttf", "application/octet-stream"]
      : ["image/png", "image/jpeg", "image/webp"];
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const validExt = isFont ? ["woff2", "woff", "ttf", "otf"].includes(ext) : ["png", "jpg", "jpeg", "webp"].includes(ext);
    if (!validExt || (!allowed.includes(file.type) && file.type !== "") || file.size > (isFont ? 4 : 8) * 1024 * 1024) {
      setNotice(isAr ? "نوع الملف أو حجمه غير مدعوم." : "Unsupported file type or size. Use WOFF2/WOFF/TTF/OTF up to 4 MB, or PNG/JPG/WebP up to 8 MB.");
      return;
    }
    setAssetBusy(true);
    const path = `brand/${kind}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("raye2-brand-assets").upload(path, file, { contentType: file.type || (ext === "woff2" ? "font/woff2" : ext === "woff" ? "font/woff" : ext === "ttf" ? "font/ttf" : ext === "otf" ? "font/otf" : "application/octet-stream"), cacheControl: "31536000", upsert: false });
    if (error) setNotice(error.message);
    else {
      const key = kind === "logo" ? "logoPath" : kind === "background" ? "backgroundPath" : "fontPath";
      patchAppearance({ [key]: path });
      if (kind === "font") patchAppearance({ customFontFamily: "Raye2CustomChalk", displayFont: "Custom chalk" });
      setNotice(isAr ? "تم رفع الملف إلى مسودة المظهر. احفظ المسودة أو انشرها." : "Asset uploaded and added to the appearance draft. Save or publish the draft.");
    }
    setAssetBusy(false);
  }

  function patchAppearance(patch: Record<string, unknown>) {
    setSiteDraft(current => current ? { ...current, appearance: { ...(current.appearance ?? {}), ...patch } } : current);
  }
  async function saveSiteDraft(publish: boolean) {
    if (!supabase || !siteDraft || siteRevision === null || siteBusy) return;
    setSiteBusy(true);
    const saved = await supabase.rpc("raye2_admin_save_site_config_draft", { p_config: siteDraft, p_expected_revision: siteRevision });
    if (saved.error || !saved.data?.[0]) { setNotice(isAr ? "تعذر حفظ المسودة. أعد تحميلها." : "Could not save draft. Reload and retry."); setSiteBusy(false); return; }
    const revision = Number(saved.data[0].new_revision); setSiteRevision(revision);
    if (publish) {
      const result = await supabase.rpc("raye2_admin_publish_site_config", { p_expected_revision: revision });
      setNotice(result.error ? (isAr ? "تم الحفظ لكن تعذر النشر." : "Saved, but publishing failed.") : (isAr ? "تم نشر المظهر." : "Appearance published."));
    } else setNotice(isAr ? "تم حفظ المسودة." : "Draft saved.");
    setSiteBusy(false);
  }
  async function restoreSiteDraft() {
    const version = Number(restoreVersion);
    if (!supabase || siteBusy || !Number.isSafeInteger(version) || version < 1) return;
    setSiteBusy(true);
    const { data, error } = await supabase.rpc("raye2_admin_restore_site_config_version", { p_version: version });
    if (error || !data?.[0]) setNotice(isAr ? "تعذرت الاستعادة." : "Could not restore version.");
    else { setSiteRevision(Number(data[0].new_revision)); setNotice(isAr ? "تمت الاستعادة إلى المسودة. انشرها عند الاستعداد." : "Restored to draft. Publish when ready."); await loadSiteDraft(); }
    setSiteBusy(false);
  }

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

  async function loadFabric() {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_storage_admin_overview");
    if (error) setNotice(t.fabricError);
    else setFabric((data ?? []) as FabricRow[]);
    setBusy(false);
  }

  async function saveAllowance() {
    if (!supabase || busy) return;
    if (reason.trim().length < 3) { setNotice(t.reasonRequired); return; }
    const monthly = Number(fabricAllowanceBytes);
    if (!Number.isSafeInteger(monthly) || monthly < 0) { setNotice(t.fabricError); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_set_storage_allowance", { p_role_key: fabricAllowanceRole, p_monthly_bytes: monthly, p_max_file_bytes: 52428800, p_reason: reason });
    if (error) setNotice(t.fabricError);
    else { setNotice(t.saved); setReason(""); await loadFabric(); }
    setBusy(false);
  }

  async function saveOverride() {
    if (!supabase || busy) return;
    if (reason.trim().length < 3) { setNotice(t.reasonRequired); return; }
    const monthly = Number(fabricOverrideBytes);
    if (!fabricOverrideUser.trim() || !Number.isSafeInteger(monthly) || monthly < 0) { setNotice(t.fabricError); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_set_storage_allowance_override", { p_owner_id: fabricOverrideUser.trim(), p_monthly_bytes: monthly, p_max_file_bytes: null, p_note: "", p_reason: reason });
    if (error) setNotice(t.fabricError);
    else { setNotice(t.saved); setReason(""); await loadFabric(); }
    setBusy(false);
  }

  async function saveCeiling() {
    if (!supabase || busy) return;
    if (reason.trim().length < 3) { setNotice(t.reasonRequired); return; }
    const ceiling = Number(fabricCeilingBytes);
    if (!Number.isSafeInteger(ceiling) || ceiling < 0) { setNotice(t.fabricError); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_set_storage_ceiling", { p_ceiling_bytes: ceiling, p_reason: reason });
    if (error) setNotice(t.fabricError);
    else { setNotice(t.saved); setReason(""); await loadFabric(); }
    setBusy(false);
  }

  async function toggleProvider(providerId: string, enabled: boolean, priority: number) {
    if (!supabase || busy) return;
    if (reason.trim().length < 3) { setNotice(t.reasonRequired); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_set_storage_provider", { p_provider_id: providerId, p_enabled: enabled, p_priority: priority, p_reason: reason });
    if (error) setNotice(t.fabricError);
    else { setNotice(t.saved); setReason(""); await loadFabric(); }
    setBusy(false);
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
  const navGroups: Array<{ title: string; items: Array<{ id: TabId; label: string }> }> = [
    { title: isAr ? "التصميم" : "Design", items: [{ id: "appearance", label: isAr ? "المظهر والهوية" : "Appearance & identity" }] },
    { title: isAr ? "نظرة عامة" : "Overview", items: [{ id: "health", label: t.health }, { id: "capacity", label: t.capacity }, { id: "telemetry", label: t.telemetry }] },
    { title: isAr ? "الحوكمة" : "Governance", items: [{ id: "rules", label: t.rules }, { id: "retention", label: t.retention }, { id: "cleanup", label: t.cleanup }, { id: "audit", label: t.audit }] },
    { title: isAr ? "التخزين" : "Storage", items: [{ id: "fabric", label: t.fabric }, { id: "providers", label: isAr ? "المزودون" : "Providers" }, { id: "storage", label: t.storage }, { id: "byos", label: isAr ? "تخزين المستخدمين" : "BYOS" }] },
    { title: isAr ? "المجتمع والإشراف" : "Community & moderation", items: [{ id: "moderation", label: t.modQueue }, { id: "integrity", label: isAr ? "نزاهة الحملات" : "Campaign integrity" }] },
    { title: isAr ? "الأعمال والبث" : "Business & live", items: [{ id: "sponsors", label: t.sponsors }, { id: "channels", label: isAr ? "قنوات يوتيوب الترويجية" : "YouTube promo channels" }, { id: "revenue", label: t.revenue }, { id: "live", label: t.live }] },
    { title: isAr ? "المجتمع والحسابات" : "Community & accounts", items: [{ id: "members", label: isAr ? "دليل الأعضاء" : "Member directory" }] },
    { title: isAr ? "الوصول والعمليات" : "Access & operations", items: [{ id: "roles", label: t.roles }, { id: "quotas", label: t.quotas }, { id: "jobs", label: t.jobs }] }
  ];
  const activeLabel = navGroups.flatMap(group => group.items).find(item => item.id === tab)?.label ?? "";
  const normalizedNavSearch = navSearch.trim().toLocaleLowerCase();
  const visibleNavGroups = normalizedNavSearch ? navGroups.map(group => ({ ...group, items: group.items.filter(item => `${group.title} ${item.label}`.toLocaleLowerCase().includes(normalizedNavSearch)) })).filter(group => group.items.length > 0) : navGroups;
  return <main className={styles.page} dir={isAr ? "rtl" : "ltr"} lang={locale}>
    <header className="raye2-ws-top"><ShellBrand locale={locale === "ar" ? "ar" : "en"} /><span className="raye2-ws-chip raye2-ws-chip--studio">{t.eyebrow}</span><span className="raye2-ws-spacer" /><Link className="raye2-ws-pill" href="/raye2/home">{isAr ? "المنصة" : "Platform"}</Link><Link className="raye2-ws-pill" href="/creator">{isAr ? "الاستوديو" : "Studio"}</Link></header>
    <section className={styles.intro}><span>{t.eyebrow}</span><h1>{t.title}</h1><p>{t.intro}</p></section>
    <div className={styles.shell}>
      <nav className={styles.sidenav} aria-label={isAr ? "أقسام إدارة Raye2" : "Raye2 administration sections"}><label className={styles.navSearch}><span aria-hidden="true">⌕</span><input type="search" value={navSearch} onChange={event => setNavSearch(event.target.value)} placeholder={isAr ? "ابحث عن إعداد أو قسم..." : "Find a setting or section..."} aria-label={isAr ? "ابحث في أقسام الإدارة" : "Search admin sections"}/>{navSearch && <button type="button" onClick={() => setNavSearch("")} aria-label={isAr ? "مسح البحث" : "Clear search"}>×</button>}</label>{visibleNavGroups.length ? visibleNavGroups.map(group => <details className={styles.navGroup} key={group.title} open={!!normalizedNavSearch || group.items.some(item => item.id === tab)}><summary className={styles.navGroupTitle}>{group.title}<span aria-hidden="true">⌄</span></summary><div className={styles.navGroupItems}>{group.items.map(item => <button key={item.id} type="button" className={tab === item.id ? styles.navItemActive : styles.navItem} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}>{item.label}</button>)}</div></details>) : <p className={styles.navEmpty}>{isAr ? "لا توجد أقسام مطابقة." : "No matching sections."}</p>}</nav>
      <section className={styles.main}>
      <div className={styles.sectionHead}><h2>{activeLabel}</h2></div>{tab === "health" && <div className={styles.quickActions}><button type="button" onClick={() => setTab("providers")}>{isAr ? "إعداد التخزين" : "Set up storage"} <span>↗</span></button><button type="button" onClick={() => setTab("moderation")}>{isAr ? "مراجعة البلاغات" : "Review reports"} <span>↗</span></button><button type="button" onClick={() => setTab("roles")}>{isAr ? "إدارة الأدوار" : "Manage roles"} <span>↗</span></button><button type="button" onClick={() => setTab("retention")}>{isAr ? "سياسات الاحتفاظ" : "Retention policies"} <span>↗</span></button></div>}
      {tab === "appearance" && <><div className={styles.sectionHead}><h2>{isAr ? "المظهر والهوية" : "Appearance & identity"}</h2><p>{isAr ? "حمّل المسودة ثم عدّلها واحفظها أو انشرها." : "Load the current draft, edit it, then save or publish."}</p><button className={styles.action} disabled={siteBusy} onClick={() => void loadSiteDraft()}>{isAr ? "تحميل المسودة" : "Load draft"}</button></div>
        {!siteDraft ? <article className={styles.card}><p>{isAr ? "لا توجد مسودة محملة." : "No draft loaded yet."}</p></article> : <article className={styles.card}>
          <div className={styles.cardHead}><div><span>RAYE2 DESIGN</span><h3>{isAr ? "ألوان وخطوط المنصة" : "Platform colors & typography"}</h3><p>{isAr ? "التغييرات تبقى مسودة حتى النشر." : "Changes remain a draft until published."}</p></div><span>v{siteRevision}</span></div>
          <label>{isAr ? "السمة" : "Theme"}<select value={String(siteDraft.appearance?.theme ?? "obsidian")} onChange={e => patchAppearance({theme:e.target.value})}><option value="obsidian">Obsidian</option><option value="paper">Paper</option><option value="violet">Violet</option><option value="custom">Custom</option></select></label>
          <div className={styles.fields}><label>{isAr ? "لون التمييز" : "Accent color"}<input type="color" value={String(siteDraft.appearance?.accent ?? "#7dd3fc")} onChange={e => patchAppearance({accent:e.target.value})}/></label><label>{isAr ? "نمط الألوان" : "Color mode"}<select value={String(siteDraft.appearance?.colorMode ?? "dark")} onChange={e => patchAppearance({colorMode:e.target.value})}><option value="dark">Dark</option><option value="light">Light</option><option value="system">System</option></select></label><label>{isAr ? "الحركة" : "Motion"}<select value={String(siteDraft.appearance?.motion ?? "reduced")} onChange={e => patchAppearance({motion:e.target.value})}><option value="full">Full</option><option value="reduced">Reduced</option><option value="off">Off</option></select></label><label>{isAr ? "خط العناوين" : "Display font"}<select value={String(siteDraft.appearance?.displayFont ?? "Cabin Sketch")} onChange={e => patchAppearance({displayFont:e.target.value})}><option>Cabin Sketch</option><option>Fredericka the Great</option><option>Chalkduster</option><option>Chalkboard SE</option><option>Segoe Print</option><option>Custom chalk</option></select></label></div>
          <div className={styles.fields}>
            <label>{isAr ? "شعار المنصة (PNG/JPG/WebP)" : "Platform logo (PNG/JPG/WebP)"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={assetBusy} onChange={e=>void uploadAppearanceAsset(e.target.files?.[0],"logo")}/></label>
            <label>{isAr ? "خلفية المنصة (PNG/JPG/WebP)" : "Site background (PNG/JPG/WebP)"}<input type="file" accept="image/png,image/jpeg,image/webp" disabled={assetBusy} onChange={e=>void uploadAppearanceAsset(e.target.files?.[0],"background")}/></label>
            <label>{isAr ? "خط طباشيري مخصص (WOFF2/WOFF/TTF/OTF)" : "Custom chalk font (WOFF2/WOFF/TTF/OTF)"}<input type="file" accept=".woff2,.woff,.ttf,.otf,font/woff2,font/woff,font/ttf,font/otf" disabled={assetBusy} onChange={e=>void uploadAppearanceAsset(e.target.files?.[0],"font")}/></label>
          </div>
          <p>{assetBusy ? (isAr ? "جارٍ رفع الملف..." : "Uploading asset…") : (isAr ? "يتم الرفع إلى مساحة أصول عامة؛ الكتابة متاحة للمسؤولين فقط." : "Assets are served from the public brand bucket; uploads are restricted to platform admins.")}</p>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
            {(["logoPath","backgroundPath","fontPath"] as const).map(key => siteDraft.appearance?.[key] ? <span key={key} className={styles.metrics}>{key}: {String(siteDraft.appearance?.[key]).split("/").pop()}</span> : null)}
          </div>
          <label>{isAr ? "موجات الخلفية" : "Background waves"}<select value={String(siteDraft.appearance?.waveStyle ?? "soft")} onChange={e=>patchAppearance({waveStyle:e.target.value})}><option value="off">Off</option><option value="soft">Soft chalk waves</option><option value="bold">Bold waves</option></select></label>
          <div className={styles.card} style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:12}}>
            {(["logoPath","backgroundPath"] as const).map(key => {
              const path = siteDraft.appearance?.[key];
              const url = typeof path === "string" ? supabase?.storage.from("raye2-brand-assets").getPublicUrl(path).data.publicUrl : null;
              return <div key={key}><small>{key === "logoPath" ? "Logo preview" : "Background preview"}</small>{url ? <img src={url} alt={key === "logoPath" ? "Uploaded logo preview" : "Uploaded background preview"} style={{display:"block",width:"100%",maxHeight:110,objectFit:"contain",borderRadius:8,marginTop:6}}/> : <p>{isAr ? "لم يتم الرفع بعد" : "No asset uploaded yet"}</p>}</div>;
            })}
            <div><small>Font preview</small><p style={{fontFamily:siteDraft.appearance?.fontPath ? "Raye2CustomChalk, cursive" : "Fredericka the Great, cursive",fontSize:23,marginTop:10}}>Chalkboard preview</p></div>
          </div>
          <label>{isAr ? "ملمس الطباشير" : "Chalk texture"}<select value={String(siteDraft.appearance?.chalkTexture ?? "hand-drawn")} onChange={e => patchAppearance({chalkTexture:e.target.value})}><option value="hand-drawn">Hand-drawn chalk</option><option value="soft">Soft chalk</option><option value="clean">Clean sketch</option></select></label>
          <div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className={styles.action} disabled={siteBusy} onClick={() => void saveSiteDraft(false)}>{isAr ? "حفظ المسودة" : "Save draft"}</button><button className={styles.action} disabled={siteBusy} onClick={() => void saveSiteDraft(true)}>{isAr ? "نشر المظهر" : "Publish appearance"}</button></div>
        </article>}
        <article className={styles.card}>
          <div className={styles.cardHead}><div><span>EVENT THEME SCHEDULER</span><h3>{isAr ? "جدولة المظاهر المؤقتة" : "Scheduled event themes"}</h3><p>{isAr ? "حدد البداية والنهاية؛ يتم تفعيل المظهر تلقائياً ثم يعود المظهر الأساسي." : "Set a start and end time. The event theme activates automatically and the base theme resumes afterward."}</p></div></div>
          <div className={styles.fields}>
            <label>{isAr ? "اسم الحدث" : "Event name"}<input value={eventName} maxLength={80} onChange={e=>setEventName(e.target.value)} placeholder="Winter / Halloween / Launch"/></label>
            <label>{isAr ? "لون الحدث" : "Event accent"}<input type="color" value={eventAccent} onChange={e=>setEventAccent(e.target.value)}/></label>
            <label>{isAr ? "بداية الحدث" : "Starts at (your local time)"}<input type="datetime-local" value={eventStartsAt} onChange={e=>setEventStartsAt(e.target.value)}/></label>
            <label>{isAr ? "نهاية الحدث" : "Ends at (your local time)"}<input type="datetime-local" value={eventEndsAt} onChange={e=>setEventEndsAt(e.target.value)}/></label>
            <label>{isAr ? "خط العناوين" : "Event display font"}<select value={eventFont} onChange={e=>setEventFont(e.target.value)}><option>Fredericka the Great</option><option>Cabin Sketch</option><option>Chalkduster</option><option>Chalkboard SE</option><option>Segoe Print</option></select></label>
            <label>{isAr ? "سمة الحدث" : "Event palette"}<select value={eventTheme} onChange={e=>setEventTheme(e.target.value)}><option value="obsidian">Obsidian</option><option value="paper">Paper</option><option value="violet">Violet</option></select></label>
          </div>
          <div style={{display:"flex",gap:8,flexWrap:"wrap",marginTop:12}}>
            <button className={styles.action} disabled={!siteDraft || !eventName.trim() || !eventStartsAt || !eventEndsAt || new Date(eventEndsAt)<=new Date(eventStartsAt) || siteBusy} onClick={() => {
              const event = { id: crypto.randomUUID(), name: eventName.trim(), enabled: true, startsAt: new Date(eventStartsAt).toISOString(), endsAt: new Date(eventEndsAt).toISOString(), accent: eventAccent, displayFont: eventFont, chalkTexture: "hand-drawn", theme: eventTheme, colorMode: "dark" };
              setSiteDraft(current => { if (!current) return current; const appearance = current.appearance ?? {}; const events = Array.isArray(appearance.eventThemes) ? appearance.eventThemes : []; return { ...current, appearance: { ...appearance, eventThemes: [...events, event] } }; });
              setEventName(""); setEventStartsAt(""); setEventEndsAt("");
            }}>{isAr ? "إضافة إلى المسودة" : "Add event to draft"}</button>
            <button className={styles.action} disabled={siteBusy || !siteDraft} onClick={() => void saveSiteDraft(false)}>{isAr ? "حفظ الجدول" : "Save schedule"}</button>
            <button className={styles.action} disabled={siteBusy || !siteDraft} onClick={() => void saveSiteDraft(true)}>{isAr ? "نشر الجدول" : "Publish schedule"}</button>
          </div>
          <div style={{marginTop:14,display:"grid",gap:8}}>
            {scheduledEvents.map((event, index) => {
              const now = Date.now();
              const starts = new Date(event.startsAt).getTime();
              const ends = new Date(event.endsAt).getTime();
              const status = !event.enabled ? "Disabled" : now < starts ? "Upcoming" : now < ends ? "Active" : "Expired";
              const selected = previewEventId === event.id;
              return <div key={event.id ?? index} style={{display:"grid",gap:10,padding:12,border:"1px solid var(--line)",borderRadius:12,background:selected?"rgba(77,141,246,.07)":"transparent"}}>
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",gap:10,flexWrap:"wrap"}}>
                  <div style={{minWidth:0,flex:"1 1 220px"}}><strong>{event.name || "Untitled event"}</strong><small style={{display:"block",opacity:.72,marginTop:5}}>{status} · {event.startsAt ? new Date(event.startsAt).toLocaleString() : "—"} → {event.endsAt ? new Date(event.endsAt).toLocaleString() : "—"}</small></div>
                  <span style={{width:14,height:14,borderRadius:99,background:event.accent,border:"1px solid rgba(255,255,255,.3)"}} aria-label={`Accent ${event.accent}`}/>
                </div>
                <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
                  <button type="button" className={styles.action} disabled={siteBusy} onClick={() => setPreviewEventId(selected ? null : event.id)}>{selected ? (isAr ? "إغلاق المعاينة" : "Close preview") : (isAr ? "معاينة" : "Preview")}</button>
                  <button type="button" className={styles.action} disabled={siteBusy} onClick={() => setSiteDraft(current => { if (!current) return current; const appearance = current.appearance ?? {}; const events = Array.isArray(appearance.eventThemes) ? appearance.eventThemes : []; return { ...current, appearance: { ...appearance, eventThemes: events.map((item, i) => i === index ? { ...item, enabled: !item.enabled } : item) } }; })}>{event.enabled ? (isAr ? "تعطيل" : "Disable") : (isAr ? "تفعيل" : "Enable")}</button>
                  <button type="button" className={styles.action} disabled={siteBusy} onClick={() => { setPreviewEventId(current => current === event.id ? null : current); setSiteDraft(current => { if (!current) return current; const appearance = current.appearance ?? {}; const events = Array.isArray(appearance.eventThemes) ? appearance.eventThemes : []; return { ...current, appearance: { ...appearance, eventThemes: events.filter((_, i) => i !== index) } }; }); }}>{isAr ? "حذف" : "Remove"}</button>
                </div>
                {selected && <div style={{padding:16,borderRadius:10,border:"1px solid rgba(77,141,246,.28)",background:event.theme==="paper"?"#f4f1e8":"#101216",color:event.theme==="paper"?"#171717":"#f4f4f6",backgroundImage:"radial-gradient(ellipse at 85% 0%, "+event.accent+"22, transparent 55%)"}}>
                  <small style={{letterSpacing:".12em",opacity:.7}}>PRIVATE EVENT PREVIEW · {event.theme.toUpperCase()}</small>
                  <h3 style={{fontFamily:event.displayFont+", cursive",fontSize:"clamp(24px,4vw,38px)",margin:"12px 0 6px",color:event.theme==="paper"?"#171717":event.accent}}>{event.name}</h3>
                  <p style={{fontSize:12,opacity:.8,margin:0}}>A preview of the event heading, palette and accent. This does not publish or activate the event.</p>
                  <div style={{display:"flex",gap:8,marginTop:14,flexWrap:"wrap"}}><span style={{padding:"8px 12px",borderRadius:8,background:event.accent,color:"#07101f",fontSize:11,fontWeight:800}}>Primary action</span><span style={{padding:"8px 12px",borderRadius:8,border:"1px solid currentColor",fontSize:11}}>Secondary action</span></div>
                </div>}
              </div>;
            })}
            {(scheduledEvents.length===0) && <p>{isAr ? "لا توجد أحداث مجدولة." : "No scheduled event themes yet."}</p>}
          </div>
        </article>
        <article className={styles.card}><h3>{isAr ? "استعادة إصدار" : "Restore published version"}</h3><p>{isAr ? "تتم الاستعادة إلى المسودة فقط." : "Restores into the draft only; it does not publish automatically."}</p><label>{isAr ? "رقم الإصدار" : "Version number"}<input type="number" min="1" value={restoreVersion} onChange={e=>setRestoreVersion(e.target.value)}/></label><button className={styles.action} disabled={siteBusy} onClick={() => void restoreSiteDraft()}>{isAr ? "استعادة إلى المسودة" : "Restore to draft"}</button></article>
      </>}
      {tab === "health" && <><div className={styles.sectionHead}><h2>{t.health}</h2><p>{t.healthNote}</p></div>{initialHealth.length===0 ? <p>{t.noHealth}</p> : <div className={styles.storageGrid}>{initialHealth.map(row => <article className={styles.card} key={row.metric}><span>{row.metric}</span><strong className={row.state==="ok"?styles.ok:row.state==="warning"?styles.warning:styles.critical}>{row.metric.startsWith("storage_") ? bytes(row.value) : row.value.toLocaleString()}</strong><small>{row.state==="ok"?t.stateOk:row.state==="warning"?t.stateWarning:t.stateCritical}</small></article>)}</div>}</>}
      {tab === "rules" && <><div className={styles.sectionHead}><h2>{t.rules}</h2><p>{t.status}: {t.proposed} · {t.active} · {t.disabled}</p></div>
        {rules.map(rule => <article className={styles.card} key={rule.rule_key}><div className={styles.cardHead}><div><span>{rule.category}</span><h3>{rule.rule_key}</h3><p>{rule.description}</p></div><select value={rule.status} onChange={event => setRules(current => current.map(item => item.rule_key === rule.rule_key ? { ...item, status: event.target.value as RuleRow["status"] } : item))}><option value="proposed">{t.proposed}</option><option value="active">{t.active}</option><option value="disabled">{t.disabled}</option></select></div><label>{t.value}<textarea rows={2} value={jsonDrafts[rule.rule_key] ?? JSON.stringify(rule.rule_value)} onChange={event => setJsonDrafts(current => ({ ...current, [rule.rule_key]: event.target.value }))}/></label><button className={styles.action} disabled={busy} onClick={() => void saveRule(rule)}>{t.save}</button></article>)}
      </>}
      {tab === "retention" && <><div className={styles.sectionHead}><h2>{t.retention}</h2><p>{t.preserve}</p></div>
        {retention.map(item => <article className={styles.card} key={item.category}><div className={styles.cardHead}><div><span>RETENTION POLICY</span><h3>{item.category}</h3></div><label className={styles.toggle}><input type="checkbox" checked={item.enabled} onChange={event => updateRetention(item.category, { enabled: event.target.checked })}/>{t.enabled}</label></div><div className={styles.fields}><label>{t.days}<input type="number" min="1" max="3650" value={item.retention_days ?? ""} placeholder="∞" onChange={event => updateRetention(item.category, { retention_days: event.target.value ? Number(event.target.value) : null })}/></label><label>{t.warning}<input type="number" min="0" max="365" value={item.warning_days} onChange={event => updateRetention(item.category, { warning_days: Number(event.target.value) })}/></label><label>{t.action}<select value={item.expiry_action} onChange={event => updateRetention(item.category, { expiry_action: event.target.value as RetentionRow["expiry_action"] })}><option value="archive">{t.archive}</option><option value="delete">{t.delete}</option></select></label></div><label className={styles.toggle}><input type="checkbox" checked={item.preserve_shared_memories} onChange={event => updateRetention(item.category, { preserve_shared_memories: event.target.checked })}/>{t.preserve}</label><button className={styles.action} disabled={busy} onClick={() => void saveRetention(item)}>{t.saveRetention}</button></article>)}
      </>}
      {tab === "cleanup" && <><div className={styles.sectionHead}><h2>{t.cleanup}</h2><p>{t.previewNote}</p></div><article className={styles.card}><div className={styles.cardHead}><div><h3>{t.sweep}</h3><p>{t.sweepNote}</p></div><button className={styles.action} disabled={busy} onClick={() => void loadSweep()}>{t.sweep}</button></div>{sweep.length===0 ? null : <div className={styles.storageGrid}>{sweep.map(row => <article className={styles.card} key={row.category}><span>{row.category}</span><strong>{row.candidates}</strong><small>{t.sweepCandidates} · {row.oldest ? new Date(row.oldest).toLocaleString(isAr ? "ar-EG" : "en") : "—"}</small></article>)}</div>}</article><article className={styles.card}><div className={styles.scopeGrid}>{categories.map(category => <label key={category} className={styles.toggle}><input type="checkbox" checked={scope.includes(category)} onChange={event => setScope(current => event.target.checked ? [...current, category] : current.filter(item => item !== category))}/>{category}</label>)}</div><hr/><label className={styles.toggle}><input type="checkbox" checked={preserveChat} onChange={event => setPreserveChat(event.target.checked)}/>{t.preserveChat}</label><label className={styles.toggle}><input type="checkbox" checked={preserveMemories} onChange={event => setPreserveMemories(event.target.checked)}/>{t.preserveMemories}</label><label>{t.reason}<textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={500}/></label><p className={styles.warning}>{t.requestOnly}</p><button className={styles.action} disabled={busy || !scope.length} onClick={() => void createPreview()}>{t.preview}</button></article><div className={styles.sectionHead}><h2>{t.request}</h2></div>{jobs.map(job => <article className={styles.card} key={job.id}><div className={styles.cardHead}><h3>{job.status.toUpperCase()}</h3><time>{new Date(job.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</time></div><p>{job.scope.join(" · ")}</p><small>{job.preserve_chat_history ? t.preserveChat : ""} {job.preserve_shared_memories ? t.preserveMemories : ""}</small><div className={styles.metrics}><span>{t.items}: {job.estimated_items ?? "—"}</span><span>{t.recovered}: {job.estimated_bytes == null ? "—" : bytes(job.estimated_bytes)}</span></div><p>{job.reason}</p><div style={{display:"flex",gap:8,marginTop:10}}>{["preview","failed"].includes(job.status) && <button className={styles.action} disabled={busy} onClick={() => void jobAction(job.id, "queue")}>{t.queueJob}</button>}{["queued","running"].includes(job.status) && <button className={styles.action} disabled={busy || !canRunCleanup} title={canRunCleanup ? undefined : t.runOwnerOnly} onClick={() => void jobAction(job.id, "run")}>{t.runJob}</button>}{["preview","queued"].includes(job.status) && <button className={styles.action} disabled={busy} onClick={() => void jobAction(job.id, "cancel")}>{t.cancelJob}</button>}</div></article>)}</>}
      {tab === "storage" && <><div className={styles.sectionHead}><h2>{t.storage}</h2><p>{t.storageNote}</p></div><div className={styles.storageGrid}>{Object.entries(storageTotals).map(([category, total]) => <article className={styles.card} key={category}><span>{category}</span><strong>{bytes(total.bytes)}</strong><small>{total.objects.toLocaleString()} {t.objects}</small></article>)}</div>{!Object.keys(storageTotals).length && <p>{t.noRows}</p>}</>}
      {tab === "quotas" && <><div className={styles.sectionHead}><h2>{t.quotas}</h2><p>{t.quotaNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadQuotas()}>{t.quotaLoad}</button></div>{quotas.length===0 ? <p>{t.quotaEmpty}</p> : <div className={styles.storageGrid}>{quotas.map(row => <article className={styles.card} key={row.rule_key}><span>{row.rule_key}</span><strong>{row.rejections.toLocaleString()}</strong><small>{t.quotaRejections} · {t.quotaLimit} {row.limit_value} · {row.distinct_users} {t.quotaUsers}{row.last_rejected ? ` · ${t.quotaLast} ${new Date(row.last_rejected).toLocaleString(isAr ? "ar-EG" : "en")}` : ""}</small></article>)}</div>}</>}
      {tab === "jobs" && <><div className={styles.sectionHead}><h2>{t.jobs}</h2><p>{t.jobsNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadBgJobs()}>{t.jobsLoad}</button></div><div className={styles.metrics}><span>{t.jobsQueued}: {bgJobStats.by_status?.queued ?? 0}</span><span>{t.jobsRunning}: {bgJobStats.by_status?.running ?? 0}</span><span>{t.jobsFailed}: {bgJobStats.by_status?.failed ?? 0}</span><span>{t.jobsStuck}: {bgJobStats.stuck_running ?? 0}</span><span>{t.cleanupPending}: {cleanupStats.pending ?? 0}</span><span>{t.cleanupFailed}: {cleanupStats.failed ?? 0}</span><span>{t.cleanupDeleted}: {cleanupStats.deleted ?? 0}</span></div>{bgJobs.length===0 ? <p>{t.jobsEmpty}</p> : <div className={styles.storageGrid}>{bgJobs.map(job => <article className={styles.card} key={job.job_id}><div className={styles.cardHead}><h3>{job.kind}</h3><span className={styles.warning}>{job.status}</span></div><small>{t.jobsAttempts}: {job.attempts}/{job.max_attempts} · {new Date(job.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</small>{job.last_error ? <p className={styles.warning}>{job.last_error}</p> : null}<div style={{display:"flex",gap:8,marginTop:8}}>{job.status === "failed" && <button className={styles.action} disabled={busy} onClick={() => void bgJobControl(job.job_id, "retry")}>{t.jobsRetry}</button>}{["queued","running","failed"].includes(job.status) && <button className={styles.action} disabled={busy} onClick={() => void bgJobControl(job.job_id, "cancel")}>{t.jobsCancel}</button>}</div></article>)}</div>}</>}
      {tab === "telemetry" && <><div className={styles.sectionHead}><h2>{t.telemetry}</h2><p>{t.telemetryNote}</p><div style={{display:"flex",gap:8}}><button className={styles.action} disabled={busy} onClick={() => void loadTelemetry()}>{t.telemetryLoad}</button><button className={styles.action} disabled={busy} onClick={() => void pruneTelemetry()}>{t.telemetryPrune}</button></div></div><div className={styles.metrics}><span>{t.telemetryErrors}: {telemetrySummary.errors ?? 0}</span><span>{t.telemetryP50}: {telemetrySummary.latency_p50_ms ?? "—"}</span><span>{t.telemetryP95}: {telemetrySummary.latency_p95_ms ?? "—"}</span></div>{telemetry.length===0 ? <p>{t.telemetryEmpty}</p> : <div className={styles.storageGrid}>{telemetry.map(ev => <article className={styles.card} key={ev.event_id}><div className={styles.cardHead}><h3>{ev.event_type}</h3><span className={ev.severity==="error"||ev.severity==="critical"?styles.critical:ev.severity==="warning"?styles.warning:styles.ok}>{ev.severity}</span></div><small>{ev.surface || "—"}{ev.duration_ms!=null ? ` · ${ev.duration_ms} ms` : ""} · {new Date(ev.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</small><p>{ev.message}</p></article>)}</div>}</>}
      {tab === "capacity" && <><div className={styles.sectionHead}><h2>{t.capacity}</h2><p>{t.capacityNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadCapacity()}>{t.capacityLoad}</button></div>{capacity.length===0 ? <p>{t.capacityEmpty}</p> : <div className={styles.storageGrid}>{capacity.map(row => <article className={styles.card} key={row.metric}><span>{row.metric}</span><strong className={row.state==="critical"?styles.critical:row.state==="warning"?styles.warning:styles.ok}>{row.used ?? "—"}{row.usage_percent!=null ? ` (${row.usage_percent}%)` : ""}</strong><small>{t.capacityLimit} {row.limit_value.toLocaleString()} {row.unit} · {t.capacityHeadroom} {row.headroom ?? "—"} · {row.enabled ? t.active : t.disabled}</small></article>)}</div>}</>}
      {tab === "fabric" && <><div className={styles.sectionHead}><h2>{t.fabric}</h2><p>{t.fabricNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadFabric()}>{t.fabricLoad}</button></div><label>{t.reason}<textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={500}/></label>
        <div className={styles.sectionHead}><h3>{t.fabricProvider}</h3></div>
        <div className={styles.storageGrid}>{fabric.filter(row => row.section === "provider").map(row => <article className={styles.card} key={row.key}><div className={styles.cardHead}><span>{row.label}</span><span className={row.enabled ? styles.ok : styles.warning}>{row.enabled ? t.fabricEnabled : t.fabricDisabled}</span></div><strong>{row.value_numeric == null ? "—" : bytes(row.value_numeric)}</strong><small>{row.detail}</small><div style={{display:"flex",gap:8,marginTop:8}}><button className={styles.action} disabled={busy} onClick={() => void toggleProvider(row.key, !row.enabled, 30)}>{row.enabled ? t.disabled : t.enabled}</button></div></article>)}</div>
        <div className={styles.sectionHead}><h3>{t.fabricAllowance}</h3></div>
        <div className={styles.storageGrid}>{fabric.filter(row => row.section === "allowance").map(row => <article className={styles.card} key={row.key}><div className={styles.cardHead}><span>{row.label}</span><span className={styles.ok}>{bytes(row.value_numeric ?? 0)}</span></div><small>{row.detail}</small></article>)}</div>
        <article className={styles.card}><div className={styles.cardHead}><h3>{t.fabricAllowance}</h3></div><label>{t.fabricRole}<select value={fabricAllowanceRole} onChange={event => setFabricAllowanceRole(event.target.value)}><option value="user">user</option><option value="creator">creator</option><option value="streamer">streamer</option><option value="combined">combined</option><option value="owner">owner</option></select></label><label>{t.fabricBytes}<input type="number" min={0} value={fabricAllowanceBytes} onChange={event => setFabricAllowanceBytes(event.target.value)}/></label><button className={styles.action} disabled={busy} onClick={() => void saveAllowance()}>{t.fabricSave}</button></article>
        <div className={styles.sectionHead}><h3>{t.fabricOverride}</h3></div>
        {fabric.filter(row => row.section === "override").length === 0 ? <p>{t.fabricEmpty}</p> : <div className={styles.storageGrid}>{fabric.filter(row => row.section === "override").map(row => <article className={styles.card} key={row.key}><span>{row.label}</span><strong>{bytes(row.value_numeric ?? 0)}</strong><small>{row.detail}</small></article>)}</div>}
        <article className={styles.card}><div className={styles.cardHead}><h3>{t.fabricOverride}</h3></div><label>{t.fabricUser}<input type="text" value={fabricOverrideUser} onChange={event => setFabricOverrideUser(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000"/></label><label>{t.fabricBytes}<input type="number" min={0} value={fabricOverrideBytes} onChange={event => setFabricOverrideBytes(event.target.value)}/></label><button className={styles.action} disabled={busy} onClick={() => void saveOverride()}>{t.fabricSave}</button></article>
        <div className={styles.sectionHead}><h3>{t.fabricSetting}</h3></div>
        {fabric.filter(row => row.section === "setting").map(row => <article className={styles.card} key={row.key}><div className={styles.cardHead}><span>{row.label}</span><span className={styles.ok}>{bytes(row.value_numeric ?? 0)}</span></div><small>{row.detail}</small></article>)}
        <article className={styles.card}><div className={styles.cardHead}><h3>{t.fabricSetting}</h3></div><label>{t.fabricCeiling}<input type="number" min={0} value={fabricCeilingBytes} onChange={event => setFabricCeilingBytes(event.target.value)}/></label><button className={styles.action} disabled={busy} onClick={() => void saveCeiling()}>{t.fabricSave}</button></article>
      </>}
      {tab === "providers" && <StorageProviders isArabic={isAr} />}
      {tab === "byos" && <ByosConnections isArabic={isAr} />}
      {tab === "live" && <><div className={styles.sectionHead}><h2>{t.live}</h2><p>{t.liveNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadLive()}>{t.liveLoad}</button></div>{!liveOverview ? <p>{t.noRows}</p> : <div className={styles.metrics}><span>{t.liveLive}: {liveOverview.live ?? 0}</span><span>{t.liveReplay}: {liveOverview.replay ?? 0}</span><span>{t.liveModerated}: {liveOverview.moderated ?? 0}</span><span>{t.liveDegraded}: {liveOverview.degraded ?? 0}</span><span>{t.liveReplayHours}: {liveOverview.replay_retention_hours ?? "—"}</span><span>{t.liveMaxDuration}: {liveOverview.max_duration_seconds ?? "—"}</span><span>{t.liveMaxConcurrent}: {liveOverview.max_concurrent_streams ?? "—"}</span></div>}</>}
      {tab === "sponsors" && <PlatformSponsorManagement />}
      {tab === "channels" && <YouTubeChannelSources isArabic={isAr} />}
      {tab === "revenue" && <PlatformRevenueOverview />}
      {tab === "integrity" && <CampaignIntegrity isArabic={isAr} />}
      {tab === "moderation" && <><div className={styles.sectionHead}><h2>{t.modQueue}</h2><p>{t.modContent} · {t.modSafety}</p><div style={{display:"flex",gap:8,alignItems:"center"}}><select value={modStatus} onChange={e=>{const v=e.target.value as typeof modStatus;setModStatus(v);void loadModQueue(v)}} aria-label={t.modQueue}>{["open","reviewing","resolved","dismissed"].map(s=><option key={s} value={s}>{s}</option>)}</select><button className={styles.action} disabled={busy} onClick={()=>void loadModQueue()}>{t.modLoad}</button></div></div>
        <label>{t.modNote}<input value={modNote} onChange={e=>setModNote(e.target.value)} maxLength={500}/></label>
        {modQueue.length===0 ? <p>{t.modEmpty}</p> : <div className={styles.storageGrid}>{modQueue.map(row=><article className={styles.card} key={row.kind+row.report_id}><div className={styles.cardHead}><h3>{row.kind==="safety"?t.modSafety:t.modContent} · {row.reason}</h3><span className={row.status==="open"?styles.warning:styles.ok}>{row.status}</span></div><small>{row.target_type} · {t.modReporter}: {row.reporter_handle??"—"} · {new Date(row.created_at).toLocaleString(isAr?"ar-EG":"en")}</small>{row.target_preview?<p>{row.target_preview}</p>:null}{row.details?<p className={styles.warning}>{row.details}</p>:null}<div style={{display:"flex",gap:8,marginTop:8}}><button className={styles.action} disabled={busy} onClick={()=>void resolveReport(row.kind,row.report_id,"reviewing")}>{t.modReview}</button><button className={styles.action} disabled={busy} onClick={()=>void resolveReport(row.kind,row.report_id,"resolved")}>{t.modResolve}</button><button className={styles.action} disabled={busy} onClick={()=>void resolveReport(row.kind,row.report_id,"dismissed")}>{t.modDismiss}</button></div></article>)}</div>}
      </>}
      {tab === "members" && <><div className={styles.sectionHead}><h2>{isAr ? "دليل الأعضاء" : "Member directory"}</h2><p>{isAr ? "ملفات الأعضاء الظاهرة وفق صلاحيات قاعدة البيانات. لا يتم عرض البريد أو بيانات الدخول." : "Member profiles visible to this protected admin session. Email addresses and authentication secrets are never exposed here."}</p></div><article className={styles.card}><div className={styles.fields}><label>{isAr ? "بحث" : "Search"}<input type="search" value={memberSearch} onChange={event => setMemberSearch(event.target.value)} placeholder={isAr ? "الاسم أو المعرف أو اسم المستخدم" : "Name, handle or user ID"} /></label><label>{isAr ? "حالة القيود" : "Restriction status"}<select value={memberStatusFilter} onChange={event => setMemberStatusFilter(event.target.value)}><option value="all">{isAr ? "الكل" : "All members"}</option><option value="restricted">{isAr ? "لديهم قيود نشطة" : "Active restrictions"}</option><option value="clear">{isAr ? "بدون قيود نشطة" : "No active restrictions"}</option></select></label></div><p>{isAr ? `عرض ${filteredMembers.length} من ${initialMembers.length} ملفاً (الحد الأقصى 100)` : `Showing ${filteredMembers.length} of ${initialMembers.length} profiles (maximum 100 loaded)`}</p></article>{filteredMembers.length === 0 && <p>{isAr ? "لا توجد حسابات مطابقة." : "No matching member profiles."}</p>}{filteredMembers.map(member => { const active = member.restrictions.filter(item => item.status === "active" && (!item.expires_at || new Date(item.expires_at).getTime() > Date.now())); return <article className={styles.card} key={member.user_id}><div className={styles.cardHead}><div><h3>{member.display_name || member.handle || (isAr ? "عضو بدون اسم" : "Unnamed member")}</h3><p>@{member.handle || "—"} · {member.visibility}</p><small>{isAr ? "تاريخ الانضمام" : "Joined"}: {new Date(member.created_at).toLocaleDateString(isAr ? "ar-EG" : "en")} · {member.user_id}</small></div><span className={active.length ? styles.warning : styles.ok}>{active.length ? (isAr ? `قيود نشطة: ${active.length}` : `${active.length} active restriction(s)`) : (isAr ? "لا توجد قيود نشطة" : "No active restrictions")}</span></div>{active.slice(0,3).map((restriction,index) => <p key={index}><strong>{restriction.action}</strong> · {restriction.feature} · {restriction.reason || "—"}{restriction.expires_at ? ` · ${isAr ? "ينتهي" : "Expires"} ${new Date(restriction.expires_at).toLocaleString()}` : ""}</p>)}</article>; })}</>}
      {tab === "roles" && <><article className={styles.card}><div className={styles.cardHead}><div><h3>{t.caps}</h3><p>{t.capsNote}</p></div></div><div className={styles.metrics}>{caps.map(item => <span key={item.capability}>{item.capability} · {t.capsRequired} {item.required_role} · {item.allowed ? t.capsYes : t.capsNo}</span>)}</div></article><div className={styles.sectionHead}><h2>{t.roles}</h2><p>{t.ownerOnly}</p></div><article className={styles.card}><label>{isAr ? "بحث في حسابات الإدارة" : "Search admin accounts"}<input value={roleSearch} onChange={event => setRoleSearch(event.target.value)} placeholder={isAr ? "الاسم أو المعرّف أو الدور أو الحالة" : "Name, user ID, role or status"} /></label><p>{isAr ? `${filteredAdmins.length} من ${admins.length} حسابات بصلاحيات إدارية` : `${filteredAdmins.length} of ${admins.length} admin-access accounts`}</p></article>{filteredAdmins.length === 0 && <p>{isAr ? "لا توجد حسابات مطابقة." : "No matching admin-access accounts."}</p>}{filteredAdmins.map(item => <article className={styles.card} key={item.user_id}><div className={styles.cardHead}><div><span>{item.active?t.accessActive:t.accessSuspended}</span><h3>{item.display_name ?? item.handle ?? item.user_id}</h3><p>@{item.handle ?? "—"}</p></div><label>{t.role}<select value={item.role} disabled={busy || item.role === "owner"} onChange={event => void changeRole(item.user_id, event.target.value)}><option value="admin">admin</option><option value="creator">creator</option><option value="streamer">streamer</option><option value="editor">editor</option><option value="moderator">moderator</option><option value="analyst">analyst</option>{item.role === "owner" && <option value="owner">owner</option>}</select></label></div>{item.role !== "owner" && <button className={styles.action} disabled={busy} onClick={() => void toggleActive(item.user_id, !item.active)}>{item.active ? t.suspend : t.reactivate}</button>}</article>)}</>}
      {tab === "audit" && <><div className={styles.sectionHead}><h2>{t.audit}</h2><p>Append-only administrative history.</p></div><article className={styles.card}><b>{t.auditFilter}</b><div className={styles.fields}><label>{t.auditAction}<input value={auditAction} onChange={event => setAuditAction(event.target.value)} placeholder="safety_report_resolved"/></label><label>{t.auditActor}<input value={auditActor} onChange={event => setAuditActor(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000"/></label></div><div style={{display:"flex",gap:8}}><button className={styles.action} disabled={busy} onClick={() => void loadAudit()}>{t.auditApply}</button><button className={styles.action} onClick={() => { setAuditAction(""); setAuditActor(""); }}>{t.auditClear}</button></div></article>{!audit.length && <p>{t.auditEmpty}</p>}{audit.map(entry => <article className={styles.card} key={entry.id}><div className={styles.cardHead}><h3>{entry.action}</h3><time>{new Date(entry.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</time></div><p>{entry.target_type} · {entry.target_id ?? "—"}</p><p>{entry.reason}</p><pre>{JSON.stringify(entry.details, null, 2)}</pre></article>)}</>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      </section>
    </div>
    <footer className={styles.footer}>RAYE2 ADMIN · {t.ownerGuard} · NO AUTOMATIC DELETION FROM THIS SCREEN</footer>
  </main>;
}

"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";
import PlatformSponsorManagement from "./platform-sponsor-management";
import PlatformRevenueOverview from "./platform-revenue-overview";

export type RuleRow = { rule_key: string; category: string; rule_value: unknown; status: "proposed" | "active" | "disabled"; description: string; updated_at: string };
export type RetentionRow = { category: string; retention_days: number | null; warning_days: number; expiry_action: "archive" | "delete"; enabled: boolean; preserve_shared_memories: boolean; updated_at: string };
export type CleanupRow = { id: string; status: string; scope: string[]; preserve_chat_history: boolean; preserve_shared_memories: boolean; estimated_items: number | null; estimated_bytes: number | null; reason: string; created_at: string };
export type SweepRow = { category: string; retention_days: number | null; expiry_action: string; candidates: number; oldest: string | null };
export type QuotaRow = { rule_key: string; category: string; limit_value: number; rejections: number; distinct_users: number; last_rejected: string | null };
export type StorageRow = { id: string; owner_id: string | null; group_id: string | null; storage_class: string; object_count: number; bytes_used: number; measured_at: string };
export type AuditRow = { id: number; actor_id: string | null; action: string; target_type: string; target_id: string | null; reason: string; details: Record<string, unknown>; created_at: string };
export type HealthRow = { metric: string; value: number; state: "ok" | "warning" | "critical" };
export type AdminRow = { user_id: string; handle: string | null; display_name: string | null; role: string; active: boolean; created_at: string };

type Locale = "en" | "ar";
const bytes = (value: number) => value < 1024 ? value + " B" : value < 1024 ** 2 ? (value / 1024).toFixed(1) + " KB" : value < 1024 ** 3 ? (value / 1024 ** 2).toFixed(1) + " MB" : (value / 1024 ** 3).toFixed(2) + " GB";

export default function Raye2AdminClient({ locale, initialRules, initialRetention, initialJobs, initialStorage, initialAudit, initialHealth, initialAdmins }: {
  locale: Locale; initialRules: RuleRow[]; initialRetention: RetentionRow[]; initialJobs: CleanupRow[]; initialStorage: StorageRow[]; initialAudit: AuditRow[]; initialHealth: HealthRow[]; initialAdmins: AdminRow[];
}) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [tab, setTab] = useState<"rules" | "retention" | "cleanup" | "storage" | "audit" | "sponsors" | "revenue" | "health" | "roles" | "quotas">("rules");
  const [rules, setRules] = useState(initialRules);
  const [retention, setRetention] = useState(initialRetention);
  const [jobs, setJobs] = useState(initialJobs);
  const [admins, setAdmins] = useState(initialAdmins);
  const [sweep, setSweep] = useState<SweepRow[]>([]);
  const [quotas, setQuotas] = useState<QuotaRow[]>([]);
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
    eyebrow:"RAYE2 / تحكم المنصة", title:"قواعد واضحة. تحكم آمن.", intro:"إدارة الحدود والاحتفاظ والتنظيف من مكان واحد. التغييرات الحساسة تمر عبر عمليات محمية وسجل تدقيق.", back:"العودة إلى Raye2", rules:"القواعد", retention:"الاحتفاظ", cleanup:"معاينة التنظيف", storage:"التخزين", audit:"سجل التدقيق", status:"الحالة", category:"التصنيف", value:"القيمة (JSON)", save:"حفظ القاعدة", description:"الوصف", proposed:"مقترح", active:"مفعّل", disabled:"معطّل", reason:"سبب التغيير (مطلوب)", days:"أيام الاحتفاظ", warning:"أيام التنبيه قبل الانتهاء", action:"الإجراء عند الانتهاء", archive:"أرشفة", delete:"حذف", enabled:"تفعيل السياسة", preserve:"حماية الذكريات المشتركة", saveRetention:"حفظ سياسة الاحتفاظ", scope:"الفئات المطلوب مراجعتها", preserveChat:"استثناء سجل المحادثات", preserveMemories:"استثناء الذكريات المشتركة", preview:"إنشاء طلب معاينة", previewNote:"هذا يسجل طلب مراجعة فقط. لا يتم حذف أي محتوى من هذه الصفحة، وتقدير المساحة ينتظر عامل التنظيف.", request:"الطلبات الأخيرة", items:"العناصر", recovered:"المساحة المقدّرة", storageNote:"هذه لقطات قياس مخزنة، وليست عدّادًا لحظيًا أو ضمانًا للسعة المتاحة.", objects:"ملفات", used:"المساحة", noRows:"لا توجد بيانات بعد.", saved:"تم حفظ التغيير.", error:"تعذر تنفيذ العملية. تحقق من الصلاحيات والاتصال.", reasonRequired:"اكتب سببًا واضحًا قبل الحفظ.", selectScope:"اختر فئة واحدة على الأقل.", requestOnly:"طلب معاينة — لا حذف", created:"تم تسجيل طلب المعاينة.", ownerGuard:"هذه الصفحة متاحة للمالك والمسؤول فقط.", sponsors:"رعاة المنصة",revenue:"الإيرادات والرعايات",health:"صحة المنصة",roles:"الأدوار والوصول",stateOk:"جيد",stateWarning:"تحذير",stateCritical:"حرج",roleChanged:"تم تحديث الدور.",roleChangeError:"تعذر تحديث الدور.",suspend:"إيقاف",reactivate:"إعادة تفعيل",accessActive:"نشط",accessSuspended:"موقوف",role:"الدور",healthNote:"عدّادات مجمّعة للمنصة. يُصنّف التخزين وفق الحدود المعرّفة في محرك القواعد.",noHealth:"لا توجد بيانات صحة بعد.",ownerOnly:"تعيين الأدوار متاح للمالك فقط.",auditFilter:"تصفية سجل التدقيق",auditAction:"الإجراء",auditActor:"معرّف الفاعل",auditApply:"تصفية",auditClear:"مسح",auditEmpty:"لا توجد سجلات مطابقة.",auditFail:"تعذر تحميل سجل التدقيق.",queueJob:"جدولة",runJob:"تنفيذ",cancelJob:"إلغاء",jobQueued:"تمت جدولة المهمة.",jobRan:"تم تنفيذ المهمة.",jobCancelled:"تم إلغاء المهمة.",jobError:"تعذر تحديث المهمة.",sweep:"معاينة الاحتفاظ",sweepNote:"ما الذي ستحذفه السياسات المفعّلة الآن.",sweepCategory:"الفئة",sweepCandidates:"المرشحون",sweepNone:"لا توجد سياسات احتفاظ مفعّلة.",sweepOldest:"الأقدم",quotas:"الحصص",quotaNote:"الاستخدام والمحاولات المرفوضة لكل قاعدة نشطة قابلة للقياس.",quotaRule:"القاعدة",quotaLimit:"الحد",quotaRejections:"المرفوضة",quotaUsers:"حسابات متأثرة",quotaLast:"آخر رفض",quotaEmpty:"لا توجد حصص قابلة للقياس.",quotaLoad:"تحديث الحصص"
  } : {
    eyebrow:"RAYE2 / PLATFORM CONTROL", title:"Clear rules. Safer control.", intro:"Manage limits, retention and cleanup in one place. Sensitive changes use guarded operations and an audit trail.", back:"Back to Raye2", rules:"Rules", retention:"Retention", cleanup:"Cleanup review", storage:"Storage", audit:"Audit log", status:"Status", category:"Category", value:"Value (JSON)", save:"Save rule", description:"Description", proposed:"Proposed", active:"Active", disabled:"Disabled", reason:"Reason for this change (required)", days:"Retention days", warning:"Warning days before expiry", action:"Expiry action", archive:"Archive", delete:"Delete", enabled:"Enable policy", preserve:"Protect Shared Memories", saveRetention:"Save retention policy", scope:"Categories to review", preserveChat:"Exclude chat history", preserveMemories:"Exclude Shared Memories", preview:"Create review request", previewNote:"This records a review request only. This page does not delete content; storage estimates remain pending a cleanup worker.", request:"Recent requests", items:"Estimated items", recovered:"Estimated recovery", storageNote:"These are stored measurement snapshots, not a live counter or a promise of available capacity.", objects:"Objects", used:"Used", noRows:"No data yet.", saved:"Change saved.", error:"The operation failed. Check permissions and connection.", reasonRequired:"Enter a clear reason before saving.", selectScope:"Select at least one category.", requestOnly:"Review request — no deletion", created:"Review request recorded.", ownerGuard:"This page is restricted to owners and admins.", sponsors:"Platform sponsors",revenue:"Revenue & finance",health:"Platform health",roles:"Roles & access",stateOk:"OK",stateWarning:"Warning",stateCritical:"Critical",roleChanged:"Role updated.",roleChangeError:"Could not update the role.",suspend:"Suspend",reactivate:"Reactivate",accessActive:"Active",accessSuspended:"Suspended",role:"Role",healthNote:"Aggregate platform counters. Storage is classified against the thresholds in the rules engine.",noHealth:"No health data yet.",ownerOnly:"Role assignment is restricted to the owner.",auditFilter:"Filter audit log",auditAction:"Action",auditActor:"Actor ID",auditApply:"Apply",auditClear:"Clear",auditEmpty:"No matching entries.",auditFail:"Could not load the audit log.",queueJob:"Queue",runJob:"Run",cancelJob:"Cancel",jobQueued:"Job queued.",jobRan:"Job completed.",jobCancelled:"Job cancelled.",jobError:"Could not update the job.",sweep:"Retention sweep",sweepNote:"What enabled policies would remove right now.",sweepCategory:"Category",sweepCandidates:"Candidates",sweepNone:"No retention policies are enabled.",sweepOldest:"Oldest",quotas:"Quotas",quotaNote:"Usage and rejected attempts per measurable active rule.",quotaRule:"Rule",quotaLimit:"Limit",quotaRejections:"Rejected",quotaUsers:"Accounts",quotaLast:"Last rejected",quotaEmpty:"No measurable quotas.",quotaLoad:"Refresh quotas"
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
      setJobs(current => [{ id: String(data), status: "preview", scope, preserve_chat_history: preserveChat, preserve_shared_memories: preserveMemories, estimated_items: null, estimated_bytes: null, reason: reason.trim(), created_at: new Date().toISOString() }, ...current]);
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
  const tabs = [{ id: "health", label: t.health }, { id: "rules", label: t.rules }, { id: "retention", label: t.retention }, { id: "cleanup", label: t.cleanup }, { id: "storage", label: t.storage }, { id: "roles", label: t.roles }, { id: "audit", label: t.audit }, { id: "quotas", label: t.quotas }, { id: "sponsors", label: t.sponsors }, { id: "revenue", label: t.revenue }] as const;
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
      {tab === "cleanup" && <><div className={styles.sectionHead}><h2>{t.cleanup}</h2><p>{t.previewNote}</p></div><article className={styles.card}><div className={styles.cardHead}><div><h3>{t.sweep}</h3><p>{t.sweepNote}</p></div><button className={styles.action} disabled={busy} onClick={() => void loadSweep()}>{t.sweep}</button></div>{sweep.length===0 ? null : <div className={styles.storageGrid}>{sweep.map(row => <article className={styles.card} key={row.category}><span>{row.category}</span><strong>{row.candidates}</strong><small>{t.sweepCandidates} · {row.oldest ? new Date(row.oldest).toLocaleString(isAr ? "ar-EG" : "en") : "—"}</small></article>)}</div>}</article><article className={styles.card}><div className={styles.scopeGrid}>{categories.map(category => <label key={category} className={styles.toggle}><input type="checkbox" checked={scope.includes(category)} onChange={event => setScope(current => event.target.checked ? [...current, category] : current.filter(item => item !== category))}/>{category}</label>)}</div><hr/><label className={styles.toggle}><input type="checkbox" checked={preserveChat} onChange={event => setPreserveChat(event.target.checked)}/>{t.preserveChat}</label><label className={styles.toggle}><input type="checkbox" checked={preserveMemories} onChange={event => setPreserveMemories(event.target.checked)}/>{t.preserveMemories}</label><label>{t.reason}<textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={500}/></label><p className={styles.warning}>{t.requestOnly}</p><button className={styles.action} disabled={busy || !scope.length} onClick={() => void createPreview()}>{t.preview}</button></article><div className={styles.sectionHead}><h2>{t.request}</h2></div>{jobs.map(job => <article className={styles.card} key={job.id}><div className={styles.cardHead}><h3>{job.status.toUpperCase()}</h3><time>{new Date(job.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</time></div><p>{job.scope.join(" · ")}</p><small>{job.preserve_chat_history ? t.preserveChat : ""} {job.preserve_shared_memories ? t.preserveMemories : ""}</small><div className={styles.metrics}><span>{t.items}: {job.estimated_items ?? "—"}</span><span>{t.recovered}: {job.estimated_bytes == null ? "—" : bytes(job.estimated_bytes)}</span></div><p>{job.reason}</p><div style={{display:"flex",gap:8,marginTop:10}}>{["preview","failed"].includes(job.status) && <button className={styles.action} disabled={busy} onClick={() => void jobAction(job.id, "queue")}>{t.queueJob}</button>}{["queued","running"].includes(job.status) && <button className={styles.action} disabled={busy} onClick={() => void jobAction(job.id, "run")}>{t.runJob}</button>}{["preview","queued"].includes(job.status) && <button className={styles.action} disabled={busy} onClick={() => void jobAction(job.id, "cancel")}>{t.cancelJob}</button>}</div></article>)}</>}
      {tab === "storage" && <><div className={styles.sectionHead}><h2>{t.storage}</h2><p>{t.storageNote}</p></div><div className={styles.storageGrid}>{Object.entries(storageTotals).map(([category, total]) => <article className={styles.card} key={category}><span>{category}</span><strong>{bytes(total.bytes)}</strong><small>{total.objects.toLocaleString()} {t.objects}</small></article>)}</div>{!Object.keys(storageTotals).length && <p>{t.noRows}</p>}</>}
      {tab === "quotas" && <><div className={styles.sectionHead}><h2>{t.quotas}</h2><p>{t.quotaNote}</p><button className={styles.action} disabled={busy} onClick={() => void loadQuotas()}>{t.quotaLoad}</button></div>{quotas.length===0 ? <p>{t.quotaEmpty}</p> : <div className={styles.storageGrid}>{quotas.map(row => <article className={styles.card} key={row.rule_key}><span>{row.rule_key}</span><strong>{row.rejections.toLocaleString()}</strong><small>{t.quotaRejections} · {t.quotaLimit} {row.limit_value} · {row.distinct_users} {t.quotaUsers}{row.last_rejected ? ` · ${t.quotaLast} ${new Date(row.last_rejected).toLocaleString(isAr ? "ar-EG" : "en")}` : ""}</small></article>)}</div>}</>}
      {tab === "sponsors" && <PlatformSponsorManagement />}
      {tab === "revenue" && <PlatformRevenueOverview />}
      {tab === "roles" && <><div className={styles.sectionHead}><h2>{t.roles}</h2><p>{t.ownerOnly}</p></div>{admins.map(item => <article className={styles.card} key={item.user_id}><div className={styles.cardHead}><div><span>{item.active?t.accessActive:t.accessSuspended}</span><h3>{item.display_name ?? item.handle ?? item.user_id}</h3><p>@{item.handle ?? "—"}</p></div><label>{t.role}<select value={item.role} disabled={busy || item.role === "owner"} onChange={event => void changeRole(item.user_id, event.target.value)}><option value="admin">admin</option><option value="creator">creator</option><option value="editor">editor</option><option value="moderator">moderator</option><option value="analyst">analyst</option>{item.role === "owner" && <option value="owner">owner</option>}</select></label></div>{item.role !== "owner" && <button className={styles.action} disabled={busy} onClick={() => void toggleActive(item.user_id, !item.active)}>{item.active ? t.suspend : t.reactivate}</button>}</article>)}</>}
      {tab === "audit" && <><div className={styles.sectionHead}><h2>{t.audit}</h2><p>Append-only administrative history.</p></div><article className={styles.card}><b>{t.auditFilter}</b><div className={styles.fields}><label>{t.auditAction}<input value={auditAction} onChange={event => setAuditAction(event.target.value)} placeholder="safety_report_resolved"/></label><label>{t.auditActor}<input value={auditActor} onChange={event => setAuditActor(event.target.value)} placeholder="00000000-0000-0000-0000-000000000000"/></label></div><div style={{display:"flex",gap:8}}><button className={styles.action} disabled={busy} onClick={() => void loadAudit()}>{t.auditApply}</button><button className={styles.action} onClick={() => { setAuditAction(""); setAuditActor(""); }}>{t.auditClear}</button></div></article>{!audit.length && <p>{t.auditEmpty}</p>}{audit.map(entry => <article className={styles.card} key={entry.id}><div className={styles.cardHead}><h3>{entry.action}</h3><time>{new Date(entry.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</time></div><p>{entry.target_type} · {entry.target_id ?? "—"}</p><p>{entry.reason}</p><pre>{JSON.stringify(entry.details, null, 2)}</pre></article>)}</>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
    </section>
    <footer className={styles.footer}>RAYE2 ADMIN · {t.ownerGuard} · NO AUTOMATIC DELETION FROM THIS SCREEN</footer>
  </main>;
}

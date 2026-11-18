"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";

export type StorageProviderRow = {
  provider_id: string;
  provider_kind: string;
  enabled: boolean;
  priority: number;
  health: string;
  capacity_bytes: number;
  used_bytes: number;
  reserved_bytes: number;
  safety_reserve_bytes: number;
  max_managed_bytes: number | null;
  used_percent: number | null;
  capacity_verified_at: string | null;
  last_reconciled_at: string | null;
  public_bucket: string | null;
  private_bucket: string | null;
};

const bytes = (value: number) => value < 1024 ? value + " B" : value < 1024 ** 2 ? (value / 1024).toFixed(1) + " KB" : value < 1024 ** 3 ? (value / 1024 ** 2).toFixed(1) + " MB" : (value / 1024 ** 3).toFixed(2) + " GB";

/** Admin view of every pooled storage provider and account: capacity, usage, health and controls. */
export default function StorageProviders({ isArabic }: { isArabic: boolean }) {
  const t = isArabic
    ? { title: "مزودو التخزين والحسابات", note: "كل مزود وكل حساب مُجمَّع في نفس المسبح. فعّل أو عطّل، اضبط الأولوية، وزامن السعة الحقيقية.", refresh: "تحديث", reconcile: "مزامنة المزودين", test: "اختبار الاتصال", testing: "جارٍ اختبار التخزين…", tested: "انتهى اختبار الاتصال", reconciled: "تمت مزامنة المزودين", empty: "لا يوجد مزودون مُسجّلون بعد.", provider: "المعرّف", kind: "النوع", enabled: "مفعّل", disabled: "معطّل", enable: "تفعيل", disable: "تعطيل", priority: "الأولوية", capacity: "السعة", used: "المستخدم", reserved: "المحجوز", headroom: "المتاح", percent: "النسبة", verified: "آخر تحقق", never: "أبدًا", health: "الحالة", bucket: "الحاويات", reason: "السبب (مطلوب)", reasonRequired: "اكتب سببًا واضحًا أولًا.", done: "تم التحديث.", fail: "تعذر تحميل المزودين أو تحديثهم." }
    : { title: "Storage providers & accounts", note: "Every provider and account pooled together. Enable or disable, set priority, and reconcile real capacity.", refresh: "Refresh", reconcile: "Reconcile providers", test: "Test connections", testing: "Testing storage…", tested: "Connection test finished", reconciled: "Providers reconciled", empty: "No providers registered yet.", provider: "Provider", kind: "Kind", enabled: "Enabled", disabled: "Disabled", enable: "Enable", disable: "Disable", priority: "Priority", capacity: "Capacity", used: "Used", reserved: "Reserved", headroom: "Headroom", percent: "Used %", verified: "Verified", never: "never", health: "Health", bucket: "Buckets", reason: "Reason (required)", reasonRequired: "Enter a clear reason first.", done: "Updated.", fail: "Could not load or update providers." };

  const [rows, setRows] = useState<StorageProviderRow[]>([]);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [testResults, setTestResults] = useState<Array<{providerId:string;ok:boolean;checks:Array<{visibility:string;ok:boolean;canList?:boolean}>}>>([]);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setNotice(t.fail); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("raye2_storage_provider_list");
      if (error) throw error;
      setRows((data ?? []) as StorageProviderRow[]);
      setNotice("");
    } catch (e) { setRows([]); setNotice(e instanceof Error ? e.message : t.fail); }
    finally { setBusy(false); }
  }, [t.fail]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(providerId: string, enabled: boolean, priority: number) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    if (enabled && !testResults.some(result => result.providerId === providerId && result.ok)) { setNotice(isArabic ? "اختبر الاتصال بنجاح قبل تفعيل هذا المزود." : "Run a successful connection test before enabling this provider."); return; }
    setBusy(true); setNotice("");
    const auditReason = enabled ? "Enabled after successful read-only storage verification" : "Disabled from the Raye2 storage control center";
    const { error } = await supabase.rpc("raye2_set_storage_provider", { p_provider_id: providerId, p_enabled: enabled, p_priority: priority, p_reason: auditReason });
    if (error) setNotice(t.fail);
    else { setNotice(t.done); setReason(""); await load(); }
    setBusy(false);
  }

  async function testConnections() {
    if (busy) return;
    setBusy(true); setNotice(""); setTestResults([]);
    try {
      const response = await fetch("/api/raye2/storage/providers/test", { method: "POST" });
      const data = await response.json().catch(() => null) as { providers?: typeof testResults; error?: string; verified?: number; configured?: number } | null;
      if (!response.ok) throw new Error(data?.error ?? t.fail);
      setTestResults(data?.providers ?? []);
      setNotice(`${t.tested}: ${data?.verified ?? 0}/${data?.configured ?? 0}`);
    } catch (error) { setNotice(error instanceof Error ? error.message : t.fail); }
    finally { setBusy(false); }
  }

  async function reconcile() {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/raye2/storage/providers/discover", { method: "POST" });
      const data = await response.json().catch(() => null) as { discovered?: number; error?: string } | null;
      if (response.ok) { setNotice(`${t.reconciled}: ${data?.discovered ?? 0}`); await load(); }
      else setNotice(data?.error ?? t.fail);
    } catch { setNotice(t.fail); }
    setBusy(false);
  }

  const headroom = (row: StorageProviderRow) => Math.max(0, row.capacity_bytes - row.used_bytes - row.reserved_bytes - row.safety_reserve_bytes);

  return (
    <>
      <div className={styles.sectionHead}>
        <h2>{isArabic ? "إعداد التخزين" : "Storage setup"}</h2>
        <p>{isArabic ? "اتبع الخطوات بالترتيب. لن يتم تفعيل أي مزود قبل نجاح اختبار الاتصال." : "Follow these steps in order. No provider is enabled until its connection test succeeds."}</p>
        <div style={{ display: "flex", gap: 8 }}>
          <button className={styles.action} disabled={busy} onClick={() => void reconcile()}>{isArabic ? "١. اكتشاف التخزين المُعدّ" : "1. Find configured storage"}</button>
          <button className={styles.action} disabled={busy} onClick={() => void testConnections()}>{busy ? t.testing : (isArabic ? "٢. اختبار الاتصال" : "2. Test connections")}</button>
          <button className={styles.action} disabled={busy} onClick={() => void load()}>{t.refresh}</button>
        </div>
      </div>
      {notice ? <p className={styles.warning}>{notice}</p> : null}
      {testResults.length > 0 ? <div className={styles.storageGrid}>{testResults.map(result => <article className={styles.card} key={result.providerId}><div className={styles.cardHead}><h3>{result.providerId}</h3><span className={result.ok ? styles.ok : styles.warning}>{result.ok ? "Connected" : "Check failed"}</span></div>{result.checks.map(check => <small key={check.visibility}>{check.visibility}: {check.ok ? "List permission verified" : "Unavailable or permission denied"}</small>)}</article>)}</div> : null}
      {rows.length === 0 ? <div className={styles.card}><h3>{isArabic ? "لم يتم العثور على مزود تخزين بعد" : "No storage providers found yet"}</h3><p>{isArabic ? "اضغط على اكتشاف التخزين المُعدّ للعثور على Tigris وFilebase باستخدام إعدادات Vercel الحالية." : "Choose Find configured storage to register Tigris and Filebase using the existing Vercel environment settings."}</p></div> : (
        <div className={styles.storageGrid}>
          {rows.map(row => (
            <article className={styles.card} key={row.provider_id}>
              <div className={styles.cardHead}>
                <h3>{row.provider_id}</h3>
                <span className={row.enabled ? styles.ok : styles.warning}>{row.enabled ? t.enabled : t.disabled}</span>
              </div>
              <small>{t.kind}: {row.provider_kind} · {t.priority}: {row.priority} · {t.health}: {row.health}</small>
              <strong>{bytes(row.capacity_bytes)}</strong>
              <small>{t.used}: {bytes(row.used_bytes)}{row.used_percent != null ? ` (${row.used_percent}%)` : ""} · {t.reserved}: {bytes(row.reserved_bytes)} · {t.headroom}: {bytes(headroom(row))}</small>
              <small>{t.bucket}: {row.public_bucket ?? "—"} / {row.private_bucket ?? "—"}</small>
              <small>{t.verified}: {row.capacity_verified_at ? new Date(row.capacity_verified_at).toLocaleString(isArabic ? "ar-EG" : "en") : t.never}</small>
              <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                <button className={styles.action} disabled={busy || (!row.enabled && !testResults.some(result => result.providerId === row.provider_id && result.ok))} title={!row.enabled && !testResults.some(result => result.providerId === row.provider_id && result.ok) ? (isArabic ? "اختبر الاتصال أولاً" : "Test the connection first") : undefined} onClick={() => void toggle(row.provider_id, !row.enabled, row.priority)}>{row.enabled ? t.disable : t.enable}</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}

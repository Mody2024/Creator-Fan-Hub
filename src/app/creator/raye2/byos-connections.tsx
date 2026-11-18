"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";

type ByosRow = { connection_id: string; owner_id: string; provider_id: string; label: string; endpoint: string; region: string; bucket_id: string; connection_state: string; verified_at: string | null; last_error: string | null; updated_at: string };

export default function ByosConnections({ isArabic }: { isArabic: boolean }) {
  const t = isArabic
    ? { title: "تخزين المستخدمين (BYOS)", note: "روابط تخزين يملكها المستخدمون كتجاوز خاص فقط. لا تُعرض الأسرار أبدًا؛ تخزين التسليم العام يبقى على مزودي Raye2.", refresh: "تحديث", empty: "لا توجد روابط بعد.", provider: "المزود", owner: "الحساب", bucket: "الحاوية", state: "الحالة", verified: "موثّق", error: "الخطأ", disable: "تعطيل", rearm: "إعادة تفعيل", reason: "السبب (مطلوب)", reasonRequired: "اكتب سببًا واضحًا أولًا.", done: "تم التحديث.", fail: "تعذر تحميل الروابط أو تحديثها.", pending: "قيد الانتظار", failed: "فاشل", disabled: "معطّل", reconcile: "مزامنة المزودين", reconcileDone: "تمت مزامنة المزودين", migrate: "ترحيل من Supabase", migrateDone: "تم ترحيل الملفات" }
    : { title: "Bring-your-own storage (BYOS)", note: "Contributor-owned buckets used as private overflow only. Secrets are never shown; public delivery stays on Raye2 providers.", refresh: "Refresh", empty: "No connections yet.", provider: "Provider", owner: "Account", bucket: "Bucket", state: "State", verified: "Verified", error: "Error", disable: "Disable", rearm: "Re-arm", reason: "Reason (required)", reasonRequired: "Enter a clear reason first.", done: "Updated.", fail: "Could not load or update connections.", pending: "Pending", failed: "Failed", disabled: "Disabled", reconcile: "Reconcile providers", reconcileDone: "Providers reconciled", migrate: "Migrate from Supabase", migrateDone: "Objects migrated" };

  const [rows, setRows] = useState<ByosRow[]>([]);
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const stateLabel = (state: string) => state === "pending" ? t.pending : state === "failed" ? t.failed : state === "disabled" ? t.disabled : t.verified;

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setNotice(t.fail); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("raye2_admin_byos_connections");
      if (error) throw error;
      setRows((data ?? []) as ByosRow[]);
      setNotice("");
    } catch (e) { setRows([]); setNotice(e instanceof Error ? e.message : t.fail); }
    finally { setBusy(false); }
  }, [t.fail]);

  useEffect(() => { void load(); }, [load]);

  async function setState(connectionId: string, state: "pending" | "disabled") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    if (reason.trim().length < 3) { setNotice(t.reasonRequired); return; }
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_admin_set_byos_state", { p_connection_id: connectionId, p_state: state, p_reason: reason.trim() });
    if (error) setNotice(t.fail);
    else { setNotice(t.done); setReason(""); await load(); }
    setBusy(false);
  }

  async function reconcileProviders() {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/raye2/storage/providers/discover", { method: "POST" });
      const data = await response.json().catch(() => null) as { discovered?: number; error?: string } | null;
      setNotice(response.ok ? `${t.reconcileDone}: ${data?.discovered ?? 0}` : (data?.error ?? t.fail));
    } catch { setNotice(t.fail); }
    setBusy(false);
  }

  async function migrateFromSupabase() {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/raye2/storage/migrate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sourceProviders: ["supabase"] }) });
      const data = await response.json().catch(() => null) as { planned?: number; migrated?: number; error?: string } | null;
      setNotice(response.ok ? `${t.migrateDone}: ${data?.migrated ?? 0}/${data?.planned ?? 0}` : (data?.error ?? t.fail));
    } catch { setNotice(t.fail); }
    setBusy(false);
  }

  return (
    <>
      <div className={styles.sectionHead}><h2>{t.title}</h2><p>{t.note}</p><button className={styles.action} disabled={busy} onClick={() => void load()}>{t.refresh}</button></div>
      <label>{t.reason}<textarea rows={2} value={reason} onChange={event => setReason(event.target.value)} maxLength={500}/></label>
      <div style={{ display: "flex", gap: 8, margin: "8px 0" }}>
        <button className={styles.action} disabled={busy} onClick={() => void reconcileProviders()}>{t.reconcile}</button>
        <button className={styles.action} disabled={busy} onClick={() => void migrateFromSupabase()}>{t.migrate}</button>
      </div>
      {notice ? <p className={styles.warning}>{notice}</p> : null}
      {rows.length === 0 ? <p>{t.empty}</p> : rows.map(row => (
        <article className={styles.card} key={row.connection_id}>
          <div className={styles.cardHead}>
            <div><span>{t.provider}: {row.provider_id}</span><h3>{row.label}</h3><p>{row.endpoint} · {row.region}</p></div>
            <span className={row.connection_state === "verified" ? styles.ok : row.connection_state === "failed" ? styles.critical : styles.warning}>{stateLabel(row.connection_state)}</span>
          </div>
          <small>{t.bucket}: {row.bucket_id} · {t.owner}: {row.owner_id}</small>
          {row.last_error ? <p className={styles.warning}>{t.error}: {row.last_error}</p> : null}
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            {row.connection_state !== "disabled"
              ? <button className={styles.action} disabled={busy} onClick={() => void setState(row.connection_id, "disabled")}>{t.disable}</button>
              : <button className={styles.action} disabled={busy} onClick={() => void setState(row.connection_id, "pending")}>{t.rearm}</button>}
          </div>
        </article>
      ))}
    </>
  );
}

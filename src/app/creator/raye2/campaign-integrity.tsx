"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";

type CampaignRow = { campaign_id: string; status: string; currency: string; budget_amount: number | string | null; daily_impression_cap: number | null; lifetime_impression_cap: number | null; impressions_served: number; invalid_events: number; attributed_net: number | string };
type ReconcileRow = { id: string; source_type: string; campaign_id: string | null; currency: string; state: string; variance: number | string; created_at: string };
type Overview = { scope: string; creator_contract: CampaignRow[]; platform_campaign: CampaignRow[]; reconciliation: ReconcileRow[]; payment_execution_enabled: boolean; viewer_identity_data_exposed: boolean };

const money = (amount: number | string | null, currency: string) => new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD", maximumFractionDigits: 2 }).format(Number(amount) || 0);

export default function CampaignIntegrity({ isArabic }: { isArabic: boolean }) {
  const t = isArabic
    ? { title: "نزاهة الحملات", note: "الميزانيات وحدود الظهور والمراجعة والتسوية. تقارير فقط — لا تنفيذ لمدفوعات.", refresh: "تحديث", budgets: "الميزانيات وحدود الظهور", reconcile: "التسوية", open: "فتح تسوية", state: "الحالة", variance: "الفارق", none: "لا يوجد بعد.", suspicious: "حركة مشبوهة", detect: "فحص الحركة المشبوهة", campaign: "الحملة", impressions: "الظهور", invalid: "مبطَل", budget: "الميزانية", daily: "يومي", lifetime: "إجمالي", attributed: "الإيراد المنسوب" }
    : { title: "Campaign integrity", note: "Budgets, impression caps, review and reconciliation. Reporting only — no payment execution.", refresh: "Refresh", budgets: "Budgets and impression caps", reconcile: "Reconciliation", open: "Open reconciliation", state: "State", variance: "Variance", none: "Nothing yet.", suspicious: "Suspicious traffic", detect: "Detect invalid traffic", campaign: "Campaign", impressions: "Impressions", invalid: "Invalid", budget: "Budget", daily: "Daily", lifetime: "Lifetime", attributed: "Attributed net" };

  const [overview, setOverview] = useState<Overview | null>(null);
  const [suspects, setSuspects] = useState<Array<{ viewer_key_hash: string; campaign_id: string; impressions: number }>>([]);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setNotice("Supabase is not configured."); return; }
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("raye2_campaign_integrity_overview");
      if (error) throw error;
      setOverview(data as Overview);
      setNotice(t.note);
    } catch (e) { setOverview(null); setNotice(e instanceof Error ? e.message : "Could not load campaign integrity."); }
    finally { setBusy(false); }
  }, [t.note]);

  useEffect(() => { void load(); }, [load]);

  async function detect() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("raye2_detect_invalid_traffic", { p_campaign_id: null, p_hours: 1 });
      if (error) throw error;
      setSuspects((data ?? []) as typeof suspects);
      setNotice((data ?? []).length ? `${(data ?? []).length} flagged viewer hashes.` : "No suspicious traffic in the last hour.");
    } catch (e) { setNotice(e instanceof Error ? e.message : "Detection failed."); }
    finally { setBusy(false); }
  }

  async function setState(id: string, state: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_set_reconciliation_state", { p_id: id, p_state: state, p_note: "" });
      if (error) throw error;
      await load();
    } catch (e) { setNotice(e instanceof Error ? e.message : "Could not update state."); }
    finally { setBusy(false); }
  }

  const rows = [...(overview?.creator_contract ?? []), ...(overview?.platform_campaign ?? [])];

  return <section className={styles.section}>
    <div className={styles.sectionHead}><div><span className="eyebrow">RAYE2 / SPONSOR INTEGRITY</span><h2>{t.title}</h2><p>{t.note}</p></div>
      <div style={{ display: "flex", gap: 8 }}>
        <button className={styles.action} disabled={busy} onClick={() => void load()}>{t.refresh}</button>
        <button className={styles.action} disabled={busy} onClick={() => void detect()}>{t.detect}</button>
      </div>
    </div>
    {notice ? <p className={styles.warning}>{notice}</p> : null}
    <div className={styles.sectionHead}><h3>{t.budgets}</h3></div>
    {rows.length === 0 ? <p>{t.none}</p> : <div className={styles.storageGrid}>{rows.map(row => <article className={styles.card} key={row.campaign_id}>
      <div className={styles.cardHead}><h3>{row.status}</h3><span>{row.currency}</span></div>
      <div className={styles.metrics}>
        <span>{t.budget}: {row.budget_amount == null ? "—" : money(row.budget_amount, row.currency)}</span>
        <span>{t.daily}: {row.daily_impression_cap ?? "—"}</span>
        <span>{t.lifetime}: {row.lifetime_impression_cap ?? "—"}</span>
        <span>{t.impressions}: {row.impressions_served}</span>
        <span>{t.invalid}: {row.invalid_events}</span>
        <span>{t.attributed}: {money(row.attributed_net, row.currency)}</span>
      </div>
    </article>)}</div>}
    <div className={styles.sectionHead}><h3>{t.reconcile}</h3></div>
    {(overview?.reconciliation ?? []).length === 0 ? <p>{t.none}</p> : <div className={styles.storageGrid}>{overview!.reconciliation.map(row => <article className={styles.card} key={row.id}>
      <div className={styles.cardHead}><h3>{row.source_type}</h3><span className={styles.warning}>{row.state}</span></div>
      <small>{t.variance}: {money(row.variance, row.currency)} · {new Date(row.created_at).toLocaleString(isArabic ? "ar-EG" : "en")}</small>
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button className={styles.action} disabled={busy} onClick={() => void setState(row.id, "disputed")}>disputed</button>
        <button className={styles.action} disabled={busy} onClick={() => void setState(row.id, "resolved")}>resolved</button>
      </div>
    </article>)}</div>}
    {suspects.length > 0 && <>
      <div className={styles.sectionHead}><h3>{t.suspicious}</h3></div>
      <div className={styles.storageGrid}>{suspects.map(s => <article className={styles.card} key={s.viewer_key_hash}>
        <div className={styles.cardHead}><h3>{s.viewer_key_hash.slice(0, 12)}…</h3><span className={styles.critical}>{s.impressions}</span></div>
        <small>{t.campaign}: {s.campaign_id?.slice(0, 8) ?? "—"}…</small>
      </article>)}</div>
    </>}
  </section>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Lifecycle = { state: string; scheduled_purge_at: string | null; reason: string };
type Preferences = { locale: string; reduced_motion: boolean; email_notifications: boolean; push_notifications: boolean };
type ExportRow = { job_id: string; status: string; created_at: string };

export default function AccountSettings({ locale }: { locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const t = isAr
    ? {
        title: "إعدادات الحساب", note: "أدر تفضيلاتك وحقوق بياناتك: التفضيلات، التصدير، الإيقاف، أو طلب الحذف.",
        state: "الحالة", preferences: "التفضيلات", locale: "اللغة", reducedMotion: "تقليل الحركة",
        email: "إشعارات البريد", push: "الإشعارات الفورية", save: "حفظ التفضيلات",
        export: "تصدير بياناتي", exports: "طلبات التصدير", exportsNone: "لا توجد طلبات تصدير.",
        deactivate: "إيقاف الحساب مؤقتًا", reactivate: "إعادة التنشيط", delete: "طلب حذف الحساب",
        cancelDelete: "إلغاء الحذف", purgeAt: "سيُحذف في", reason: "السبب (اختياري)",
        saved: "تم الحفظ.", err: "تعذر تنفيذ العملية.", deactivated: "تم إيقاف الحساب.", reactivated: "تمت إعادة التنشيط.",
        deleteRequested: "تم تسجيل طلب الحذف (قابل للإلغاء خلال المدة).", exportQueued: "تم تسجيل طلب التصدير."
      }
    : {
        title: "Account settings", note: "Manage your preferences and data rights: preferences, export, deactivation or a deletion request.",
        state: "State", preferences: "Preferences", locale: "Language", reducedMotion: "Reduced motion",
        email: "Email notifications", push: "Push notifications", save: "Save preferences",
        export: "Export my data", exports: "Export requests", exportsNone: "No export requests.",
        deactivate: "Deactivate account", reactivate: "Reactivate", delete: "Request account deletion",
        cancelDelete: "Cancel deletion", purgeAt: "Purge scheduled", reason: "Reason (optional)",
        saved: "Saved.", err: "The operation failed.", deactivated: "Account deactivated.", reactivated: "Account reactivated.",
        deleteRequested: "Deletion requested (cancellable during the grace period).", exportQueued: "Export request recorded."
      };

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const [{ data: lc }, { data: pr }, { data: ex }] = await Promise.all([
      supabase.rpc("raye2_get_account_lifecycle"),
      supabase.rpc("raye2_get_my_preferences"),
      supabase.rpc("raye2_get_my_data_exports")
    ]);
    setLifecycle(((lc ?? []) as Lifecycle[])[0] ?? null);
    setPrefs(((pr ?? []) as Preferences[])[0] ?? null);
    setExports((ex ?? []) as ExportRow[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function run(action: () => Promise<{ error: unknown }>, message: string) {
    if (busy) return;
    setBusy(true); setNotice("");
    const { error } = await action();
    if (error) setNotice(t.err);
    else { setNotice(message); await load(); }
    setBusy(false);
  }

  const supabase = () => getSupabaseBrowserClient();

  return (
    <section className="module-block" id="account-settings">
      <div className="module-heading"><div><h2>{t.title}</h2><p>{t.note}</p></div></div>
      {notice ? <p>{notice}</p> : null}

      <article className="module-card">
        <div className="module-card-top"><span>{t.state}</span><span className="module-state">{lifecycle?.state ?? "—"}</span></div>
        {lifecycle?.scheduled_purge_at ? <small>{t.purgeAt}: {new Date(lifecycle.scheduled_purge_at).toLocaleString(isAr ? "ar-EG" : "en")}</small> : null}
        <label>{t.reason}<input value={lifecycle?.reason ?? ""} readOnly /></label>
        <div className="module-card-top">
          {lifecycle?.state === "active" ? (
            <button className="module-arrow" disabled={busy} onClick={() => void run(async () => supabase()!.rpc("raye2_deactivate_account", { p_reason: "member requested" }), t.deactivated)}>{t.deactivate}</button>
          ) : (
            <button className="module-arrow" disabled={busy} onClick={() => void run(async () => supabase()!.rpc("raye2_reactivate_account"), t.reactivated)}>{lifecycle?.state === "deletion_requested" ? t.cancelDelete : t.reactivate}</button>
          )}
          {lifecycle?.state !== "deletion_requested" ? (
            <button className="module-arrow" disabled={busy} onClick={() => void run(async () => supabase()!.rpc("raye2_request_account_deletion", { p_reason: "member requested" }), t.deleteRequested)}>{t.delete}</button>
          ) : null}
        </div>
      </article>

      <article className="module-card">
        <div className="module-card-top"><span>{t.preferences}</span></div>
        {prefs ? (
          <>
            <label>{t.locale}
              <select value={prefs.locale} onChange={(e) => setPrefs({ ...prefs, locale: e.target.value })}>
                <option value="en">English</option><option value="ar">العربية</option>
              </select>
            </label>
            <label className="module-toggle"><input type="checkbox" checked={prefs.reduced_motion} onChange={(e) => setPrefs({ ...prefs, reduced_motion: e.target.checked })} />{t.reducedMotion}</label>
            <label className="module-toggle"><input type="checkbox" checked={prefs.email_notifications} onChange={(e) => setPrefs({ ...prefs, email_notifications: e.target.checked })} />{t.email}</label>
            <label className="module-toggle"><input type="checkbox" checked={prefs.push_notifications} onChange={(e) => setPrefs({ ...prefs, push_notifications: e.target.checked })} />{t.push}</label>
            <button className="module-arrow" disabled={busy} onClick={() => void run(async () => supabase()!.rpc("raye2_set_my_preferences", { p_locale: prefs.locale, p_reduced_motion: prefs.reduced_motion, p_email_notifications: prefs.email_notifications, p_push_notifications: prefs.push_notifications }), t.saved)}>{t.save}</button>
          </>
        ) : null}
      </article>

      <article className="module-card">
        <div className="module-card-top"><span>{t.export}</span></div>
        <button className="module-arrow" disabled={busy} onClick={() => void run(async () => supabase()!.rpc("raye2_request_data_export"), t.exportQueued)}>{t.export}</button>
        <small>{t.exports}</small>
        {exports.length === 0 ? <p>{t.exportsNone}</p> : exports.map((row) => (
          <small key={row.job_id}>{row.status} · {new Date(row.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</small>
        ))}
      </article>
    </section>
  );
}

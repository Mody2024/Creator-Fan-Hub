"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Lifecycle = { state: string; scheduled_purge_at: string | null; reason: string };
type Preferences = { locale: string; reduced_motion: boolean; email_notifications: boolean; push_notifications: boolean };
type ExportRow = { job_id: string; status: string; created_at: string };
type Restriction = { id: string; action: string; feature: string | null; reason: string; expires_at: string | null; created_at: string; appeal_status: string | null };
type Override = { id: string; capability: string; value: unknown; reason: string; expires_at: string | null };
type EngPrefs = { muted_categories: string[]; quiet_hours_enabled: boolean; quiet_hours_start: string; quiet_hours_end: string; quiet_hours_timezone: string };
type SessionRow = { session_id: string; created_at: string; updated_at: string | null; aal: string | null; not_after: string | null; user_agent: string | null; is_current: boolean };
type StorageObject = { object_id: string; provider_id: string; bucket_id: string; object_key: string; asset_class: string; visibility: string; object_state: string; size_bytes: number; mime_type: string | null; created_at: string };
type ByosRow = { connection_id: string; provider_id: string; label: string; endpoint: string; region: string; bucket_id: string; path_style: boolean; secret_ref: string; connection_state: string; verified_at: string | null; last_error: string | null; updated_at: string };

export default function AccountSettings({ locale }: { locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [lifecycle, setLifecycle] = useState<Lifecycle | null>(null);
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [exports, setExports] = useState<ExportRow[]>([]);
  const [restrictions, setRestrictions] = useState<Restriction[]>([]);
  const [appealText, setAppealText] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Override[]>([]);
  const [eng, setEng] = useState<EngPrefs | null>(null);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [objects, setObjects] = useState<StorageObject[]>([]);
  const [byos, setByos] = useState<ByosRow[]>([]);
  const [byosDraft, setByosDraft] = useState({ provider_id: "storj", label: "", endpoint: "", region: "us1", bucket_id: "", path_style: true, secret_ref: "" });
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
        deleteRequested: "تم تسجيل طلب الحذف (قابل للإلغاء خلال المدة).", exportQueued: "تم تسجيل طلب التصدير.",
        standing: "حالة الحساب", standingNone: "حسابك بحالة جيدة. لا توجد قيود نشطة.", overrides: "صلاحيات خاصة بحسابك", overridesNone: "لا توجد صلاحيات خاصة.", overridesNote: "منحها مسؤول المنصة لحسابك، وقد تنتهي تلقائيًا.", appeal: "استئناف", appealPlaceholder: "اشرح سبب مراجعة القرار (١٠ أحرف على الأقل)…", appealSent: "تم إرسال الاستئناف للمراجعة.", appealPending: "استئناف قيد المراجعة", expires: "ينتهي", notifPrefs: "تفضيلات الإشعارات", notifPrefsNote: "اختر ما لا تريد رؤيته في صندوق الإشعارات، وحدد ساعات الهدوء.", quietHours: "تفعيل ساعات الهدوء", quietStart: "تبدأ", quietEnd: "تنتهي", quietTz: "المنطقة الزمنية", muteHint: "اكتم (لن تظهر في الصندوق)", cat_follow: "المتابعات", cat_reactions: "التفاعلات", cat_comments: "التعليقات", cat_mentions: "الإشارات", cat_announcements: "الإعلانات", cat_events: "الفعاليات", cat_live: "البث المباشر", cat_groups: "المجموعات",         sessions: "الأجهزة والجلسات", sessionsNote: "الأماكن التي سجّلت الدخول منها. أنهِ أي جلسة لا تخصك.", current: "هذه الجلسة", endSession: "إنهاء الجلسة", endOthers: "إنهاء الجلسات الأخرى", noSessions: "لا توجد جلسات.", unknownDevice: "جهاز غير معروف", sessionEnded: "تم إنهاء الجلسة.", sessionsEnded: "تم إنهاء الجلسات الأخرى.", sessionError: "تعذر تحديث الجلسات.",
        storage: "ملفاتي المخزّنة", storageNote: "الملفات التي رفعتها إلى مساحة المنصة. يمكنك حذف أي ملف لتحرير مساحتك.", storageEmpty: "لا توجد ملفات مخزّنة.", storageDelete: "حذف", storageDeleted: "تم حذف الملف.", storageError: "تعذر حذف الملف.", byos: "التخزين الخاص بي (BYOS)", byosNote: "اربط دلو تخزين خاص بك ليكون مساحة احتياطية. تُخزَّن بيانات الاتصال بلا أسرار؛ المفتاح السري يبقى في إعدادات الخادم باسم مرجع.", byosProvider: "المزوّد", byosLabel: "الاسم", byosEndpoint: "نقطة النهاية (https)", byosRegion: "المنطقة", byosBucket: "اسم الدلو", byosPathStyle: "تنسيق المسار", byosSecretRef: "اسم المرجع السري (متغير البيئة)", byosAdd: "ربط الاتصال", byosVerify: "فحص الاتصال", byosDelete: "فصل", byosAdded: "تم ربط الاتصال.", byosVerified: "تم التحقق من الاتصال.", byosFailed: "فشل فحص الاتصال.", byosRemoved: "تم فصل الاتصال.", byosEmpty: "لا توجد اتصالات بعد.", byosState: "الحالة", byosLastError: "آخر خطأ"
      }
    : {
        title: "Account settings", note: "Manage your preferences and data rights: preferences, export, deactivation or a deletion request.",
        state: "State", preferences: "Preferences", locale: "Language", reducedMotion: "Reduced motion",
        email: "Email notifications", push: "Push notifications", save: "Save preferences",
        export: "Export my data", exports: "Export requests", exportsNone: "No export requests.",
        deactivate: "Deactivate account", reactivate: "Reactivate", delete: "Request account deletion",
        cancelDelete: "Cancel deletion", purgeAt: "Purge scheduled", reason: "Reason (optional)",
        saved: "Saved.", err: "The operation failed.", deactivated: "Account deactivated.", reactivated: "Account reactivated.",
        deleteRequested: "Deletion requested (cancellable during the grace period).", exportQueued: "Export request recorded.",
        standing: "Account standing", standingNone: "Your account is in good standing. No active restrictions.", overrides: "Account-specific capabilities", overridesNone: "No account-specific capabilities.", overridesNote: "Granted to your account by a platform administrator; may expire automatically.", appeal: "Appeal", appealPlaceholder: "Explain why this should be reviewed (at least 10 characters)…", appealSent: "Appeal submitted for review.", appealPending: "Appeal under review", expires: "Expires", notifPrefs: "Notification preferences", notifPrefsNote: "Choose what to hide from your inbox, and set quiet hours.", quietHours: "Enable quiet hours", quietStart: "Start", quietEnd: "End", quietTz: "Timezone", muteHint: "Mute (hidden from the inbox)", cat_follow: "Follows", cat_reactions: "Reactions", cat_comments: "Comments", cat_mentions: "Mentions", cat_announcements: "Announcements", cat_events: "Events", cat_live: "Live", cat_groups: "Groups",         sessions: "Devices & sessions", sessionsNote: "Where you are signed in. End any session that is not yours.", current: "This session", endSession: "End session", endOthers: "End other sessions", noSessions: "No sessions.", unknownDevice: "Unknown device", sessionEnded: "Session ended.", sessionsEnded: "Other sessions ended.", sessionError: "Could not update sessions.",
        storage: "My stored files", storageNote: "Files you uploaded to platform storage. Delete any file to free your space.", storageEmpty: "No stored files.", storageDelete: "Delete", storageDeleted: "File deleted.", storageError: "Could not delete the file.", byos: "Bring your own storage (BYOS)", byosNote: "Connect your own bucket as private overflow. Connection details are stored secret-free; the key stays in server settings under a reference name.", byosProvider: "Provider", byosLabel: "Label", byosEndpoint: "Endpoint (https)", byosRegion: "Region", byosBucket: "Bucket name", byosPathStyle: "Path style", byosSecretRef: "Secret reference name (environment variable)", byosAdd: "Connect", byosVerify: "Test connection", byosDelete: "Disconnect", byosAdded: "Connection saved.", byosVerified: "Connection verified.", byosFailed: "Connection test failed.", byosRemoved: "Connection removed.", byosEmpty: "No connections yet.", byosState: "State", byosLastError: "Last error"
      };

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const [{ data: lc }, { data: pr }, { data: ex }, { data: rs }, { data: ov }, { data: ep }, { data: se }, { data: so }, { data: by }] = await Promise.all([
      supabase.rpc("raye2_get_account_lifecycle"),
      supabase.rpc("raye2_get_my_preferences"),
      supabase.rpc("raye2_get_my_data_exports"),
      supabase.rpc("raye2_get_my_restrictions"),
      supabase.rpc("raye2_get_my_capability_overrides"),
      supabase.rpc("raye2_get_my_engagement_notification_preferences"),
      supabase.rpc("raye2_my_sessions"),
      supabase.rpc("raye2_my_storage_objects", { p_limit: 100 }),
      supabase.rpc("raye2_my_byos_connections")
    ]);
    setLifecycle(((lc ?? []) as Lifecycle[])[0] ?? null);
    setPrefs(((pr ?? []) as Preferences[])[0] ?? null);
    setExports((ex ?? []) as ExportRow[]);
    setRestrictions((rs ?? []) as Restriction[]);
    setOverrides((ov ?? []) as Override[]);
    setEng(((ep ?? []) as EngPrefs[])[0] ?? null);
    setSessions((se ?? []) as SessionRow[]);
    setObjects((so ?? []) as StorageObject[]);
    setByos((by ?? []) as ByosRow[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function endSession(sessionId: string) {
    const sb = supabase(); if (!sb) return;
    setBusy(true); setNotice("");
    const { error } = await sb.rpc("raye2_revoke_my_session", { p_session_id: sessionId });
    if (error) setNotice(t.sessionError); else { setNotice(t.sessionEnded); await load(); }
    setBusy(false);
  }

  async function endOtherSessions() {
    const sb = supabase(); if (!sb) return;
    setBusy(true); setNotice("");
    const { error } = await sb.rpc("raye2_revoke_other_sessions");
    if (error) setNotice(t.sessionError); else { setNotice(t.sessionsEnded); await load(); }
    setBusy(false);
  }

  async function run(action: () => Promise<{ error: unknown }>, message: string) {
    if (busy) return;
    setBusy(true); setNotice("");
    const { error } = await action();
    if (error) setNotice(t.err);
    else { setNotice(message); await load(); }
    setBusy(false);
  }

  async function deleteObject(objectId: string) {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/raye2/storage/object", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "delete", objectId }) });
      const data = await response.json().catch(() => null) as { error?: string } | null;
      setNotice(response.ok ? t.storageDeleted : (data?.error ?? t.storageError));
      if (response.ok) await load();
    } catch {
      setNotice(t.storageError);
    }
    setBusy(false);
  }

  async function saveByosConnection() {
    const sb = supabase(); if (!sb || busy) return;
    setBusy(true); setNotice("");
    const { error } = await sb.rpc("raye2_upsert_byos_connection", {
      p_connection_id: null,
      p_provider_id: byosDraft.provider_id,
      p_label: byosDraft.label,
      p_endpoint: byosDraft.endpoint,
      p_region: byosDraft.region,
      p_bucket_id: byosDraft.bucket_id,
      p_path_style: byosDraft.path_style,
      p_secret_ref: byosDraft.secret_ref
    });
    if (error) setNotice(t.err); else { setNotice(t.byosAdded); await load(); }
    setBusy(false);
  }

  async function verifyByosConnection(connectionId: string) {
    if (busy) return;
    setBusy(true); setNotice("");
    try {
      const response = await fetch("/api/raye2/storage/byos", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ connectionId }) });
      const data = await response.json().catch(() => null) as { state?: string; error?: string } | null;
      setNotice(response.ok && data?.state === "verified" ? t.byosVerified : (data?.error ?? t.byosFailed));
      await load();
    } catch {
      setNotice(t.byosFailed);
    }
    setBusy(false);
  }

  async function removeByosConnection(connectionId: string) {
    const sb = supabase(); if (!sb || busy) return;
    setBusy(true); setNotice("");
    const { error } = await sb.rpc("raye2_delete_byos_connection", { p_connection_id: connectionId });
    if (error) setNotice(t.err); else { setNotice(t.byosRemoved); await load(); }
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

      {eng ? (
        <article className="module-card">
          <div className="module-card-top"><span>{t.notifPrefs}</span></div>
          <p><small>{t.notifPrefsNote}</small></p>
          {([["follow", t.cat_follow], ["reactions", t.cat_reactions], ["comments", t.cat_comments], ["mentions", t.cat_mentions], ["announcements", t.cat_announcements], ["events", t.cat_events], ["live", t.cat_live], ["groups", t.cat_groups]] as [string, string][]).map(([key, label]) => (
            <label key={key} className="module-toggle">
              <input type="checkbox" checked={(eng.muted_categories ?? []).includes(key)} onChange={() => setEng({ ...eng, muted_categories: (eng.muted_categories ?? []).includes(key) ? (eng.muted_categories ?? []).filter((x) => x !== key) : [...(eng.muted_categories ?? []), key] })} />
              {label}
            </label>
          ))}
          <small>{t.muteHint}</small>
          <label className="module-toggle"><input type="checkbox" checked={eng.quiet_hours_enabled} onChange={(e) => setEng({ ...eng, quiet_hours_enabled: e.target.checked })} />{t.quietHours}</label>
          <label>{t.quietStart}<input type="time" value={eng.quiet_hours_start.slice(0, 5)} onChange={(e) => setEng({ ...eng, quiet_hours_start: e.target.value })} /></label>
          <label>{t.quietEnd}<input type="time" value={eng.quiet_hours_end.slice(0, 5)} onChange={(e) => setEng({ ...eng, quiet_hours_end: e.target.value })} /></label>
          <label>{t.quietTz}<input value={eng.quiet_hours_timezone} onChange={(e) => setEng({ ...eng, quiet_hours_timezone: e.target.value })} /></label>
          <button className="module-arrow" disabled={busy} onClick={() => void run(async () => supabase()!.rpc("raye2_set_engagement_notification_preferences", { p_muted_categories: eng.muted_categories ?? [], p_quiet_hours_enabled: eng.quiet_hours_enabled, p_quiet_hours_start: eng.quiet_hours_start, p_quiet_hours_end: eng.quiet_hours_end, p_quiet_hours_timezone: eng.quiet_hours_timezone }), t.saved)}>{t.save}</button>
        </article>
      ) : null}

      <article className="module-card">
        <div className="module-card-top"><span>{t.standing}</span><span className="module-state">{restrictions.length ? restrictions.length : "✓"}</span></div>
        {restrictions.length === 0 ? <p>{t.standingNone}</p> : restrictions.map((r) => (
          <div key={r.id}>
            <strong>{r.action}{r.feature ? ` · ${r.feature}` : ""}</strong>
            <p>{r.reason}</p>
            {r.expires_at ? <small>{t.expires}: {new Date(r.expires_at).toLocaleString(isAr ? "ar-EG" : "en")}</small> : null}
            {r.appeal_status ? <small>{t.appealPending} ({r.appeal_status})</small> : (
              <>
                <label>{t.appeal}
                  <textarea value={appealText[r.id] ?? ""} placeholder={t.appealPlaceholder} onChange={(e) => setAppealText({ ...appealText, [r.id]: e.target.value })} />
                </label>
                <button className="module-arrow" disabled={busy || (appealText[r.id] ?? "").trim().length < 10} onClick={() => void run(async () => supabase()!.rpc("raye2_submit_moderation_appeal", { p_restriction_id: r.id, p_message: (appealText[r.id] ?? "").trim() }), t.appealSent)}>{t.appeal}</button>
              </>
            )}
          </div>
        ))}
      </article>

      {overrides.length ? (
        <article className="module-card">
          <div className="module-card-top"><span>{t.overrides}</span><span className="module-state">{overrides.length}</span></div>
          <p><small>{t.overridesNote}</small></p>
          {overrides.map((o) => (
            <div key={o.id}>
              <strong>{o.capability}</strong>
              <small>{JSON.stringify(o.value)}{o.expires_at ? ` · ${t.expires}: ${new Date(o.expires_at).toLocaleString(isAr ? "ar-EG" : "en")}` : ""}</small>
            </div>
          ))}
        </article>
      ) : null}

      <article className="module-card">
        <div className="module-card-top"><span>{t.sessions}</span></div>
        <p><small>{t.sessionsNote}</small></p>
        {sessions.length === 0 ? <p>{t.noSessions}</p> : sessions.map((row) => (
          <div key={row.session_id}>
            <strong>{row.user_agent || t.unknownDevice}{row.is_current ? ` · ${t.current}` : ""}</strong>
            <small>{new Date(row.updated_at || row.created_at).toLocaleString(isAr ? "ar-EG" : "en")}{row.aal ? ` · ${row.aal.toUpperCase()}` : ""}</small>
            {!row.is_current ? <button className="module-arrow" disabled={busy} onClick={() => void endSession(row.session_id)}>{t.endSession}</button> : null}
          </div>
        ))}
        {sessions.some((row) => !row.is_current) ? <button className="module-arrow" disabled={busy} onClick={() => void endOtherSessions()}>{t.endOthers}</button> : null}
      </article>

      <article className="module-card">
        <div className="module-card-top"><span>{t.export}</span></div>
        <button className="module-arrow" disabled={busy} onClick={() => void run(async () => supabase()!.rpc("raye2_request_data_export"), t.exportQueued)}>{t.export}</button>
        <small>{t.exports}</small>
        {exports.length === 0 ? <p>{t.exportsNone}</p> : exports.map((row) => (
          <small key={row.job_id}>{row.status} · {new Date(row.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</small>
        ))}
      </article>

      <article className="module-card">
        <div className="module-card-top"><span>{t.storage}</span><span className="module-state">{objects.length}</span></div>
        <p><small>{t.storageNote}</small></p>
        {objects.length === 0 ? <p>{t.storageEmpty}</p> : objects.map((o) => (
          <div key={o.object_id}>
            <strong>{o.asset_class} · {o.bucket_id}</strong>
            <small>{o.visibility} · {(o.size_bytes / (1024 * 1024)).toFixed(1)} MB · {new Date(o.created_at).toLocaleString(isAr ? "ar-EG" : "en")}</small>
            <button className="module-arrow" disabled={busy} onClick={() => void deleteObject(o.object_id)}>{t.storageDelete}</button>
          </div>
        ))}
      </article>

      <article className="module-card">
        <div className="module-card-top"><span>{t.byos}</span><span className="module-state">{byos.length}</span></div>
        <p><small>{t.byosNote}</small></p>
        {byos.length === 0 ? <p>{t.byosEmpty}</p> : byos.map((c) => (
          <div key={c.connection_id}>
            <strong>{c.label || c.provider_id} · {c.bucket_id}</strong>
            <small>{t.byosState}: {c.connection_state} · {c.endpoint}</small>
            {c.last_error ? <small>{t.byosLastError}: {c.last_error}</small> : null}
            <div className="module-card-top">
              <button className="module-arrow" disabled={busy} onClick={() => void verifyByosConnection(c.connection_id)}>{t.byosVerify}</button>
              <button className="module-arrow" disabled={busy} onClick={() => void removeByosConnection(c.connection_id)}>{t.byosDelete}</button>
            </div>
          </div>
        ))}
        <label>{t.byosProvider}
          <select value={byosDraft.provider_id} onChange={(e) => setByosDraft({ ...byosDraft, provider_id: e.target.value })}>
            <option value="storj">Storj</option><option value="backblaze_b2">Backblaze B2</option><option value="cloudflare_r2">Cloudflare R2</option>
          </select>
        </label>
        <label>{t.byosLabel}<input value={byosDraft.label} onChange={(e) => setByosDraft({ ...byosDraft, label: e.target.value })} /></label>
        <label>{t.byosEndpoint}<input value={byosDraft.endpoint} placeholder="https://gateway.storjshare.io" onChange={(e) => setByosDraft({ ...byosDraft, endpoint: e.target.value })} /></label>
        <label>{t.byosRegion}<input value={byosDraft.region} onChange={(e) => setByosDraft({ ...byosDraft, region: e.target.value })} /></label>
        <label>{t.byosBucket}<input value={byosDraft.bucket_id} onChange={(e) => setByosDraft({ ...byosDraft, bucket_id: e.target.value })} /></label>
        <label>{t.byosSecretRef}<input value={byosDraft.secret_ref} placeholder="RAYE2_BYOS_STORJ" onChange={(e) => setByosDraft({ ...byosDraft, secret_ref: e.target.value })} /></label>
        <label className="module-toggle"><input type="checkbox" checked={byosDraft.path_style} onChange={(e) => setByosDraft({ ...byosDraft, path_style: e.target.checked })} />{t.byosPathStyle}</label>
        <button className="module-arrow" disabled={busy || !byosDraft.endpoint || !byosDraft.bucket_id || !byosDraft.secret_ref} onClick={() => void saveByosConnection()}>{t.byosAdd}</button>
      </article>
    </section>
  );
}

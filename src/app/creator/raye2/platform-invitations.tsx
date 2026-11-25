"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";

type InviteRow = { id: string; email: string | null; max_uses: number; uses: number; expires_at: string; created_at: string; revoked_at: string | null };

function randomToken() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
}

export default function PlatformInvitations({ isArabic }: { isArabic: boolean }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [rows, setRows] = useState<InviteRow[]>([]);
  const [email, setEmail] = useState("");
  const [expiryDays, setExpiryDays] = useState("7");
  const [maxUses, setMaxUses] = useState("1");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [createdLink, setCreatedLink] = useState("");

  const copy = isArabic ? {
    note: "دعوات إنشاء حسابات Raye2 على مستوى المنصة. دعوات المجموعات منفصلة.",
    load: "تحديث الدعوات", create: "إنشاء دعوة", email: "البريد الإلكتروني (اختياري)",
    expiry: "تنتهي خلال (أيام)", uses: "عدد مرات الاستخدام", active: "نشطة",
    revoked: "ملغاة", expired: "منتهية", exhausted: "مستنفدة", copy: "انسخ الرابط",
    created: "تم إنشاء الدعوة. انسخ الرابط الآن؛ لن يظهر الرمز مرة أخرى.",
    revokedDone: "تم إلغاء الدعوة.", error: "تعذر تنفيذ العملية. تحقق من صلاحيات المالك.",
    empty: "لا توجد دعوات بعد.", revoke: "إلغاء الدعوة", status: "الحالة", createdAt: "تاريخ الإنشاء",
    inviteLink: "رابط الدعوة — يظهر مرة واحدة فقط"
  } : {
    note: "Platform-wide account invitations. These are separate from private group invitations.",
    load: "Refresh invitations", create: "Create invitation", email: "Email restriction (optional)",
    expiry: "Expires in (days)", uses: "Allowed uses", active: "Active",
    revoked: "Revoked", expired: "Expired", exhausted: "Used up", copy: "Copy link",
    created: "Invitation created. Copy the link now; the token will not be shown again.",
    revokedDone: "Invitation revoked.", error: "Could not complete the action. Check owner permissions.",
    empty: "No invitations yet.", revoke: "Revoke invitation", status: "Status", createdAt: "Created",
    inviteLink: "Invitation link — shown once only"
  };

  async function load() {
    if (!supabase) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_list_platform_invites");
    setBusy(false);
    if (error) { setNotice(copy.error); return; }
    setRows((data ?? []) as InviteRow[]);
  }

  // Load the invitation inventory as soon as an owner opens this tab. The manual
  // refresh remains available for updates made in another admin session.
  useEffect(() => {
    let active = true;
    if (!supabase) return;
    setBusy(true);
    void (async () => {
      try {
        const { data, error } = await supabase.rpc("raye2_list_platform_invites");
        if (!active) return;
        setBusy(false);
        if (error) { setNotice(copy.error); return; }
        setRows((data ?? []) as InviteRow[]);
      } catch {
        if (!active) return;
        setBusy(false);
        setNotice(copy.error);
      }
    })();
    return () => { active = false; };
  }, [supabase, isArabic]);

  async function create() {
    if (!supabase || busy) return;
    const token = randomToken();
    const expiresAt = new Date(Date.now() + Number(expiryDays) * 86400000).toISOString();
    setBusy(true); setNotice(""); setCreatedLink("");
    const { error } = await supabase.rpc("raye2_create_platform_invite", {
      p_token: token,
      p_email: email.trim() || null,
      p_expires_at: expiresAt,
      p_max_uses: Number(maxUses)
    });
    setBusy(false);
    if (error) { setNotice(copy.error); return; }
    setCreatedLink(window.location.origin + "/community?raye2_access_invite=" + token + "#join");
    setNotice(copy.created);
    setEmail("");
    await load();
  }

  async function revoke(id: string) {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_revoke_platform_invite", { p_invite_id: id });
    setBusy(false);
    if (error) { setNotice(copy.error); return; }
    setNotice(copy.revokedDone);
    await load();
  }

  const statusOf = (row: InviteRow) => row.revoked_at ? copy.revoked : new Date(row.expires_at).getTime() <= Date.now() ? copy.expired : row.uses >= row.max_uses ? copy.exhausted : copy.active;

  return <div>
    <p>{copy.note}</p>
    <article className={styles.card}>
      <div className={styles.fields}>
        <label>{copy.email}<input type="email" value={email} onChange={event => setEmail(event.target.value)} maxLength={254} placeholder="name@example.com"/></label>
        <label>{copy.expiry}<select value={expiryDays} onChange={event => setExpiryDays(event.target.value)}>{[1,3,7,14,30].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>{copy.uses}<select value={maxUses} onChange={event => setMaxUses(event.target.value)}>{[1,2,5,10,25,50,100].map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      </div>
      <button className={styles.action} disabled={busy} onClick={() => void create()}>{copy.create}</button>
      {createdLink && <div style={{marginTop:12}}>
        <label>{copy.inviteLink}<input readOnly value={createdLink} onFocus={event => event.currentTarget.select()}/></label>
        <button className={styles.action} onClick={() => void navigator.clipboard.writeText(createdLink)}>{copy.copy}</button>
      </div>}
    </article>
    <div className={styles.sectionHead}><h3>{copy.status}</h3><button className={styles.action} disabled={busy} onClick={() => void load()}>{copy.load}</button></div>
    {rows.length === 0 ? <p>{copy.empty}</p> : rows.map(row => <article className={styles.card} key={row.id}>
      <div className={styles.cardHead}><div><strong>{row.email || (isArabic ? "أي بريد إلكتروني" : "Any email")}</strong><p>{row.uses}/{row.max_uses} · {copy.createdAt}: {new Date(row.created_at).toLocaleDateString(isArabic ? "ar-EG" : "en")}</p><small>{new Date(row.expires_at).toLocaleString(isArabic ? "ar-EG" : "en")}</small></div><span>{statusOf(row)}</span></div>
      {!row.revoked_at && new Date(row.expires_at).getTime() > Date.now() && row.uses < row.max_uses && <button className={styles.action} disabled={busy} onClick={() => void revoke(row.id)}>{copy.revoke}</button>}
    </article>)}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
  </div>;
}

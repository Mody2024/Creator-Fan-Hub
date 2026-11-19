"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";

type Channel = {
  id: string;
  channel_url: string;
  channel_handle: string;
  channel_title: string | null;
  enabled: boolean;
  placements: string[];
  created_at: string;
};

const PLACEMENTS = [
  { id: "video", label: "Video previews" },
  { id: "live", label: "Live previews" },
  { id: "minis", label: "Mini feed" },
  { id: "community", label: "Community posts" }
];

function parseChannelUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname.toLowerCase())) return null;
    const handle = url.pathname.match(/^\/@([A-Za-z0-9._-]{3,})\/?$/)?.[1];
    const channelId = url.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{20,})\/?$/)?.[1];
    if (handle) return { channel_handle: handle.toLowerCase(), channel_url: `https://www.youtube.com/@${handle}` };
    if (channelId) return { channel_handle: `channel:${channelId}`, channel_url: `https://www.youtube.com/channel/${channelId}` };
    return null;
  } catch { return null; }
}

export default function YouTubeChannelSources({ isArabic = false }: { isArabic?: boolean }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const placementLabel = (id: string, english: string) => isArabic ? ({ video: "معاينات الفيديو", live: "معاينات البث", minis: "خلاصة الميني", community: "منشورات المجتمع" }[id] ?? english) : english;
  const [channels, setChannels] = useState<Channel[]>([]);
  const [url, setUrl] = useState("");
  const [placements, setPlacements] = useState<string[]>(["video", "live", "minis", "community"]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from("raye2_youtube_promo_channels")
      .select("id,channel_url,channel_handle,channel_title,enabled,placements,created_at")
      .order("created_at", { ascending: false });
    if (loadError) { setError(isArabic ? "تعذر تحميل القنوات. طبّق ترحيل قاعدة بيانات Raye2 أولًا." : "Could not load channel sources. Apply the latest Raye2 database migration first."); return; }
    setChannels((data ?? []) as Channel[]);
    setError("");
  }, [supabase, isArabic]);

  useEffect(() => { void load(); }, [load]);

  async function addChannel() {
    if (!supabase) return;
    const parsed = parseChannelUrl(url);
    if (!parsed) { setError(isArabic ? "أدخل رابط قناة يوتيوب عام بصيغة @handle أو /channel/UC…" : "Enter a public YouTube channel URL in @handle or /channel/UC… format."); return; }
    if (!placements.length) { setError(isArabic ? "اختر موضعًا واحدًا على الأقل." : "Choose at least one placement."); return; }
    setBusy(true); setError(""); setNotice("");
    const { error: insertError } = await supabase.from("raye2_youtube_promo_channels").insert({
      ...parsed, enabled: true, placements
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.code === "23505" ? (isArabic ? "هذه القناة متصلة بالفعل." : "That channel is already connected.") : insertError.message);
      return;
    }
    setUrl(""); setNotice(isArabic ? "تمت إضافة القناة. سيكتشف Raye2 فيديوهاتها العامة تلقائيًا." : "Channel added. Its public uploads will be discovered automatically.");
    await load();
  }

  async function updateChannel(id: string, patch: Partial<Pick<Channel, "enabled" | "placements">>) {
    if (!supabase) return;
    setBusy(true); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("raye2_youtube_promo_channels").update(patch).eq("id", id);
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    setNotice(isArabic ? "تم حفظ إعدادات القناة." : "Channel settings saved."); await load();
  }

  async function removeChannel(id: string) {
    if (!supabase || !window.confirm(isArabic ? "إزالة هذه القناة من ترويج Raye2؟" : "Remove this YouTube channel from Raye2 promotions?")) return;
    setBusy(true); setError(""); setNotice("");
    const { error: deleteError } = await supabase.from("raye2_youtube_promo_channels").delete().eq("id", id);
    setBusy(false);
    if (deleteError) { setError(deleteError.message); return; }
    setNotice(isArabic ? "تمت إزالة القناة." : "Channel removed."); await load();
  }

  return <section style={{ display: "grid", gap: 16 }}>
    <div className={styles.sectionHead}>
      <div><h2>{isArabic ? "مصادر قنوات يوتيوب" : "YouTube channel sources"}</h2><p>{isArabic ? "أضف القناة مرة واحدة. يكتشف Raye2 الفيديوهات العامة ويتحقق من المحتوى الجديد تلقائيًا." : "Connect channels once. Raye2 discovers their public uploads and checks for new videos automatically."}</p></div>
      <button type="button" className={styles.action} disabled={busy} onClick={() => void load()}>{isArabic ? "تحديث القائمة" : "Refresh list"}</button>
    </div>
    <article className={styles.card} style={{ display: "grid", gap: 12 }}>
      <div><h3>{isArabic ? "إضافة قناة" : "Add a channel"}</h3><p>{isArabic ? "أدخل رابط الصفحة الرئيسية للقناة. لا تحتاج إلى قائمة تشغيل Shorts." : "Paste a channel homepage URL. No Shorts playlist is required."}</p></div>
      <label>{isArabic ? "رابط القناة" : "Channel URL"}<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://youtube.com/@channelname" autoComplete="url"/></label>
      <div><strong>{isArabic ? "استخدم هذه القناة في" : "Use this channel in"}</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
        {PLACEMENTS.map(item => <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={placements.includes(item.id)} onChange={event => setPlacements(current => event.target.checked ? [...current, item.id] : current.filter(value => value !== item.id))}/>
          {item.label}
        </label>)}
      </div></div>
      <div><button type="button" className={styles.action} disabled={busy} onClick={() => void addChannel()}>{isArabic ? "إضافة القناة" : "Add channel"}</button></div>
      {error ? <p role="alert" style={{ color: "var(--raye2-danger,#c44)" }}>{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </article>
    <div className={styles.sectionHead}><div><h2>{isArabic ? "القنوات المتصلة" : "Connected channels"}</h2><p>{channels.length} {isArabic ? "قنوات" : "channel sources"}</p></div></div>
    {channels.length === 0 ? <article className={styles.card}><p>{isArabic ? "لا توجد قنوات متصلة بعد." : "No channels connected yet."}</p></article> : channels.map(channel => <article className={styles.card} key={channel.id} style={{ display: "grid", gap: 12 }}>
      <div className={styles.cardHead}><div><h3>{channel.channel_title || `@${channel.channel_handle.replace(/^channel:/, "")}`}</h3><a href={channel.channel_url} target="_blank" rel="noopener noreferrer">{channel.channel_url}</a><p>{isArabic ? "اكتشاف تلقائي · تحديث كل 6 ساعات عند طلب المحتوى" : "Automatic discovery · refreshes every 6 hours when content is requested"}</p></div>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={channel.enabled} disabled={busy} onChange={event => void updateChannel(channel.id, { enabled: event.target.checked })}/>{isArabic ? "مفعّلة" : "Enabled"}</label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{PLACEMENTS.map(item => <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={channel.placements.includes(item.id)} disabled={busy} onChange={event => void updateChannel(channel.id, { placements: event.target.checked ? [...channel.placements, item.id] : channel.placements.filter(value => value !== item.id) })}/>{placementLabel(item.id, item.label)}</label>)}</div>
      <div><button type="button" className={styles.action} disabled={busy} onClick={() => void removeChannel(channel.id)}>{isArabic ? "إزالة القناة" : "Remove channel"}</button></div>
    </article>)}
    <p style={{ fontSize: 12, opacity: .7 }}>{isArabic ? "يقرأ Raye2 بيانات الفيديوهات العامة ويعرض مشغل يوتيوب الأصلي. لا ينزّل فيديوهات القنوات ولا يعيد رفعها." : "Raye2 reads public YouTube metadata and embeds original YouTube videos. It does not download or re-upload channel videos."}</p>
  </section>;
}

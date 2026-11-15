"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type ContentState = "draft" | "scheduled" | "published" | "expired" | "processing" | "taken_down";

type ContentRow = {
  media_id: string;
  title: string;
  media_type: string;
  slug: string;
  category: string;
  is_published: boolean;
  processing_status: string | null;
  published_at: string | null;
  publish_at: string | null;
  expires_at: string | null;
  taken_down: boolean;
  state: ContentState;
  view_count: number | string;
  reaction_count: number | string;
  comment_count: number | string;
};

const STATES: ContentState[] = ["published", "scheduled", "draft", "expired", "processing", "taken_down"];

const LABELS = {
  en: {
    eyebrow: "CREATOR STUDIO / CONTENT LIBRARY",
    title: "Everything you own, ",
    emphasis: "one list.",
    intro: "Every long video you own, with its current state: published, scheduled, draft, expired, still processing or taken down. Filters and counts are derived server-side.",
    search: "Search title, slug or category…",
    all: "All",
    empty: "No content matches this filter.",
    loadFail: "Could not load the content library. Check your connection and try again.",
    state: "State",
    published: "Published",
    scheduled: "Scheduled",
    draft: "Draft",
    expired: "Expired",
    processing: "Processing",
    taken_down: "Taken down",
    views: "Views",
    reactions: "Reactions",
    comments: "Comments",
    open: "Open watch page ↗",
    goLive: "Goes live",
    expires: "Expires",
    notLive: "Not live yet",
    loading: "Loading your content library…",
    takenDownNote: "Taken down by moderation. Contact the platform team about reinstatement.",
    retry: "Retry processing",
    retryQueued: "The asset was queued again. It becomes ready after the worker succeeds.",
    retryLimit: "This asset has reached its manual retry limit.",
    retryFail: "This asset cannot be retried now.",
    quotaTitle: "Quota & cooldown",
    longVideoQuota: "Long videos left this month",
    cooldown: "Long-video cooldown",
    cooldownReady: "You can publish a long video now.",
    cooldownWait: "Next allowed",
    cooldownDays: "days",
    quotaUnavailable: "Quota details are unavailable."
  },
  ar: {
    eyebrow: "استوديو Raye2 / مكتبة المحتوى",
    title: "كل ما تملكه، ",
    emphasis: "في قائمة واحدة.",
    intro: "كل فيديو طويل تملكه مع حالته الحالية: منشور، مجدول، مسودة، منتهٍ، قيد المعالجة أو مُزال. تُحسب الفلاتر والعدادات من الخادم.",
    search: "ابحث بالعنوان أو المعرّف أو التصنيف…",
    all: "الكل",
    empty: "لا يوجد محتوى مطابق لهذا الفلتر.",
    loadFail: "تعذر تحميل مكتبة المحتوى. تحقق من الاتصال وحاول مرة أخرى.",
    state: "الحالة",
    published: "منشور",
    scheduled: "مجدول",
    draft: "مسودة",
    expired: "منتهٍ",
    processing: "قيد المعالجة",
    taken_down: "مُزال",
    views: "مشاهدات",
    reactions: "تفاعلات",
    comments: "تعليقات",
    open: "افتح صفحة المشاهدة ↗",
    goLive: "يُنشر في",
    expires: "ينتهي",
    notLive: "غير منشور بعد",
    loading: "جارٍ تحميل مكتبة المحتوى…",
    takenDownNote: "أُزيل بواسطة الإشراف. تواصل مع فريق المنصة بشأن إعادة التفعيل.",
    retry: "إعادة محاولة المعالجة",
    retryQueued: "تمت إعادة الملف إلى قائمة المعالجة. سيظهر جاهزًا بعد نجاح العامل.",
    retryLimit: "تم استنفاد محاولات الإعادة اليدوية لهذا الملف.",
    retryFail: "لا يمكن إعادة هذا الملف الآن.",
    quotaTitle: "الحصة وفترة الانتظار",
    longVideoQuota: "الفيديوهات الطويلة المتبقية هذا الشهر",
    cooldown: "فترة انتظار الفيديو الطويل",
    cooldownReady: "يمكنك نشر فيديو طويل الآن.",
    cooldownWait: "الموعد المسموح التالي",
    cooldownDays: "يوم",
    quotaUnavailable: "تفاصيل الحصة غير متاحة."
  }
} as const;

function toNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

type Capabilities = {
  quotas?: Record<string, number | null>;
  usage?: Record<string, number | null>;
  cooldown?: {
    long_video_cooldown_days?: number | null;
    next_allowed_at?: string | null;
    can_publish_long_video_now?: boolean;
  };
};

export default function ContentLibrary({ locale = "en" }: { locale?: "en" | "ar" }) {
  const t = LABELS[locale];
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<string>(t.loading);
  const [filter, setFilter] = useState<"all" | ContentState>("all");
  const [search, setSearch] = useState("");
  const [caps, setCaps] = useState<Capabilities | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setReady(true); setStatus(t.loadFail); return; }
    try {
      const { data, error } = await supabase.rpc("raye2_creator_content_library");
      if (error) throw error;
      const { data: capData } = await supabase.rpc("raye2_get_creator_capabilities");
      setCaps((capData ?? null) as Capabilities | null);
      const list = Array.isArray(data) ? (data as ContentRow[]) : [];
      setRows(list);
      setStatus(list.length === 0 ? t.empty : "");
    } catch {
      setRows([]);
      setStatus(t.loadFail);
    } finally {
      setReady(true);
    }
  }, [supabase, t]);

  const retry = useCallback(async (mediaId: string) => {
    if (!supabase) return;
    setStatus("");
    try {
      const { data, error } = await supabase.rpc("retry_raye2_media_processing", { p_media_id: mediaId });
      if (error) throw error;
      const result = Array.isArray(data) ? data[0] as { retried?: boolean; result_code?: string } : null;
      if (!result?.retried) {
        setStatus(result?.result_code === "retry_limit" ? t.retryLimit : t.retryFail);
        return;
      }
      setStatus(t.retryQueued);
      await load();
    } catch {
      setStatus(t.retryFail);
    }
  }, [supabase, t, load]);

  useEffect(() => { void load(); }, [load]);

  const counts = useMemo(() => {
    const base: Record<ContentState, number> = { draft: 0, scheduled: 0, published: 0, expired: 0, processing: 0, taken_down: 0 };
    for (const row of rows) base[row.state] = (base[row.state] ?? 0) + 1;
    return base;
  }, [rows]);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    return rows.filter(row => {
      const stateMatches = filter === "all" || row.state === filter;
      const queryMatches = !query || [row.title, row.slug, row.category].some(value => value.toLowerCase().includes(query));
      return stateMatches && queryMatches;
    });
  }, [rows, filter, search]);

  const quotaLeft = (() => {
    const limit = caps?.quotas?.long_videos_per_month;
    const used = caps?.usage?.long_videos_per_month;
    if (typeof limit !== "number") return null;
    return Math.max(0, limit - (typeof used === "number" ? used : 0));
  })();
  const cooldownDays = caps?.cooldown?.long_video_cooldown_days ?? null;
  const cooldownReady = caps?.cooldown?.can_publish_long_video_now;

  const when = (iso: string | null) => iso ? new Date(iso).toLocaleString(locale === "ar" ? "ar-EG" : "en-US") : t.notLive;

  return <section id="creator-content-library" className="moderation-panel content-manager" aria-busy={!ready}>
    <div className="moderation-heading">
      <div><span className="eyebrow">{t.eyebrow}</span><h2>{t.title}<em>{t.emphasis}</em></h2><p>{t.intro}</p></div>
      <span className="module-count">{rows.length} {locale === "ar" ? "عنصر" : "ITEMS"}</span>
    </div>
    {caps && <div className="library-quota" aria-label={t.quotaTitle}>
      <strong>{t.quotaTitle}</strong>
      <span>{t.longVideoQuota}: <b>{quotaLeft ?? "—"}</b></span>
      <span>{t.cooldown}: <b>{typeof cooldownDays === "number" ? `${cooldownDays} ${t.cooldownDays}` : "—"}</b></span>
      <span>{cooldownReady === false && caps.cooldown?.next_allowed_at ? `${t.cooldownWait} ${when(caps.cooldown.next_allowed_at)}` : t.cooldownReady}</span>
    </div>}
    <div className="library-filters" role="group" aria-label={t.state}>
      <button type="button" className="nhen-action" aria-pressed={filter === "all"} onClick={() => setFilter("all")}>{t.all} ({rows.length})</button>
      {STATES.map(state => <button key={state} type="button" className="nhen-action" aria-pressed={filter === state} onClick={() => setFilter(state)}>{t[state]} ({counts[state]})</button>)}
    </div>
    <input className="nhen-search" style={{ width: "100%", marginTop: 12 }} value={search} onChange={event => setSearch(event.target.value)} placeholder={t.search} aria-label={t.search} />
    {!ready && <p className="editor-status" role="status" aria-live="polite">{t.loading}</p>}
    {ready && status && <p className="editor-status" role="status" aria-live="polite">{status}</p>}
    {ready && !status && visible.length === 0 && <div className="moderation-empty" role="status"><h3>{t.empty}</h3></div>}
    {ready && visible.length > 0 && <ul className="library-list">
      {visible.map(row => <li key={row.media_id} className="library-row">
        <div className="library-row-main">
          <div className="library-row-head"><span className={`nhen-pill library-state library-state-${row.state}`}>{t[row.state]}</span><strong>{row.title}</strong></div>
          <small className="nhen-muted">/{row.slug} · {row.category}</small>
          <small className="nhen-muted">{row.state === "scheduled" ? `${t.goLive} ${when(row.publish_at)}` : row.expires_at ? `${t.expires} ${when(row.expires_at)}` : `${t.published} ${when(row.published_at)}`}</small>
          {row.taken_down && <small className="nhen-muted">{t.takenDownNote}</small>}
        </div>
        <div className="library-row-stats">
          <span><b>{toNumber(row.view_count)}</b> {t.views}</span>
          <span><b>{toNumber(row.reaction_count)}</b> {t.reactions}</span>
          <span><b>{toNumber(row.comment_count)}</b> {t.comments}</span>
          {row.state === "processing" && row.processing_status === "failed" && <button type="button" className="nhen-action" onClick={() => void retry(row.media_id)}>{t.retry}</button>}
          <a className="nhen-action" href={`/watch/${row.slug}`}>{t.open}</a>
        </div>
      </li>)}
    </ul>}
  </section>;
}

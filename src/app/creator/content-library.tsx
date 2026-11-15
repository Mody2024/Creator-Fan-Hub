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
    takenDownNote: "Taken down by moderation. Contact the platform team about reinstatement."
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
    takenDownNote: "أُزيل بواسطة الإشراف. تواصل مع فريق المنصة بشأن إعادة التفعيل."
  }
} as const;

function toNumber(value: number | string): number {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export default function ContentLibrary({ locale = "en" }: { locale?: "en" | "ar" }) {
  const t = LABELS[locale];
  const supabase = getSupabaseBrowserClient();
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState<string>(t.loading);
  const [filter, setFilter] = useState<"all" | ContentState>("all");
  const [search, setSearch] = useState("");

  const load = useCallback(async () => {
    if (!supabase) { setReady(true); setStatus(t.loadFail); return; }
    try {
      const { data, error } = await supabase.rpc("raye2_creator_content_library");
      if (error) throw error;
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

  const when = (iso: string | null) => iso ? new Date(iso).toLocaleString(locale === "ar" ? "ar-EG" : "en-US") : t.notLive;

  return <section id="creator-content-library" className="moderation-panel content-manager" aria-busy={!ready}>
    <div className="moderation-heading">
      <div><span className="eyebrow">{t.eyebrow}</span><h2>{t.title}<em>{t.emphasis}</em></h2><p>{t.intro}</p></div>
      <span className="module-count">{rows.length} {locale === "ar" ? "عنصر" : "ITEMS"}</span>
    </div>
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
          <a className="nhen-action" href={`/watch/${row.slug}`}>{t.open}</a>
        </div>
      </li>)}
    </ul>}
  </section>;
}

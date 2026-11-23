"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { resolveStorageDeliveries } from "@/lib/storage/resolve-delivery";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import { buildWatchCard, type WatchCard, type WatchRow } from "./watch-library-media";

const PAGE = 24;

const MORE_T = {
  en: { error: "Could not load more videos. Try again.", loading: "Loading", more: "Load more videos", end: "You have reached the end." },
  ar: { error: "تعذّر تحميل المزيد من الفيديوهات. حاول مرة أخرى.", loading: "جارٍ التحميل", more: "تحميل المزيد من الفيديوهات", end: "وصلت إلى النهاية." }
} as const;

export default function WatchLibraryMore({
  locale = "en",
  initial,
  before,
  beforeId
}: {
  locale?: "en" | "ar";
  initial: WatchCard[];
  before: string;
  beforeId: string;
}) {
  const t = MORE_T[locale];
  const [cards, setCards] = useState<WatchCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  async function loadMore() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    setBusy(true); setError("");
    const last = cards.length ? cards[cards.length - 1] : initial[initial.length - 1];
    const cursorTime = cards.length ? last.publishedAt : before;
    const cursorId = cards.length ? last.id : beforeId;
    const { data, error: err } = await supabase.rpc("raye2_get_watch_library_page", {
      p_limit: PAGE, p_before: cursorTime, p_before_id: cursorId
    });
    if (err) { setError(t.error); setBusy(false); return; }
    const rows = (data ?? []) as WatchRow[];
    if (rows.length < PAGE) setDone(true);
    const pooledRefs = rows.flatMap((row) => {
      const refs: Array<{ bucketId: string; objectKey: string }> = [];
      if (row.storage_path?.startsWith("creator-media-public/")) refs.push({ bucketId: "creator-media-public", objectKey: row.storage_path.slice("creator-media-public/".length) });
      if (row.thumbnail_path?.startsWith("creator-media-public/")) refs.push({ bucketId: "creator-media-public", objectKey: row.thumbnail_path.slice("creator-media-public/".length) });
      return refs;
    });
    const pooled = await resolveStorageDeliveries(pooledRefs, (bucketId, objectKey) => supabase.storage.from(bucketId).getPublicUrl(objectKey).data.publicUrl);
    const pooledUrl = (storagePath: string) => pooled.get("creator-media-public\u0000" + storagePath.slice("creator-media-public/".length)) ?? null;
    const next = rows.flatMap((row) => {
      const card = buildWatchCard(supabase, row, pooledUrl);
      return card ? [card] : [];
    });
    setCards((prev) => [...prev, ...next]);
    setBusy(false);
  }

  return (
    <>
      {cards.length ? (
        <div className="raye2-watch-grid">
          {cards.map((video) => (
            <article className="raye2-watch-card" key={video.id}>
              <Link className="raye2-watch-card-media" href={"/watch/" + video.slug}>
                <PublicVideoPlayer src={video.src} poster={video.poster} title={video.title} description={video.description} youtubeEmbedUrl={video.youtubeEmbedUrl} />
                <span className="raye2-watch-play">▶</span>
              </Link>
              <div className="raye2-watch-card-copy">
                <span className="raye2-watch-label">{video.category.toUpperCase()} · OFFICIAL</span>
                <h3><Link href={"/watch/" + video.slug}>{video.title}</Link></h3>
                <p>{video.description}</p>
                <time>{new Date(video.publishedAt).toLocaleDateString()}</time>
              </div>
            </article>
          ))}
        </div>
      ) : null}
      {error ? <p role="alert" style={{ color: "var(--error, #e87d85)" }}>{error}</p> : null}
      {!done ? (
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void loadMore()} style={{ margin: "18px auto", display: "block" }}>
          {busy ? "Loading…" : error ? "Retry" : t.more}
        </button>
      ) : cards.length ? <p style={{ textAlign: "center", opacity: 0.6, fontSize: 13 }}>{t.end}</p> : null}
    </>
  );
}

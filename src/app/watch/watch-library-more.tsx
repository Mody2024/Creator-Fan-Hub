"use client";

import Link from "next/link";
import { useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import { buildWatchCard, type WatchCard, type WatchRow } from "./watch-library-media";

const PAGE = 24;

export default function WatchLibraryMore({
  initial,
  before,
  beforeId
}: {
  initial: WatchCard[];
  before: string;
  beforeId: string;
}) {
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
    if (err) { setError("Could not load more videos. Try again."); setBusy(false); return; }
    const rows = (data ?? []) as WatchRow[];
    if (rows.length < PAGE) setDone(true);
    const next = rows.flatMap((row) => {
      const card = buildWatchCard(supabase, row);
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
      {error ? <p role="alert" style={{ color: "#e5484d" }}>{error}</p> : null}
      {!done ? (
        <button type="button" className="button button-secondary" disabled={busy} onClick={() => void loadMore()} style={{ margin: "18px auto", display: "block" }}>
          {busy ? "Loading…" : error ? "Retry" : "Load more videos"}
        </button>
      ) : cards.length ? <p style={{ textAlign: "center", opacity: 0.6, fontSize: 13 }}>You have reached the end.</p> : null}
    </>
  );
}

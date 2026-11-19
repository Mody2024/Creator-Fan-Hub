"use client";

import { useEffect, useState, type ReactNode } from "react";
import "./raye2-skippable-promo-gate.css";
import { selectRaye2ChannelPromo, type Raye2ChannelPromoInput } from "@/lib/raye2/channel-promo-rotation.mjs";

const recentByPlacement = new Map<string, string[]>();

function getRecentPromoIds(placement: string) {
  const memory = recentByPlacement.get(placement);
  if (memory?.length) return memory;
  try {
    const parsed = JSON.parse(sessionStorage.getItem(`raye2:promo-history:${placement}`) ?? "[]");
    return Array.isArray(parsed) ? parsed.map(String).slice(-12) : [];
  } catch { return []; }
}

function rememberPromo(placement: string, ids: string[]) {
  const next = ids.slice(-12);
  recentByPlacement.set(placement, next);
  try { sessionStorage.setItem(`raye2:promo-history:${placement}`, JSON.stringify(next)); } catch {}
}


export default function Raye2SkippablePromoGate({
  placement, children
}: { placement: "video" | "live"; children: ReactNode }) {
  const [promo, setPromo] = useState<ReturnType<typeof selectRaye2ChannelPromo>>(null);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [skipped, setSkipped] = useState(false);
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/raye2/channel-promos", { cache: "no-store" });
        if (!response.ok) return;
        const data = await response.json();
        const list = data.promosByPlacement?.[placement];
        if (!Array.isArray(list)) return;
        const recent = getRecentPromoIds(placement);
        const selected = selectRaye2ChannelPromo({ promos: list as Raye2ChannelPromoInput[], placement, recentPromoIds: recent });
        if (cancelled || !selected) return;
        rememberPromo(placement, [...recent, selected.id]);
        setPromo(selected);
      } catch {
        // If YouTube sync is unavailable, show the Raye2 player normally.
      }
    }
    void load();
    return () => { cancelled = true; };
  }, [placement]);

  useEffect(() => {
    if (!promo || skipped || finished) return;
    const startedAt = Date.now();
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      setSecondsLeft(Math.max(0, 5 - elapsed));
      if (elapsed >= (promo.promoDurationSeconds ?? 15)) {
        setFinished(true);
      }
    }, 250);
    return () => window.clearInterval(timer);
  }, [promo, skipped, finished]);

  if (!promo || skipped || finished) return <>{children}</>;

  const embedUrl = new URL(`https://www.youtube-nocookie.com/embed/${encodeURIComponent(promo.videoId)}`);
  embedUrl.search = new URLSearchParams({
    start: String(promo.promoStartSeconds ?? 0),
    end: String(promo.promoEndSeconds ?? 15),
    autoplay: "1",
    controls: "1",
    playsinline: "1",
    rel: "0",
    mute: "1"
  }).toString();

  return (
    <section className="raye2-skippable-promo" aria-label="Featured channel preview">
      <div className="raye2-skippable-promo-head">
        <div>
          <span>FEATURED CHANNEL · PREVIEW</span>
          <strong>{promo.title}</strong>
        </div>
        {secondsLeft > 0 ? (
          <span className="raye2-skippable-promo-countdown">Skip in {secondsLeft}s</span>
        ) : (
          <button type="button" onClick={() => setSkipped(true)}>Skip preview ↗</button>
        )}
      </div>
      <div className="raye2-skippable-promo-player">
        <iframe
          src={embedUrl.toString()}
          title={`YouTube preview: ${promo.title}`}
          allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share"
          referrerPolicy="strict-origin-when-cross-origin"
          allowFullScreen
        />
      </div>
      <div className="raye2-skippable-promo-foot">
        <span>Short preview from {promo.channelTitle || "featured channel"}</span>
        <a href={promo.url} target="_blank" rel="noopener noreferrer">Open full video on YouTube ↗</a>
      </div>
    </section>
  );
}

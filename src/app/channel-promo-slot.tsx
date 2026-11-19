"use client";

import { useEffect, useState } from "react";
import "./channel-promo-slot.css";
import { selectRaye2ChannelPromo, type Raye2PromoPlacement, type Raye2ChannelPromoInput } from "@/lib/raye2/channel-promo-rotation.mjs";

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


export default function Raye2ChannelPromoSlot({ placement }: { placement: Raye2PromoPlacement }) {
  const [promo, setPromo] = useState<ReturnType<typeof selectRaye2ChannelPromo>>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let promos: Raye2ChannelPromoInput[] = [];
      try {
        const response = await fetch("/api/raye2/channel-promos", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          const byPlacement = data.promosByPlacement?.[placement];
          if (Array.isArray(byPlacement)) promos = byPlacement;
        }
      } catch {
        // Fail closed when the channel catalogue is unavailable.
      }
      if (cancelled) return;
      const recent = getRecentPromoIds(placement);
      const selected = selectRaye2ChannelPromo({ promos, placement, recentPromoIds: recent });
      if (selected) rememberPromo(placement, [...recent, selected.id]);
      setPromo(selected);
    }
    void load();
    return () => { cancelled = true; };
  }, [placement]);

  if (!promo) return null;
  return (
    <aside className="raye2-channel-promo" aria-label="Featured channel">
      <div className="raye2-channel-promo-copy">
        <span className="raye2-channel-promo-label">✦ {promo.label}</span>
        <strong>{promo.title}</strong>
        {promo.description ? <p>{promo.description}</p> : null}
        <a href={promo.url} target="_blank" rel="noopener noreferrer">{promo.cta} ↗</a>
      </div>
      {placement === "minis" && promo.videoId ? (
        <div className="raye2-channel-promo-mini">
          <iframe
            src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(promo.videoId)}?playsinline=1&controls=1&rel=0`}
            title={`Channel Short: ${promo.title}`}
            loading="lazy"
            allow="accelerometer; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        </div>
      ) : promo.thumbnailUrl ? (
        <a className="raye2-channel-promo-art" href={promo.url} target="_blank" rel="noopener noreferrer" aria-label={promo.cta}>
          <img src={promo.thumbnailUrl} alt="" loading="lazy" />
        </a>
      ) : null}
    </aside>
  );
}

"use client";

import { useEffect, useState } from "react";
import "./channel-promo-slot.css";
import { selectRaye2ChannelPromo, type Raye2PromoPlacement } from "@/lib/raye2/channel-promo-rotation";

const recentByPlacement = new Map<string, string[]>();

export default function Raye2ChannelPromoSlot({ placement }: { placement: Raye2PromoPlacement }) {
  const [promo, setPromo] = useState<ReturnType<typeof selectRaye2ChannelPromo>>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let promos: unknown[] = [];
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
      const recent = recentByPlacement.get(placement) ?? [];
      const selected = selectRaye2ChannelPromo({ promos, placement, recentPromoIds: recent });
      if (selected) recentByPlacement.set(placement, [...recent, selected.id].slice(-12));
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

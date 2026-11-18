"use client";

import { useEffect, useState } from "react";
import "./channel-promo-slot.css";
import { selectRaye2ChannelPromo, type Raye2PromoPlacement } from "@/lib/raye2/channel-promo-rotation";

const recentByPlacement = new Map<string, string[]>();

function configuredPromos() {
  try {
    const raw = process.env.NEXT_PUBLIC_RAYE2_CHANNEL_PROMOS;
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export default function Raye2ChannelPromoSlot({ placement }: { placement: Raye2PromoPlacement }) {
  const [promo, setPromo] = useState<ReturnType<typeof selectRaye2ChannelPromo>>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      let promos = configuredPromos();
      try {
        const response = await fetch("/api/raye2/channel-promos", { cache: "no-store" });
        if (response.ok) {
          const data = await response.json();
          if (Array.isArray(data.promos) && data.promos.length) promos = data.promos;
        }
      } catch {
        // Use the optional manually configured list if channel sync is unavailable.
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
      {promo.thumbnailUrl ? (
        <a className="raye2-channel-promo-art" href={promo.url} target="_blank" rel="noopener noreferrer" aria-label={promo.cta}>
          <img src={promo.thumbnailUrl} alt="" loading="lazy" />
        </a>
      ) : null}
    </aside>
  );
}

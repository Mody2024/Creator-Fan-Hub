"use client";

import { useMemo } from "react";
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
  const promo = useMemo(() => {
    const recent = recentByPlacement.get(placement) ?? [];
    const selected = selectRaye2ChannelPromo({
      promos: configuredPromos(),
      placement,
      recentPromoIds: recent
    });
    if (selected) recentByPlacement.set(placement, [...recent, selected.id].slice(-12));
    return selected;
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
          {/* Public YouTube thumbnail supplied by the channel owner. */}
          <img src={promo.thumbnailUrl} alt="" loading="lazy" />
        </a>
      ) : null}
    </aside>
  );
}

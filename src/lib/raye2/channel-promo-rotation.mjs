const YOUTUBE_HOSTS = new Set(["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be", "www.youtu.be"]);

export function normalizeRaye2ChannelPromo(input) {
  if (!input || typeof input !== "object") return null;
  const id = String(input.id ?? "").trim();
  const title = String(input.title ?? "").trim();
  const rawUrl = String(input.url ?? "").trim();
  if (!id || !title || !rawUrl) return null;
  let url;
  try { url = new URL(rawUrl); } catch { return null; }
  if (url.protocol !== "https:" || !YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return null;
  if (url.hostname.toLowerCase() === "youtu.be" || url.hostname.toLowerCase() === "www.youtu.be") {
    if (!url.pathname.slice(1)) return null;
  } else if (url.pathname !== "/watch" && !url.pathname.startsWith("/shorts/") && !url.pathname.startsWith("/channel/") && !url.pathname.startsWith("/@")) {
    return null;
  }
  const thumbnailUrl = input.thumbnailUrl ? String(input.thumbnailUrl) : null;
  return {
    id, title, url: url.toString(),
    description: String(input.description ?? "").trim().slice(0, 240),
    thumbnailUrl,
    label: "Featured channel",
    cta: String(input.cta ?? "Watch on YouTube").trim().slice(0, 40) || "Watch on YouTube",
    placements: Array.isArray(input.placements)
      ? input.placements.filter(x => ["video", "live", "minis", "community"].includes(x))
      : ["video", "live", "minis", "community"],
    active: input.active !== false
  };
}

/**
 * Picks one active channel promo for a placement, avoiding the supplied recent
 * history. If every eligible promo was recently shown, the rotation starts a
 * new cycle rather than returning no promo. Inject random for deterministic tests.
 */
export function selectRaye2ChannelPromo({ promos = [], placement, recentPromoIds = [], random = Math.random } = {}) {
  const eligible = promos.map(normalizeRaye2ChannelPromo)
    .filter(p => p && p.active && p.placements.includes(placement));
  if (!eligible.length) return null;
  const recent = new Set(recentPromoIds.map(String));
  let candidates = eligible.filter(p => !recent.has(p.id));
  if (!candidates.length) candidates = eligible;
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  return candidates[index];
}

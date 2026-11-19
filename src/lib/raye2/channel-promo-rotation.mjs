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
  const videoId = String(input.videoId ?? (url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.split("/").filter(Boolean).pop()) ?? "").trim();
  const durationSeconds = Number(input.durationSeconds);
  const chapters = Array.isArray(input.chapters) ? input.chapters
    .map(chapter => ({ title: String(chapter?.title ?? ""), startSeconds: Number(chapter?.startSeconds) }))
    .filter(chapter => Number.isFinite(chapter.startSeconds) && chapter.startSeconds >= 0)
    .sort((a,b) => a.startSeconds-b.startSeconds) : [];
  return {
    id, title, url: url.toString(), videoId,
    durationSeconds: Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : null,
    chapters,
    description: String(input.description ?? "").trim().slice(0, 240),
    channelTitle: String(input.channelTitle ?? "").trim().slice(0, 120),
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
    .filter(p => p && p.active && p.placements.includes(placement) && ((placement !== "video" && placement !== "live") || (p.durationSeconds !== null && p.durationSeconds >= 60)));
  if (!eligible.length) return null;
  const recent = new Set(recentPromoIds.map(String));
  let candidates = eligible.filter(p => !recent.has(p.id));
  if (!candidates.length) candidates = eligible;
  const index = Math.min(candidates.length - 1, Math.max(0, Math.floor(random() * candidates.length)));
  const selected = candidates[index];
  if (placement === "video" || placement === "live") {
    const length = 15;
    const duration = selected.durationSeconds;
    if (!selected.videoId || !duration || duration <= length + 5) return null;
    const chapterStarts = selected.chapters
      .map(chapter => chapter.startSeconds)
      .filter(seconds => seconds >= 10 && seconds + length <= duration - 5);
    const startSeconds = chapterStarts.length
      ? chapterStarts[Math.min(chapterStarts.length - 1, Math.floor(random() * chapterStarts.length))]
      : 10 + Math.floor(random() * Math.max(1, duration - length - 15));
    return { ...selected, promoStartSeconds: startSeconds, promoEndSeconds: startSeconds + length, promoDurationSeconds: length };
  }
  return selected;
}

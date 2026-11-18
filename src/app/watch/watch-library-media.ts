import type { SupabaseClient } from "@supabase/supabase-js";

export type WatchRow = {
  media_id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  tags: string[] | null;
  published_at: string;
  media_type: string;
  storage_path: string | null;
  source_url: string | null;
  processing_status: string | null;
  thumbnail_path: string | null;
  alt_text: string | null;
};

export type WatchCard = {
  id: string;
  slug: string;
  title: string;
  description: string;
  category: string;
  src: string;
  poster: string | null;
  youtubeEmbedUrl: string | null;
  publishedAt: string;
};

const YOUTUBE_HOSTS = ["youtube.com", "www.youtube.com", "m.youtube.com", "youtu.be"];

function safePublicUrl(supabase: SupabaseClient, path: string): string | null {
  if (!path.startsWith("creator-media-public/")) return null;
  const parts = path.split("/");
  if (parts.length < 2 || !parts.slice(1).every((part) => /^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/.test(part))) return null;
  const publicUrl = supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl;
  try {
    const parsed = new URL(publicUrl);
    const configured = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://invalid.local");
    if (parsed.protocol !== "https:" || parsed.origin !== configured.origin) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function youtubeEmbed(sourceUrl: string | null): string | null {
  try {
    const u = new URL(sourceUrl ?? "");
    if (!YOUTUBE_HOSTS.includes(u.hostname)) return null;
    const parts = u.pathname.split("/").filter(Boolean);
    const id = u.hostname === "youtu.be" ? parts[0] : u.searchParams.get("v") ?? parts[parts.length - 1];
    if (!id || !/^[A-Za-z0-9_-]{11}$/.test(id)) return null;
    return "https://www.youtube-nocookie.com/embed/" + id + "?rel=0";
  } catch {
    return null;
  }
}

export function buildWatchCard(supabase: SupabaseClient, item: WatchRow, pooledUrl?: (storagePath: string) => string | null): WatchCard | null {
  if (!["video", "youtube"].includes(item.media_type)) return null;
  if (item.media_type === "video" && item.processing_status !== "ready") return null;

  let src = "";
  let embed: string | null = null;
  if (item.media_type === "video") {
    const url = (item.storage_path ? pooledUrl?.(item.storage_path) ?? null : null) ?? safePublicUrl(supabase, item.storage_path ?? "");
    if (!url) return null;
    src = url;
  } else {
    embed = youtubeEmbed(item.source_url);
    if (!embed) return null;
  }

  let poster: string | null = null;
  if (item.thumbnail_path?.startsWith("creator-media-public/")) {
    const pooledCandidate = pooledUrl?.(item.thumbnail_path) ?? null;
    if (pooledCandidate) {
      poster = pooledCandidate;
    } else {
      const candidate = safePublicUrl(supabase, item.thumbnail_path);
      if (candidate) {
        try {
          const parsedPoster = new URL(candidate);
          const parsedVideo = new URL(src || embed || "https://invalid.local");
          if (parsedPoster.protocol === "https:" && parsedPoster.origin === parsedVideo.origin) poster = parsedPoster.toString();
        } catch {
          poster = null;
        }
      }
    }
  }

  return {
    id: item.media_id,
    slug: item.slug,
    title: item.title,
    description: item.description || item.alt_text || "",
    category: item.category || "Video",
    src,
    poster,
    youtubeEmbedUrl: embed,
    publishedAt: item.published_at
  };
}

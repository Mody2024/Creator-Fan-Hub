import { NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const revalidate = 21600;

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const MAX_PLAYLIST_PAGES = 200;
const SHORTS_MAX_SECONDS = 180;

type ChannelRow = { id: string; channel_url: string; channel_handle: string; channel_title: string | null; enabled: boolean; placements: string[] };
type PlaylistItem = { snippet?: { title?: string; description?: string; channelTitle?: string; resourceId?: { videoId?: string }; thumbnails?: { maxres?: { url?: string }; high?: { url?: string }; medium?: { url?: string } } } };
type PlaylistResponse = { nextPageToken?: string; items?: PlaylistItem[] };
type ChannelResponse = { items?: Array<{ id?: string; snippet?: { title?: string }; contentDetails?: { relatedPlaylists?: { uploads?: string } } }> };
type VideoItem = { id?: string; snippet?: { title?: string; description?: string; tags?: string[]; channelTitle?: string; thumbnails?: { maxres?: { url?: string }; high?: { url?: string }; medium?: { url?: string } } }; contentDetails?: { duration?: string }; status?: { privacyStatus?: string } };
type VideoResponse = { items?: VideoItem[] };

async function youtubeJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { next: { revalidate: 21600 } });
  if (!response.ok) throw new Error(`YouTube API returned ${response.status}`);
  return response.json() as Promise<T>;
}

function durationSeconds(value = "") {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

function parseChapters(description = "") {
  const chapters: Array<{ startSeconds: number; title: string }> = [];
  const pattern = /(?:^|\s)(?:(\d{1,2}):)?(\d{1,2}):(\d{2})\s+([^\r\n]+)/g;
  for (const match of description.matchAll(pattern)) {
    const startSeconds = Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
    if (startSeconds >= 0) chapters.push({ startSeconds, title: match[4].trim().slice(0, 100) });
  }
  return chapters.filter((chapter, index, all) => index === 0 || chapter.startSeconds > all[index - 1].startSeconds);
}

async function resolveChannel(channel: ChannelRow, apiKey: string) {
  const url = new URL(`${YOUTUBE_API}/channels`);
  const lookup = channel.channel_handle.startsWith("channel:")
    ? { id: channel.channel_handle.slice("channel:".length) }
    : { forHandle: channel.channel_handle.replace(/^@/, "") };
  url.search = new URLSearchParams({ part: "snippet,contentDetails", ...lookup, key: apiKey }).toString();
  const result = await youtubeJson<ChannelResponse>(url);
  const resolved = result.items?.[0];
  const uploadsPlaylistId = resolved?.contentDetails?.relatedPlaylists?.uploads;
  if (!uploadsPlaylistId) throw new Error(`Could not resolve channel ${channel.channel_handle}`);
  return { uploadsPlaylistId, title: resolved.snippet?.title ?? channel.channel_title ?? channel.channel_handle };
}

async function readAllUploads(playlistId: string, apiKey: string) {
  const entries: PlaylistItem[] = [];
  let pageToken = "";
  let pageCount = 0;
  do {
    const url = new URL(`${YOUTUBE_API}/playlistItems`);
    url.search = new URLSearchParams({
      part: "snippet", playlistId, maxResults: "50", key: apiKey,
      ...(pageToken ? { pageToken } : {})
    }).toString();
    const page = await youtubeJson<PlaylistResponse>(url);
    entries.push(...(page.items ?? []));
    pageToken = page.nextPageToken ?? "";
    pageCount += 1;
  } while (pageToken && pageCount < MAX_PLAYLIST_PAGES);
  return { entries, complete: !pageToken };
}

async function hydrateUploads(entries: PlaylistItem[], apiKey: string) {
  const ids = [...new Set(entries.map(item => item.snippet?.resourceId?.videoId).filter((id): id is string => Boolean(id)))];
  const details = new Map<string, VideoItem>();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const url = new URL(`${YOUTUBE_API}/videos`);
    url.search = new URLSearchParams({
      part: "snippet,contentDetails,status",
      id: ids.slice(offset, offset + 50).join(","),
      key: apiKey
    }).toString();
    const result = await youtubeJson<VideoResponse>(url);
    for (const item of result.items ?? []) if (item.id) details.set(item.id, item);
  }
  return entries.flatMap(entry => {
    const id = entry.snippet?.resourceId?.videoId;
    const video = id ? details.get(id) : null;
    const title = video?.snippet?.title?.trim() || entry.snippet?.title?.trim();
    const duration = durationSeconds(video?.contentDetails?.duration);
    if (!id || !video || !title || video.status?.privacyStatus !== "public") return [];
    const description = (video.snippet?.description ?? entry.snippet?.description ?? "").trim();
    const tags = video.snippet?.tags ?? [];
    const hasShortMarker = [...tags, title, description].some(value => /#shorts\b/i.test(value));
    // Data API does not expose an authoritative Shorts flag or frame orientation.
    // Only positively marked short-form videos enter Mini's; uncertain short videos stay out.
    const isShort = duration !== null && duration <= SHORTS_MAX_SECONDS && hasShortMarker;
    return [{
      id: `youtube-${id}`,
      videoId: id,
      title,
      description: description.slice(0, 240),
      chapters: parseChapters(description),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: video.snippet?.thumbnails?.maxres?.url
        ?? video.snippet?.thumbnails?.high?.url
        ?? video.snippet?.thumbnails?.medium?.url
        ?? entry.snippet?.thumbnails?.high?.url
        ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      durationSeconds: duration,
      contentClass: isShort ? "short" : duration !== null && duration > SHORTS_MAX_SECONDS ? "long" : "uncertain",
      channelTitle: video.snippet?.channelTitle ?? entry.snippet?.channelTitle ?? "",
      label: "Featured channel",
      cta: "Watch on YouTube",
      active: true
    }];
  });
}

export async function GET() {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  if (!apiKey) return NextResponse.json(
    { error: "YouTube channel sync is not configured.", setupRequired: true },
    { status: 503, headers: { "Cache-Control": "no-store" } }
  );
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Database is not configured." }, { status: 503 });

  try {
    const { data: channels, error } = await supabase
      .from("raye2_youtube_promo_channels")
      .select("id,channel_url,channel_handle,channel_title,enabled,placements")
      .eq("enabled", true)
      .order("created_at", { ascending: true });
    if (error) throw error;

    const allPromos: Array<Record<string, unknown> & { placements: string[]; contentClass: string }> = [];
    const syncResults: Array<{ channel: string; title: string; total: number; complete: boolean }> = [];
    for (const channel of (channels ?? []) as ChannelRow[]) {
      const { uploadsPlaylistId, title } = await resolveChannel(channel, apiKey);
      const uploads = await readAllUploads(uploadsPlaylistId, apiKey);
      const videos = await hydrateUploads(uploads.entries, apiKey);
      const eligible = videos.map(video => ({
        ...video,
        placements: channel.placements,
        channelId: channel.id,
        channelTitle: title
      }));
      allPromos.push(...eligible);
      syncResults.push({
        channel: channel.channel_url,
        title,
        total: eligible.length,
        complete: uploads.complete
      });
    }

    const promosByPlacement = {
      video: allPromos.filter(video => video.placements.includes("video") && typeof video.durationSeconds === "number" && video.durationSeconds > 180),
      live: allPromos.filter(video => video.placements.includes("live") && typeof video.durationSeconds === "number" && video.durationSeconds > 180),
      minis: allPromos.filter(video => video.placements.includes("minis") && video.contentClass === "short"),
      community: allPromos.filter(video => video.placements.includes("community"))
    };
    return NextResponse.json({
      channels: syncResults,
      promosByPlacement,
      counts: {
        channels: syncResults.length,
        channelUploads: allPromos.length,
        miniShorts: promosByPlacement.minis.length,
        longVideoSources: promosByPlacement.video.length,
        communityVideos: promosByPlacement.community.length
      },
      classification: {
        shorts: "Up to 180 seconds plus an explicit #Shorts metadata marker",
        uncertainShorts: "Excluded from Mini's until positively classified",
        regularVideos: "Longer than 180 seconds",
        source: "Public channel uploads playlist"
      },
      syncedAt: new Date().toISOString()
    }, { headers: { "Cache-Control": "public, s-maxage=21600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("[raye2-channel-promos] channel discovery failed", error);
    return NextResponse.json({ error: "Unable to discover one or more configured channels." }, { status: 502 });
  }
}

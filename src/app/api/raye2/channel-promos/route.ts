import { NextResponse } from "next/server";

export const revalidate = 3600;

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";
const MAX_PLAYLIST_PAGES = 200;
const MAX_SHORT_SECONDS = 180;

type PlaylistItem = {
  snippet?: {
    title?: string;
    description?: string;
    resourceId?: { videoId?: string };
    thumbnails?: { maxres?: { url?: string }; high?: { url?: string }; medium?: { url?: string } };
  };
};
type PlaylistResponse = { nextPageToken?: string; items?: PlaylistItem[] };
type ChannelResponse = {
  items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
};
type VideoDetailsResponse = {
  items?: Array<{
    id?: string;
    snippet?: {
      title?: string;
      description?: string;
      thumbnails?: { maxres?: { url?: string }; high?: { url?: string }; medium?: { url?: string } };
    };
    contentDetails?: { duration?: string };
    status?: { privacyStatus?: string };
  }>;
};

async function youtubeJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`YouTube API returned ${response.status}`);
  return response.json() as Promise<T>;
}

function durationSeconds(value = "") {
  const match = value.match(/^PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?$/);
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2] ?? 0) * 60 + Number(match[3] ?? 0);
}

async function readPlaylist(playlistId: string, apiKey: string) {
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

async function hydrateVideos(entries: PlaylistItem[], apiKey: string) {
  const ids = [...new Set(entries.map(item => item.snippet?.resourceId?.videoId).filter((id): id is string => Boolean(id)))];
  const byId = new Map<string, NonNullable<VideoDetailsResponse["items"]>[number]>();
  for (let offset = 0; offset < ids.length; offset += 50) {
    const url = new URL(`${YOUTUBE_API}/videos`);
    url.search = new URLSearchParams({
      part: "snippet,contentDetails,status", id: ids.slice(offset, offset + 50).join(","), key: apiKey
    }).toString();
    const response = await youtubeJson<VideoDetailsResponse>(url);
    for (const item of response.items ?? []) if (item.id) byId.set(item.id, item);
  }
  return entries.flatMap(entry => {
    const id = entry.snippet?.resourceId?.videoId;
    const video = id ? byId.get(id) : null;
    const title = video?.snippet?.title?.trim() || entry.snippet?.title?.trim();
    const duration = durationSeconds(video?.contentDetails?.duration);
    if (!id || !title || !video || video.status?.privacyStatus !== "public" || title === "Deleted video" || title === "Private video") return [];
    return [{
      id: `youtube-${id}`,
      title,
      description: (video.snippet?.description ?? entry.snippet?.description ?? "").trim().slice(0, 240),
      url: `https://www.youtube.com/watch?v=${id}`,
      thumbnailUrl: video.snippet?.thumbnails?.maxres?.url
        ?? video.snippet?.thumbnails?.high?.url
        ?? video.snippet?.thumbnails?.medium?.url
        ?? entry.snippet?.thumbnails?.high?.url
        ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      durationSeconds: duration,
      label: "Featured channel",
      cta: "Watch on YouTube",
      active: true
    }];
  });
}

export async function GET() {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  const handle = (process.env.RAYE2_YOUTUBE_HANDLE || "maronizer").replace(/^@/, "").trim();
  const shortsPlaylistId = process.env.RAYE2_YOUTUBE_SHORTS_PLAYLIST_ID?.trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube channel sync is not configured yet.", setupRequired: true },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const channelUrl = new URL(`${YOUTUBE_API}/channels`);
    channelUrl.search = new URLSearchParams({ part: "contentDetails", forHandle: handle, key: apiKey }).toString();
    const channel = await youtubeJson<ChannelResponse>(channelUrl);
    const uploadsPlaylistId = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      return NextResponse.json({ error: "The configured YouTube channel could not be resolved." }, { status: 404 });
    }

    const uploads = await readPlaylist(uploadsPlaylistId, apiKey);
    const communityPromos = await hydrateVideos(uploads.entries, apiKey);

    // YouTube's Data API does not identify the Shorts tab as a separate feed.
    // Require a channel-owned curated playlist so full-length uploads can never
    // accidentally be placed in the Mini's feed.
    let miniPromos: Awaited<ReturnType<typeof hydrateVideos>> = [];
    let shortsPlaylistConfigured = Boolean(shortsPlaylistId);
    if (shortsPlaylistId) {
      const shorts = await readPlaylist(shortsPlaylistId, apiKey);
      miniPromos = (await hydrateVideos(shorts.entries, apiKey))
        .filter(video => video.durationSeconds !== null && video.durationSeconds <= MAX_SHORT_SECONDS)
        .map(video => ({ ...video, label: "Channel Short", cta: "Watch Short" }));
    }

    const promosByPlacement = {
      video: communityPromos,
      live: communityPromos,
      minis: miniPromos,
      community: communityPromos
    };
    const total = communityPromos.length;
    return NextResponse.json({
      channel: `https://www.youtube.com/@${handle}`,
      promosByPlacement,
      counts: {
        channelUploads: total,
        miniShorts: miniPromos.length,
        communityVideos: total
      },
      shortsPlaylistConfigured,
      shortsPlaylistRequired: !shortsPlaylistConfigured,
      uploadsComplete: uploads.complete,
      syncedAt: new Date().toISOString()
    }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("[raye2-channel-promos] YouTube sync failed", error);
    return NextResponse.json({ error: "Unable to sync the public YouTube uploads right now." }, { status: 502 });
  }
}

import { NextResponse } from "next/server";

export const revalidate = 3600;

const YOUTUBE_API = "https://www.googleapis.com/youtube/v3";

type YouTubeChannelResponse = {
  items?: Array<{ contentDetails?: { relatedPlaylists?: { uploads?: string } } }>;
};
type YouTubePlaylistResponse = {
  nextPageToken?: string;
  items?: Array<{ snippet?: {
    title?: string;
    description?: string;
    resourceId?: { videoId?: string };
    thumbnails?: { maxres?: { url?: string }; high?: { url?: string }; medium?: { url?: string } };
  } }>;
};

async function youtubeJson<T>(url: URL): Promise<T> {
  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) throw new Error(`YouTube API returned ${response.status}`);
  return response.json() as Promise<T>;
}

export async function GET() {
  const apiKey = process.env.YOUTUBE_DATA_API_KEY;
  const handle = (process.env.RAYE2_YOUTUBE_HANDLE || "maronizer").replace(/^@/, "").trim();
  if (!apiKey) {
    return NextResponse.json(
      { error: "YouTube channel sync is not configured yet.", setupRequired: true },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }

  try {
    const channelUrl = new URL(`${YOUTUBE_API}/channels`);
    channelUrl.search = new URLSearchParams({ part: "contentDetails", forHandle: handle, key: apiKey }).toString();
    const channel = await youtubeJson<YouTubeChannelResponse>(channelUrl);
    const uploadsPlaylistId = channel.items?.[0]?.contentDetails?.relatedPlaylists?.uploads;
    if (!uploadsPlaylistId) {
      return NextResponse.json({ error: "The configured YouTube channel could not be resolved." }, { status: 404 });
    }

    const promos: Array<{
      id: string; title: string; description: string; url: string;
      thumbnailUrl: string | null; placements: string[]; active: boolean;
    }> = [];
    let pageToken = "";
    let pageCount = 0;
    do {
      const playlistUrl = new URL(`${YOUTUBE_API}/playlistItems`);
      playlistUrl.search = new URLSearchParams({
        part: "snippet", playlistId: uploadsPlaylistId, maxResults: "50", key: apiKey,
        ...(pageToken ? { pageToken } : {})
      }).toString();
      const page = await youtubeJson<YouTubePlaylistResponse>(playlistUrl);
      for (const item of page.items ?? []) {
        const videoId = item.snippet?.resourceId?.videoId;
        const title = item.snippet?.title?.trim();
        if (!videoId || !title || title === "Deleted video" || title === "Private video") continue;
        promos.push({
          id: `youtube-${videoId}`,
          title,
          description: item.snippet?.description?.trim().slice(0, 240) ?? "",
          url: `https://www.youtube.com/watch?v=${videoId}`,
          thumbnailUrl: item.snippet?.thumbnails?.maxres?.url
            ?? item.snippet?.thumbnails?.high?.url
            ?? item.snippet?.thumbnails?.medium?.url
            ?? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          placements: ["video", "live", "minis", "community"],
          active: true
        });
      }
      pageToken = page.nextPageToken ?? "";
      pageCount += 1;
    } while (pageToken && pageCount < 200);

    return NextResponse.json({
      channel: `https://www.youtube.com/@${handle}`,
      promos,
      total: promos.length,
      complete: !pageToken,
      syncedAt: new Date().toISOString()
    }, { headers: { "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=86400" } });
  } catch (error) {
    console.error("[raye2-channel-promos] YouTube sync failed", error);
    return NextResponse.json({ error: "Unable to sync the public YouTube uploads right now." }, { status: 502 });
  }
}

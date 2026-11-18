# Raye2 YouTube channel promotion setup

Channel: `@maronizer` — https://www.youtube.com/@maronizer

This is unpaid cross-promotion, not an ad network. The integration uses the official YouTube Data API for public metadata and the official YouTube embedded player for playback. It does not download or re-host YouTube audiovisual content.

## What each placement does

- **Mini feed:** embeds a Short from a dedicated channel-owned Shorts playlist. Full-length uploads are never used in this slot.
- **Community:** randomly selects from public channel uploads and creates a featured post/card linking to the original YouTube video.
- **Raye2 watch pages:** selects a 15-second excerpt from a public long-form channel upload. It prefers timestamps parsed from chapter markers in the video's description; if no chapter is present, it selects a bounded random excerpt. The YouTube embedded player plays the excerpt and a skip control becomes available after five seconds.
- **Raye2 live pages:** uses the same short excerpt gate before the live player. This is a pre-roll preview, not insertion into the actual live stream. Public recorded streams uploaded to the channel can be selected as source videos.

The 15-second excerpt is a timed segment inside YouTube's official player. It is not a separately rendered or AI-edited clip. Truly polished cuts from original source footage require the original file and an authorized editing pipeline; the YouTube Data API does not provide permission to download video/audio.

## Step 1 — Create a Google Cloud project and enable the API

The project administrator should:

1. Open https://console.cloud.google.com/
2. Create or select a project.
3. Open APIs & Services → Library.
4. Find **YouTube Data API v3** and enable it.
5. Open APIs & Services → Credentials.
6. Create an API key.
7. Restrict the key to the YouTube Data API v3.
8. Keep the key private. This endpoint reads public channel metadata, so it does not need a user's OAuth token.

Google's official documentation:
- https://developers.google.com/youtube/v3/getting-started
- https://developers.google.com/youtube/data/reference/rest/v3/videos/list
- https://developers.google.com/youtube/player_parameters

## Step 2 — Create a Shorts playlist

The Data API does not expose a reliable dedicated "Shorts tab" feed for a channel. To avoid mistakenly showing a short regular upload or a long video in Mini's:

1. Open YouTube while signed into the channel.
2. Create a playlist named `Raye2 Mini Promos`.
3. Add the Shorts you want Raye2 to use.
4. Set playlist visibility to Public or Unlisted.
5. Copy the playlist ID from its URL. It is the value after `list=`.

Keep this playlist updated when you publish new Shorts. Only items in this playlist are used by the Mini feed; full uploads are excluded.

## Step 3 — Add Vercel environment variables

In the Raye2 Vercel project:

1. Open the Vercel Dashboard.
2. Select the existing Creator Hub / Raye2 project connected to `Mody2024/Creator-Fan-Hub`.
3. Open Settings → Environment Variables.
4. Add the following variables:

| Name | Value | Type |
|---|---|---|
| `RAYE2_YOUTUBE_HANDLE` | `maronizer` | Plain |
| `YOUTUBE_DATA_API_KEY` | Your Google Cloud API key | Sensitive / Encrypted |
| `RAYE2_YOUTUBE_SHORTS_PLAYLIST_ID` | Playlist ID from Step 2 | Plain |

5. Select **Preview** for the first test. Do not change Production yet.
6. Save each variable.
7. Redeploy the latest `development` preview. Vercel environment-variable changes apply only to new deployments.

Do not use a `NEXT_PUBLIC_` prefix for the API key.

## Step 4 — Verify the preview

Open:

`https://YOUR-DEVELOPMENT-PREVIEW.vercel.app/api/raye2/channel-promos`

Expected JSON fields:
- `channel` should be `https://www.youtube.com/@maronizer`.
- `counts.channelUploads` should be greater than zero.
- `counts.miniShorts` should match the public Shorts playlist (after filtering unavailable/private items).
- `shortsPlaylistConfigured` should be true.
- `promosByPlacement.minis` should contain only playlist Shorts.
- `promosByPlacement.video` and `promosByPlacement.live` should contain channel uploads with duration metadata.

Then test:
1. A Raye2 watch page: a 15-second channel excerpt appears before the main video; Skip becomes available after five seconds.
2. A live page: the same preview appears before the live player; skipping reveals the player.
3. Mini feed: a vertical embedded Short appears.
4. Community: a random featured channel video card links to YouTube.

If the API returns 503, the server-side key is missing. If it returns 404, the channel handle did not resolve. If it returns 502, inspect the Vercel function logs and Google API quota/key restrictions.

## Important limitations

- This is not paid advertising and generates no ad-network revenue.
- A 15-second chapter/random excerpt in an embedded YouTube player is not an AI-generated, professionally edited standalone clip.
- YouTube Data API terms prohibit downloading/caching audiovisual content through the API. For actual rendered cuts, use the original video/stream recording file that the channel owner has the rights to provide and process it through Raye2's own media worker.
- The live page placement is a pre-roll preview. It does not splice ads into a live broadcast.
- The YouTube API has quotas and current service terms. Do not assume unlimited sync.
- Environment-variable changes require a new deployment.

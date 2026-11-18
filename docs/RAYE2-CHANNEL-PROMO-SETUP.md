# Raye2 YouTube channel promotions

Raye2 uses the public uploads of the configured channel as house promotions. This is cross-promotion, not paid advertising.

## Current channel

- Handle: `@maronizer`
- Channel page: `https://www.youtube.com/@maronizer`
- Every available public upload is eligible for random rotation in all four Raye2 placements: video pages, live pages, Mini feed and community feed.

## One-time server configuration

Add these environment variables to the Raye2 Vercel project for the intended deployment:

- `RAYE2_YOUTUBE_HANDLE=maronizer`
- `YOUTUBE_DATA_API_KEY=<server-side YouTube Data API key>`

The API key must be stored as a server-only secret. Do not prefix it with `NEXT_PUBLIC_`, expose it in client code, commit it, or share it in chat. The key-owning adult/project administrator should create and manage the Google Cloud project and key, enable YouTube Data API v3, and apply API key restrictions appropriate to the deployment.

The API resolves the handle to the channel's uploads playlist and paginates through public uploads (up to 10,000 items per sync). Results are cached for one hour. New public uploads are included after cache refresh. Deleted/private videos are skipped. YouTube API quota and current Google API terms/limits apply.

## Behavior

- Raye2 selects a random eligible video from the channel's public uploads.
- Recent video IDs are avoided within the active browser session until the rotation pool is exhausted.
- The selected card links directly to the original YouTube video and shows its thumbnail/title.
- Cards are labelled “Featured channel”; this is not a paid ad and creates no ad-network revenue.
- The current placements are cards around the content, not interruptions inserted into the video or live stream.

## Fallback

If the server-side API key is not configured or the API is temporarily unavailable, the channel promo slot can fall back to manually configured `NEXT_PUBLIC_RAYE2_CHANNEL_PROMOS` entries. Never put secrets in that public variable.

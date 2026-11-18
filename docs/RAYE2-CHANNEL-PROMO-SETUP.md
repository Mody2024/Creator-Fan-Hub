# Raye2 featured YouTube channel promotions

This is a house-promotion mode, not paid advertising. It does not need an ad-network account, VAST tag, or ad payment.

## Configuration

Set the following public environment variable in the Raye2 Vercel project for the intended deployment:

`NEXT_PUBLIC_RAYE2_CHANNEL_PROMOS`

Its value is a JSON array of promo clips. Example (replace every example value with a real channel-owned video):

```json
[
  {
    "id": "channel-clip-01",
    "title": "Watch our latest highlight",
    "description": "A short preview from our official YouTube channel.",
    "url": "https://www.youtube.com/watch?v=VIDEO_ID_1",
    "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID_1/hqdefault.jpg",
    "cta": "Watch on YouTube",
    "placements": ["video", "live", "minis", "community"],
    "active": true
  },
  {
    "id": "channel-clip-02",
    "title": "Another channel highlight",
    "url": "https://www.youtube.com/shorts/VIDEO_ID_2",
    "thumbnailUrl": "https://i.ytimg.com/vi/VIDEO_ID_2/hqdefault.jpg",
    "placements": ["minis", "community"],
    "active": true
  }
]
```

Each promo must have a unique stable `id`, a title, and a valid HTTPS YouTube channel/video/Shorts URL. The selector chooses randomly from active promos eligible for that placement and avoids recently shown IDs until the rotation cycle is exhausted.

## Placement behavior

- Watch pages: a featured-channel card below the player.
- Live pages: a featured-channel card below the stream player.
- Mini feed: a featured-channel card in the feed grid.
- Community: a featured-channel card above the post list.

The card is labelled “Featured channel” and opens the configured YouTube destination in a new tab. It is not inserted into the actual video stream and does not interrupt playback.

## Clip sourcing and rights

Raye2 does not download, cut, or re-upload arbitrary YouTube videos. Prepare short promotional videos/Shorts on the channel (or use clips you have permission to promote), then add their individual YouTube URLs and thumbnails to this list. The current rotation selects among prepared promo entries; it does not automatically edit source videos.

## Important limitations

- This is unpaid cross-promotion; no provider revenue or impression-based payout is generated.
- The public environment variable contains public promo metadata only. Never put secrets, account credentials, or payout details in it.
- This first version uses environment configuration rather than an admin-managed database screen.
- A configured promo appears only where the corresponding page slot is mounted and only when at least one active eligible entry exists.

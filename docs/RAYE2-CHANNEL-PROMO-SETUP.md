# Raye2 YouTube channel promotion catalogue

## Admin-managed channels

Raye2 discovers public uploads from every enabled channel in the Admin → Business & live → YouTube promo channels section. The initial source is `@maronizer`. Admins can add more channel links, choose placements, pause a source, or remove it. No manual Shorts playlist is required.

Supported channel links:
- `https://www.youtube.com/@channelhandle`
- `https://www.youtube.com/channel/UC...`

The public uploads playlist is resolved automatically from each channel. Raye2 reads up to 10,000 uploads per channel and refreshes the catalogue every six hours. Newly published public videos become eligible after the next refresh. YouTube API quota applies.

## Automatic content classification

- **Mini feed:** videos up to 180 seconds that have a Shorts marker in title/description/tags or a portrait thumbnail signal. Ambiguous short uploads are excluded rather than risk placing a regular video in Mini's.
- **Video and live preview sources:** long uploads over 180 seconds.
- **Community:** all public uploads from enabled channels.
- **Video/live preview:** 15-second timed excerpts inside YouTube's official embedded player. Chapter markers are preferred; otherwise a bounded random timestamp is chosen. The skip control appears after five seconds.

YouTube classifies Shorts using both duration and aspect ratio, with date-specific rules. The Data API exposes duration and thumbnails/metadata, but does not expose a definitive Shorts boolean. Therefore Raye2's classification is best-effort, not guaranteed to match YouTube's own Shorts tab for every upload.

## Vercel configuration

Only one server-side environment variable is required:

`YOUTUBE_DATA_API_KEY`

Add it to the existing Vercel project `creator-fan-hub` as a Sensitive/Encrypted variable for Preview first. It must be a YouTube Data API v3 key and must not use a `NEXT_PUBLIC_` prefix.

The previous `RAYE2_YOUTUBE_HANDLE` and `RAYE2_YOUTUBE_SHORTS_PLAYLIST_ID` settings are no longer used by the multi-channel catalogue. Channel links and placements are stored in the admin-managed Supabase table.

## Database migration

Apply `supabase/migrations/20261119200000_raye2_youtube_promo_channels.sql` to the connected Supabase project before using the Admin channel manager. It creates the channel source table, admin-only write policy, public enabled-channel read policy, and seeds `@maronizer`.

## Limitations

- This is unpaid channel cross-promotion, not a paid ad network.
- The YouTube Data API must not be used to download, import, cache, or store copies of YouTube audiovisual content without prior written approval.
- A timed embedded excerpt is not a separately rendered or AI-edited video clip.
- To create genuinely edited cuts, use the original video/stream recording files that the content owner is authorized to provide, then process those files through Raye2's own media pipeline.
- Live-page placement is a pre-roll preview; it is not an ad splice inside an ongoing live broadcast.
- API quota and YouTube API policies apply.

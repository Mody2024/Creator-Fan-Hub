# Raye2 YouTube channel promotions

## What the system does

Raye2 discovers public uploads from every enabled YouTube channel and selects content for the placement chosen by the admin. No manually maintained Shorts playlist is required.

The initial channel is `@maronizer`. Admins can add more channels, pause/remove a channel, and choose its placements from **Admin → Business & live → YouTube promo channels**.

Supported links:
- `https://www.youtube.com/@channelhandle`
- `https://www.youtube.com/channel/UC...`

## Automatic content classification

- **Mini feed:** all public uploads up to 180 seconds. YouTube does not expose a definitive Shorts flag through the Data API, so this favours including every short clip; an ordinary upload under three minutes may also appear in Mini's.
- **Video and live previews:** regular uploads longer than 180 seconds, including completed public livestream recordings detected through YouTube's live-stream metadata. Raye2 selects a 15-second excerpt inside YouTube's official embedded player, preferring chapter timestamps and otherwise selecting a bounded random timestamp. The skip control appears after five seconds.
- **Community:** any public upload from an enabled channel can appear as a featured post/card linking to the original YouTube video.

The YouTube Data API does not expose an authoritative Shorts flag. Classification is best-effort using available metadata, duration and thumbnail dimensions. It may not match YouTube's own Shorts tab perfectly.

## New uploads

The channel's public uploads playlist is discovered automatically. YouTube metadata requests use a six-hour cache. New public uploads are eligible after that cache expires and a Raye2 page requests the catalogue. This is on-demand cache revalidation, not a guaranteed background poll when nobody is using Raye2. API quota applies.

## Vercel configuration

Only one server-side variable is required:

`YOUTUBE_DATA_API_KEY`

1. Open the existing Vercel project `creator-fan-hub`.
2. Open Settings → Environment Variables.
3. Add `YOUTUBE_DATA_API_KEY` with your YouTube Data API v3 key.
4. Choose **Sensitive/Encrypted** and **Preview** first.
5. Save and redeploy the `development` branch.

Do not use a `NEXT_PUBLIC_` prefix. The key must never be exposed to browser code.

Create the key in Google Cloud Console:
1. Select/create a project.
2. Enable YouTube Data API v3.
3. Create an API key under APIs & Services → Credentials.
4. Restrict it to YouTube Data API v3.
5. Keep it private.

## Database setup

Apply migration `supabase/migrations/20261119200000_raye2_youtube_promo_channels.sql` to the connected Supabase project. It creates the admin-managed channel source table, RLS policies and seeds `@maronizer`.

The migration is in the development branch but has not been applied to the connected Supabase project. Do not use the channel manager until the migration is applied.

## Limitations

- This is unpaid cross-promotion, not paid ad inventory.
- YouTube's API is used for public metadata; Raye2 embeds original YouTube videos and does not download/re-upload their audiovisual content.
- Timed excerpts are not separately rendered or AI-edited clips. Professional independent edits require the original source file and an authorized Raye2 editing pipeline.
- The live placement is a preview before the live player, not an ad splice inside the live broadcast.
- API quota and YouTube API terms apply.

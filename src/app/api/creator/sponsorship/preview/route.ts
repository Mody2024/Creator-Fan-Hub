import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { readBoundedJson } from "@/lib/read-bounded-json";
import { selectSponsorBreakpoints } from "@/lib/raye2/sponsor-breakpoint-director.mjs";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) return NextResponse.json({ error: "Backend is not configured." }, { status: 503 });
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const parsed = await readBoundedJson(request, 4096);
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: parsed.status });
  const body: unknown = parsed.value;
  const campaignId = body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>).campaignId : null;
  if (typeof campaignId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(campaignId)) {
    return NextResponse.json({ error: "A valid sponsorship campaign ID is required." }, { status: 400 });
  }

  // RLS and the explicit owner filter both restrict preview to the signed-in creator.
  const { data: campaign, error: campaignError } = await supabase
    .from("raye2_creator_sponsor_campaigns")
    .select("id,media_id,sponsor_name,placement,status,category_key,category_exclusive,max_per_viewer")
    .eq("id", campaignId)
    .eq("creator_id", userId)
    .maybeSingle();
  if (campaignError) return NextResponse.json({ error: "Could not load this sponsorship campaign." }, { status: 500 });
  if (!campaign) return NextResponse.json({ error: "Sponsorship campaign not found." }, { status: 404 });

  const { data: video, error: videoError } = await supabase
    .from("video_catalog")
    .select("duration_seconds,published_at")
    .eq("media_id", campaign.media_id)
    .maybeSingle();
  if (videoError || !video || !video.published_at || !Number.isSafeInteger(video.duration_seconds) || video.duration_seconds <= 0) {
    return NextResponse.json({ error: "A published video with a known duration is required for preview." }, { status: 422 });
  }

  const [reviewsResult, variantsResult] = await Promise.all([
    supabase.from("raye2_creator_sponsor_breakpoints")
      .select("at_seconds,decision,note")
      .eq("campaign_id", campaign.id)
      .eq("creator_id", userId)
      .order("at_seconds"),
    supabase.from("raye2_sponsor_creative_variants")
      .select("id,media_id,variant_key,active")
      .eq("creator_campaign_id", campaign.id)
      .eq("owner_id", userId)
      .eq("active", true)
      .order("created_at")
  ]);
  if (reviewsResult.error || variantsResult.error) {
    return NextResponse.json({ error: "Could not load creator review data. Check that the sponsorship migrations are applied." }, { status: 503 });
  }

  const candidates = (reviewsResult.data ?? []).map((row) => ({
    atSeconds: row.at_seconds,
    source: "creator_mark" as const,
    confidence: 1,
    creatorExcluded: row.decision === "exclude"
  }));
  const breakpoints = selectSponsorBreakpoints({
    durationSeconds: video.duration_seconds,
    candidates,
    maxBreaks: 2,
    minSpacingSeconds: 300,
    minLeadSeconds: 60,
    minTailSeconds: 30,
    minConfidence: 0.7
  });

  return NextResponse.json({
    previewOnly: true,
    deliveryEnabled: false,
    campaign: {
      id: campaign.id,
      sponsorName: campaign.sponsor_name,
      placement: campaign.placement,
      status: campaign.status,
      categoryKey: campaign.category_key,
      categoryExclusive: campaign.category_exclusive,
      maxPerViewer: campaign.max_per_viewer
    },
    durationSeconds: video.duration_seconds,
    reviewedBreakpoints: reviewsResult.data ?? [],
    proposedBreakpoints: breakpoints,
    creativeVariants: variantsResult.data ?? [],
    limitations: [
      "Only creator-reviewed timestamps are considered; automatic media analysis is not connected.",
      "This preview does not select a platform campaign or an external ad-network campaign.",
      "No advertisement is loaded, played, inserted or counted as an impression."
    ]
  }, { headers: { "Cache-Control": "private, no-store" } });
}

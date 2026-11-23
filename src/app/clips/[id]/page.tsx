import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { resolvePublicObjectUrls } from "@/lib/storage/resolve.server";
import ClipDetailClient from "./clip-detail-client";
import "../clips-raye2.css";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ClipRow = {
  id: string; title: string; caption: string; storage_path: string; duration_seconds: number;
  created_at: string; expires_at: string; visibility: string; status: string;
  attribution_text: string; source_media_id: string | null; source_slug: string | null; source_title: string;
  clipper_id: string; clipper_handle: string | null; clipper_display_name: string | null; clipper_avatar_url: string | null;
  source_owner_id: string | null;
};

export default async function ClipPermalinkPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const cookieStore = await cookies();
  const locale = cookieStore.get("raye2_locale")?.value === "ar" ? "ar" : "en";
  const isArabic = locale === "ar";
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const { data, error } = await supabase.rpc("raye2_get_community_clip", { p_clip_id: id }).maybeSingle();
  if (error || !data) notFound();
  const clip = data as ClipRow;
  // A removed or expired clip is not addressable as a public page; the RPC still returns it to its
  // clipper/source owner/moderator for other surfaces, but the permalink should not resolve.
  if (clip.status !== "published" || new Date(clip.expires_at).getTime() <= Date.now()) notFound();

  const ref = { bucketId: "raye2-clips", objectKey: clip.storage_path };
  const pooled = await resolvePublicObjectUrls([ref]);
  const pooledSrc = pooled.get("raye2-clips\u0000" + clip.storage_path) ?? null;
  const src = pooledSrc ?? supabase.storage.from("raye2-clips").getPublicUrl(clip.storage_path).data.publicUrl;

  return (
    <main className="raye2-clips-page" dir={isArabic ? "rtl" : "ltr"} lang={locale}>
      <article className="raye2-clip-detail">
        <video className="raye2-clip-detail-video" src={src} controls preload="metadata" playsInline />
        <h1>{clip.title}</h1>
        {clip.caption ? <p className="raye2-muted">{clip.caption}</p> : null}
        <small className="raye2-clip-attribution">
          {isArabic ? "المصدر" : "Source"}: {clip.source_slug ? <Link href={`/watch/${clip.source_slug}`}>{clip.attribution_text}</Link> : clip.attribution_text}
        </small>
        <small>{clip.clipper_display_name ?? clip.clipper_handle ?? (isArabic ? "عضو" : "Member")} · {isArabic ? "ينتهي" : "Expires"} {new Date(clip.expires_at).toLocaleDateString(isArabic ? "ar" : "en")}</small>
        <ClipDetailClient
          clipId={clip.id}
          clipperId={clip.clipper_id}
          sourceOwnerId={clip.source_owner_id}
          locale={locale}
        />
      </article>
    </main>
  );
}

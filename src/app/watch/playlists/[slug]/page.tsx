import Link from "next/link";
import { notFound } from "next/navigation";
import { cookies } from "next/headers";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./playlist.css";

export const dynamic = "force-dynamic";

type Item = { media_id: string; title: string; slug: string; description: string; category: string; src: string; duration: number | null };

export default async function PlaylistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const cookieStore = await cookies();
  const isArabic = cookieStore.get("raye2_locale")?.value === "ar";
  const supabase = await createSupabaseServerClient();
  if (!supabase) notFound();

  const { data: playlist } = await supabase
    .from("video_playlists")
    .select("id,slug,title,description,owner_id,updated_at")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();
  if (!playlist) notFound();

  const { data: owner } = await supabase
    .from("member_profiles")
    .select("handle,display_name")
    .eq("user_id", playlist.owner_id)
    .maybeSingle();

  const { data: rows } = await supabase
    .from("video_playlist_items")
    .select("position,media_id,media_items!inner(id,title,storage_path,alt_text,video_catalog!video_catalog_media_id_fkey!inner(slug,description,category,published_at,duration_seconds))")
    .eq("playlist_id", playlist.id)
    .order("position", { ascending: true });

  const items: Item[] = (rows ?? []).flatMap((row) => {
    const media = Array.isArray(row.media_items) ? row.media_items[0] : row.media_items;
    if (!media?.storage_path?.startsWith("creator-media-public/")) return [];
    const catalog = Array.isArray(media.video_catalog) ? media.video_catalog[0] : media.video_catalog;
    if (!catalog?.slug || !catalog.published_at) return [];
    const parts = media.storage_path.split("/");
    if (parts.length < 2) return [];
    return [{
      media_id: media.id,
      title: media.title,
      slug: catalog.slug,
      description: catalog.description || media.alt_text || "",
      category: catalog.category || "Video",
      src: supabase.storage.from(parts[0]).getPublicUrl(parts.slice(1).join("/")).data.publicUrl,
      duration: catalog.duration_seconds ?? null
    }];
  });

  const t = isArabic
    ? { back: "عودة إلى المشاهدة", by: "من إنشاء", count: "فيديو", empty: "لا توجد فيديوهات منشورة في قائمة التشغيل هذه بعد.", watch: "شاهد ↗", playlist: "قائمة تشغيل" }
    : { back: "Back to Watch", by: "by", count: "videos", empty: "No published videos in this playlist yet.", watch: "Watch ↗", playlist: "Playlist" };

  return (
    <main className="playlist-page" dir={isArabic ? "rtl" : "ltr"}>
      <header className="playlist-head">
        <Link href="/watch" className="playlist-back">{t.back}</Link>
        <span className="playlist-eyebrow">{t.playlist}</span>
        <h1>{playlist.title}</h1>
        {owner?.handle ? <p className="playlist-by">{t.by} <Link href={"/u/" + owner.handle}>{owner.display_name ?? owner.handle}</Link></p> : null}
        {playlist.description ? <p className="playlist-desc">{playlist.description}</p> : null}
        <p className="playlist-count">{items.length} {t.count}</p>
      </header>
      {items.length ? (
        <ol className="playlist-items">
          {items.map((item) => (
            <li key={item.media_id}>
              <article className="playlist-item">
                <video src={item.src} controls preload="metadata" playsInline aria-label={item.title} />
                <div className="playlist-item-info">
                  <span className="playlist-item-cat">{item.category}</span>
                  <h2>{item.title}</h2>
                  <p>{item.description}</p>
                  <Link href={"/watch/" + item.slug}>{t.watch}</Link>
                </div>
              </article>
            </li>
          ))}
        </ol>
      ) : (
        <div className="playlist-empty">{t.empty}</div>
      )}
    </main>
  );
}

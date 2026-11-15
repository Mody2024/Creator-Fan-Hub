"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getResumableUploadSession, uploadToSupabaseStorage } from "@/lib/supabase/resumable-upload";

type ClipRow = { id: string; title: string; caption: string; storage_path: string; duration_seconds: number; created_at: string; expires_at: string; attribution_text: string; source_media_id: string | null; source_slug: string | null; clipper_handle: string | null; clipper_display_name: string | null; clipper_avatar_url: string | null };
type ClipCard = ClipRow & { src: string };
type SourceRow = { media_id: string; slug: string | null; duration_seconds: number | null; media_items: { title: string; media_type: string } | { title: string; media_type: string }[] };
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SECONDS = 30;

export default function ClipsClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const input = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<ClipCard[]>([]);
  const [sources, setSources] = useState<{ id: string; title: string; slug: string | null; duration: number | null }[]>([]);
  const [sourceId, setSourceId] = useState("");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const isArabic = locale === "ar";
  const t = isArabic
    ? { heading: "شارك مقطعًا من فيديو", intro: "اختر فيديو منشورًا، حدّد البداية والنهاية (حتى ٣٠ ثانية)، وارفع المقطع. يظهر مع إشارة إلى المصدر.", source: "الفيديو المصدر", start: "البداية (ثانية)", end: "النهاية (ثانية)", title: "عنوان المقطع", caption: "وصف (اختياري)", choose: "＋ اختر ملف MP4/WebM", none: "لم يتم اختيار ملف", publish: "انشر المقطع ↗", publishing: "جارٍ النشر…", signIn: "سجّل الدخول لنشر مقطع ↗", loading: "جارٍ تحميل المقاطع…", empty: "لا توجد مقاطع مجتمع بعد. كن أول من يصنع واحدًا.", ready: "الملف جاهز. تحقق من النطاق والعنوان.", live: "أصبح مقطعك متاحًا.", invalid: "اختر ملف MP4 أو WebM.", tooLarge: "الحجم يتجاوز ٥٠ ميجابايت.", badRange: "يجب أن يكون النطاق بين ١ و٣٠ ثانية وداخل مدة المصدر.", videoRead: "تعذر قراءة الملف.", feedError: "تعذر تحميل المقاطع. حدّث الصفحة.", upload: "جارٍ الرفع", attribution: "المصدر", clipDuration: "المدة", expired: "منتهي", expires: "ينتهي", quota: "تم بلوغ الحد اليومي للمقاطع.", noSource: "اختر فيديو مصدرًا." }
    : { heading: "Clip a published video", intro: "Pick a published video, set a start and end (up to 30 seconds) and upload the clip. It appears with source attribution.", source: "Source video", start: "Start (seconds)", end: "End (seconds)", title: "Clip title", caption: "Caption (optional)", choose: "＋ Choose MP4/WebM file", none: "No file selected", publish: "Publish clip ↗", publishing: "Publishing…", signIn: "Sign in to publish a clip ↗", loading: "Loading community clips…", empty: "No community clips yet. Be the first to make one.", ready: "File ready. Check the range and title.", live: "Your clip is live.", invalid: "Choose an MP4 or WebM file.", tooLarge: "This file exceeds the 50 MB limit.", badRange: "The range must be 1–30 seconds and inside the source duration.", videoRead: "This file could not be read.", feedError: "The clips feed could not load. Please refresh.", upload: "Uploading", attribution: "Source", clipDuration: "Duration", expired: "EXPIRED", expires: "Expires", quota: "Daily community clip limit reached.", noSource: "Choose a source video." };

  useEffect(() => { const match = document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/); if (match) setLocale(match[1] as "en" | "ar"); }, []);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("raye2_list_community_clips", { p_limit: 60 });
    if (error) { setStatus(t.feedError); setLoading(false); return; }
    setItems(((data ?? []) as ClipRow[]).map((row) => ({ ...row, src: supabase.storage.from("raye2-clips").getPublicUrl(row.storage_path).data.publicUrl })));
    setLoading(false);
  }, [supabase, t.feedError]);

  const loadSources = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase
      .from("video_catalog")
      .select("media_id,slug,duration_seconds,media_items!inner(title,media_type,is_published,allow_clipping)")
      .not("published_at", "is", null)
      .eq("media_items.is_published", true)
      .eq("media_items.allow_clipping", true)
      .limit(40);
    const rows = ((data ?? []) as unknown as SourceRow[]).map((row) => {
      const media = Array.isArray(row.media_items) ? row.media_items[0] : row.media_items;
      return { id: row.media_id, title: media?.title ?? "Raye2 video", slug: row.slug, duration: row.duration_seconds };
    });
    setSources(rows);
  }, [supabase]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void supabase.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => setUserId(data.user?.id ?? null));
    void load();
    void loadSources();
  }, [supabase, load, loadSources]);

  async function chooseFile(selected: File | null) {
    setFile(null); setStatus("");
    if (!selected) return;
    if (!["video/mp4", "video/webm"].includes(selected.type)) { setStatus(t.invalid); if (input.current) input.current.value = ""; return; }
    if (selected.size > MAX_BYTES) { setStatus(t.tooLarge); if (input.current) input.current.value = ""; return; }
    setFile(selected);
    setTitle((value) => value || selected.name.replace(/\.[^.]+$/, "").slice(0, 100));
    setStatus(t.ready);
  }

  const clipDuration = Math.max(0, Math.round(end - start));

  async function publish() {
    if (!supabase || !userId || !file || !title.trim() || !sourceId || busy) return;
    if (clipDuration < 1 || clipDuration > MAX_SECONDS) { setStatus(t.badRange); return; }
    const source = sources.find((s) => s.id === sourceId);
    if (source?.duration && end > source.duration) { setStatus(t.badRange); return; }
    setBusy(true); setStatus("");
    let reservationId: string | null = null;
    let uploadSession: ReturnType<typeof getResumableUploadSession> | null = null;
    let uploaded = false;
    try {
      uploadSession = getResumableUploadSession(userId, "raye2-clips", file);
      const previousReservation = uploadSession.getReservationId();
      if (previousReservation) {
        const { data: reused, error: reuseError } = await supabase.rpc("reuse_nhen_media_upload_reservation", { p_reservation_id: previousReservation, p_bytes: file.size, p_bucket: "raye2-clips" });
        if (!reuseError && reused) reservationId = previousReservation;
      }
      if (!reservationId) {
        const { data: reservation, error: reservationError } = await supabase.rpc("reserve_nhen_media_upload", { p_bytes: file.size, p_bucket: "raye2-clips" });
        if (reservationError || !reservation?.[0]?.reservation_id) throw reservationError ?? new Error("Storage capacity is unavailable. No upload was started.");
        reservationId = reservation[0].reservation_id as string;
        uploadSession.saveReservation(reservationId);
      }
      const path = uploadSession.objectName;
      await uploadToSupabaseStorage({ client: supabase, bucketName: "raye2-clips", objectName: path, file, onProgress: setUploadProgress });
      uploaded = true;
      const { error: saveError } = await supabase.rpc("raye2_publish_community_clip", {
        p_title: title.trim(), p_caption: caption.trim(), p_storage_path: path, p_duration_seconds: clipDuration,
        p_source_media_id: sourceId, p_clip_start_seconds: Math.round(start), p_clip_end_seconds: Math.round(end), p_visibility: "public"
      });
      if (saveError) {
        const { error: cleanupError } = await supabase.storage.from("raye2-clips").remove([path]);
        if (cleanupError) throw new Error("The post could not be saved and its file needs administrator cleanup.");
        throw new Error(/daily community clip/.test(saveError.message) ? t.quota : saveError.message);
      }
      setTitle(""); setCaption(""); setFile(null); setStart(0); setEnd(0); setSourceId(""); if (input.current) input.current.value = "";
      setStatus(t.live); await load();
    } catch (error) { setStatus(error instanceof Error ? error.message : t.feedError); }
    finally {
      if (uploaded && uploadSession) {
        uploadSession.clear();
        if (reservationId) { try { await supabase.rpc("release_nhen_media_upload_reservation", { p_reservation_id: reservationId }); } catch { /* reservation expires automatically */ } }
      }
      setUploadProgress(null);
      setBusy(false);
    }
  }

  const expiresLabel = (value: string) => new Date(value).toLocaleDateString(isArabic ? "ar-EG" : "en-US", { month: "short", day: "numeric" });

  return (
    <section className="raye2-clips-feed">
      <article className="raye2-clips-compose">
        <h2>{t.heading}</h2>
        <p className="nhen-muted">{t.intro}</p>
        {userId ? (
          <>
            <label>{t.source}
              <select value={sourceId} onChange={(e) => setSourceId(e.target.value)}>
                <option value="">—</option>
                {sources.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
            <div className="raye2-clips-range">
              <label>{t.start}<input type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value) || 0)} /></label>
              <label>{t.end}<input type="number" min={0} value={end} onChange={(e) => setEnd(Number(e.target.value) || 0)} /></label>
              <small>{t.clipDuration}: {clipDuration}s</small>
            </div>
            <label>{t.title}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} /></label>
            <label>{t.caption}<input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} /></label>
            <input ref={input} type="file" accept="video/mp4,video/webm" aria-label={t.choose} onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)} />
            <small>{file ? file.name : t.none}</small>
            {uploadProgress !== null ? <progress aria-label={t.upload} max={100} value={uploadProgress} /> : null}
            <button className="nhen-action" disabled={busy || !file || !title.trim() || !sourceId} onClick={() => void publish()}>{busy ? t.publishing : t.publish}</button>
          </>
        ) : (
          <Link className="nhen-action" href="/login">{t.signIn}</Link>
        )}
        {status ? <p role="status" className="nhen-muted">{status}</p> : null}
      </article>

      {loading ? <div className="nhen-card nhen-empty-state">{t.loading}</div> : items.length ? (
        <div className="raye2-clips-grid">
          {items.map((item) => (
            <article className="raye2-clip-card" key={item.id}>
              <video className="raye2-clip-video" src={item.src} controls preload="metadata" playsInline />
              <div className="raye2-clip-info">
                <h3>{item.title}</h3>
                <p>{item.caption}</p>
                <small className="raye2-clip-attribution">{t.attribution}: {item.source_slug ? <Link href={`/watch/${item.source_slug}`}>{item.attribution_text}</Link> : item.attribution_text}</small>
                <small>{item.clipper_display_name ?? item.clipper_handle ?? "Member"} · {t.expires} {expiresLabel(item.expires_at)}</small>
              </div>
            </article>
          ))}
        </div>
      ) : <div className="nhen-card nhen-empty-state">{t.empty}</div>}
    </section>
  );
}

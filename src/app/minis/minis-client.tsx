"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getResumableUploadSession, uploadToSupabaseStorage } from "@/lib/supabase/resumable-upload";
import { MultipartUnavailableError, prefersChunkedUpload, uploadChunkedToPool } from "@/lib/storage/chunked-upload";
import { resolveStorageDeliveries, splitStoragePath } from "@/lib/storage/resolve-delivery";

type MiniRow = { id: string; title: string; caption: string; storage_path: string; duration_seconds: number; created_at: string; expires_at: string; author_id: string | null; author_handle: string | null; author_display_name: string | null; author_avatar_url: string | null };
type MiniCard = MiniRow & { src: string };
const MAX_BYTES = 50 * 1024 * 1024;
const MAX_SECONDS = 15;

export default function MinisClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const input = useRef<HTMLInputElement>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [items, setItems] = useState<MiniCard[]>([]);
  const [title, setTitle] = useState("");
  const [caption, setCaption] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [duration, setDuration] = useState(0);
  const [busy, setBusy] = useState(false);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const isArabic = locale === "ar";
  const t = isArabic
    ? {
        share: "شارك مقطع ميني", limits: "مقاطع MP4 أو WebM حتى ١٥ ثانية و٥٠ ميجابايت. تنتهي صلاحيتها بعد ٣٠ يومًا.", title: "اكتب عنوانًا", caption: "أضف وصفًا (اختياري)", choose: "＋ اختر مقطعًا", none: "لم يتم اختيار مقطع", publish: "انشر الميني ↗", publishing: "جارٍ النشر…", signIn: "سجّل الدخول لنشر مقطع ↗", loading: "جارٍ تحميل المقاطع…", empty: "لا توجد مقاطع ميني بعد. كن أول من ينشر.", ready: "المقطع جاهز. أضف عنوانًا وانشره.", live: "أصبح مقطعك متاحًا.", invalid: "اختر مقطعًا بصيغة MP4 أو WebM.", tooLarge: "الحجم يتجاوز ٥٠ ميجابايت.", tooLong: "يجب ألا تتجاوز مدة الميني ١٥ ثانية.", videoRead: "تعذر قراءة المقطع.", genericRead: "تعذر قراءة المقطع.", uploadInterrupted: "توقف الرفع. اختر الملف نفسه للمتابعة.", uploadCleanup: "تعذر حفظ المنشور، ويحتاج الملف إلى مراجعة المسؤول.", expired: "منتهي", expires: "ينتهي", upload: "جارٍ الرفع", resume: "إذا توقف الرفع، اختر الملف نفسه مرة أخرى للاستكمال.", feedError: "تعذر تحميل المقاطع. حدّث الصفحة.", fileTitle: "عنوان المقطع", fileCaption: "وصف المقطع", uploadProgress: "تقدم رفع الميني", quota: "تم بلوغ الحد اليومي للمقاطع (٣ يوميًا للأعضاء).", report: "إبلاغ", reported: "تم إرسال الإبلاغ.", reportFail: "تعذر إرسال الإبلاغ.", remove: "إزالة", removed: "تمت إزالة المقطع.", removeFail: "تعذر إزالة المقطع.", reportReason: "سبب الإبلاغ"
      }
    : {
        share: "Share a Mini", limits: "MP4 or WebM · up to 15 seconds · 50 MB. Expires 30 days after publishing.", title: "Give your Mini a title", caption: "Add a caption (optional)", choose: "＋ Choose clip", none: "No clip selected", publish: "Publish Mini ↗", publishing: "Publishing…", signIn: "Sign in to publish a Mini ↗", loading: "Loading Mini's…", empty: "No Mini's yet. Be the first to share one.", ready: "Clip ready. Add a title and publish it.", live: "Your Mini is live.", invalid: "Choose an MP4 or WebM clip.", tooLarge: "This clip exceeds the 50 MB limit.", tooLong: "Mini's must be 15 seconds or shorter.", videoRead: "This clip could not be read.", genericRead: "Could not read this clip.", uploadInterrupted: "Upload interrupted. Choose the same file again to continue.", uploadCleanup: "The post could not be saved and its file needs administrator cleanup.", expired: "EXPIRED", expires: "Expires", upload: "Uploading", resume: "If interrupted, choose the same file again to resume.", feedError: "The Mini's feed could not load. Please refresh.", fileTitle: "Clip title", fileCaption: "Clip caption", uploadProgress: "Mini upload progress", quota: "Daily Mini limit reached (3 per day for members).", report: "Report", reported: "Report submitted.", reportFail: "Could not submit the report.", remove: "Remove", removed: "Mini removed.", removeFail: "Could not remove the Mini.", reportReason: "Report reason"
      };

  useEffect(() => { const match = document.cookie.match(/(?:^|; )raye2_locale=(en|ar)(?:;|$)/); if (match) setLocale(match[1] as "en" | "ar"); }, []);

  const load = useCallback(async () => {
    if (!supabase) { setLoading(false); return; }
    setLoading(true);
    const { data, error } = await supabase.rpc("raye2_list_minis", { p_limit: 60 });
    if (error) { setStatus(t.feedError); setLoading(false); return; }
    const rows = (data ?? []) as MiniRow[];
    const refs = rows.map(row => splitStoragePath("raye2-minis/" + row.storage_path)).filter((ref): ref is NonNullable<typeof ref> => ref !== null);
    const urls = await resolveStorageDeliveries(refs, (bucketId, objectKey) => supabase.storage.from(bucketId).getPublicUrl(objectKey).data.publicUrl);
    setItems(rows.map((row) => ({ ...row, src: urls.get("raye2-minis\u0000" + row.storage_path) ?? supabase.storage.from("raye2-minis").getPublicUrl(row.storage_path).data.publicUrl })));
    setLoading(false);
  }, [supabase, t.feedError]);

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    void supabase.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => setUserId(data.user?.id ?? null));
    void load();
  }, [supabase, load]);

  async function chooseFile(selected: File | null) {
    setFile(null); setDuration(0); setStatus("");
    if (!selected) return;
    if (!["video/mp4", "video/webm"].includes(selected.type)) { setStatus(t.invalid); if (input.current) input.current.value = ""; return; }
    if (selected.size > MAX_BYTES) { setStatus(t.tooLarge); if (input.current) input.current.value = ""; return; }
    const url = URL.createObjectURL(selected);
    try {
      const seconds = await new Promise<number>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject(new Error(t.videoRead));
        video.src = url;
      });
      if (!Number.isFinite(seconds) || seconds <= 0 || seconds > MAX_SECONDS) throw new Error(t.tooLong);
      setFile(selected); setDuration(Math.ceil(seconds)); setTitle((value) => value || selected.name.replace(/\.[^.]+$/, "").slice(0, 100)); setStatus(t.ready);
    } catch (error) { setStatus(error instanceof Error ? error.message : t.genericRead); if (input.current) input.current.value = ""; }
    finally { URL.revokeObjectURL(url); }
  }

  async function publish() {
    if (!supabase || !userId || !file || !title.trim() || busy) return;
    setBusy(true); setStatus("");
    let reservationId: string | null = null;
    let uploadSession: ReturnType<typeof getResumableUploadSession> | null = null;
    let uploaded = false;
    try {
      uploadSession = getResumableUploadSession(userId, "raye2-minis", file);
      const previousReservation = uploadSession.getReservationId();
      if (previousReservation) {
        const { data: reused, error: reuseError } = await supabase.rpc("reuse_nhen_media_upload_reservation", { p_reservation_id: previousReservation, p_bytes: file.size, p_bucket: "raye2-minis" });
        if (!reuseError && reused) reservationId = previousReservation;
      }
      if (!reservationId) {
        const { data: reservation, error: reservationError } = await supabase.rpc("reserve_nhen_media_upload", { p_bytes: file.size, p_bucket: "raye2-minis" });
        if (reservationError || !reservation?.[0]?.reservation_id) throw reservationError ?? new Error("Storage capacity is unavailable. No upload was started.");
        reservationId = reservation[0].reservation_id as string;
        uploadSession.saveReservation(reservationId);
      }
      const path = uploadSession.objectName;
      let pooledUploaded = false;
      if (prefersChunkedUpload(file)) {
        try {
          await uploadChunkedToPool({ bucketId: "raye2-minis", objectKey: path, file, assetClass: "mini", contentType: file.type, onProgress: setUploadProgress });
          pooledUploaded = true;
        } catch (poolError) {
          if (!(poolError instanceof MultipartUnavailableError)) throw poolError;
          // Pooled multipart storage is not available yet; fall back to the Supabase path below.
        }
      }
      if (!pooledUploaded) {
        await uploadToSupabaseStorage({ client: supabase, bucketName: "raye2-minis", objectName: path, file, onProgress: setUploadProgress });
      }
      uploaded = true;
      const { error: saveError } = await supabase.rpc("raye2_publish_mini", { p_title: title.trim(), p_caption: caption.trim(), p_storage_path: path, p_duration_seconds: duration, p_source_media_id: null, p_visibility: "public" });
      if (saveError) {
        const { error: cleanupError } = await supabase.storage.from("raye2-minis").remove([path]);
        if (cleanupError) throw new Error(t.uploadCleanup);
        throw new Error(/daily Mini/.test(saveError.message) ? t.quota : saveError.message);
      }
      setTitle(""); setCaption(""); setFile(null); setDuration(0); if (input.current) input.current.value = "";
      setStatus(t.live); await load();
    } catch (error) { setStatus(!uploaded ? `${t.uploadInterrupted} ${error instanceof Error ? error.message : ""}` : error instanceof Error ? error.message : t.uploadCleanup); }
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

  async function reportMini(id: string) {
    if (!supabase || !userId) return;
    setBusy(true);
    const { error } = await supabase.rpc("raye2_report_community_content", { p_target_type: "mini", p_target_id: id, p_reason: "other", p_details: "" });
    setStatus(error ? t.reportFail : t.reported);
    setBusy(false);
  }
  async function removeMini(id: string, storagePath: string) {
    if (!supabase || !userId) return;
    setBusy(true);
    const { error } = await supabase.from("raye2_minis").update({ status: "removed" }).eq("id", id).eq("author_id", userId);
    if (!error) { try { await supabase.storage.from("raye2-minis").remove([storagePath]); } catch { /* row already hidden; storage cleanup is best-effort */ } }
    setStatus(error ? t.removeFail : t.removed);
    await load();
    setBusy(false);
  }
  return (
    <section className="raye2-minis-feed">
      <article className="raye2-minis-compose">
        <h2>{t.share}</h2>
        <p className="raye2-muted">{t.limits}</p>
        {userId ? (
          <>
            <label>{t.fileTitle}<input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={100} /></label>
            <label>{t.fileCaption}<input value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={500} /></label>
            <input ref={input} type="file" accept="video/mp4,video/webm" aria-label={t.fileTitle} onChange={(e) => void chooseFile(e.target.files?.[0] ?? null)} />
            <small>{file ? `${file.name} · ${duration}s` : t.none}</small>
            {uploadProgress !== null ? <progress aria-label={t.uploadProgress} max={100} value={uploadProgress} /> : null}
            <button className="raye2-action" disabled={busy || !file || !title.trim()} onClick={() => void publish()}>{busy ? t.publishing : t.publish}</button>
          </>
        ) : (
          <Link className="raye2-action" href="/community#join">{t.signIn}</Link>
        )}
        {status ? <p role="status" className="raye2-muted">{status}</p> : null}
      </article>

      {loading ? <div className="raye2-card raye2-empty-state">{t.loading}</div> : items.length ? (
        <div className="raye2-minis-grid">
          {items.map((item) => (
            <article className="raye2-mini-card" key={item.id}>
              <video className="raye2-mini-video" src={item.src} controls preload="metadata" playsInline />
              <div className="raye2-mini-info">
                <h3>{item.title}</h3>
                <p>{item.caption}</p>
                <small>{item.author_display_name ?? item.author_handle ?? "Member"} · {t.expires} {expiresLabel(item.expires_at)}</small>
                {userId && item.author_id !== userId ? <button type="button" className="raye2-action" aria-label={t.report} disabled={busy} onClick={() => void reportMini(item.id)}>{t.report}</button> : null}
                {userId && item.author_id === userId ? <button type="button" className="raye2-action" aria-label={t.remove} disabled={busy} onClick={() => void removeMini(item.id, item.storage_path)}>{t.remove}</button> : null}
              </div>
            </article>
          ))}
        </div>
      ) : <div className="raye2-card raye2-empty-state">{t.empty}</div>}
    </section>
  );
}

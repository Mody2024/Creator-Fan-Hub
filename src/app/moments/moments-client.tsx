"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type MediaRow = { id: string; title: string; media_type: string };

export default function MomentsClient() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const router = useRouter();
  const [media, setMedia] = useState<MediaRow[]>([]);
  const [videoId, setVideoId] = useState("");
  const [body, setBody] = useState("");
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(60);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [locale, setLocale] = useState<"en" | "ar">("en");
  const isArabic = locale === "ar";
  const t = isArabic
    ? { compose: "أنشئ لحظة", intro: "اختر فيديو من فيديوهاتك وحدّد المقطع المميز (حتى ٣ دقائق).", pick: "اختر فيديو", start: "البداية (ثانية)", end: "النهاية (ثانية)", body: "اكتب وصفًا للحظة", publish: "انشر اللحظة ↗", publishing: "جارٍ النشر…", done: "أُرسلت اللحظة للمراجعة وستظهر قريبًا.", noMedia: "لا توجد فيديوهات منشورة بعد.", error: "تعذر نشر اللحظة.", clip: "يجب أن تكون النهاية بعد البداية." }
    : { compose: "Create a Moment", intro: "Pick one of your videos and mark the highlight window (up to 3 minutes).", pick: "Choose a video", start: "Start (seconds)", end: "End (seconds)", body: "Describe the Moment", publish: "Publish Moment ↗", publishing: "Publishing…", done: "Moment submitted for review; it will appear shortly.", noMedia: "No published videos yet.", error: "Could not publish the Moment.", clip: "The end must come after the start." };

  useEffect(() => { const match = document.cookie.match(/(?:^|; )raye2_locale=(en|ar)(?:;|$)/); if (match) setLocale(match[1] as "en" | "ar"); }, []);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data } = await supabase.rpc("get_creator_media", { p_limit: 100 });
    const rows = (Array.isArray(data) ? data : []) as MediaRow[];
    setMedia(rows.filter((row) => ["video", "youtube"].includes(row.media_type)));
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function publish() {
    if (!supabase || busy || !videoId || !body.trim() || end <= start) return;
    setBusy(true); setStatus("");
    const { error } = await supabase.rpc("raye2_publish_moment", { p_linked_video_id: videoId, p_body: body.trim(), p_start_seconds: start, p_end_seconds: end });
    if (error) setStatus(error.message.includes("highlight") || error.message.includes("seconds") ? error.message : t.error);
    else { setStatus(t.done); setBody(""); router.refresh(); }
    setBusy(false);
  }

  if (media.length === 0) return null;

  return (
    <article className="raye2-moments-compose">
      <h2>{t.compose}</h2>
      <p className="raye2-muted">{t.intro}</p>
      <label>{t.pick}
        <select value={videoId} onChange={(e) => setVideoId(e.target.value)}>
          <option value="">—</option>
          {media.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </label>
      <label>{t.body}<input value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} /></label>
      <div className="raye2-moments-window">
        <label>{t.start}<input type="number" min={0} value={start} onChange={(e) => setStart(Number(e.target.value))} /></label>
        <label>{t.end}<input type="number" min={1} value={end} onChange={(e) => setEnd(Number(e.target.value))} /></label>
      </div>
      {end <= start ? <small className="raye2-muted">{t.clip}</small> : null}
      <button className="raye2-action" disabled={busy || !videoId || !body.trim() || end <= start} onClick={() => void publish()}>{busy ? t.publishing : t.publish}</button>
      {status ? <p role="status" className="raye2-muted">{status}</p> : null}
    </article>
  );
}

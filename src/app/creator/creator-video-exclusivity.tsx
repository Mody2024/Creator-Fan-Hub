"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type VideoRow = {
  media_id: string;
  slug: string;
  title: string;
  published_at: string | null;
  exclusive_until: string | null;
  available_until: string | null;
};

export default function CreatorVideoExclusivity({ locale }: { locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [videos, setVideos] = useState<VideoRow[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { exclusive: string; available: string }>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const t = isAr
    ? {
        title: "حصريات مدة الفيديو", note: "اختر مدة الحصرية (حتى 7 أيام) ومدة الإتاحة (حتى 14 يومًا) لكل فيديو منشور.",
        exclusive: "حصرية (أيام)", available: "إتاحة (أيام)", apply: "تطبيق", none: "لا توجد فيديوهات منشورة بعد.",
        saved: "تم تحديث الحصرية.", err: "تعذر التحديث (تحقق من الحدود والصلاحية).", exclusiveUntil: "حصرية حتى", availableUntil: "متاح حتى"
      }
    : {
        title: "Video exclusivity & expiry", note: "Set an exclusive window (up to 7 days) and an availability window (up to 14 days) for each published video.",
        exclusive: "Exclusive (days)", available: "Available (days)", apply: "Apply", none: "No published videos yet.",
        saved: "Exclusivity updated.", err: "Could not update (check caps and permission).", exclusiveUntil: "Exclusive until", availableUntil: "Available until"
      };

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.rpc("raye2_get_my_video_exclusivity");
    setVideos((data ?? []) as VideoRow[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function apply(mediaId: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    const draft = drafts[mediaId] ?? { exclusive: "", available: "" };
    const exclusive = draft.exclusive.trim() === "" ? 0 : Number(draft.exclusive);
    const available = draft.available.trim() === "" ? 0 : Number(draft.available);
    if (!Number.isInteger(exclusive) || !Number.isInteger(available) || exclusive < 0 || available < 0) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_set_video_exclusivity", {
      p_media_id: mediaId, p_exclusive_days: exclusive, p_available_days: available
    });
    if (error) setNotice(t.err);
    else { setNotice(t.saved); await load(); }
    setBusy(false);
  }

  return (
    <section className="module-block" id="creator-video-exclusivity">
      <div className="module-heading"><div><h2>{t.title}</h2><p>{t.note}</p></div></div>
      {notice ? <p>{notice}</p> : null}
      {videos.length === 0 ? <p>{t.none}</p> : videos.map((video) => {
        const draft = drafts[video.media_id] ?? { exclusive: "", available: "" };
        return (
          <article className="module-card" key={video.media_id}>
            <div className="module-card-top"><span>{video.title}</span><span className="module-state">{video.slug}</span></div>
            <small>
              {video.exclusive_until ? `${t.exclusiveUntil} ${new Date(video.exclusive_until).toLocaleString(isAr ? "ar-EG" : "en")}` : ""}
              {video.available_until ? ` · ${t.availableUntil} ${new Date(video.available_until).toLocaleString(isAr ? "ar-EG" : "en")}` : ""}
            </small>
            <label>{t.exclusive}
              <input type="number" min={0} max={7} value={draft.exclusive}
                onChange={(e) => setDrafts((c) => ({ ...c, [video.media_id]: { ...draft, exclusive: e.target.value } }))} />
            </label>
            <label>{t.available}
              <input type="number" min={0} max={14} value={draft.available}
                onChange={(e) => setDrafts((c) => ({ ...c, [video.media_id]: { ...draft, available: e.target.value } }))} />
            </label>
            <button className="module-arrow" disabled={busy} onClick={() => void apply(video.media_id)}>{t.apply}</button>
          </article>
        );
      })}
    </section>
  );
}

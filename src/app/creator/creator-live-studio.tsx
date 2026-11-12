"use client";

import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Stream = {
  id: string;
  title: string;
  status: string;
  visibility: string;
  health: string;
  started_at: string | null;
  ended_at: string | null;
  replay_until: string | null;
  created_at: string;
};

const HEALTH = ["connecting", "good", "degraded", "reconnecting", "offline"] as const;

export default function CreatorLiveStudio({ locale }: { locale: "ar" | "en" }) {
  const isAr = locale === "ar";
  const [streams, setStreams] = useState<Stream[]>([]);
  const [title, setTitle] = useState("");
  const [visibility, setVisibility] = useState("public");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");

  const t = isAr
    ? {
        title: "استوديو البث", note: "ابدأ بثك وتابع حالته وأدر الإعادة. البث متاح لدور البث (Streamer) فقط.",
        streamTitle: "عنوان البث", visibility: "الظهور", start: "ابدأ البث", end: "إنهاء", replay: "الإعادة متاحة حتى",
        health: "الحالة", none: "لا يوجد بث بعد.", started: "تم بدء البث.", ended: "تم إنهاء البث.", err: "تعذر تنفيذ العملية (تحقق من صلاحية البث والحصص)."
      }
    : {
        title: "Live studio", note: "Start a stream, report its health and manage the replay. Starting streams requires the Streamer role.",
        streamTitle: "Stream title", visibility: "Visibility", start: "Start stream", end: "End", replay: "Replay available until",
        health: "Health", none: "No streams yet.", started: "Stream started.", ended: "Stream ended.", err: "The operation failed (check the Streamer role and quotas)."
      };

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.rpc("raye2_get_my_live_streams");
    setStreams((data ?? []) as Stream[]);
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function start() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy || title.trim().length < 1) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_start_live_stream", { p_title: title.trim(), p_visibility: visibility });
    if (error) setNotice(t.err);
    else { setNotice(t.started); setTitle(""); await load(); }
    setBusy(false);
  }

  async function end(id: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_end_live_stream", { p_stream_id: id });
    if (error) setNotice(t.err);
    else { setNotice(t.ended); await load(); }
    setBusy(false);
  }

  async function setHealth(id: string, health: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_update_live_stream_health", { p_stream_id: id, p_health: health });
    if (error) setNotice(t.err);
    else await load();
    setBusy(false);
  }

  return (
    <section className="module-block" id="creator-live-studio">
      <div className="module-heading"><div><h2>{t.title}</h2><p>{t.note}</p></div></div>
      <article className="module-card">
        <div className="module-card-top"><span>{t.streamTitle}</span></div>
        <input value={title} maxLength={140} onChange={(e) => setTitle(e.target.value)} placeholder={t.streamTitle} />
        <label>{t.visibility}
          <select value={visibility} onChange={(e) => setVisibility(e.target.value)}>
            <option value="public">public</option><option value="unlisted">unlisted</option><option value="private">private</option>
          </select>
        </label>
        <button className="module-arrow" disabled={busy} onClick={() => void start()}>{t.start}</button>
        {notice ? <p>{notice}</p> : null}
      </article>
      {streams.length === 0 ? <p>{t.none}</p> : streams.map((stream) => (
        <article className="module-card" key={stream.id}>
          <div className="module-card-top"><span>{stream.title}</span><span className="module-state">{stream.status}</span></div>
          <small>{t.health}: {stream.health}{stream.replay_until ? ` · ${t.replay} ${new Date(stream.replay_until).toLocaleString(isAr ? "ar-EG" : "en")}` : ""}</small>
          {stream.status === "live" ? (
            <div className="module-card-top">
              {HEALTH.map((state) => (
                <button key={state} className="module-arrow" disabled={busy || stream.health === state} onClick={() => void setHealth(stream.id, state)}>{state}</button>
              ))}
              <button className="module-arrow" disabled={busy} onClick={() => void end(stream.id)}>{t.end}</button>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}

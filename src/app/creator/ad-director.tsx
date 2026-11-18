"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type MediaRow = { id: string; title: string; media_type: string; is_published: boolean };
type Breakpoint = { id: string; at_seconds: number; source: string; excluded: boolean };
type Placement = { at_seconds: number; source_type: string | null; sponsor_name: string | null; disclosure_text: string | null; variant_key: string | null; replay_seconds: number; reason: string };

export default function AdDirector({ locale }: { locale: "en" | "ar" }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const isArabic = locale === "ar";
  const t = isArabic
    ? {
        title: "مخرج الإعلانات الذكي", intro: "اقترح نقاط توقف طبيعية داخل فيديوهاتك، راجعها أو استبعدها، وعاين أين قد يظهر الرعاة.",
        pick: "اختر فيديو", propose: "اقترح نقاط التوقف", proposals: "نقاط التوقف", approve: "اعتماد", exclude: "استبعاد", preview: "عاين الخطة", loading: "جارٍ التحميل…", none: "لا توجد نقاط توقف بعد.", planned: "المواضع المقترحة", empty: "لم يتم التخطيط لأي موضع.", replay: "إعادة السياق", sponsor: "الراعي", reason: "السبب", contract: "عقد المبدع", platform: "حملة المنصة", nosponsor: "لا راعٍ مؤهل", noMedia: "لا توجد فيديوهات منشورة بعد."
      }
    : {
        title: "Smart Advertising Director", intro: "Propose natural breakpoints inside your videos, review or exclude them, and preview where sponsors may appear.",
        pick: "Choose a video", propose: "Propose breakpoints", proposals: "Breakpoints", approve: "Approve", exclude: "Exclude", preview: "Preview plan", loading: "Loading…", none: "No breakpoints yet.", planned: "Proposed placements", empty: "No placements planned.", replay: "Context replay", sponsor: "Sponsor", reason: "Reason", contract: "Creator contract", platform: "Platform campaign", nosponsor: "No eligible sponsor", noMedia: "No published videos yet."
      };

  const [media, setMedia] = useState<MediaRow[]>([]);
  const [videoId, setVideoId] = useState("");
  const [breakpoints, setBreakpoints] = useState<Breakpoint[]>([]);
  const [plan, setPlan] = useState<Placement[]>([]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc("get_creator_media", { p_limit: 100 }).then(({ data }: { data: unknown }) => {
      const rows = (Array.isArray(data) ? data : []) as MediaRow[];
      const published = rows.filter((row) => ["video", "youtube"].includes(row.media_type) && row.is_published);
      setMedia(published);
      if (published[0]) setVideoId(published[0].id);
      setLoaded(true);
    });
  }, [supabase]);

  const loadBreakpoints = useCallback(async (id: string) => {
    if (!supabase || !id) { setBreakpoints([]); return; }
    const { data } = await supabase.from("raye2_media_breakpoints").select("id,at_seconds,source,excluded").eq("media_id", id).order("at_seconds");
    setBreakpoints((Array.isArray(data) ? data : []) as Breakpoint[]);
  }, [supabase]);

  useEffect(() => { setPlan([]); void loadBreakpoints(videoId); }, [videoId, loadBreakpoints]);

  async function propose() {
    if (!supabase || !videoId || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_propose_breakpoints", { p_media_id: videoId });
    if (error) setNotice(error.message);
    await loadBreakpoints(videoId);
    setBusy(false);
  }

  async function toggle(breakpoint: Breakpoint) {
    if (!supabase || busy) return;
    setBusy(true); setNotice("");
    const { error } = await supabase.rpc("raye2_set_media_breakpoint_excluded", { p_breakpoint_id: breakpoint.id, p_excluded: !breakpoint.excluded });
    if (error) setNotice(error.message);
    await loadBreakpoints(videoId);
    setBusy(false);
  }

  async function preview() {
    if (!supabase || !videoId || busy) return;
    setBusy(true); setNotice("");
    const { data, error } = await supabase.rpc("raye2_ad_director_plan", { p_media_id: videoId, p_inventory: "video", p_viewer_key: null, p_region: null });
    if (error) setNotice(error.message); else setPlan((Array.isArray(data) ? data : []) as Placement[]);
    setBusy(false);
  }

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  const sourceLabel = (p: Placement) => p.source_type === "creator_contract" ? t.contract : p.source_type === "platform_campaign" ? t.platform : t.nosponsor;

  if (loaded && media.length === 0) return null;

  return (
    <section id="creator-sponsorships" className="raye2-ad-director">
      <h2>{t.title}</h2>
      <p className="raye2-muted">{t.intro}</p>
      <label>{t.pick}
        <select value={videoId} onChange={(e) => setVideoId(e.target.value)} disabled={busy}>
          {media.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
      </label>
      <div className="raye2-ad-director-actions">
        <button className="raye2-action" disabled={busy || !videoId} onClick={() => void propose()}>{t.propose}</button>
        <button className="raye2-action" disabled={busy || !videoId} onClick={() => void preview()}>{t.preview}</button>
      </div>
      {notice ? <p role="status" className="raye2-muted">{notice}</p> : null}

      <h3>{t.proposals}</h3>
      {breakpoints.length === 0 ? <p className="raye2-muted">{t.none}</p> : (
        <ul className="raye2-ad-breakpoints">
          {breakpoints.map((b) => (
            <li key={b.id} className={b.excluded ? "is-excluded" : ""}>
              <span>{fmt(b.at_seconds)}</span>
              <span className="raye2-muted">{b.source}</span>
              <button className="raye2-action" disabled={busy} onClick={() => void toggle(b)}>{b.excluded ? t.approve : t.exclude}</button>
            </li>
          ))}
        </ul>
      )}

      <h3>{t.planned}</h3>
      {plan.length === 0 ? <p className="raye2-muted">{t.empty}</p> : (
        <ul className="raye2-ad-plan">
          {plan.map((p, i) => (
            <li key={`${p.at_seconds}-${i}`}>
              <span className="raye2-ad-plan-at">{fmt(p.at_seconds)}</span>
              <span className="raye2-ad-plan-src">{sourceLabel(p)}</span>
              {p.sponsor_name ? <span>{t.sponsor}: {p.sponsor_name}</span> : null}
              <span className="raye2-muted">{t.replay}: {p.replay_seconds}s · {p.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

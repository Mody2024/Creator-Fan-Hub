"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type MediaOption = { media_id: string; title: string; media_type: string; is_published: boolean };

type SiteDraft = {
  schemaVersion: 1;
  identity: { siteName: string; tagline: string; logoMediaId?: string | null; mascotMediaId?: string | null; narrationMediaId?: string | null; narrationText?: string; narrationAutoPlay?: boolean };
  appearance: { theme: "obsidian" | "paper" | "violet" | "custom"; accent?: string; colorMode?: string; motion?: string };
  hero: { title: string; body: string; mediaId?: string | null; overlay?: number; muted?: boolean; loop?: boolean };
  maintenance: { enabled: boolean; message: string };
  layout: { sectionOrder: string[]; visibleSections: string[] };
  socialLinkIds: string[];
  featureFlags: Record<string, boolean>;
  [key: string]: unknown;
};

const fallback: SiteDraft = {
  schemaVersion: 1,
  identity: { siteName: "THE INNER CIRCLE", tagline: "A community built around what comes next." },
  appearance: { theme: "obsidian", accent: "#C5A46D", colorMode: "dark", motion: "full" },
  hero: { title: "Your next favorite video starts here.", body: "Vote on ideas, share what you want to see, and help shape the next upload.", mediaId: null, overlay: 0.35, muted: true, loop: true },
  maintenance: { enabled: false, message: "We'll be back soon." },
  layout: { sectionOrder: ["hero", "ideas", "poll", "events", "community", "socials"], visibleSections: ["hero", "ideas", "poll", "events", "community", "socials"] },
  socialLinkIds: [],
  featureFlags: { polls: true, ideas: true, events: true, guidedTour: true, mascot: true, voice: false, miniGames: false, store: false }
};

export default function CreatorSettings() {
  const router = useRouter();
  const [draft, setDraft] = useState<SiteDraft>(fallback);
  const [revision, setRevision] = useState(1);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(fallback));
  const hasUnsavedChanges = JSON.stringify(draft) !== savedSnapshot;
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading your private draft…");
  const [mediaOptions, setMediaOptions] = useState<MediaOption[]>([]);

  const load = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("Supabase is not configured for this preview.");
      setBusy(false);
      return;
    }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      router.replace("/creator/login");
      return;
    }
    const { data: admin, error: adminError } = await supabase
      .from("creator_admins").select("user_id").eq("user_id", userData.user.id).eq("active", true).maybeSingle();
    if (adminError || !admin) {
      setStatus("This account has not been granted creator access. Ask the owner to provision your account.");
      setBusy(false);
      return;
    }
    const { data, error } = await supabase.rpc("get_site_config_draft");
    if (error || !data?.[0]?.draft) {
      setStatus("Could not load the draft. Check creator access and database setup.");
      setBusy(false);
      return;
    }
    const loaded = data[0];
    const { data: mediaData } = await supabase.rpc("get_creator_media", { p_limit: 100 });
    setMediaOptions((mediaData ?? []) as MediaOption[]);
    const normalizedDraft: SiteDraft = { ...fallback, ...loaded.draft, identity: { ...fallback.identity, ...loaded.draft.identity }, appearance: { ...fallback.appearance, ...loaded.draft.appearance }, hero: { ...fallback.hero, ...loaded.draft.hero }, maintenance: { ...fallback.maintenance, ...loaded.draft.maintenance }, layout: { ...fallback.layout, ...loaded.draft.layout }, featureFlags: { ...fallback.featureFlags, ...loaded.draft.featureFlags }, socialLinkIds: Array.isArray(loaded.draft.socialLinkIds) ? loaded.draft.socialLinkIds : [] };
    setDraft(normalizedDraft);
    setSavedSnapshot(JSON.stringify(normalizedDraft));
    setRevision(Number(loaded.draft_revision));
    setStatus("Draft loaded. Changes remain private until you publish.");
    setBusy(false);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  function update<K extends keyof SiteDraft>(section: K, key: string, value: unknown) {
    setDraft(current => ({ ...current, [section]: { ...(current[section] as Record<string, unknown>), [key]: value } }));
  }

  function moveVisibleSection(key: string, direction: -1 | 1) {
    setDraft(current => {
      const order = [...(current.layout.sectionOrder ?? fallback.layout.sectionOrder)];
      const visibleSet = new Set(current.layout.visibleSections ?? fallback.layout.visibleSections);
      const visibleOrder = order.filter(item => visibleSet.has(item));
      const index = visibleOrder.indexOf(key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= visibleOrder.length) return current;
      [visibleOrder[index], visibleOrder[nextIndex]] = [visibleOrder[nextIndex], visibleOrder[index]];
      let visibleIndex = 0;
      const sectionOrder = order.map(item => visibleSet.has(item) ? visibleOrder[visibleIndex++] : item);
      return { ...current, layout: { ...current.layout, sectionOrder } };
    });
  }

  async function save(publish: boolean) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase || saving) return;
    setSaving(true);
    setStatus(publish ? "Publishing the verified draft…" : "Saving draft…");
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) {
      setSaving(false);
      router.replace("/creator/login");
      return;
    }
    const { data: admin } = await supabase.from("creator_admins").select("user_id").eq("user_id", userData.user.id).eq("active", true).maybeSingle();
    if (!admin) {
      setSaving(false);
      setStatus("Creator access is required for this action.");
      return;
    }
    const saved = await supabase.rpc("save_site_config_draft", { p_config: draft, p_expected_revision: revision });
    if (saved.error || !saved.data?.[0]) {
      setSaving(false);
      setStatus(saved.error?.message?.includes("revision conflict") ? "Another edit changed this draft. Reload it before trying again." : "Draft save failed. Check the configuration and try again.");
      return;
    }
    const nextRevision = Number(saved.data[0].new_revision);
    setRevision(nextRevision);
    setSavedSnapshot(JSON.stringify(draft));
    if (publish) {
      const result = await supabase.rpc("publish_site_config", { p_expected_revision: nextRevision });
      if (result.error || !result.data?.[0]) {
        setSaving(false);
        setStatus("Draft saved, but publishing failed. Your published site has not been changed.");
        return;
      }
      setStatus("Published successfully. The public website now reads this version.");
    } else {
      setStatus("Draft saved privately. Publish when you're ready.");
    }
    setSaving(false);
    router.refresh();
  }

  return <section className="creator-editor" aria-busy={busy || saving}>
    <div className="editor-topline"><span className="eyebrow">LIVE CONFIGURATION / DRAFT {revision} · {hasUnsavedChanges ? "UNSAVED CHANGES" : "ALL CHANGES SAVED"}</span><button className="editor-reload" onClick={() => { if (hasUnsavedChanges && !window.confirm("Discard your unsaved changes and reload the saved draft?")) return; setBusy(true); void load(); }} disabled={busy || saving}>Reload draft ↻</button></div>
    {busy ? <p className="editor-status" role="status">{status}</p> : <>
      <div className="draft-preview-wrap"><div className="draft-preview-label"><span>LIVE DRAFT PREVIEW</span><small>Private until you publish</small></div><div className={"draft-preview theme-" + draft.appearance.theme} style={{"--preview-accent": draft.appearance.accent || "#C5A46D"} as React.CSSProperties & {"--preview-accent": string}}><div className="draft-preview-top"><span>{draft.identity.siteName || "Your website name"}</span><span>PREVIEW / 01</span></div><div className="draft-preview-main"><span className="draft-preview-eyebrow">{draft.identity.tagline || "Your tagline"}</span><h3>{draft.hero.title || "Your headline goes here"}</h3><p>{draft.hero.body || "Your description will appear here."}</p><span className="draft-preview-cta">{draft.featureFlags.polls ? "CAST YOUR VOTE ↗" : draft.featureFlags.ideas ? "SUBMIT AN IDEA ↗" : "EXPLORE ↗"}</span></div><div className="draft-preview-sections">{(draft.layout.sectionOrder ?? []).filter(key=>(draft.layout.visibleSections ?? []).includes(key)).map((key,index)=><span key={key}>{String(index+1).padStart(2,"0")} / {({hero:"Hero",ideas:"Ideas",poll:"Voting",events:"Events",community:"Community",socials:"Social links"} as Record<string,string>)[key] ?? key}</span>)}</div>{draft.maintenance.enabled && <div className="draft-preview-maintenance">MAINTENANCE MODE · {draft.maintenance.message}</div>}</div></div><div className="editor-section-title"><span>01 / IDENTITY</span><h2>Make it <em>yours.</em></h2><p>These values are stored in Supabase. The public website changes only after publishing.</p></div>
      <div className="editor-grid">
        <label>Website name<input maxLength={100} value={draft.identity.siteName} onChange={e=>update("identity","siteName",e.target.value)} /></label>
        <label>Tagline<input maxLength={240} value={draft.identity.tagline} onChange={e=>update("identity","tagline",e.target.value)} /></label>
        <label>Hero headline<input maxLength={180} value={draft.hero.title} onChange={e=>update("hero","title",e.target.value)} /></label>
        <label>Hero description<textarea maxLength={1000} rows={3} value={draft.hero.body} onChange={e=>update("hero","body",e.target.value)} /></label>
        <label>Visual theme<select value={draft.appearance.theme} onChange={e=>update("appearance","theme",e.target.value)}><option value="obsidian">Obsidian</option><option value="paper">Paper</option><option value="violet">Violet</option><option value="custom">Custom</option></select></label>
        <label>Accent color<input type="color" value={draft.appearance.accent || "#C5A46D"} onChange={e=>update("appearance","accent",e.target.value)} /></label>
      </div>
      <div className="editor-grid">
        <label>Published logo image<select value={draft.identity.logoMediaId ?? ""} onChange={e=>update("identity","logoMediaId",e.target.value || null)}><option value="">Text logo only</option>{mediaOptions.filter(item=>item.is_published && item.media_type==="image").map(item=><option key={item.media_id} value={item.media_id}>{item.title}</option>)}</select></label>
        <label>Published hero media<select value={draft.hero.mediaId ?? ""} onChange={e=>update("hero","mediaId",e.target.value || null)}><option value="">Use default hero artwork</option>{mediaOptions.filter(item=>item.is_published && (item.media_type==="image" || item.media_type==="video")).map(item=><option key={item.media_id} value={item.media_id}>{item.title} · {item.media_type}</option>)}</select></label>
      </div>
      <p className="media-upload-note">Only published assets can be selected for the public site. Upload and publish files in the Media Library first.</p>
      <div className="editor-grid">
        <label>Published mascot image<select value={draft.identity.mascotMediaId ?? ""} onChange={e=>update("identity","mascotMediaId",e.target.value || null)}><option value="">No custom mascot</option>{mediaOptions.filter(item=>item.is_published && item.media_type==="image").map(item=><option key={item.media_id} value={item.media_id}>{item.title}</option>)}</select></label>
        <label>Intro narration / voice clip<select value={draft.identity.narrationMediaId ?? ""} onChange={e=>update("identity","narrationMediaId",e.target.value || null)}><option value="">No narration clip</option>{mediaOptions.filter(item=>item.is_published && item.media_type==="audio").map(item=><option key={item.media_id} value={item.media_id}>{item.title}</option>)}</select></label>
      </div>
      <label>On-screen narration text / transcript<textarea rows={4} maxLength={1600} value={draft.identity.narrationText ?? ""} onChange={e=>update("identity","narrationText",e.target.value)} placeholder="Write the words visitors should see alongside the voice-over…" /></label>
      <label className="editor-check"><input type="checkbox" checked={draft.identity.narrationAutoPlay !== false} onChange={e=>update("identity","narrationAutoPlay",e.target.checked)} /> Attempt voice-over autoplay on page load <small>Browsers may block audible autoplay; a visible play button remains available.</small></label>
      <div className="editor-grid">
        <label>Hero overlay strength<input type="range" min="0" max="0.85" step="0.05" value={typeof draft.hero.overlay === "number" ? draft.hero.overlay : 0.35} onChange={e=>update("hero","overlay",Number(e.target.value))} /><small>{Math.round(Number(draft.hero.overlay ?? 0.35)*100)}% dark overlay</small></label>
        <label className="editor-check"><input type="checkbox" checked={draft.hero.muted !== false} onChange={e=>update("hero","muted",e.target.checked)} /> Mute hero video by default</label>
        <label className="editor-check"><input type="checkbox" checked={draft.hero.loop !== false} onChange={e=>update("hero","loop",e.target.checked)} /> Loop hero video</label>
      </div>
      <p className="media-upload-note">Mascots use published images for now. Narration attempts autoplay where browser permissions allow it. If audible autoplay is blocked, visitors get a clear play control. Keep the transcript concise and readable.</p>
      <div className="editor-divider" />
      <div className="editor-section-title"><span>02 / EXPERIENCE</span><h2>Choose what <em>appears.</em></h2><p>Disabled modules keep their saved configuration; this switch controls public availability only.</p></div>
      <div className="feature-toggle-grid">
        {([["polls","Community polls"],["ideas","Idea submissions"],["events","Events"],["guidedTour","Guided tour"],["mascot","Mascot"],["voice","Voice and narration"],["miniGames","Mini-games"],["store","Store (future)"]] as const).map(([key,label])=><label className="feature-toggle" key={key}><span><strong>{label}</strong><small>{key === "store" ? "Keep disabled until the store is ready." : "Enable or disable this experience."}</small></span><input type="checkbox" checked={draft.featureFlags[key]} onChange={e=>setDraft(current=>({...current,featureFlags:{...current.featureFlags,[key]:e.target.checked}}))} /></label>)}
      </div>
      <div className="editor-divider" />
      <div className="editor-section-title"><span>03 / LAYOUT</span><h2>Set the <em>stage.</em></h2><p>Choose which public sections appear. Hiding a section never deletes its saved content.</p></div>
      <div className="feature-toggle-grid">
        {([["hero","Hero"],["ideas","Idea board"],["poll","Voting"],["events","Events"],["community","Community banner"],["socials","Social links"]] as const).map(([key,label])=><label className="feature-toggle" key={key}><span><strong>{label}</strong><small>Show or hide this public section.</small></span><input type="checkbox" checked={(draft.layout.visibleSections ?? []).includes(key)} onChange={e=>setDraft(current=>({...current,layout:{...current.layout,visibleSections:e.target.checked?Array.from(new Set([...current.layout.visibleSections,key])):current.layout.visibleSections.filter(item=>item!==key)}}))} /></label>)}
      </div>
      <div className="section-order-panel">
        <div className="section-order-heading"><strong>Public section order</strong><span>Move visible sections up or down. Publish to apply.</span></div>
        {(draft.layout.sectionOrder ?? fallback.layout.sectionOrder).filter(key=>(draft.layout.visibleSections ?? []).includes(key)).map((key,index,items)=><div className="section-order-row" key={key}><span className="section-order-index">{String(index+1).padStart(2,"0")}</span><strong>{({hero:"Hero",ideas:"Idea board",poll:"Voting",events:"Events",community:"Community banner",socials:"Social links"} as Record<string,string>)[key] ?? key}</strong><div className="section-order-actions"><button type="button" aria-label={key+" up"} disabled={index===0} onClick={()=>moveVisibleSection(key,-1)}>↑</button><button type="button" aria-label={key+" down"} disabled={index===items.length-1} onClick={()=>moveVisibleSection(key,1)}>↓</button></div></div>)}
      </div>
      <div className="editor-divider" />
      <div className="editor-section-title"><span>04 / AVAILABILITY</span><h2>Control the <em>doors.</em></h2><p>Maintenance mode is reversible and stored in the draft.</p></div>
      <label className="maintenance-toggle"><input type="checkbox" checked={draft.maintenance.enabled} onChange={e=>update("maintenance","enabled",e.target.checked)} /><span><strong>Maintenance mode</strong><small>Show a temporary offline page to public visitors after publishing.</small></span></label>
      <label className="editor-full-label">Maintenance message<textarea rows={2} maxLength={240} value={draft.maintenance.message} onChange={e=>update("maintenance","message",e.target.value)} /></label>
      <div className="editor-actions"><button className="button button-secondary" onClick={() => void save(false)} disabled={saving || busy}>Save draft</button><button className="button button-primary" onClick={() => void save(true)} disabled={saving || busy}>Save & publish <span>↗</span></button></div>
      <p className="editor-status" role="status" aria-live="polite">{status}</p>
    </>}
  </section>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type SiteDraft = {
  schemaVersion: 1;
  identity: { siteName: string; tagline: string; logoMediaId?: string | null; mascotMediaId?: string | null };
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
  layout: { sectionOrder: ["hero", "ideas", "poll", "latest", "events", "community", "videos", "socials"], visibleSections: ["hero", "ideas", "poll", "community"] },
  socialLinkIds: [],
  featureFlags: { polls: true, ideas: true, events: true, guidedTour: true, mascot: true, voice: false, miniGames: false, store: false }
};

export default function CreatorSettings() {
  const router = useRouter();
  const [draft, setDraft] = useState<SiteDraft>(fallback);
  const [revision, setRevision] = useState(1);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading your private draft…");

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
    setDraft({ ...fallback, ...loaded.draft, identity: { ...fallback.identity, ...loaded.draft.identity }, appearance: { ...fallback.appearance, ...loaded.draft.appearance }, hero: { ...fallback.hero, ...loaded.draft.hero }, maintenance: { ...fallback.maintenance, ...loaded.draft.maintenance }, layout: { ...fallback.layout, ...loaded.draft.layout }, featureFlags: { ...fallback.featureFlags, ...loaded.draft.featureFlags }, socialLinkIds: Array.isArray(loaded.draft.socialLinkIds) ? loaded.draft.socialLinkIds : [] });
    setRevision(Number(loaded.draft_revision));
    setStatus("Draft loaded. Changes remain private until you publish.");
    setBusy(false);
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  function update<K extends keyof SiteDraft>(section: K, key: string, value: unknown) {
    setDraft(current => ({ ...current, [section]: { ...(current[section] as Record<string, unknown>), [key]: value } }));
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
    <div className="editor-topline"><span className="eyebrow">LIVE CONFIGURATION / DRAFT {revision}</span><button className="editor-reload" onClick={() => { setBusy(true); void load(); }} disabled={busy || saving}>Reload draft ↻</button></div>
    {busy ? <p className="editor-status" role="status">{status}</p> : <>
      <div className="editor-section-title"><span>01 / IDENTITY</span><h2>Make it <em>yours.</em></h2><p>These values are stored in Supabase. The public website changes only after publishing.</p></div>
      <div className="editor-grid">
        <label>Website name<input maxLength={100} value={draft.identity.siteName} onChange={e=>update("identity","siteName",e.target.value)} /></label>
        <label>Tagline<input maxLength={240} value={draft.identity.tagline} onChange={e=>update("identity","tagline",e.target.value)} /></label>
        <label>Hero headline<input maxLength={180} value={draft.hero.title} onChange={e=>update("hero","title",e.target.value)} /></label>
        <label>Hero description<textarea maxLength={1000} rows={3} value={draft.hero.body} onChange={e=>update("hero","body",e.target.value)} /></label>
        <label>Visual theme<select value={draft.appearance.theme} onChange={e=>update("appearance","theme",e.target.value)}><option value="obsidian">Obsidian</option><option value="paper">Paper</option><option value="violet">Violet</option><option value="custom">Custom</option></select></label>
        <label>Accent color<input type="color" value={draft.appearance.accent || "#C5A46D"} onChange={e=>update("appearance","accent",e.target.value)} /></label>
      </div>
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
      <div className="editor-divider" />
      <div className="editor-section-title"><span>04 / AVAILABILITY</span><h2>Control the <em>doors.</em></h2><p>Maintenance mode is reversible and stored in the draft.</p></div>
      <label className="maintenance-toggle"><input type="checkbox" checked={draft.maintenance.enabled} onChange={e=>update("maintenance","enabled",e.target.checked)} /><span><strong>Maintenance mode</strong><small>Show a temporary offline page to public visitors after publishing.</small></span></label>
      <label className="editor-full-label">Maintenance message<textarea rows={2} maxLength={240} value={draft.maintenance.message} onChange={e=>update("maintenance","message",e.target.value)} /></label>
      <div className="editor-actions"><button className="button button-secondary" onClick={() => void save(false)} disabled={saving || busy}>Save draft</button><button className="button button-primary" onClick={() => void save(true)} disabled={saving || busy}>Save & publish <span>↗</span></button></div>
      <p className="editor-status" role="status" aria-live="polite">{status}</p>
    </>}
  </section>;
}

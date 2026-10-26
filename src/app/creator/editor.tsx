"use client";

import { useState } from "react";

type SiteConfig = {
  schemaVersion: 1;
  identity: { siteName: string; tagline: string; logoMediaId: string | null; mascotMediaId: string | null };
  appearance: { theme: "obsidian" | "paper" | "violet" | "custom"; accent: string; colorMode: "dark" | "light" | "system"; motion: "full" | "reduced" | "off" };
  layout: { sectionOrder: string[]; visibleSections: string[] };
  hero: { title: string; body: string; mediaId: string | null; overlay: number; muted: boolean; loop: boolean };
  socialLinkIds: string[];
  featureFlags: { polls: boolean; ideas: boolean; events: boolean; guidedTour: boolean; mascot: boolean; voice: boolean; miniGames: boolean; store: boolean };
  maintenance: { enabled: boolean; message: string };
};

export default function CreatorEditor({ initialConfig, initialRevision }: { initialConfig: SiteConfig; initialRevision: number }) {
  const [config, setConfig] = useState<SiteConfig>(initialConfig);
  const [revision, setRevision] = useState(initialRevision);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [publishedVersion, setPublishedVersion] = useState<number | null>(null);

  function patch<K extends keyof SiteConfig>(key: K, value: SiteConfig[K]) {
    setConfig(current => ({ ...current, [key]: value }));
    setPublishedVersion(null);
  }
  async function send(url: string, body: unknown) {
    const response = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(typeof result.error === "string" ? result.error : "Request failed.");
    return result;
  }
  async function save() {
    setBusy(true); setMessage("");
    try {
      const result = await send("/api/creator/draft", { config, revision });
      setRevision(result.revision);
      setMessage("Draft saved. Public visitors still see the previously published version.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Save failed."); }
    finally { setBusy(false); }
  }
  async function publish() {
    setBusy(true); setMessage("");
    try {
      const result = await send("/api/creator/publish", { revision });
      setPublishedVersion(result.version);
      setMessage("Published version " + result.version + " is now available to public visitors.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Publishing failed."); }
    finally { setBusy(false); }
  }
  const featureLabels: Array<[keyof SiteConfig["featureFlags"], string]> = [
    ["ideas", "Idea submissions"], ["polls", "Community polls"], ["events", "Events"],
    ["guidedTour", "Guided tour"], ["mascot", "Mascot"], ["voice", "Voice narration"],
    ["miniGames", "Mini-games"], ["store", "Store (future)"]
  ];

  return <section className="editor-panel">
    <div className="editor-heading"><div><span className="eyebrow">LIVE CONFIGURATION</span><h2>Shape the public site.</h2><p>Save a private draft first, then publish it when you are ready.</p></div><span className="draft-badge">REVISION {revision}</span></div>
    <div className="editor-grid">
      <div className="editor-field"><label htmlFor="siteName">Website name</label><input id="siteName" maxLength={100} value={config.identity.siteName} onChange={e=>patch("identity",{...config.identity,siteName:e.target.value})}/></div>
      <div className="editor-field"><label htmlFor="tagline">Tagline</label><input id="tagline" maxLength={240} value={config.identity.tagline} onChange={e=>patch("identity",{...config.identity,tagline:e.target.value})}/></div>
      <div className="editor-field editor-wide"><label htmlFor="heroTitle">Hero headline</label><input id="heroTitle" maxLength={180} value={config.hero.title} onChange={e=>patch("hero",{...config.hero,title:e.target.value})}/></div>
      <div className="editor-field editor-wide"><label htmlFor="heroBody">Hero description</label><textarea id="heroBody" maxLength={1000} rows={3} value={config.hero.body} onChange={e=>patch("hero",{...config.hero,body:e.target.value})}/></div>
      <div className="editor-field"><label htmlFor="theme">Visual theme</label><select id="theme" value={config.appearance.theme} onChange={e=>patch("appearance",{...config.appearance,theme:e.target.value as SiteConfig["appearance"]["theme"]})}><option value="obsidian">Obsidian</option><option value="paper">Paper</option><option value="violet">Violet</option><option value="custom">Custom</option></select></div>
      <div className="editor-field"><label htmlFor="accent">Accent color</label><div className="color-input"><input id="accent" type="color" value={config.appearance.accent} onChange={e=>patch("appearance",{...config.appearance,accent:e.target.value})}/><code>{config.appearance.accent}</code></div></div>
      <div className="editor-field editor-wide"><label htmlFor="maintenanceMessage">Maintenance message</label><input id="maintenanceMessage" maxLength={240} value={config.maintenance.message} onChange={e=>patch("maintenance",{...config.maintenance,message:e.target.value})}/><label className="switch-line"><input type="checkbox" checked={config.maintenance.enabled} onChange={e=>patch("maintenance",{...config.maintenance,enabled:e.target.checked})}/> Enable maintenance mode on the public website</label></div>
    </div>
    <div className="feature-editor"><span className="eyebrow">FEATURE VISIBILITY</span><div className="feature-toggle-grid">{featureLabels.map(([key,label])=><label className="switch-line" key={key}><input type="checkbox" checked={config.featureFlags[key]} onChange={e=>patch("featureFlags",{...config.featureFlags,[key]:e.target.checked})}/>{label}</label>)}</div><p>Disabled features retain their settings. Some modules remain previews until their full functionality is implemented.</p></div>
    <div className="editor-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={save}>{busy?"Working…":"Save draft"}</button><button type="button" className="button button-primary" disabled={busy} onClick={publish}>{busy?"Working…":"Publish to public site ↗"}</button></div>
    <p className="form-status" role="status" aria-live="polite">{message}</p>
    {publishedVersion !== null && <span className="published-version">Published version {publishedVersion}</span>}
  </section>;
}

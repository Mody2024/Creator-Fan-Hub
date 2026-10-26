"use client";

import { useCallback, useEffect, useState } from "react";

type VersionRow = {
  version: number;
  published_at: string;
  published_by: string | null;
  maintenance_mode: boolean;
  site_name: string;
  hero_title: string;
};

export default function PublishingHistory() {
  const [versions, setVersions] = useState<VersionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(0);
  const [status, setStatus] = useState("Loading published versions…");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/creator/history", { cache: "no-store" });
      const payload = await response.json() as { versions?: VersionRow[]; error?: string };
      if (!response.ok) throw new Error(payload.error || "Could not load publishing history.");
      setVersions(Array.isArray(payload.versions) ? payload.versions : []);
      setStatus(payload.versions?.length ? "Latest published snapshots loaded." : "No published versions were found yet.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load publishing history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function restore(version: VersionRow) {
    if (working || !window.confirm(
      `Copy published version ${version.version} into the private draft? This will not publish it or change the live website.`
    )) return;
    setWorking(version.version);
    setStatus(`Restoring version ${version.version} to the private draft…`);
    try {
      const response = await fetch("/api/creator/history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ version: version.version })
      });
      const payload = await response.json() as { revision?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Restore failed.");
      setStatus(`Version ${version.version} copied to draft revision ${payload.revision}. Review it in Site identity before publishing.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Restore failed.");
    } finally {
      setWorking(0);
    }
  }

  return <section className="moderation-panel content-manager" aria-busy={loading || working > 0}>
    <div className="moderation-heading">
      <div><span className="eyebrow">PUBLISHING / VERSION HISTORY</span><h2>Every release, <em>traceable.</em></h2><p>Review recent published snapshots and safely copy an older version into your private draft. Restoring never changes the live site by itself.</p></div>
      <button className="editor-reload" type="button" onClick={() => void load()} disabled={loading || working > 0}>Refresh ↻</button>
    </div>
    <p className="editor-status" role="status" aria-live="polite">{status}</p>
    {!loading && versions.length > 0 && <div className="publishing-history-list">
      {versions.map(version => <article className="moderation-item" key={version.version}>
        <div className="module-card-top"><span>VERSION {version.version}</span><span className="module-state">{version.maintenance_mode ? "Maintenance mode" : "Public mode"}</span></div>
        <h3>{version.site_name}</h3>
        <p className="moderation-body">{version.hero_title}</p>
        <p className="editor-status">Published {Number.isNaN(Date.parse(version.published_at)) ? "at an unknown time" : new Date(version.published_at).toLocaleString()}</p>
        <div className="moderation-actions"><button type="button" disabled={working > 0} onClick={() => void restore(version)}>{working === version.version ? "Restoring…" : "Restore to draft ↶"}</button></div>
      </article>)}
    </div>}
  </section>;
}

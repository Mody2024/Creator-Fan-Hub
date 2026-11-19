"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./admin.module.css";

type Channel = {
  id: string;
  channel_url: string;
  channel_handle: string;
  channel_title: string | null;
  enabled: boolean;
  placements: string[];
  last_synced_at: string | null;
  last_sync_status: string;
  last_sync_error: string | null;
  created_at: string;
};

const PLACEMENTS = [
  { id: "video", label: "Video previews" },
  { id: "live", label: "Live previews" },
  { id: "minis", label: "Mini feed" },
  { id: "community", label: "Community posts" }
];

function parseChannelUrl(raw: string) {
  try {
    const url = new URL(raw.trim());
    if (url.protocol !== "https:" || !["youtube.com", "www.youtube.com", "m.youtube.com"].includes(url.hostname.toLowerCase())) return null;
    const handle = url.pathname.match(/^\/@([A-Za-z0-9._-]{3,})\/?$/)?.[1];
    const channelId = url.pathname.match(/^\/channel\/(UC[A-Za-z0-9_-]{20,})\/?$/)?.[1];
    if (handle) return { channel_handle: handle.toLowerCase(), channel_url: `https://www.youtube.com/@${handle}` };
    if (channelId) return { channel_handle: `channel:${channelId}`, channel_url: `https://www.youtube.com/channel/${channelId}` };
    return null;
  } catch { return null; }
}

export default function YouTubeChannelSources() {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [url, setUrl] = useState("");
  const [placements, setPlacements] = useState<string[]>(["video", "live", "minis", "community"]);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error: loadError } = await supabase
      .from("raye2_youtube_promo_channels")
      .select("id,channel_url,channel_handle,channel_title,enabled,placements,last_synced_at,last_sync_status,last_sync_error,created_at")
      .order("created_at", { ascending: false });
    if (loadError) { setError("Could not load channel sources. Apply the latest Raye2 database migration first."); return; }
    setChannels((data ?? []) as Channel[]);
    setError("");
  }, [supabase]);

  useEffect(() => { void load(); }, [load]);

  async function addChannel() {
    if (!supabase) return;
    const parsed = parseChannelUrl(url);
    if (!parsed) { setError("Enter a public YouTube channel URL in @handle or /channel/UC… format."); return; }
    if (!placements.length) { setError("Choose at least one placement."); return; }
    setBusy(true); setError(""); setNotice("");
    const { error: insertError } = await supabase.from("raye2_youtube_promo_channels").insert({
      ...parsed, enabled: true, placements
    });
    setBusy(false);
    if (insertError) {
      setError(insertError.code === "23505" ? "That channel is already connected." : insertError.message);
      return;
    }
    setUrl(""); setNotice("Channel added. Its public uploads will be discovered automatically.");
    await load();
  }

  async function updateChannel(id: string, patch: Partial<Pick<Channel, "enabled" | "placements">>) {
    if (!supabase) return;
    setBusy(true); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("raye2_youtube_promo_channels").update(patch).eq("id", id);
    setBusy(false);
    if (updateError) { setError(updateError.message); return; }
    setNotice("Channel settings saved."); await load();
  }

  async function removeChannel(id: string) {
    if (!supabase || !window.confirm("Remove this YouTube channel from Raye2 promotions?")) return;
    setBusy(true); setError(""); setNotice("");
    const { error: deleteError } = await supabase.from("raye2_youtube_promo_channels").delete().eq("id", id);
    setBusy(false);
    if (deleteError) { setError(deleteError.message); return; }
    setNotice("Channel removed."); await load();
  }

  return <section style={{ display: "grid", gap: 16 }}>
    <div className={styles.sectionHead}>
      <div><h2>YouTube channel sources</h2><p>Connect channels once. Raye2 discovers their public uploads and checks for new videos automatically.</p></div>
      <button type="button" className={styles.action} disabled={busy} onClick={() => void load()}>Refresh</button>
    </div>
    <article className={styles.card} style={{ display: "grid", gap: 12 }}>
      <div><h3>Add a channel</h3><p>Paste a channel homepage URL. No Shorts playlist is required.</p></div>
      <label>Channel URL<input value={url} onChange={event => setUrl(event.target.value)} placeholder="https://youtube.com/@channelname" autoComplete="url"/></label>
      <div><strong>Use this channel in</strong><div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
        {PLACEMENTS.map(item => <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={placements.includes(item.id)} onChange={event => setPlacements(current => event.target.checked ? [...current, item.id] : current.filter(value => value !== item.id))}/>
          {item.label}
        </label>)}
      </div></div>
      <div><button type="button" className={styles.action} disabled={busy} onClick={() => void addChannel()}>Add channel</button></div>
      {error ? <p role="alert" style={{ color: "var(--raye2-danger,#c44)" }}>{error}</p> : null}
      {notice ? <p role="status">{notice}</p> : null}
    </article>
    <div className={styles.sectionHead}><div><h2>Connected channels</h2><p>{channels.length} channel sources</p></div></div>
    {channels.length === 0 ? <article className={styles.card}><p>No channels connected yet.</p></article> : channels.map(channel => <article className={styles.card} key={channel.id} style={{ display: "grid", gap: 12 }}>
      <div className={styles.cardHead}><div><h3>{channel.channel_title || `@${channel.channel_handle.replace(/^channel:/, "")}`}</h3><a href={channel.channel_url} target="_blank" rel="noopener noreferrer">{channel.channel_url}</a><p>Sync: {channel.last_sync_status}{channel.last_synced_at ? ` · ${new Date(channel.last_synced_at).toLocaleString()}` : " · Not synced yet"}</p>{channel.last_sync_error ? <small>{channel.last_sync_error}</small> : null}</div>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}><input type="checkbox" checked={channel.enabled} disabled={busy} onChange={event => void updateChannel(channel.id, { enabled: event.target.checked })}/>Enabled</label>
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>{PLACEMENTS.map(item => <label key={item.id} style={{ display: "flex", alignItems: "center", gap: 6 }}><input type="checkbox" checked={channel.placements.includes(item.id)} disabled={busy} onChange={event => void updateChannel(channel.id, { placements: event.target.checked ? [...channel.placements, item.id] : channel.placements.filter(value => value !== item.id) })}/>{item.label}</label>)}</div>
      <div><button type="button" className={styles.action} disabled={busy} onClick={() => void removeChannel(channel.id)}>Remove channel</button></div>
    </article>)}
    <p style={{ fontSize: 12, opacity: .7 }}>Raye2 reads public YouTube metadata and embeds original YouTube videos. It does not download or re-upload channel videos.</p>
  </section>;
}

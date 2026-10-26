"use client";

import { useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

function getIdeaToken() {
  const key = "creator-fan-hub:idea-token:v1";
  let token = window.localStorage.getItem(key);
  if (!token) {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    token = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(key, token);
  }
  return token;
}

export default function IdeaSubmissionForm() {
  const [token, setToken] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => { try { setToken(getIdeaToken()); } catch { setStatus("Browser storage is unavailable. Check your privacy settings."); } }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!token || busy) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setStatus("Submissions are temporarily unavailable. Please try again later."); return; }
    setBusy(true);
    setStatus("Sending your idea for moderation…");
    const { data, error } = await supabase.rpc("submit_public_idea", {
      p_display_name: displayName.trim(),
      p_title: title.trim(),
      p_body: body.trim(),
      p_submission_token: token
    });
    if (error) {
      setStatus("We couldn't submit that idea. Check the fields and try again.");
      setBusy(false);
      return;
    }
    const result = Array.isArray(data) ? data[0] as { accepted: boolean; result_code: string } | undefined : undefined;
    const messages: Record<string, string> = {
      submitted_for_review: "Thanks! Your idea has been sent for moderation and won't appear publicly until approved.",
      cooldown: "Please wait 10 minutes before submitting another idea from this browser.",
      daily_limit: "This browser has reached the current daily idea limit. Please try again tomorrow.",
      ideas_unavailable: "Idea submissions are temporarily disabled by the creator."
    };
    setStatus(messages[result?.result_code ?? ""] ?? "The idea wasn't accepted. Please try again later.");
    if (result?.accepted) { setTitle(""); setBody(""); }
    setBusy(false);
  }

  return <form className="idea-submit-form" onSubmit={submit}>
    <div className="idea-form-fields">
      <label>Display name <span>OPTIONAL IDENTITY</span><input value={displayName} onChange={e=>setDisplayName(e.target.value)} maxLength={32} placeholder="How should we credit you?" /></label>
      <label>Idea title <span>4–100 CHARACTERS</span><input required value={title} onChange={e=>setTitle(e.target.value)} minLength={4} maxLength={100} placeholder="A video, challenge, or series idea…" /></label>
      <label className="idea-form-wide">Tell us more <span>10–800 CHARACTERS</span><textarea required value={body} onChange={e=>setBody(e.target.value)} minLength={10} maxLength={800} rows={4} placeholder="What would make this idea worth watching?" /></label>
    </div>
    <div className="idea-form-bottom"><p>Ideas are reviewed before publication. A browser token helps slow spam but does not verify real-world identity.</p><button className="button button-primary" disabled={!token || busy || title.trim().length < 4 || body.trim().length < 10}>{busy ? "Submitting…" : "Send your idea"} <span>↗</span></button></div>
    <p className="idea-submit-status" role="status" aria-live="polite">{status}</p>
  </form>;
}

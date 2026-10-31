"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Option = { option_id: string; option_label: string; option_position: number };
type VoteResult = { accepted: boolean; result_code: string };

function getBrowserVoteToken() {
  const key = "creator-fan-hub:anonymous-vote-token:v1";
  let token = window.localStorage.getItem(key);
  if (!token) {
    const bytes = new Uint8Array(24);
    window.crypto.getRandomValues(bytes);
    token = Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(key, token);
  }
  return token;
}

export default function PollVoteForm({ pollId, options }: { pollId: string; options: Option[] }) {
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    try { setToken(getBrowserVoteToken()); }
    catch { setStatus("Your browser could not create a secure local vote token. Check privacy/storage settings."); }
  }, []);

  async function submitVote() {
    if (!selected || !token || !displayName.trim() || displayName.trim().length > 32 || submitting) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("Voting is unavailable because the database connection is not configured.");
      return;
    }
    setSubmitting(true);
    setStatus("Recording your vote securely…");
    try {
      const { data, error } = await supabase.rpc("cast_public_poll_vote", {
        p_poll_id: pollId,
        p_option_id: selected,
        p_display_name: displayName.trim(),
        p_voter_token: token
      });
      if (error) {
        setStatus("We couldn't confirm your vote. Refresh the page before retrying to check whether it was recorded.");
        return;
      }
      const result = (Array.isArray(data) ? data[0] : null) as VoteResult | null;
      if (result?.accepted) {
        setStatus("Your vote has been recorded. Thanks for helping choose what comes next!");
        router.refresh();
        return;
      }
      const messages: Record<string, string> = {
        already_voted: "A vote from this browser has already been recorded for this poll.",
        poll_closed: "This poll is not currently open for voting.",
        polls_unavailable: "Voting is temporarily disabled by the creator."
      };
      setStatus(messages[result?.result_code ?? ""] ?? "The vote was not accepted. Please refresh and try again.");
    } catch {
      setStatus("The connection failed before we could confirm your vote. Refresh the page before retrying to avoid a duplicate attempt.");
    } finally {
      setSubmitting(false);
    }
  }

  return <form className="poll-vote-form" onSubmit={event => { event.preventDefault(); void submitVote(); }}>
    <fieldset disabled={!token || submitting || options.length === 0}>
      <label className="poll-voter-name">Your nickname <span>NO ACCOUNT NEEDED · {displayName.length}/32</span><input required minLength={1} maxLength={32} value={displayName} onChange={event=>setDisplayName(event.target.value)} placeholder="Enter a nickname" autoComplete="nickname" /></label>
      <legend>Choose one option</legend>
      {options.map(option => <label className={selected === option.option_id ? "poll-choice is-selected" : "poll-choice"} key={option.option_id}>
        <input type="radio" name={"poll-" + pollId} value={option.option_id} checked={selected === option.option_id} onChange={event => setSelected(event.target.value)} />
        <span>{option.option_label}</span><i aria-hidden="true">{selected === option.option_id ? "✓" : "+"}</i>
      </label>)}
      <button className="button button-primary poll-submit" type="submit" disabled={!selected || !token || !displayName.trim() || displayName.trim().length > 32 || submitting}>{submitting ? "Recording vote…" : "Submit vote"} <span>↗</span></button>
    </fieldset>
    <p className="poll-vote-status" role="status" aria-live="polite">{status || "Enter a nickname only; no account is required. One vote per browser token, not identity verification."}</p>
  </form>;
}

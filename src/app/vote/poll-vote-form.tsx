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
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    try { setToken(getBrowserVoteToken()); }
    catch { setStatus("Your browser could not create a secure local vote token. Check privacy/storage settings."); }
  }, []);

  async function submitVote() {
    if (!selected || !token || submitting) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus("Voting is unavailable because the database connection is not configured.");
      return;
    }
    setSubmitting(true);
    setStatus("Recording your vote securely…");
    const { data, error } = await supabase.rpc("cast_public_poll_vote", {
      p_poll_id: pollId,
      p_option_id: selected,
      p_voter_token: token
    });
    if (error) {
      setStatus("We couldn't record your vote. Please try again later.");
      setSubmitting(false);
      return;
    }
    const result = (Array.isArray(data) ? data[0] : null) as VoteResult | null;
    if (result?.accepted) {
      setStatus("Your vote has been recorded. Thanks for helping choose what comes next!");
      setSubmitting(false);
      router.refresh();
      return;
    }
    const messages: Record<string, string> = {
      already_voted: "A vote from this browser has already been recorded for this poll.",
      poll_closed: "This poll is not currently open for voting.",
      polls_unavailable: "Voting is temporarily disabled by the creator."
    };
    setStatus(messages[result?.result_code ?? ""] ?? "The vote was not accepted. Please refresh and try again.");
    setSubmitting(false);
  }

  return <form className="poll-vote-form" onSubmit={event => { event.preventDefault(); void submitVote(); }}>
    <fieldset disabled={!token || submitting || options.length === 0}>
      <legend>Choose one option</legend>
      {options.map(option => <label className={selected === option.option_id ? "poll-choice is-selected" : "poll-choice"} key={option.option_id}>
        <input type="radio" name={"poll-" + pollId} value={option.option_id} checked={selected === option.option_id} onChange={event => setSelected(event.target.value)} />
        <span>{option.option_label}</span><i aria-hidden="true">{selected === option.option_id ? "✓" : "+"}</i>
      </label>)}
      <button className="button button-primary poll-submit" type="submit" disabled={!selected || !token || submitting}>{submitting ? "Recording vote…" : "Submit vote"} <span>↗</span></button>
    </fieldset>
    <p className="poll-vote-status" role="status" aria-live="polite">{status || "One vote per browser token for this poll. This is not identity verification."}</p>
  </form>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import styles from "./raye2.module.css";

type PollOption = { id: string; label: string; position: number; votes: number };
type Poll = {
  message_id: string;
  question: string;
  allow_multiple: boolean;
  closed: boolean;
  created_by: string;
  total_votes: number;
  my_votes: string[];
  options: PollOption[];
};

type Props = {
  supabase: SupabaseClient;
  messageId: string;
  locale: "en" | "ar";
  canClose: boolean;
};

export default function Raye2MessagePoll({ supabase, messageId, locale, canClose }: Props) {
  const isAr = locale === "ar";
  const [poll, setPoll] = useState<Poll | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    const { data, error: loadError } = await supabase.rpc("raye2_get_message_poll", { p_message_id: messageId });
    if (loadError) { setError(isAr ? "تعذر تحميل الاستطلاع." : "Couldn't load the poll."); return; }
    setPoll(data as Poll);
  }, [supabase, messageId, isAr]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    const channel = supabase.channel("raye2:poll:" + messageId)
      .on("postgres_changes", { event: "*", schema: "public", table: "raye2_message_poll_votes", filter: "message_id=eq." + messageId }, () => { void load(); })
      .on("postgres_changes", { event: "*", schema: "public", table: "raye2_message_polls", filter: "message_id=eq." + messageId }, () => { void load(); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, messageId, load]);

  async function toggleVote(optionId: string) {
    if (!poll || busy || poll.closed) return;
    const selected = new Set(poll.my_votes);
    if (poll.allow_multiple) {
      if (selected.has(optionId)) selected.delete(optionId); else selected.add(optionId);
    } else {
      selected.clear(); selected.add(optionId);
    }
    if (selected.size === 0) return;
    setBusy(true); setError("");
    try {
      const { error: voteError } = await supabase.rpc("raye2_vote_message_poll", { p_message_id: messageId, p_option_ids: [...selected] });
      if (voteError) throw voteError;
      await load();
    } catch { setError(isAr ? "تعذر تسجيل التصويت." : "Couldn't record your vote."); }
    finally { setBusy(false); }
  }

  async function closePoll() {
    if (!poll || busy || poll.closed) return;
    setBusy(true); setError("");
    try {
      const { error: closeError } = await supabase.rpc("raye2_close_message_poll", { p_message_id: messageId });
      if (closeError) throw closeError;
      await load();
    } catch { setError(isAr ? "تعذر إغلاق الاستطلاع." : "Couldn't close the poll."); }
    finally { setBusy(false); }
  }

  if (error && !poll) return <p className={styles.emptySmall}>{error}</p>;
  if (!poll) return <p className={styles.emptySmall}>{isAr ? "جارٍ تحميل الاستطلاع…" : "Loading poll…"}</p>;

  return (
    <div className={styles.poll}>
      <div className={styles.pollHead}>
        <b>{poll.question}</b>
        <span>{poll.allow_multiple ? (isAr ? "اختيار متعدد" : "Multiple choice") : (isAr ? "اختيار واحد" : "Single choice")}{poll.closed ? (isAr ? " · مغلق" : " · Closed") : ""}</span>
      </div>
      <ul className={styles.pollOptions}>
        {poll.options.map(option => {
          const share = poll.total_votes ? Math.round((option.votes / poll.total_votes) * 100) : 0;
          const mine = poll.my_votes.includes(option.id);
          return (
            <li key={option.id}>
              <button type="button" className={mine ? styles.pollOptionMine : ""} disabled={busy || poll.closed} onClick={() => void toggleVote(option.id)}>
                <span className={styles.pollBar} style={{ width: share + "%" }} aria-hidden />
                <span className={styles.pollLabel}>{mine ? "✓ " : ""}{option.label}</span>
                <small>{option.votes} · {share}%</small>
              </button>
            </li>
          );
        })}
      </ul>
      <div className={styles.pollFoot}>
        <span>{poll.total_votes} {isAr ? "صوت" : poll.total_votes === 1 ? "vote" : "votes"}</span>
        {canClose && !poll.closed && <button type="button" disabled={busy} onClick={() => void closePoll()}>{isAr ? "إغلاق الاستطلاع" : "Close poll"}</button>}
      </div>
      {error && <p className={styles.emptySmall}>{error}</p>}
    </div>
  );
}

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

export default function PollVoteForm({ pollId, options, locale="en" }: { pollId: string; options: Option[]; locale?:"en"|"ar" }) {
  const isArabic=locale==="ar";
  const t=isArabic?{tokenError:"تعذر إنشاء رمز تصويت محلي آمن. تحقق من إعدادات الخصوصية والتخزين.",unavailable:"التصويت غير متاح لأن اتصال قاعدة البيانات غير مُعد.",recording:"جارٍ تسجيل صوتك بأمان…",confirm:"تعذر تأكيد صوتك. حدّث الصفحة قبل إعادة المحاولة للتحقق من تسجيله.",success:"تم تسجيل صوتك. شكرًا لمساعدتك في اختيار القادم!",already:"تم تسجيل صوت من هذا المتصفح لهذا التصويت بالفعل.",closed:"هذا التصويت غير مفتوح حاليًا.",disabled:"التصويت متوقف مؤقتًا من المبدع.",notAccepted:"لم يتم قبول الصوت. حدّث الصفحة وحاول مرة أخرى.",connection:"انقطع الاتصال قبل تأكيد صوتك. حدّث الصفحة قبل إعادة المحاولة لتجنب تكرار المحاولة.",choose:"اختر إجابة واحدة",nickname:"اسمك المستعار",noAccount:"لا تحتاج إلى حساب",placeholder:"استخدم اسمًا مستعارًا دون بيانات شخصية",submit:"أرسل صوتك",sending:"جارٍ تسجيل الصوت…",privacy:"اكتب اسمًا مستعارًا فقط؛ لا يلزم إنشاء حساب. صوت واحد لكل رمز متصفح، وليس تحققًا من الهوية."}:{tokenError:"Your browser could not create a secure local vote token. Check privacy/storage settings.",unavailable:"Voting is unavailable because the database connection is not configured.",recording:"Recording your vote securely…",confirm:"We couldn't confirm your vote. Refresh the page before retrying to check whether it was recorded.",success:"Your vote has been recorded. Thanks for helping choose what comes next!",already:"A vote from this browser has already been recorded for this poll.",closed:"This poll is not currently open for voting.",disabled:"Voting is temporarily disabled by the creator.",notAccepted:"The vote was not accepted. Please refresh and try again.",connection:"The connection failed before we could confirm your vote. Refresh the page before retrying to avoid a duplicate attempt.",choose:"Choose one option",nickname:"Your nickname",noAccount:"NO ACCOUNT NEEDED",placeholder:"Use a nickname, not personal details",submit:"Submit vote",sending:"Recording vote…",privacy:"Enter a nickname only; no account is required. One vote per browser token, not identity verification."};
  const router = useRouter();
  const [selected, setSelected] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [token, setToken] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [status, setStatus] = useState("");
  useEffect(() => {
    try { setToken(getBrowserVoteToken()); }
    catch { setStatus(t.tokenError); }
  }, []);

  async function submitVote() {
    if (!selected || !token || !displayName.trim() || displayName.trim().length > 32 || submitting) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setStatus(t.unavailable);
      return;
    }
    setSubmitting(true);
    setStatus(t.recording);
    try {
      const { data, error } = await supabase.rpc("cast_public_poll_vote", {
        p_poll_id: pollId,
        p_option_id: selected,
        p_display_name: displayName.trim(),
        p_voter_token: token
      });
      if (error) {
        setStatus(t.confirm);
        return;
      }
      const result = (Array.isArray(data) ? data[0] : null) as VoteResult | null;
      if (result?.accepted) {
        setStatus(t.success);
        router.refresh();
        return;
      }
      const messages: Record<string, string> = {
        already_voted: t.already,
        poll_closed: t.closed,
        polls_unavailable: t.disabled
      };
      setStatus(messages[result?.result_code ?? ""] ?? t.notAccepted);
    } catch {
      setStatus(t.connection);
    } finally {
      setSubmitting(false);
    }
  }

  return <form dir={isArabic?"rtl":"ltr"} lang={locale} className="poll-vote-form" onSubmit={event => { event.preventDefault(); void submitVote(); }}>
    <fieldset disabled={!token || submitting || options.length === 0}>
      <legend>{t.choose}</legend>
      <label className="poll-voter-name">{t.nickname} <span>{t.noAccount} · {displayName.length}/32</span><input required minLength={1} maxLength={32} value={displayName} onChange={event=>setDisplayName(event.target.value)} placeholder={t.placeholder} autoComplete="nickname" /></label>
      {options.map(option => <label className={selected === option.option_id ? "poll-choice is-selected" : "poll-choice"} key={option.option_id}>
        <input type="radio" name={"poll-" + pollId} value={option.option_id} checked={selected === option.option_id} onChange={event => setSelected(event.target.value)} />
        <span>{option.option_label}</span><i aria-hidden="true">{selected === option.option_id ? "✓" : "+"}</i>
      </label>)}
      <button className="button button-primary poll-submit" type="submit" disabled={!selected || !token || !displayName.trim() || displayName.trim().length > 32 || submitting}>{submitting ? t.sending : t.submit} <span>↗</span></button>
    </fieldset>
    <p className="poll-vote-status" role="status" aria-live="polite">{status || t.privacy}</p>
  </form>;
}

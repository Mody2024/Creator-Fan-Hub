"use client";

import { useEffect, useMemo, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type ShareableConversation = { conversation_id: string; conversation_type: string; title: string; member_count: number };

export default function ClipDetailClient({ clipId, clipperId, sourceOwnerId, locale }: { clipId: string; clipperId: string; sourceOwnerId: string | null; locale: "en" | "ar" }) {
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const isAr = locale === "ar";
  const [userId, setUserId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [conversations, setConversations] = useState<ShareableConversation[]>([]);
  const [shareOpen, setShareOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const t = isAr
    ? { copy: "نسخ الرابط", copied: "تم نسخ رابط المقطع.", copyFail: "تعذر نسخ الرابط.", share: "شارك في محادثة", noChats: "لا توجد محادثات متاحة.", shared: "تمت المشاركة في المحادثة.", shareFail: "تعذرت المشاركة.", report: "إبلاغ", reportReason: "سبب الإبلاغ", reported: "تم إرسال الإبلاغ للمراجعة.", reportFail: "تعذر إرسال الإبلاغ.", copyright: "حقوق النشر", spam: "محتوى مزعج", harassment: "مضايقة", other: "أخرى", remove: "إزالة المقطع", removeConfirm: "إزالة هذا المقطع؟", removed: "تمت إزالة المقطع.", removeFail: "تعذر إزالة المقطع." }
    : { copy: "Copy link", copied: "Clip link copied.", copyFail: "Could not copy the link.", share: "Share to chat", noChats: "No conversations available.", shared: "Shared to the conversation.", shareFail: "Could not share the clip.", report: "Report", reportReason: "Report reason", reported: "Report submitted for review.", reportFail: "Could not submit the report.", copyright: "Copyright", spam: "Spam", harassment: "Harassment", other: "Other", remove: "Remove clip", removeConfirm: "Remove this clip?", removed: "Clip removed.", removeFail: "Could not remove the clip." };

  useEffect(() => {
    let alive = true;
    void supabase?.auth.getUser().then(({ data }: { data: { user: { id: string } | null } }) => { if (alive) setUserId(data.user?.id ?? null); });
    return () => { alive = false; };
  }, [supabase]);

  const copyLink = async () => {
    try {
      await navigator.clipboard?.writeText(window.location.href);
      setStatus(t.copied);
    } catch {
      setStatus(t.copyFail);
    }
  };

  const openShare = async () => {
    if (!supabase) return;
    setShareOpen(true);
    const { data } = await supabase.rpc("raye2_list_shareable_conversations", { p_limit: 40 });
    setConversations((data ?? []) as ShareableConversation[]);
  };

  const shareTo = async (conversationId: string) => {
    if (!supabase || busy) return;
    setBusy(true);
    const { error } = await supabase.rpc("raye2_share_clip_to_chat", { p_conversation_id: conversationId, p_clip_id: clipId });
    setBusy(false);
    setStatus(error ? t.shareFail : t.shared);
    if (!error) setShareOpen(false);
  };

  const report = async (reason: string) => {
    if (!supabase) return;
    const { error } = await supabase.rpc("raye2_report_community_content", { p_target_type: "community_clip", p_target_id: clipId, p_reason: reason, p_details: "" });
    setStatus(error ? t.reportFail : t.reported);
  };

  const remove = async () => {
    if (!supabase || busy || !window.confirm(t.removeConfirm)) return;
    setBusy(true);
    const { error } = await supabase.rpc("raye2_remove_community_clip", { p_clip_id: clipId, p_reason: "owner removed" });
    setBusy(false);
    setStatus(error ? t.removeFail : t.removed);
  };

  const canRemove = !!userId && (userId === clipperId || userId === sourceOwnerId);
  return (
    <div className="raye2-clip-detail-actions">
      <button type="button" onClick={() => void copyLink()}>{t.copy}</button>
      {userId && <button type="button" onClick={() => void openShare()}>{t.share}</button>}
      {userId && <details className="raye2-clip-report"><summary>{t.report}</summary><div role="group" aria-label={t.reportReason}><button type="button" onClick={() => void report("copyright")}>{t.copyright}</button><button type="button" onClick={() => void report("spam")}>{t.spam}</button><button type="button" onClick={() => void report("harassment")}>{t.harassment}</button><button type="button" onClick={() => void report("other")}>{t.other}</button></div></details>}
      {canRemove && <button type="button" disabled={busy} onClick={() => void remove()}>{t.remove}</button>}
      {shareOpen && <div className="raye2-clip-share" role="group" aria-label={t.share}>
        {conversations.length === 0 ? <small>{t.noChats}</small> : conversations.map(item => (
          <button type="button" key={item.conversation_id} disabled={busy} onClick={() => void shareTo(item.conversation_id)}>
            {item.title || (item.conversation_type === "group" ? (isAr ? "مجموعة" : "Group") : (isAr ? "محادثة" : "Chat"))} · {item.member_count}
          </button>
        ))}
      </div>}
      {status && <small role="status" className="raye2-muted">{status}</small>}
    </div>
  );
}

"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./raye2.module.css";

type Profile = { user_id: string; handle: string | null; display_name: string | null; avatar_url?: string | null };
type Group = { id: string; name: string; slug: string; description: string; visibility: "public" | "private"; status: string; conversation_id: string | null; owner_id: string };
type Conversation = { id: string; conversation_type: "direct" | "group"; group_id: string | null; status: string; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; parent_message_id: string | null; edited_at: string | null; created_at: string };
type Thread = { id: string; kind: "direct" | "group"; title: string; subtitle: string; conversationId: string; groupId: string | null; avatar: string; updatedAt: string; lastMessage: string; unread: number; canSend: boolean };
type SavedItem = { id: string; message_id: string | null; saved_content: { body?: string; sender_id?: string; created_at?: string }; created_at: string };
type Locale = "en" | "ar";

const stamp = (value: string, locale: Locale) => new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en", { hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const relative = (value: string, locale: Locale) => {
  const diff = Math.max(0, Date.now() - new Date(value).getTime());
  if (diff < 60_000) return locale === "ar" ? "الآن" : "now";
  if (diff < 3_600_000) return locale === "ar" ? `منذ ${Math.floor(diff / 60_000)} د` : `${Math.floor(diff / 60_000)}m`;
  if (diff < 86_400_000) return locale === "ar" ? `منذ ${Math.floor(diff / 3_600_000)} س` : `${Math.floor(diff / 3_600_000)}h`;
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en", { month: "short", day: "numeric" }).format(new Date(value));
};
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]?.toUpperCase() ?? "").join("") || "R";

export default function Raye2Client() {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [locale, setLocale] = useState<Locale>("en");
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [discoverGroups, setDiscoverGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"chats" | "groups" | "discover" | "saved">("chats");
  const [query, setQuery] = useState("");
  const [compose, setCompose] = useState("");
  const [personQuery, setPersonQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupVisibility, setGroupVisibility] = useState<"public" | "private">("private");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactionCounts, setReactionCounts] = useState<Record<string, Record<string, number>>>({});
  const [myReactions, setMyReactions] = useState<Record<string, string[]>>({});
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");

  const isAr = locale === "ar";
  const t = isAr ? {
    eyebrow:"مساحات RAYE2", title:"تواصل أقرب.", intro:"رسائلك ومجموعاتك ومجتمعاتك في مساحة واحدة.", chats:"المحادثات", groups:"مجموعاتي", discover:"اكتشف", saved:"المحفوظات", search:"ابحث في المحادثات…", newMessage:"رسالة جديدة", newGroup:"مجموعة جديدة", groupName:"اسم المجموعة", groupDesc:"وصف مختصر (اختياري)", public:"عامة", private:"خاصة", create:"إنشاء المجموعة", cancel:"إلغاء", send:"إرسال", message:"اكتب رسالة…", emptyTitle:"اختر محادثة للبدء", emptyText:"ابدأ محادثة خاصة أو انضم إلى مجموعة.", noThreads:"لا توجد محادثات بعد", noGroups:"لم تنضم إلى مجموعات بعد", findPeople:"ابحث بالاسم أو اسم المستخدم", people:"الأعضاء", startChat:"ابدأ محادثة", join:"انضم", joined:"عضو بالفعل", publicGroups:"مجموعات عامة", noResults:"لا توجد نتائج مطابقة.", signIn:"سجّل الدخول لاستخدام Raye2", signInText:"المحادثات والمجموعات مرتبطة بحسابك وتحميها صلاحيات الوصول.", home:"الرئيسية", loading:"جارٍ التحميل…", failed:"تعذر تحميل البيانات. تحقق من اتصالك ثم أعد المحاولة.", sendError:"تعذر إرسال الرسالة.", createError:"تعذر إنشاء المجموعة. تأكد من الاسم وحاول مجددًا.", searchError:"تعذر إكمال البحث.", savedEmpty:"لا توجد رسائل محفوظة بعد.", save:"حفظ", unsave:"إزالة الحفظ", reply:"رد", edit:"تعديل", delete:"حذف", edited:"معدّلة", react:"تفاعل", privateLabel:"خاصة", publicLabel:"عامة", members:"الأعضاء", noMessages:"ابدأ المحادثة برسالة بسيطة.", back:"رجوع", groupReady:"تم إنشاء المجموعة.", chatReady:"تم فتح المحادثة.", profile:"الملف الشخصي", signOut:"تسجيل الخروج", inviteOnly:"دعوة فقط", rooms:"المساحات", safety:"تظل المجموعات الخاصة مخفية عن غير أعضائها.", loadingChat:"تحميل المحادثة…"
  } : {
    eyebrow:"RAYE2 / YOUR SPACES", title:"Closer conversations.", intro:"Your messages, groups and communities — connected in one place.", chats:"Chats", groups:"My groups", discover:"Discover", saved:"Saved", search:"Search conversations…", newMessage:"New message", newGroup:"New group", groupName:"Group name", groupDesc:"A short description (optional)", public:"Public", private:"Private", create:"Create group", cancel:"Cancel", send:"Send", message:"Write a message…", emptyTitle:"Choose a conversation", emptyText:"Start a private chat or join a community group.", noThreads:"No conversations yet", noGroups:"You haven't joined any groups yet", findPeople:"Search by name or handle", people:"People", startChat:"Message", join:"Join group", joined:"Joined", publicGroups:"Public groups", noResults:"No matching results.", signIn:"Sign in to use Raye2", signInText:"Your conversations and groups are connected to your account and protected by access controls.", home:"Home", loading:"Loading…", failed:"Couldn't load your spaces. Check your connection and try again.", sendError:"Message couldn't be sent.", createError:"Couldn't create the group. Check the name and try again.", searchError:"Search couldn't be completed.", savedEmpty:"No saved messages yet.", save:"Save", unsave:"Unsave", reply:"Reply", edit:"Edit", delete:"Delete", edited:"edited", react:"React", privateLabel:"Private", publicLabel:"Public", members:"members", noMessages:"Start the conversation with a message.", back:"Back", groupReady:"Your group is ready.", chatReady:"Conversation opened.", profile:"Profile", signOut:"Sign out", inviteOnly:"Invite only", rooms:"Spaces", safety:"Private groups stay hidden from people who aren't members.", loadingChat:"Loading conversation…"
  };

  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);
    if (match) setLocale(match[1] as Locale);
  }, []);

  const loadData = useCallback(async (uid: string) => {
    if (!supabase) return;
    const [{ data: ownProfile }, { data: memberships }, { data: memberConversations }, { data: publicGroups }] = await Promise.all([
      supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").eq("user_id", uid).maybeSingle(),
      supabase.from("raye2_group_members").select("group_id").eq("user_id", uid).eq("status", "active"),
      supabase.from("raye2_conversation_members").select("conversation_id,last_read_at,conversations:raye2_conversations!inner(id,conversation_type,group_id,status,created_at)").eq("user_id", uid),
      supabase.from("raye2_groups").select("id,name,slug,description,visibility,status,conversation_id,owner_id").eq("visibility", "public").in("status", ["active", "read_only"]).order("created_at", { ascending: false }).limit(40)
    ]);
    if (ownProfile) setProfile(ownProfile as Profile);
    const groupIds = (memberships ?? []).map((row: { group_id: string }) => row.group_id);
    const [{ data: ownGroups }, { data: conversations }] = await Promise.all([
      groupIds.length ? supabase.from("raye2_groups").select("id,name,slug,description,visibility,status,conversation_id,owner_id").in("id", groupIds) : Promise.resolve({ data: [] }),
      Promise.resolve({ data: (memberConversations ?? []).map((row: any) => ({ ...row.conversations, last_read_at: row.last_read_at })).filter((row: any) => row?.status === "active") })
    ]);
    const conversationRows = (conversations ?? []) as Array<Conversation & { last_read_at: string | null }>;
    const groupRows = (ownGroups ?? []) as Group[];
    setGroups(groupRows);
    setDiscoverGroups((publicGroups ?? []) as Group[]);
    const groupMap = new Map(groupRows.map(group => [group.id, group]));
    const conversationIds = conversationRows.map(row => row.id);
    const [{ data: roster }, { data: messageRows }] = await Promise.all([
      conversationIds.length ? supabase.from("raye2_conversation_members").select("conversation_id,user_id").in("conversation_id", conversationIds) : Promise.resolve({ data: [] }),
      conversationIds.length ? supabase.from("raye2_messages").select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(600) : Promise.resolve({ data: [] })
    ]);
    const rosterRows = (roster ?? []) as Array<{ conversation_id: string; user_id: string }>;
    const profileIds = [...new Set(rosterRows.map(row => row.user_id).concat((messageRows ?? []).map((row: Message) => row.sender_id)))].filter(id => id !== uid);
    const { data: otherProfiles } = profileIds.length
      ? await supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").in("user_id", profileIds)
      : { data: [] };
    const profileMap: Record<string, Profile> = { [uid]: (ownProfile as Profile) ?? { user_id: uid, handle: "you", display_name: "You" } };
    for (const item of (otherProfiles ?? []) as Profile[]) profileMap[item.user_id] = item;
    setProfiles(profileMap);
    const allMessages = ((messageRows ?? []) as Message[]).reverse();
    setMessages(allMessages);
    const nextThreads: Thread[] = conversationRows.map(conversation => {
      const group = conversation.group_id ? groupMap.get(conversation.group_id) : undefined;
      const otherId = rosterRows.find(row => row.conversation_id === conversation.id && row.user_id !== uid)?.user_id;
      const other = otherId ? profileMap[otherId] : undefined;
      const last = allMessages.filter(message => message.conversation_id === conversation.id).at(-1);
      const title = conversation.conversation_type === "group" ? (group?.name ?? (isAr ? "مجموعة" : "Group")) : (other?.display_name ?? other?.handle ?? (isAr ? "عضو" : "Member"));
      const unread = allMessages.filter(message => message.conversation_id === conversation.id && message.sender_id !== uid && (!conversation.last_read_at || new Date(message.created_at) > new Date(conversation.last_read_at))).length;
      return { id: conversation.id, kind: conversation.conversation_type, title, subtitle: conversation.conversation_type === "group" ? (group?.visibility === "public" ? t.publicLabel : t.privateLabel) : (other?.handle ? "@" + other.handle : t.chats), conversationId: conversation.id, groupId: conversation.group_id, avatar: initials(title), updatedAt: last?.created_at ?? conversation.created_at, lastMessage: last?.body ?? "", unread, canSend: conversation.conversation_type === "direct" || group?.status === "active" };
    }).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setThreads(nextThreads);
    setSavedIds([]);
    const { data: saved } = await supabase.from("raye2_message_bookmarks").select("id,message_id,saved_content,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(100);
    setSavedItems((saved ?? []) as SavedItem[]);
    setSavedIds((saved ?? []).map((item: any) => item.message_id).filter(Boolean));
    const messageIds = allMessages.map(message => message.id);
    if (messageIds.length) {
      const [{ data: reactions }, { data: mine }] = await Promise.all([
        supabase.from("raye2_message_reactions").select("message_id,reaction_key").in("message_id", messageIds),
        supabase.from("raye2_message_reactions").select("message_id,reaction_key").eq("user_id", uid).in("message_id", messageIds)
      ]);
      const counts: Record<string, Record<string, number>> = {};
      for (const reaction of reactions ?? []) counts[reaction.message_id] = { ...(counts[reaction.message_id] ?? {}), [reaction.reaction_key]: (counts[reaction.message_id]?.[reaction.reaction_key] ?? 0) + 1 };
      const mineMap: Record<string, string[]> = {};
      for (const reaction of mine ?? []) mineMap[reaction.message_id] = [...(mineMap[reaction.message_id] ?? []), reaction.reaction_key];
      setReactionCounts(counts); setMyReactions(mineMap);
    } else { setReactionCounts({}); setMyReactions({}); }
  }, [supabase, isAr, t.chats, t.publicLabel, t.privateLabel]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getUser().then(async ({ data, error }) => {
      if (!alive) return;
      if (error || !data.user) { setUserId(null); return; }
      setUserId(data.user.id);
      try { await loadData(data.user.id); } catch { setStatus(t.failed); }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!alive) return;
      if (!session?.user) { setUserId(null); setProfile(null); setThreads([]); }
      else { setUserId(session.user.id); void loadData(session.user.id).catch(() => setStatus(t.failed)); }
    });
    return () => { alive = false; authListener.subscription.unsubscribe(); };
  }, [supabase, loadData, t.failed]);

  useEffect(() => {
    if (!supabase || !userId) return;
    const channel = supabase.channel("raye2-live-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "raye2_messages" }, () => { void loadData(userId); })
      .on("postgres_changes", { event: "*", schema: "public", table: "raye2_group_members" }, () => { void loadData(userId); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, userId, loadData]);

  const selected = threads.find(thread => thread.id === selectedId) ?? null;
  const visibleThreads = threads.filter(thread => (tab === "groups" ? thread.kind === "group" : thread.kind === "direct") && (thread.title + " " + thread.lastMessage).toLowerCase().includes(query.toLowerCase()));
  const currentMessages = messages.filter(message => selected && message.conversation_id === selected.conversationId);
  const savedMessages = savedItems.map(item => {
    const original = item.message_id ? messages.find(message => message.id === item.message_id) : null;
    return { id: item.id, messageId: item.message_id, body: original?.body ?? item.saved_content?.body ?? "", senderId: original?.sender_id ?? item.saved_content?.sender_id ?? "", originalConversationId: original?.conversation_id ?? null };
  });

  async function openDirect(target: Profile) {
    if (!supabase || !userId || busy) return;
    setBusy(true); setStatus("");
    try {
      const { data, error } = await supabase.rpc("raye2_create_direct_conversation", { p_other_user: target.user_id });
      if (error) throw error;
      await loadData(userId);
      setSelectedId(data as string); setTab("chats"); setMobilePane("chat"); setStatus(t.chatReady);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function searchPeople() {
    if (!supabase || !personQuery.trim()) { setPeople([]); return; }
    setBusy(true);
    try {
      const clean = personQuery.trim().replace(/^@/, "").replace(/[^a-zA-Z0-9_. -]/g, "").slice(0, 60);
      if (!clean) { setPeople([]); return; }
      const { data, error } = await supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").eq("visibility", "public").or(`handle.ilike.%${clean}%,display_name.ilike.%${clean}%`).neq("user_id", userId ?? "").limit(12);
      if (error) throw error;
      setPeople((data ?? []) as Profile[]);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function createGroup() {
    if (!supabase || !userId || busy) return;
    setBusy(true); setStatus("");
    const slug = groupName.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
    if (groupName.trim().length < 2 || slug.length < 2) { setStatus(t.createError); setBusy(false); return; }
    try {
      const { data, error } = await supabase.rpc("raye2_create_group", { p_name: groupName.trim(), p_slug: slug + "-" + crypto.randomUUID().slice(0, 8), p_visibility: groupVisibility, p_description: groupDescription.trim() });
      if (error) throw error;
      await loadData(userId);
      const created = (await supabase.from("raye2_groups").select("conversation_id").eq("id", data).single()).data;
      setShowCreateGroup(false); setGroupName(""); setGroupDescription(""); setSelectedId(created?.conversation_id ?? null); setTab("groups"); setMobilePane("chat"); setStatus(t.groupReady);
    } catch { setStatus(t.createError); }
    finally { setBusy(false); }
  }

  async function joinGroup(group: Group) {
    if (!supabase || !userId || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_join_public_group", { p_group_id: group.id });
      if (error) throw error;
      await loadData(userId);
      if (group.conversation_id) { setSelectedId(group.conversation_id); setMobilePane("chat"); }
      setStatus(t.joined);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function sendMessage() {
    if (!supabase || !userId || !selected || !compose.trim() || busy) return;
    const body = compose.trim();
    if (body.length > 5000) { setStatus(isAr ? "الحد الأقصى للرسالة 5000 حرف." : "Messages are limited to 5,000 characters."); return; }
    setBusy(true); setStatus("");
    const tempId = "local-" + Date.now();
    const optimistic: Message = { id: tempId, conversation_id: selected.conversationId, sender_id: userId, body, parent_message_id: replyTo?.id ?? null, edited_at: null, created_at: new Date().toISOString() };
    setMessages(current => [...current, optimistic]); setCompose(""); setReplyTo(null);
    try {
      const { data, error } = await supabase.from("raye2_messages").insert({ conversation_id: selected.conversationId, sender_id: userId, body, parent_message_id: optimistic.parent_message_id }).select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at").single();
      if (error) throw error;
      setMessages(current => [...current.filter(message => message.id !== tempId), data as Message]);
      setThreads(current => current.map(thread => thread.id === selected.id ? { ...thread, lastMessage: body, updatedAt: (data as Message).created_at } : thread).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch {
      setMessages(current => current.filter(message => message.id !== tempId)); setCompose(body); setStatus(t.sendError);
    } finally { setBusy(false); }
  }

  async function toggleReaction(message: Message, key: string) {
    if (!supabase || !userId) return;
    const mine = myReactions[message.id] ?? [];
    const exists = mine.includes(key);
    const next = exists ? mine.filter(value => value !== key) : [...mine, key];
    setMyReactions(current => ({ ...current, [message.id]: next }));
    setReactionCounts(current => ({ ...current, [message.id]: { ...(current[message.id] ?? {}), [key]: Math.max(0, (current[message.id]?.[key] ?? 0) + (exists ? -1 : 1)) } }));
    const result = exists
      ? await supabase.from("raye2_message_reactions").delete().eq("message_id", message.id).eq("user_id", userId).eq("reaction_key", key)
      : await supabase.from("raye2_message_reactions").insert({ message_id: message.id, user_id: userId, reaction_key: key });
    if (result.error) { setMyReactions(current => ({ ...current, [message.id]: mine })); void loadData(userId); }
  }

  async function toggleBookmark(message: Message) {
    if (!supabase || !userId) return;
    const isSaved = savedIds.includes(message.id);
    if (isSaved) {
      const result = await supabase.from("raye2_message_bookmarks").delete().eq("message_id", message.id).eq("user_id", userId);
      if (!result.error) setSavedIds(current => current.filter(id => id !== message.id));
      else setStatus(t.searchError);
    } else {
      const result = await supabase.rpc("raye2_bookmark_message", { p_message_id: message.id });
      if (!result.error) setSavedIds(current => [...current, message.id]);
      else setStatus(t.searchError);
    }
  }

  async function editMessage(message: Message) {
    if (!supabase || !userId || message.sender_id !== userId) return;
    const next = window.prompt(isAr ? "تعديل الرسالة" : "Edit message", message.body);
    if (next === null || !next.trim() || next.trim().length > 5000) return;
    const { data, error } = await supabase.from("raye2_messages").update({ body: next.trim(), edited_at: new Date().toISOString() }).eq("id", message.id).select("id").maybeSingle();
    if (error || !data) setStatus(t.searchError);
    else setMessages(current => current.map(item => item.id === message.id ? { ...item, body: next.trim(), edited_at: new Date().toISOString() } : item));
  }

  async function deleteMessage(message: Message) {
    if (!supabase || !userId || message.sender_id !== userId || !window.confirm(isAr ? "حذف هذه الرسالة؟" : "Delete this message?")) return;
    const { error } = await supabase.from("raye2_messages").delete().eq("id", message.id);
    if (error) setStatus(t.searchError);
    else setMessages(current => current.filter(item => item.id !== message.id));
  }

  const reactionOptions = ["❤️", "👍", "😂", "✨", "🔥"];
  if (!supabase) return <main className={styles.authGate}><Link href="/" className={styles.brand}>RAYE<span>2</span></Link><h1>{t.signIn}</h1><p>{t.signInText}</p><Link className={styles.primaryButton} href="/community#join">{t.signIn}</Link></main>;
  if (!userId) return <main className={styles.authGate}><Link href="/" className={styles.brand}>RAYE<span>2</span></Link><h1>{t.signIn}</h1><p>{t.signInText}</p><Link className={styles.primaryButton} href="/community#join">{t.signIn}</Link><Link className={styles.backLink} href="/">{t.home}</Link></main>;

  return (
    <main className={styles.page} dir={isAr ? "rtl" : "ltr"} lang={locale}>
      <header className={styles.header}>
        <Link href="/" className={styles.brand}>RAYE<span>2</span></Link>
        <div className={styles.headerCenter}><span className={styles.liveDot}/><span>{t.eyebrow}</span><span className={styles.headerDivider}/><span>{profile?.display_name ?? profile?.handle ?? "Member"}</span></div>
        <div className={styles.headerActions}><Link href="/community">{t.home}</Link><Link href="/profile">{t.profile}</Link><button onClick={() => void supabase.auth.signOut().then(() => router.push("/"))}>{t.signOut}</button></div>
      </header>
      <section className={styles.intro}><div><span className={styles.kicker}>RAYE2 / COMMUNITY LAYER</span><h1>{t.title}</h1><p>{t.intro}</p></div><div className={styles.introMark}><span>R</span><i>✳</i></div></section>
      <section className={styles.workspace}>
        <aside className={`${styles.sidebar} ${mobilePane === "chat" ? styles.hideMobile : ""}`}>
          <div className={styles.sideTop}><div><span className={styles.kicker}>{t.rooms}</span><h2>{t.chats}</h2></div><button className={styles.iconButton} onClick={() => { setTab("chats"); setPersonQuery(""); setPeople([]); document.getElementById("raye2-people-search")?.focus(); }} aria-label={t.newMessage}>＋</button></div>
          <label className={styles.searchBox}><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search}/></label>
          <div className={styles.tabs}>
            <button className={tab === "chats" ? styles.activeTab : ""} onClick={() => setTab("chats")}>{t.chats}</button>
            <button className={tab === "groups" ? styles.activeTab : ""} onClick={() => setTab("groups")}>{t.groups}</button>
            <button className={tab === "discover" ? styles.activeTab : ""} onClick={() => setTab("discover")}>{t.discover}</button>
            <button className={tab === "saved" ? styles.activeTab : ""} onClick={() => setTab("saved")}>{t.saved}</button>
          </div>
          {tab === "discover" ? <div className={styles.discoverPanel}>
            <span className={styles.kicker}>{t.people}</span><div className={styles.searchRow}><input id="raye2-people-search" value={personQuery} onChange={event => setPersonQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void searchPeople(); }} placeholder={t.findPeople}/><button onClick={() => void searchPeople()}>⌕</button></div>
            {people.map(person => <article className={styles.personRow} key={person.user_id}><div className={styles.avatar}>{initials(person.display_name ?? person.handle ?? "R")}</div><div className={styles.personInfo}><b>{person.display_name ?? person.handle}</b><small>@{person.handle}</small></div><button className={styles.miniButton} onClick={() => void openDirect(person)}>{t.startChat}</button></article>)}
            <span className={styles.kicker}>{t.publicGroups}</span>
            {discoverGroups.filter(group => group.name.toLowerCase().includes(query.toLowerCase())).map(group => <article className={styles.groupRow} key={group.id}><div className={styles.avatar}>#</div><div className={styles.personInfo}><b>{group.name}</b><small>{group.description || t.publicLabel}</small></div><button className={styles.miniButton} onClick={() => void joinGroup(group)}>{groups.some(item => item.id === group.id) ? t.joined : t.join}</button></article>)}
            {!people.length && !discoverGroups.length && <p className={styles.emptySmall}>{t.noResults}</p>}
          </div> : tab === "saved" ? <div className={styles.threadList}>{savedMessages.map(message => <button className={styles.thread} key={message.id} onClick={() => { const thread = message.originalConversationId ? threads.find(item => item.conversationId === message.originalConversationId) : null; if (thread) { setSelectedId(thread.id); setTab(thread.kind === "group" ? "groups" : "chats"); setMobilePane("chat"); } }}><div className={styles.avatar}>{initials(profiles[message.senderId]?.display_name ?? "R")}</div><div className={styles.threadText}><b>{profiles[message.senderId]?.display_name ?? (isAr ? "رسالة محفوظة" : "Saved message")}</b><span>{message.body || (isAr ? "تم الاحتفاظ بالنسخة المحفوظة" : "Preserved saved copy")}</span></div></button>)}{!savedMessages.length && <p className={styles.emptySmall}>{t.savedEmpty}</p>}</div> : <div className={styles.threadList}>
            {tab === "groups" && <button className={styles.createGroupButton} onClick={() => setShowCreateGroup(true)}>＋ {t.newGroup}</button>}
            {visibleThreads.map(thread => <button key={thread.id} className={`${styles.thread} ${selectedId === thread.id ? styles.selectedThread : ""}`} onClick={() => { setSelectedId(thread.id); setMobilePane("chat"); }}>
              <div className={styles.avatar}>{thread.avatar}</div><div className={styles.threadText}><b>{thread.title}</b><span>{thread.lastMessage || thread.subtitle}</span></div><div className={styles.threadMeta}><time>{relative(thread.updatedAt, locale)}</time>{thread.unread > 0 && <i>{thread.unread}</i>}</div>
            </button>)}
            {!visibleThreads.length && <p className={styles.emptySmall}>{tab === "groups" ? t.noGroups : t.noThreads}</p>}
            <p className={styles.privacyNote}>◇ {t.safety}</p>
          </div>}
        </aside>
        <section className={`${styles.conversation} ${mobilePane === "list" ? styles.hideMobile : ""}`}>
          {selected ? <>
            <div className={styles.chatHeader}><button className={styles.backButton} onClick={() => setMobilePane("list")}>← {t.back}</button><div className={styles.avatar}>{selected.avatar}</div><div className={styles.chatHeading}><h2>{selected.title}</h2><span>{selected.subtitle}</span></div><button className={styles.iconButton} title={t.saved} onClick={() => setTab("saved")}>⌑</button></div>
            <div className={styles.messageArea}>
              {currentMessages.length === 0 && <div className={styles.emptyConversation}><div>✳</div><h3>{t.noMessages}</h3></div>}
              {currentMessages.map(message => {
                const mine = message.sender_id === userId;
                const author = profiles[message.sender_id];
                const parent = message.parent_message_id ? messages.find(item => item.id === message.parent_message_id) : null;
                return <article key={message.id} className={`${styles.messageRow} ${mine ? styles.ownMessage : ""}`}>
                  {!mine && <div className={styles.messageAvatar}>{initials(author?.display_name ?? author?.handle ?? "R")}</div>}
                  <div className={styles.messageBody}>
                    {!mine && <span className={styles.author}>{author?.display_name ?? author?.handle ?? "Member"}</span>}
                    {parent && <div className={styles.replyQuote}>{parent.body}</div>}
                    <div className={styles.bubble}>{message.body}</div>
                    <div className={styles.messageMeta}><time>{stamp(message.created_at, locale)}</time>{message.edited_at && <span>{t.edited}</span>}
                      <button onClick={() => setReplyTo(message)}>{t.reply}</button><button onClick={() => void toggleBookmark(message)}>{savedIds.includes(message.id) ? "⌑" : "＋"}</button>
                      {mine && <><button onClick={() => void editMessage(message)}>{t.edit}</button><button onClick={() => void deleteMessage(message)}>×</button></>}
                    </div>
                    <div className={styles.reactionStrip}>{reactionOptions.map((emoji, index) => { const key = ["love", "like", "laugh", "spark", "fire"][index]; const count = reactionCounts[message.id]?.[key] ?? 0; return <button key={key} className={myReactions[message.id]?.includes(key) ? styles.reacted : ""} onClick={() => void toggleReaction(message, key)}>{emoji}{count > 0 && <small>{count}</small>}</button>; })}</div>
                  </div>
                </article>;
              })}
            </div>
            <div className={styles.composerWrap}>
              {replyTo && <div className={styles.replyingTo}><span>{t.reply}: {replyTo.body.slice(0, 100)}</span><button onClick={() => setReplyTo(null)}>×</button></div>}
              <form className={styles.composer} onSubmit={event => { event.preventDefault(); void sendMessage(); }}><textarea value={compose} onChange={event => setCompose(event.target.value)} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={selected.canSend ? t.message : (isAr ? "هذه المجموعة للقراءة فقط حاليًا" : "This group is currently read-only")} disabled={!selected.canSend} maxLength={5000} rows={1}/><button type="submit" disabled={!compose.trim() || busy || !selected.canSend}>{t.send} ↗</button></form><div className={styles.composerFoot}><span>RAYE2 • PRIVATE BY DESIGN</span><span>{compose.length}/5000</span></div>
            </div>
          </> : <div className={styles.blankState}><div className={styles.blankOrbit}>R</div><span className={styles.kicker}>{t.eyebrow}</span><h2>{t.emptyTitle}</h2><p>{t.emptyText}</p><button className={styles.primaryButton} onClick={() => { setTab("discover"); setMobilePane("list"); }}>{t.discover} ↗</button></div>}
        </section>
      </section>
      {status && <div className={styles.status} role="status">{status}<button onClick={() => setStatus("")}>×</button></div>}
      {showCreateGroup && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowCreateGroup(false); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="raye2-group-title"><button className={styles.modalClose} onClick={() => setShowCreateGroup(false)}>×</button><span className={styles.kicker}>RAYE2 / GROUP SETUP</span><h2 id="raye2-group-title">{t.newGroup}</h2><label>{t.groupName}<input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80}/></label><label>{t.groupDesc}<textarea value={groupDescription} onChange={event => setGroupDescription(event.target.value)} maxLength={1000} rows={3}/></label><div className={styles.visibilityPicker}><button className={groupVisibility === "public" ? styles.visibilityActive : ""} onClick={() => setGroupVisibility("public")}>◎ {t.public}</button><button className={groupVisibility === "private" ? styles.visibilityActive : ""} onClick={() => setGroupVisibility("private")}>◇ {t.private}</button></div><p className={styles.modalHint}>{groupVisibility === "private" ? t.inviteOnly + " — " + t.safety : t.publicLabel + " — " + t.safety}</p><div className={styles.modalActions}><button onClick={() => setShowCreateGroup(false)}>{t.cancel}</button><button className={styles.primaryButton} disabled={busy || groupName.trim().length < 2} onClick={() => void createGroup()}>{t.create} ↗</button></div></section></div>}
    </main>
  );
}

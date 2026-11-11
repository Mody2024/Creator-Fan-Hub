"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./raye2.module.css";
import Raye2VoiceControls from "./raye2-voice-controls";
import Raye2GroupVoiceControls from "./raye2-group-voice-controls";
import Raye2WatchTogetherControls from "./raye2-watch-together-controls";

type Profile = { user_id: string; handle: string | null; display_name: string | null; avatar_url?: string | null };
type Group = { id: string; name: string; slug: string; description: string; visibility: "public" | "private"; status: string; conversation_id: string | null; owner_id: string; memberRole?: "owner" | "admin" | "moderator" | "member" };
type SharedMemory = { id: string; group_id: string | null; created_by: string; source_message_id: string | null; memory_type: string; title: string; caption: string; content: Record<string, unknown>; retention_mode: "temporary" | "group_lifetime" | "preserved"; expires_at: string | null; pinned: boolean; created_at: string };
type MemorySettings = { group_id: string; contribution_policy: "all_members" | "managers_only"; export_policy: "all_members" | "managers_only" | "disabled" };
type GroupMember = { group_id: string; user_id: string; role: "owner" | "admin" | "moderator" | "member"; status: string; joined_at: string; profile?: Profile };
type JoinRequest = { id: string; group_id: string; user_id: string; note: string; status: "pending" | "approved" | "declined" | "cancelled"; created_at: string; profile?: Profile };
type Conversation = { id: string; conversation_type: "direct" | "group"; group_id: string | null; status: string; created_at: string };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; parent_message_id: string | null; edited_at: string | null; created_at: string; topic_id?: string | null };
type GroupTopic = { id: string; slug: string; name: string; topic_position: number; message_count: number };
type ActiveRule = { rule_key: string; category: string; rule_value: unknown; description: string };
type Thread = { id: string; kind: "direct" | "group"; title: string; subtitle: string; conversationId: string; groupId: string | null; otherUserId: string | null; avatar: string; updatedAt: string; lastMessage: string; unread: number; canSend: boolean };
type ReportTarget = { type: "message" | "user" | "group"; id: string; conversationId?: string | null };
type SavedItem = { id: string; message_id: string | null; saved_content: { body?: string; sender_id?: string; created_at?: string }; created_at: string };
type NotificationItem = { id: string; actor_id: string | null; conversation_id: string | null; message_id: string | null; notification_type: string; preview: string; read_at: string | null; created_at: string };
type PinnedMessage = { id: string; conversation_id: string; sender_id: string; body: string; parent_message_id: string | null; edited_at: string | null; created_at: string };
type MessageRequest = { id: string; sender_id: string; recipient_id: string; initial_message: string; status: "pending" | "accepted" | "declined" | "cancelled"; created_at: string };
type NotificationPreferences = { direct_messages: boolean; group_messages: boolean; quiet_hours_enabled: boolean; quiet_hours_start: string; quiet_hours_end: string; quiet_hours_timezone: string; event_reminders: boolean };
type GroupNotificationPreference = { group_id: string; mode: "inherit" | "all" | "muted" };
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
  const pathname = usePathname();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [locale, setLocale] = useState<Locale>("en");
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [userId, setUserId] = useState<string | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [profiles, setProfiles] = useState<Record<string, Profile>>({});
  const [groups, setGroups] = useState<Group[]>([]);
  const [memories, setMemories] = useState<SharedMemory[]>([]);
  const [memorySettings, setMemorySettings] = useState<MemorySettings>({ group_id: "", contribution_policy: "all_members", export_policy: "all_members" });
  const [memorySettingsSaving, setMemorySettingsSaving] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showGroupManage, setShowGroupManage] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [bannedMembers, setBannedMembers] = useState<GroupMember[]>([]);
  const [groupManageLoading, setGroupManageLoading] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [notificationPreferences, setNotificationPreferences] = useState<NotificationPreferences>({ direct_messages: true, group_messages: true, quiet_hours_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "08:00", quiet_hours_timezone: "UTC", event_reminders: true });
  const [groupNotificationPreferences, setGroupNotificationPreferences] = useState<Record<string, GroupNotificationPreference["mode"]>>({});
  const [notificationSaving, setNotificationSaving] = useState(false);
  const [messageSearchOpen, setMessageSearchOpen] = useState(false);
  const [messageSearch, setMessageSearch] = useState("");
  const [messageSearchResults, setMessageSearchResults] = useState<PinnedMessage[]>([]);
  const [messageSearchBusy, setMessageSearchBusy] = useState(false);
  const [pinnedMessages, setPinnedMessages] = useState<PinnedMessage[]>([]);
  const [groupTopics, setGroupTopics] = useState<GroupTopic[]>([]);
  const [activeTopicId, setActiveTopicId] = useState<string | null>(null);
  const [showTopicManage, setShowTopicManage] = useState(false);
  const [newTopicName, setNewTopicName] = useState("");
  const [activeRules, setActiveRules] = useState<ActiveRule[]>([]);
  const [messageRequests, setMessageRequests] = useState<MessageRequest[]>([]);
  const [requestProfiles, setRequestProfiles] = useState<Record<string, Profile>>({});
  const [allowMessageRequests, setAllowMessageRequests] = useState(true);
  const [allowPrivateCalls, setAllowPrivateCalls] = useState(true);
  const [voicePreferenceSaving, setVoicePreferenceSaving] = useState(false);
  const [contactSaving, setContactSaving] = useState(false);
  const [reportTarget, setReportTarget] = useState<ReportTarget | null>(null);
  const [reportReason, setReportReason] = useState("harassment");
  const [reportDetails, setReportDetails] = useState("");
  const realtimeChannel = useRef<ReturnType<NonNullable<typeof supabase>["channel"]> | null>(null);
  const typingActive = useRef(false);
  const typingTimers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const [inviteHours, setInviteHours] = useState("72");
  const [inviteUses, setInviteUses] = useState("10");
  const [inviteUrl, setInviteUrl] = useState("");
  const [inviteId, setInviteId] = useState<string | null>(null);
  const [discoverGroups, setDiscoverGroups] = useState<Group[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<"chats" | "groups" | "discover" | "saved" | "memories" | "notifications">("chats");
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
    eyebrow:"مساحات RAYE2", title:"تواصل أقرب.", intro:"رسائلك ومجموعاتك ومجتمعاتك في مساحة واحدة.", chats:"المحادثات", groups:"مجموعاتي", discover:"اكتشف", saved:"المحفوظات", memories:"الذكريات المشتركة", invite:"دعوة أعضاء", createInvite:"إنشاء رابط دعوة", copyInvite:"نسخ الرابط", revokeInvite:"إلغاء الرابط", inviteExpiry:"صلاحية الرابط (ساعات)", inviteUses:"عدد مرات الاستخدام", inviteReady:"تم إنشاء رابط الدعوة.", inviteRevoked:"تم إلغاء رابط الدعوة.", saveMemory:"حفظ في الذكريات", memorySaved:"تم حفظ الذكرى للمجموعة.", search:"ابحث في المحادثات…", newMessage:"رسالة جديدة", newGroup:"مجموعة جديدة", groupName:"اسم المجموعة", groupDesc:"وصف مختصر (اختياري)", public:"عامة", private:"خاصة", create:"إنشاء المجموعة", cancel:"إلغاء", send:"إرسال", message:"اكتب رسالة…", emptyTitle:"اختر محادثة للبدء", emptyText:"ابدأ محادثة خاصة أو انضم إلى مجموعة.", noThreads:"لا توجد محادثات بعد", noGroups:"لم تنضم إلى مجموعات بعد", findPeople:"ابحث بالاسم أو اسم المستخدم", people:"الأعضاء", startChat:"ابدأ محادثة", join:"انضم", joined:"عضو بالفعل", publicGroups:"مجموعات عامة", noResults:"لا توجد نتائج مطابقة.", signIn:"سجّل الدخول لاستخدام Raye2", signInText:"المحادثات والمجموعات مرتبطة بحسابك وتحميها صلاحيات الوصول.", home:"الرئيسية", loading:"جارٍ التحميل…", failed:"تعذر تحميل البيانات. تحقق من اتصالك ثم أعد المحاولة.", sendError:"تعذر إرسال الرسالة.", createError:"تعذر إنشاء المجموعة. تأكد من الاسم وحاول مجددًا.", searchError:"تعذر إكمال البحث.", savedEmpty:"لا توجد رسائل محفوظة بعد.", save:"حفظ", unsave:"إزالة الحفظ", reply:"رد", edit:"تعديل", delete:"حذف", edited:"معدّلة", react:"تفاعل", privateLabel:"خاصة", publicLabel:"عامة", members:"الأعضاء", noMessages:"ابدأ المحادثة برسالة بسيطة.", back:"رجوع", groupReady:"تم إنشاء المجموعة.", chatReady:"تم فتح المحادثة.", profile:"الملف الشخصي", signOut:"تسجيل الخروج", inviteOnly:"دعوة فقط", rooms:"المساحات", safety:"تظل المجموعات الخاصة مخفية عن غير أعضائها.", loadingChat:"تحميل المحادثة…", manageGroup:"إدارة المجموعة", pendingRequests:"طلبات الانضمام", memberList:"الأعضاء", noRequests:"لا توجد طلبات معلقة.", noMembers:"لا يوجد أعضاء لعرضهم.", approve:"قبول", decline:"رفض", removeMember:"إزالة", roleOwner:"مالك", roleAdmin:"مشرف", roleModerator:"منسق", roleMember:"عضو", roleUpdated:"تم تحديث صلاحية العضو.", memberRemoved:"تمت إزالة العضو.",bannedMembers:"الأعضاء المحظورون", banMember:"حظر", unbanMember:"رفع الحظر", memberBanned:"تم حظر العضو.", memberUnbanned:"تم رفع الحظر.", noBans:"لا يوجد أعضاء محظورون.", requestReviewed:"تمت مراجعة الطلب.", preserveMemory:"احتفاظ دائم", preserveMemoryHint:"لن تنتهي هذه الذكرى تلقائيًا.", pinMemory:"تثبيت", unpinMemory:"إلغاء التثبيت", expirySoon:"تقترب هذه الذكرى من الانتهاء.", memoryUpdated:"تم تحديث الذكرى.", close:"إغلاق", searchMessages:"البحث في الرسائل", searchPlaceholder:"ابحث داخل هذه المحادثة…", noSearchResults:"لا توجد نتائج مطابقة.", pinnedMessages:"الرسائل المثبتة", pinMessage:"تثبيت", unpinMessage:"إلغاء التثبيت", messagePinned:"تم تثبيت الرسالة.", messageUnpinned:"تم إلغاء تثبيت الرسالة.", report:"إبلاغ", block:"حظر", reportTitle:"الإبلاغ عن محتوى أو حساب", reportReason:"سبب الإبلاغ", reportDetails:"تفاصيل إضافية (اختياري)", reportSent:"تم إرسال البلاغ للمراجعة.", blockConfirm:"هل تريد حظر هذا الحساب؟ لن يتمكن أي منكما من بدء محادثة جديدة.", blocked:"تم حظر الحساب.", reasons:{spam:"رسائل مزعجة",harassment:"مضايقة",hate:"خطاب كراهية",impersonation:"انتحال",copyright:"حقوق ملكية",other:"سبب آخر"}, notifications:"الإشعارات", messageRequests:"طلبات المراسلة", allowRequests:"السماح بطلبات مراسلة جديدة", requestPending:"بانتظار الرد", requestSent:"تم إرسال طلب المراسلة.", requestAccepted:"تم قبول الطلب وفتح المحادثة.", requestDeclined:"تم رفض طلب المراسلة.", requestUnavailable:"هذا الحساب لا يستقبل طلبات مراسلة جديدة.", acceptRequest:"قبول", declineRequest:"رفض", noMessageRequests:"لا توجد طلبات مراسلة معلقة.", contactSettings:"من يمكنه بدء محادثة معك؟", allowVoiceCalls:"السماح بالمكالمات الصوتية الخاصة", notificationSettings:"إعدادات الإشعارات", directNotifications:"رسائل خاصة", groupNotifications:"رسائل المجموعات", quietHours:"ساعات الهدوء", quietHoursEnable:"تفعيل ساعات الهدوء", quietStart:"من", quietEnd:"إلى", groupOverrides:"إعدادات إشعارات كل مجموعة", inherit:"افتراضي", allNotifications:"الكل", muted:"مكتومة", noNotifications:"لا توجد إشعارات جديدة.", markAllRead:"تحديد الكل كمقروء", notificationSaved:"تم حفظ إعدادات الإشعارات.",eventReminders:"تذكيرات الفعاليات", memoryPermissions:"صلاحيات الذكريات المشتركة", contributions:"من يمكنه إضافة الذكريات؟", exports:"من يمكنه تصدير الذكريات؟", allMembers:"كل الأعضاء", managersOnly:"المشرفون فقط", exportsDisabled:"التصدير معطّل", saveMemorySettings:"حفظ الصلاحيات", memorySettingsSaved:"تم تحديث صلاحيات الذكريات.", exportMemories:"تصدير JSON", exportNote:"يحتوي التصدير على النصوص والبيانات الوصفية فقط، ولا ينسخ ملفات الوسائط.",limitsLabel:"حدود المنصة المفعّلة",limitsHint:"تُضبط هذه الحدود من مسؤولي المنصة ويطبّقها الخادم."
  ,topics:"القنوات",topicAll:"كل الرسائل",topicGeneral:"عام",newTopic:"قناة جديدة",topicName:"اسم القناة",createTopic:"إنشاء",deleteTopic:"حذف",manageTopics:"إدارة القنوات",noTopics:"لا توجد قنوات بعد.",topicCreated:"تم إنشاء القناة.",topicDeleted:"تم حذف القناة.",topicError:"تعذر تحديث القناة.",postInTopic:"منشور في"} : {
    eyebrow:"RAYE2 / YOUR SPACES", title:"Closer conversations.", intro:"Your messages, groups and communities — connected in one place.", chats:"Chats", groups:"My groups", discover:"Discover", saved:"Saved", memories:"Shared Memories", invite:"Invite members", createInvite:"Create invite link", copyInvite:"Copy link", revokeInvite:"Revoke link", inviteExpiry:"Link expiry (hours)", inviteUses:"Maximum uses", inviteReady:"Invite link created.", inviteRevoked:"Invite link revoked.", saveMemory:"Save to Memories", memorySaved:"Saved to group memories.", search:"Search conversations…", newMessage:"New message", newGroup:"New group", groupName:"Group name", groupDesc:"A short description (optional)", public:"Public", private:"Private", create:"Create group", cancel:"Cancel", send:"Send", message:"Write a message…", emptyTitle:"Choose a conversation", emptyText:"Start a private chat or join a community group.", noThreads:"No conversations yet", noGroups:"You haven't joined any groups yet", findPeople:"Search by name or handle", people:"People", startChat:"Message", join:"Join group", joined:"Joined", publicGroups:"Public groups", noResults:"No matching results.", signIn:"Sign in to use Raye2", signInText:"Your conversations and groups are connected to your account and protected by access controls.", home:"Home", loading:"Loading…", failed:"Couldn't load your spaces. Check your connection and try again.", sendError:"Message couldn't be sent.", createError:"Couldn't create the group. Check the name and try again.", searchError:"Search couldn't be completed.", savedEmpty:"No saved messages yet.", save:"Save", unsave:"Unsave", reply:"Reply", edit:"Edit", delete:"Delete", edited:"edited", react:"React", privateLabel:"Private", publicLabel:"Public", members:"members", noMessages:"Start the conversation with a message.", back:"Back", groupReady:"Your group is ready.", chatReady:"Conversation opened.", profile:"Profile", signOut:"Sign out", inviteOnly:"Invite only", rooms:"Spaces", safety:"Private groups stay hidden from people who aren't members.", loadingChat:"Loading conversation…", manageGroup:"Manage group", pendingRequests:"Join requests", memberList:"Members", noRequests:"No pending requests.", noMembers:"No members to show.", approve:"Approve", decline:"Decline", removeMember:"Remove", roleOwner:"Owner", roleAdmin:"Admin", roleModerator:"Moderator", roleMember:"Member", roleUpdated:"Member permissions updated.", memberRemoved:"Member removed.",bannedMembers:"Banned members", banMember:"Ban", unbanMember:"Unban", memberBanned:"Member banned.", memberUnbanned:"Ban lifted.", noBans:"No banned members.", requestReviewed:"Request reviewed.", preserveMemory:"Preserve permanently", preserveMemoryHint:"This memory will not expire automatically.", pinMemory:"Pin", unpinMemory:"Unpin", expirySoon:"This memory is approaching expiry.", memoryUpdated:"Memory updated.", close:"Close", searchMessages:"Search messages", searchPlaceholder:"Search this conversation…", noSearchResults:"No matching messages.", pinnedMessages:"Pinned messages", pinMessage:"Pin", unpinMessage:"Unpin", messagePinned:"Message pinned.", messageUnpinned:"Message unpinned.", report:"Report", block:"Block", reportTitle:"Report content or account", reportReason:"Report reason", reportDetails:"Additional details (optional)", reportSent:"Your report was submitted for review.", blockConfirm:"Block this account? Neither of you will be able to start a new conversation.", blocked:"Account blocked.", reasons:{spam:"Spam",harassment:"Harassment",hate:"Hate speech",impersonation:"Impersonation",copyright:"Copyright",other:"Other"}, notifications:"Notifications", messageRequests:"Message requests", allowRequests:"Allow new message requests", requestPending:"Awaiting response", requestSent:"Message request sent.", requestAccepted:"Request accepted. Conversation opened.", requestDeclined:"Message request declined.", requestUnavailable:"This account is not accepting new message requests.", acceptRequest:"Accept", declineRequest:"Decline", noMessageRequests:"No pending message requests.", contactSettings:"Who can start a conversation with you?", allowVoiceCalls:"Allow private voice calls", notificationSettings:"Notification settings", directNotifications:"Direct messages", groupNotifications:"Group messages", quietHours:"Quiet hours", quietHoursEnable:"Enable quiet hours", quietStart:"From", quietEnd:"Until", groupOverrides:"Per-group notifications", inherit:"Default", allNotifications:"All", muted:"Muted", noNotifications:"All caught up.", markAllRead:"Mark all as read", notificationSaved:"Notification settings saved.",eventReminders:"Event reminders", memoryPermissions:"Shared Memories permissions", contributions:"Who can add memories?", exports:"Who can export memories?", allMembers:"All members", managersOnly:"Managers only", exportsDisabled:"Export disabled", saveMemorySettings:"Save permissions", memorySettingsSaved:"Memory permissions updated.", exportMemories:"Export JSON", exportNote:"Exports include text and metadata only; media files are not copied.",limitsLabel:"Active platform limits",limitsHint:"These limits are set by platform administrators and enforced by the server."
  ,topics:"Channels",topicAll:"All messages",topicGeneral:"General",newTopic:"New channel",topicName:"Channel name",createTopic:"Create",deleteTopic:"Delete",manageTopics:"Manage channels",noTopics:"No channels yet.",topicCreated:"Channel created.",topicDeleted:"Channel deleted.",topicError:"Could not update the channel.",postInTopic:"Posted in"};

  useEffect(() => {
    try {
      const savedTheme = window.localStorage.getItem("raye2-theme");
      if (savedTheme === "light" || savedTheme === "dark") setTheme(savedTheme);
    } catch { /* Keep the default theme when browser storage is unavailable. */ }
  }, []);

  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);
    if (match) setLocale(match[1] as Locale);
  }, []);

  const loadData = useCallback(async (uid: string) => {
    if (!supabase) return;
    const [{ data: ownProfile }, { data: memberships }, { data: memberConversations }, { data: publicGroups }] = await Promise.all([
      supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").eq("user_id", uid).maybeSingle(),
      supabase.from("raye2_group_members").select("group_id,role").eq("user_id", uid).eq("status", "active"),
      supabase.from("raye2_conversation_members").select("conversation_id,last_read_at,conversations:raye2_conversations!inner(id,conversation_type,group_id,status,created_at)").eq("user_id", uid),
      supabase.from("raye2_groups").select("id,name,slug,description,visibility,status,conversation_id,owner_id").eq("visibility", "public").in("status", ["active", "read_only"]).order("created_at", { ascending: false }).limit(40)
    ]);
    if (ownProfile) setProfile(ownProfile as Profile);
    const groupIds = (memberships ?? []).map((row: { group_id: string }) => row.group_id);
    const conversationRows = ((memberConversations ?? []) as Array<{
      last_read_at: string | null;
      conversations: Conversation | Conversation[] | null;
    }>).flatMap(row => {
      const conversation = Array.isArray(row.conversations) ? row.conversations[0] : row.conversations;
      return conversation?.status === "active" ? [{ ...conversation, last_read_at: row.last_read_at }] : [];
    });
    const { data: ownGroups } = groupIds.length
      ? await supabase.from("raye2_groups").select("id,name,slug,description,visibility,status,conversation_id,owner_id").in("id", groupIds)
      : { data: [] };
    const roleMap = new Map<string, NonNullable<Group["memberRole"]>>((memberships ?? []).map((row: { group_id: string; role: NonNullable<Group["memberRole"]> }) => [row.group_id, row.role]));
    const groupRows = ((ownGroups ?? []) as Group[]).map(group => ({ ...group, memberRole: roleMap.get(group.id) ?? "member" }));
    setGroups(groupRows);
    setDiscoverGroups((publicGroups ?? []) as Group[]);
    const groupMap = new Map(groupRows.map(group => [group.id, group]));
    const conversationIds = conversationRows.map(row => row.id);
    const [{ data: roster }, { data: messageRows }] = await Promise.all([
      conversationIds.length ? supabase.from("raye2_conversation_members").select("conversation_id,user_id").in("conversation_id", conversationIds) : Promise.resolve({ data: [] }),
      conversationIds.length ? supabase.from("raye2_messages").select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at,topic_id").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(600) : Promise.resolve({ data: [] })
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
      return { id: conversation.id, kind: conversation.conversation_type, title, subtitle: conversation.conversation_type === "group" ? (group?.visibility === "public" ? t.publicLabel : t.privateLabel) : (other?.handle ? "@" + other.handle : t.chats), conversationId: conversation.id, groupId: conversation.group_id, otherUserId: conversation.conversation_type === "direct" ? (otherId ?? null) : null, avatar: initials(title), updatedAt: last?.created_at ?? conversation.created_at, lastMessage: last?.body ?? "", unread, canSend: conversation.conversation_type === "direct" || group?.status === "active" };
    }).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
    setThreads(nextThreads);
    const [{ data: notificationRows }, { data: preferenceRow }, { data: groupPreferenceRows }, { data: requestRows }, { data: contactRow }, { data: voicePreferenceRow }] = await Promise.all([
      supabase.from("raye2_notifications").select("id,actor_id,conversation_id,message_id,notification_type,preview,read_at,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(80),
      supabase.from("raye2_notification_preferences").select("direct_messages,group_messages,quiet_hours_enabled,quiet_hours_start,quiet_hours_end,quiet_hours_timezone,event_reminders").eq("user_id", uid).maybeSingle(),
      groupIds.length ? supabase.from("raye2_group_notification_preferences").select("group_id,mode").in("group_id", groupIds) : Promise.resolve({ data: [] }),
      supabase.from("raye2_message_requests").select("id,sender_id,recipient_id,initial_message,status,created_at").or(`sender_id.eq.${uid},recipient_id.eq.${uid}`).eq("status", "pending").order("created_at", { ascending: false }).limit(40),
      supabase.from("raye2_contact_preferences").select("allow_message_requests").eq("user_id", uid).maybeSingle(),
      supabase.from("raye2_voice_preferences").select("allow_private_calls").eq("user_id", uid).maybeSingle()
    ]);
    setNotifications((notificationRows ?? []) as NotificationItem[]);
    setNotificationPreferences((preferenceRow as NotificationPreferences | null) ?? { direct_messages: true, group_messages: true, quiet_hours_enabled: false, quiet_hours_start: "22:00", quiet_hours_end: "08:00", quiet_hours_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC", event_reminders: true });
    setGroupNotificationPreferences(Object.fromEntries(((groupPreferenceRows ?? []) as GroupNotificationPreference[]).map(item => [item.group_id, item.mode])));
    const pendingRequests = (requestRows ?? []) as MessageRequest[];
    setMessageRequests(pendingRequests);
    setAllowMessageRequests((contactRow as { allow_message_requests: boolean } | null)?.allow_message_requests ?? true);
    setAllowPrivateCalls((voicePreferenceRow as { allow_private_calls: boolean } | null)?.allow_private_calls ?? true);
    const requestUserIds = [...new Set(pendingRequests.map(item => item.sender_id === uid ? item.recipient_id : item.sender_id))];
    const { data: requestPeople } = requestUserIds.length ? await supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").in("user_id", requestUserIds) : { data: [] };
    setRequestProfiles(Object.fromEntries(((requestPeople ?? []) as Profile[]).map(item => [item.user_id, item])));
    setSavedIds([]);
    const { data: saved } = await supabase.from("raye2_message_bookmarks").select("id,message_id,saved_content,created_at").eq("user_id", uid).order("created_at", { ascending: false }).limit(100);
    setSavedItems((saved ?? []) as SavedItem[]);
    setSavedIds(((saved ?? []) as SavedItem[]).map(item => item.message_id).filter((id): id is string => Boolean(id)));
    const { data: memoryRows } = groupIds.length
      ? await supabase.from("raye2_shared_memories").select("id,group_id,created_by,source_message_id,memory_type,title,caption,content,retention_mode,expires_at,pinned,created_at").in("group_id", groupIds).order("pinned", { ascending: false }).order("created_at", { ascending: false }).limit(200)
      : { data: [] };
    setMemories((memoryRows ?? []) as SharedMemory[]);
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
    void supabase.auth.getUser().then(async ({ data, error }: { data: { user: { id: string } | null }; error: unknown }) => {
      if (!alive) return;
      if (error || !data.user) { setUserId(null); return; }
      setUserId(data.user.id);
      try { await loadData(data.user.id); } catch { setStatus(t.failed); }
    });
    const { data: authListener } = supabase.auth.onAuthStateChange((_event: string, session: { user: { id: string } } | null) => {
      if (!alive) return;
      if (!session?.user) { setUserId(null); setProfile(null); setThreads([]); }
      else { setUserId(session.user.id); void loadData(session.user.id).catch(() => setStatus(t.failed)); }
    });
    return () => { alive = false; authListener.subscription.unsubscribe(); };
  }, [supabase, loadData, t.failed]);

  const selected = threads.find(thread => thread.id === selectedId) ?? null;
  const selectedGroup = selected?.groupId ? groups.find(group => group.id === selected.groupId) ?? null : null;
  const canManageSelectedGroup = Boolean(selectedGroup && ["owner", "admin", "moderator"].includes(selectedGroup.memberRole ?? "member"));
  const visibleThreads = threads.filter(thread => (tab === "groups" ? thread.kind === "group" : thread.kind === "direct") && (thread.title + " " + thread.lastMessage).toLowerCase().includes(query.toLowerCase()));
  const currentMessages = messages.filter(message => selected && message.conversation_id === selected.conversationId);
  const visibleMessages = activeTopicId ? currentMessages.filter(message => message.topic_id === activeTopicId) : currentMessages;

  useEffect(() => {
    if (!supabase || !selected?.conversationId) { setPinnedMessages([]); return; }
    let active = true;
    void supabase.from("raye2_pinned_messages").select("message_id")
      .eq("conversation_id", selected.conversationId).order("created_at", { ascending: false }).limit(20)
      .then(async (queryResult: { data: Array<{ message_id: string }> | null; error: unknown }) => {
        const { data, error } = queryResult;
        if (!active) return;
        if (error || !data?.length) { setPinnedMessages([]); return; }
        const ids = data.map(row => row.message_id);
        const result = await supabase.from("raye2_messages")
          .select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at")
          .eq("conversation_id", selected.conversationId).in("id", ids);
        if (active) setPinnedMessages(((result.data ?? []) as PinnedMessage[]).sort((a,b) => a.created_at.localeCompare(b.created_at)));
      });
    return () => { active = false; };
  }, [supabase, selected?.conversationId]);

  useEffect(() => {
    const groupId = selectedGroup?.id;
    if (!supabase || !groupId) { setGroupTopics([]); setActiveTopicId(null); return; }
    let active = true;
    void supabase.rpc("raye2_list_group_topics", { p_group_id: groupId }).then(({ data }: { data: GroupTopic[] | null }) => {
      if (active) setGroupTopics((data ?? []) as GroupTopic[]);
    });
    return () => { active = false; };
  }, [supabase, selectedGroup?.id]);

  useEffect(() => {
    if (!supabase || !userId || !selected?.conversationId) {
      setOnlineUserIds([]); setTypingUserIds([]);
      return;
    }
    const channel = supabase.channel("raye2-room-" + selected.conversationId, { config: { presence: { key: userId } } })
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState() as Record<string, Array<{ user_id?: string }>>;
        const ids = Object.values(state).flatMap(items => items.map(item => item.user_id).filter((id): id is string => Boolean(id)));
        setOnlineUserIds([...new Set(ids)]);
      })
      .on("broadcast", { event: "typing" }, ({ payload }: { payload?: { user_id?: unknown; typing?: unknown } }) => {
        const sender = typeof payload?.user_id === "string" ? payload.user_id : "";
        if (!sender || sender === userId) return;
        if (payload?.typing === false) {
          const timer = typingTimers.current[sender];
          if (timer) clearTimeout(timer);
          delete typingTimers.current[sender];
          setTypingUserIds(current => current.filter(id => id !== sender));
          return;
        }
        setTypingUserIds(current => current.includes(sender) ? current : [...current, sender]);
        const previous = typingTimers.current[sender];
        if (previous) clearTimeout(previous);
        typingTimers.current[sender] = setTimeout(() => {
          setTypingUserIds(current => current.filter(id => id !== sender));
          delete typingTimers.current[sender];
        }, 2800);
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "raye2_messages" }, () => { void loadData(userId); })
      .on("postgres_changes", { event: "*", schema: "public", table: "raye2_group_members" }, () => { void loadData(userId); })
      .subscribe(async (status: string) => {
        if (status === "SUBSCRIBED") await channel.track({ user_id: userId, online_at: new Date().toISOString() });
      });
    realtimeChannel.current = channel;
    return () => {
      realtimeChannel.current = null;
      for (const timer of Object.values(typingTimers.current)) clearTimeout(timer);
      typingTimers.current = {};
      setTypingUserIds([]);
      void supabase.removeChannel(channel);
    };
  }, [supabase, userId, selected?.conversationId, loadData]);

  useEffect(() => {
    if (!supabase || !userId || !selected?.conversationId) return;
    const hasUnread = currentMessages.some(message => message.sender_id !== userId);
    if (!hasUnread) return;
    void supabase.rpc("raye2_mark_conversation_read", { p_conversation_id: selected.conversationId }).then(({ error }: { error: unknown }) => {
      if (!error) setThreads(current => current.map(thread => thread.conversationId === selected.conversationId ? { ...thread, unread: 0 } : thread));
    });
  }, [supabase, userId, selected?.conversationId, currentMessages.length]);

  async function searchConversationMessages() {
    if (!supabase || !selected || !messageSearch.trim() || messageSearchBusy) return;
    setMessageSearchBusy(true);
    try {
      const term = messageSearch.trim().replace(/[\\%_]/g, "\\  async function blockUser(targetUserId: string) {").slice(0, 120);
      const { data, error } = await supabase.from("raye2_messages")
        .select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at")
        .eq("conversation_id", selected.conversationId).ilike("body", "%" + term + "%")
        .order("created_at", { ascending: false }).limit(30);
      if (error) throw error;
      setMessageSearchResults((data ?? []) as PinnedMessage[]);
    } catch { setStatus(t.searchError); }
    finally { setMessageSearchBusy(false); }
  }

  async function togglePinnedMessage(message: Message) {
    if (!supabase || !selected || !message.id || message.id.startsWith("local-")) return;
    const isPinned = pinnedMessages.some(item => item.id === message.id);
    const { error } = await supabase.rpc(isPinned ? "raye2_unpin_message" : "raye2_pin_message", {
      p_conversation_id: selected.conversationId,
      p_message_id: message.id
    });
    if (error) { setStatus(t.searchError); return; }
    setPinnedMessages(current => isPinned ? current.filter(item => item.id !== message.id) : [...current, message as PinnedMessage].sort((a,b) => a.created_at.localeCompare(b.created_at)));
    setStatus(isPinned ? t.messageUnpinned : t.messagePinned);
  }

  async function blockUser(targetUserId: string) {
    if (!supabase || !userId || targetUserId === userId || busy) return;
    if (!window.confirm(t.blockConfirm)) return;
    setBusy(true);
    try {
      const { error } = await supabase.from("member_blocks").upsert({ blocker_id: userId, blocked_id: targetUserId }, { onConflict: "blocker_id,blocked_id", ignoreDuplicates: true });
      if (error) throw error;
      const blockedThread = threads.find(thread => thread.kind === "direct" && thread.otherUserId === targetUserId);
      if (blockedThread) {
        setThreads(current => current.filter(thread => thread.id !== blockedThread.id));
        if (selectedId === blockedThread.id) { setSelectedId(null); setMobilePane("list"); }
      }
      setPeople(current => current.filter(person => person.user_id !== targetUserId));
      setStatus(t.blocked);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function submitSafetyReport() {
    if (!supabase || !reportTarget || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_submit_safety_report", {
        p_target_type: reportTarget.type,
        p_target_id: reportTarget.id,
        p_conversation_id: reportTarget.conversationId ?? null,
        p_reason: reportReason,
        p_details: reportDetails.trim()
      });
      if (error) throw error;
      setReportTarget(null); setReportDetails(""); setReportReason("harassment");
      setStatus(t.reportSent);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function markNotificationRead(item: NotificationItem) {
    if (!supabase || !userId || item.read_at) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("raye2_notifications").update({ read_at: readAt }).eq("id", item.id).eq("user_id", userId);
    if (!error) setNotifications(current => current.map(row => row.id === item.id ? { ...row, read_at: readAt } : row));
  }

  async function markAllNotificationsRead() {
    if (!supabase || !userId) return;
    const readAt = new Date().toISOString();
    const { error } = await supabase.from("raye2_notifications").update({ read_at: readAt }).eq("user_id", userId).is("read_at", null);
    if (error) { setStatus(t.searchError); return; }
    setNotifications(current => current.map(row => ({ ...row, read_at: row.read_at ?? readAt })));
  }

  async function saveNotificationPreferences(next: NotificationPreferences) {
    if (!supabase || notificationSaving) return;
    setNotificationSaving(true);
    const { error } = await supabase.rpc("raye2_set_notification_preferences", {
      p_direct_messages: next.direct_messages,
      p_group_messages: next.group_messages,
      p_quiet_hours_enabled: next.quiet_hours_enabled,
      p_quiet_hours_start: next.quiet_hours_start,
      p_quiet_hours_end: next.quiet_hours_end,
      p_quiet_hours_timezone: next.quiet_hours_timezone,
      p_event_reminders: next.event_reminders
    });
    if (error) setStatus(t.searchError);
    else { setNotificationPreferences(next); setStatus(t.notificationSaved); }
    setNotificationSaving(false);
  }

  async function saveGroupNotificationPreference(groupId: string, mode: GroupNotificationPreference["mode"]) {
    if (!supabase || notificationSaving) return;
    setNotificationSaving(true);
    const { error } = await supabase.rpc("raye2_set_group_notification_preference", { p_group_id: groupId, p_mode: mode });
    if (error) setStatus(t.searchError);
    else { setGroupNotificationPreferences(current => ({ ...current, [groupId]: mode })); setStatus(t.notificationSaved); }
    setNotificationSaving(false);
  }

  function openNotification(item: NotificationItem) {
    void markNotificationRead(item);
    const thread = item.conversation_id ? threads.find(row => row.conversationId === item.conversation_id) : null;
    if (thread) {
      setSelectedId(thread.id);
      setTab(thread.kind === "group" ? "groups" : "chats");
      setMobilePane("chat");
    }
  }

  function broadcastTyping(typing: boolean) {
    if (!realtimeChannel.current || !userId) return;
    void realtimeChannel.current.send({ type: "broadcast", event: "typing", payload: { user_id: userId, typing } });
  }


  useEffect(() => {
    if (!showGroupManage || !supabase || !selectedGroup || !canManageSelectedGroup) return;
    setMemorySettings({ group_id: selectedGroup.id, contribution_policy: "all_members", export_policy: "all_members" });
    let alive = true;
    setGroupManageLoading(true);
    void (async () => {
      const [{ data: memberRows, error: memberError }, { data: requestRows, error: requestError }, { data: memoryPolicy, error: memoryPolicyError }, { data: banRows, error: banError }] = await Promise.all([
        supabase.from("raye2_group_members").select("group_id,user_id,role,status,joined_at").eq("group_id", selectedGroup.id).eq("status", "active").order("joined_at", { ascending: true }),
        supabase.from("raye2_group_join_requests").select("id,group_id,user_id,note,status,created_at").eq("group_id", selectedGroup.id).eq("status", "pending").order("created_at", { ascending: true }),
        supabase.from("raye2_group_memory_settings").select("group_id,contribution_policy,export_policy").eq("group_id", selectedGroup.id).maybeSingle(),
        supabase.rpc("raye2_get_group_bans", { p_group_id: selectedGroup.id, p_limit: 200 })
      ]);
      if (!alive) return;
      if (memoryPolicy) setMemorySettings(memoryPolicy as MemorySettings);
      if (memberError || requestError || memoryPolicyError || banError) { setStatus(t.searchError); setGroupMembers([]); setJoinRequests([]); setBannedMembers([]); setGroupManageLoading(false); return; }
      const memberData = (memberRows ?? []) as GroupMember[];
      const requestData = (requestRows ?? []) as JoinRequest[];
      const ids = [...new Set([...memberData.map(row => row.user_id), ...requestData.map(row => row.user_id)])];
      const { data: profileRows } = ids.length
        ? await supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").in("user_id", ids)
        : { data: [] };
      if (!alive) return;
      const byId = new Map(((profileRows ?? []) as Profile[]).map(item => [item.user_id, item]));
      setGroupMembers(memberData.map(item => ({ ...item, profile: byId.get(item.user_id) })));
      setJoinRequests(requestData.map(item => ({ ...item, profile: byId.get(item.user_id) })));
      const banData = (banRows ?? []) as Array<{ user_id: string; role: GroupMember["role"]; restricted_at: string | null; handle: string | null; display_name: string | null; avatar_url: string | null }>;
      setBannedMembers(banData.map(row => ({ group_id: selectedGroup.id, user_id: row.user_id, role: row.role, status: "banned", joined_at: row.restricted_at ?? "", profile: { user_id: row.user_id, handle: row.handle, display_name: row.display_name, avatar_url: row.avatar_url } })));
      setGroupManageLoading(false);
    })().catch(() => { if (alive) { setGroupManageLoading(false); setStatus(t.searchError); } });
    return () => { alive = false; };
  }, [showGroupManage, supabase, selectedGroup?.id, canManageSelectedGroup, t.searchError]);
  const savedMessages = savedItems.map(item => {
    const original = item.message_id ? messages.find(message => message.id === item.message_id) : null;
    return { id: item.id, messageId: item.message_id, body: original?.body ?? item.saved_content?.body ?? "", senderId: original?.sender_id ?? item.saved_content?.sender_id ?? "", originalConversationId: original?.conversation_id ?? null };
  });

  async function saveContactPreferences(next: boolean) {
    if (!supabase || contactSaving) return;
    setContactSaving(true);
    const { error } = await supabase.rpc("raye2_set_contact_preferences", { p_allow_message_requests: next });
    if (error) setStatus(t.searchError);
    else { setAllowMessageRequests(next); setStatus(t.notificationSaved); }
    setContactSaving(false);
  }

  async function saveVoicePreferences(next: boolean) {
    if (!supabase || voicePreferenceSaving) return;
    setVoicePreferenceSaving(true);
    const { error } = await supabase.rpc("raye2_set_voice_preferences", { p_allow_private_calls: next });
    if (error) setStatus(t.searchError);
    else { setAllowPrivateCalls(next); setStatus(t.notificationSaved); }
    setVoicePreferenceSaving(false);
  }

  async function reviewMessageRequest(request: MessageRequest, decision: "accepted" | "declined") {
    if (!supabase || !userId || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc("raye2_review_message_request", { p_request_id: request.id, p_decision: decision });
    if (error) { setStatus(t.searchError); setBusy(false); return; }
    await loadData(userId);
    if (decision === "accepted" && data) {
      setSelectedId(data as string); setTab("chats"); setMobilePane("chat"); setStatus(t.requestAccepted);
    } else setStatus(t.requestDeclined);
    setBusy(false);
  }

  async function openDirect(target: Profile) {
    if (!supabase || !userId || busy) return;
    setBusy(true); setStatus("");
    try {
      const { data, error } = await supabase.rpc("raye2_create_direct_conversation", { p_other_user: target.user_id });
      if (error) { if (error.message?.includes("not accepting")) { setStatus(t.requestUnavailable); return; } throw error; }
      const result = data as { status: "conversation" | "request_sent" | "incoming_request"; conversation_id?: string; request_id?: string };
      await loadData(userId);
      if (result.status === "conversation" && result.conversation_id) { setSelectedId(result.conversation_id); setTab("chats"); setMobilePane("chat"); setStatus(t.chatReady); }
      else { setTab("notifications"); setMobilePane("list"); setStatus(result.status === "incoming_request" ? t.requestPending : t.requestSent); }
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

  useEffect(() => {
    if (!supabase || !showGroupManage || !userId) return;
    let active = true;
    void supabase.rpc("raye2_list_active_rules").then(({ data }: { data: ActiveRule[] | null }) => { if (active) setActiveRules(data ?? []); });
    return () => { active = false; };
  }, [supabase, showGroupManage, userId]);

  async function createGroup() {
    if (!supabase || !userId || busy) return;
    setBusy(true); setStatus("");
    const baseSlug = groupName.trim().toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 52);
    if (groupName.trim().length < 2) { setStatus(t.createError); setBusy(false); return; }
    const slug = (baseSlug.length >= 2 ? baseSlug : "group") + "-" + crypto.randomUUID().slice(0, 8);
    try {
      const { data, error } = await supabase.rpc("raye2_create_group", { p_name: groupName.trim(), p_slug: slug, p_visibility: groupVisibility, p_description: groupDescription.trim() });
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

  async function createGroupInvite() {
    if (!supabase || !userId || !selectedGroup || !["owner", "admin", "moderator"].includes(selectedGroup.memberRole ?? "member") || busy) return;
    setBusy(true); setStatus("");
    try {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      const token = Array.from(bytes, value => value.toString(16).padStart(2, "0")).join("");
      const expiryHours = Math.min(2160, Math.max(1, Number(inviteHours) || 72));
      const maxUses = inviteUses.trim() ? Math.min(10000, Math.max(1, Number(inviteUses) || 1)) : null;
      const expiresAt = new Date(Date.now() + expiryHours * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase.rpc("raye2_create_group_invite", {
        p_group_id: selectedGroup.id, p_token: token, p_expires_at: expiresAt, p_max_uses: maxUses
      });
      if (error) throw error;
      const url = new URL("/raye2/invite", window.location.origin);
      url.searchParams.set("token", token);
      setInviteId(String(data)); setInviteUrl(url.toString()); setStatus(t.inviteReady);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function revokeGroupInvite() {
    if (!supabase || !inviteId || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_revoke_group_invite", { p_invite_id: inviteId });
      if (error) throw error;
      setInviteUrl(""); setInviteId(null); setStatus(t.inviteRevoked);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function saveSharedMemory(message: Message) {
    if (!supabase || !selectedGroup || selected?.kind !== "group" || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_save_shared_memory", {
        p_group_id: selectedGroup.id, p_message_id: message.id
      });
      if (error) throw error;
      const { data } = await supabase.from("raye2_shared_memories")
        .select("id,group_id,created_by,source_message_id,memory_type,title,caption,content,retention_mode,expires_at,pinned,created_at")
        .eq("group_id", selectedGroup.id).eq("source_message_id", message.id).maybeSingle();
      if (data) setMemories(current => [data as SharedMemory, ...current.filter(item => item.id !== data.id)]);
      setStatus(t.memorySaved);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function reviewJoinRequest(request: JoinRequest, decision: "approved" | "declined") {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_review_group_join_request", { p_request_id: request.id, p_decision: decision });
      if (error) throw error;
      setJoinRequests(current => current.filter(item => item.id !== request.id));
      if (decision === "approved") {
        const { data } = await supabase.from("raye2_group_members").select("group_id,user_id,role,status,joined_at").eq("group_id", selectedGroup.id).eq("user_id", request.user_id).maybeSingle();
        if (data) setGroupMembers(current => [...current.filter(item => item.user_id !== request.user_id), { ...data, profile: request.profile } as GroupMember]);
      }
      setStatus(t.requestReviewed);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function changeMemberRole(member: GroupMember, role: "admin" | "moderator" | "member") {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || busy || member.role === "owner") return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_set_group_member_role", { p_group_id: selectedGroup.id, p_user_id: member.user_id, p_role: role });
      if (error) throw error;
      setGroupMembers(current => current.map(item => item.user_id === member.user_id ? { ...item, role } : item));
      setStatus(t.roleUpdated);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function removeGroupMember(member: GroupMember) {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || busy || member.role === "owner" || member.user_id === userId) return;
    const name = member.profile?.display_name ?? member.profile?.handle ?? (isAr ? "هذا العضو" : "this member");
    if (!window.confirm((isAr ? "إزالة " : "Remove ") + name + (isAr ? " من المجموعة؟" : " from this group?"))) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_remove_group_member", { p_group_id: selectedGroup.id, p_user_id: member.user_id });
      if (error) throw error;
      setGroupMembers(current => current.filter(item => item.user_id !== member.user_id));
      setStatus(t.memberRemoved);
      await loadData(userId!);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function banGroupMember(member: GroupMember) {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || busy || member.role === "owner" || member.user_id === userId) return;
    const name = member.profile?.display_name ?? member.profile?.handle ?? (isAr ? "هذا العضو" : "this member");
    if (!window.confirm((isAr ? "حظر " : "Ban ") + name + (isAr ? " من المجموعة؟" : " from this group?"))) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_ban_group_member", { p_group_id: selectedGroup.id, p_user_id: member.user_id });
      if (error) throw error;
      setGroupMembers(current => current.filter(item => item.user_id !== member.user_id));
      setBannedMembers(current => [...current.filter(item => item.user_id !== member.user_id), { ...member, status: "banned" }]);
      setStatus(t.memberBanned);
      await loadData(userId!);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function unbanGroupMember(member: GroupMember) {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_unban_group_member", { p_group_id: selectedGroup.id, p_user_id: member.user_id });
      if (error) throw error;
      setBannedMembers(current => current.filter(item => item.user_id !== member.user_id));
      setStatus(t.memberUnbanned);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function saveMemoryPermissions() {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || memorySettingsSaving) return;
    setMemorySettingsSaving(true);
    try {
      const { error } = await supabase.rpc("raye2_set_group_memory_settings", {
        p_group_id: selectedGroup.id,
        p_contribution_policy: memorySettings.contribution_policy,
        p_export_policy: memorySettings.export_policy
      });
      if (error) throw error;
      setStatus(t.memorySettingsSaved);
    } catch { setStatus(t.searchError); }
    finally { setMemorySettingsSaving(false); }
  }

  async function exportSharedMemories(groupId: string) {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.rpc("raye2_export_shared_memories", { p_group_id: groupId });
      if (error || !data) throw error ?? new Error("Export unavailable");
      const groupName = groups.find(group => group.id === groupId)?.name ?? "raye2-group";
      const safeName = groupName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48) || "raye2-group";
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = safeName + "-shared-memories.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setStatus(t.exportMemories);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }
  async function updateSharedMemory(memory: SharedMemory, patch: Partial<Pick<SharedMemory, "retention_mode" | "expires_at" | "pinned">>) {
    if (!supabase || !memory.group_id || busy) return;
    const group = groups.find(item => item.id === memory.group_id);
    const isManager = ["owner", "admin", "moderator"].includes(group?.memberRole ?? "member");
    if (patch.pinned !== undefined && !isManager) return;
    if (patch.retention_mode === "preserved" && memory.created_by !== userId && !isManager) return;
    setBusy(true);
    try {
      const { data, error } = await supabase.from("raye2_shared_memories").update(patch).eq("id", memory.id)
        .select("id,group_id,created_by,source_message_id,memory_type,title,caption,content,retention_mode,expires_at,pinned,created_at").maybeSingle();
      if (error || !data) throw error ?? new Error("Memory permission denied");
      setMemories(current => current.map(item => item.id === memory.id ? data as SharedMemory : item));
      setStatus(t.memoryUpdated);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }

  async function sendMessage() {
    if (!supabase || !userId || !selected || !compose.trim() || busy) return;
    if (typingActive.current) { broadcastTyping(false); typingActive.current = false; }
    const body = compose.trim();
    if (body.length > 5000) { setStatus(isAr ? "الحد الأقصى للرسالة 5000 حرف." : "Messages are limited to 5,000 characters."); return; }
    setBusy(true); setStatus("");
    const tempId = "local-" + Date.now();
    const optimistic: Message = { id: tempId, conversation_id: selected.conversationId, sender_id: userId, body, parent_message_id: replyTo?.id ?? null, edited_at: null, created_at: new Date().toISOString(), topic_id: activeTopicId ?? null };
    setMessages(current => [...current, optimistic]); setCompose(""); setReplyTo(null);
    try {
      const { data, error } = await supabase.from("raye2_messages").insert({ conversation_id: selected.conversationId, sender_id: userId, body, parent_message_id: optimistic.parent_message_id, topic_id: activeTopicId ?? null }).select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at,topic_id").single();
      if (error) throw error;
      setMessages(current => [...current.filter(message => message.id !== tempId), data as Message]);
      setThreads(current => current.map(thread => thread.id === selected.id ? { ...thread, lastMessage: body, updatedAt: (data as Message).created_at } : thread).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch {
      setMessages(current => current.filter(message => message.id !== tempId)); setCompose(body); setStatus(t.sendError);
    } finally { setBusy(false); }
  }

  async function createGroupTopic() {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || busy) return;
    const name = newTopicName.trim();
    if (!name) return;
    setBusy(true); setStatus("");
    try {
      const { error } = await supabase.rpc("raye2_create_group_topic", { p_group_id: selectedGroup.id, p_name: name });
      if (error) throw error;
      setNewTopicName(""); setStatus(t.topicCreated);
      const { data } = await supabase.rpc("raye2_list_group_topics", { p_group_id: selectedGroup.id });
      setGroupTopics((data ?? []) as GroupTopic[]);
    } catch { setStatus(t.topicError); } finally { setBusy(false); }
  }

  async function deleteGroupTopic(topicId: string) {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || busy) return;
    setBusy(true); setStatus("");
    try {
      const { error } = await supabase.rpc("raye2_delete_group_topic", { p_topic_id: topicId });
      if (error) throw error;
      if (activeTopicId === topicId) setActiveTopicId(null);
      setStatus(t.topicDeleted);
      const { data } = await supabase.rpc("raye2_list_group_topics", { p_group_id: selectedGroup.id });
      setGroupTopics((data ?? []) as GroupTopic[]);
    } catch { setStatus(t.topicError); } finally { setBusy(false); }
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
      if (!result.error) {
        setSavedIds(current => current.filter(id => id !== message.id));
        setSavedItems(current => current.filter(item => item.message_id !== message.id));
      } else setStatus(t.searchError);
    } else {
      const result = await supabase.rpc("raye2_bookmark_message", { p_message_id: message.id });
      if (!result.error) {
        setSavedIds(current => [...current, message.id]);
        setSavedItems(current => [...current, { id: "local-" + message.id, message_id: message.id, saved_content: { body: message.body, sender_id: message.sender_id, created_at: message.created_at }, created_at: new Date().toISOString() }]);
      } else setStatus(t.searchError);
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

  const platformNav = [
    { href: "/raye2/home", en: "Home", ar: "الرئيسية", icon: "⌂" },
    { href: "/watch", en: "Watch", ar: "المشاهدة", icon: "▶" },
    { href: "/shorts", en: "Mini's", ar: "ميني", icon: "▤" },
    { href: "/search", en: "Explore", ar: "استكشف", icon: "⌕" },
    { href: "/series", en: "Series", ar: "السلاسل", icon: "▥" },
    { href: "/creator", en: "Creator Studio", ar: "استوديو المبدعين", icon: "✳" },
    { href: "/raye2", en: "Messages", ar: "الرسائل", icon: "✉" },
    { href: "/notifications", en: "Alerts", ar: "الإشعارات", icon: "◉" },
    { href: "/saved", en: "Saved", ar: "المحفوظات", icon: "▱" },
    { href: "/profile", en: "Profile", ar: "الملف الشخصي", icon: "◎" }
  ];
  const switchLocale = () => {
    const next: Locale = locale === "en" ? "ar" : "en";
    setLocale(next);
    document.cookie = `nhen_locale=${next}; path=/; max-age=31536000; samesite=lax`;
  };
  const reactionOptions = ["❤️", "👍", "😂", "✨", "🔥"];
  if (!supabase) return <main className={styles.authGate}><Link href="/" className={styles.brand}>RAYE<span>2</span></Link><h1>{t.signIn}</h1><p>{t.signInText}</p><Link className={styles.primaryButton} href="/community#join">{t.signIn}</Link></main>;
  if (!userId) return <main className={styles.authGate}><Link href="/" className={styles.brand}>RAYE<span>2</span></Link><h1>{t.signIn}</h1><p>{t.signInText}</p><Link className={styles.primaryButton} href="/community#join">{t.signIn}</Link><Link className={styles.backLink} href="/">{t.home}</Link></main>;

  return (
    <main className={styles.page} data-theme={theme} dir={isAr ? "rtl" : "ltr"} lang={locale}>
      <div className={styles.voiceGlobalWrap}>{supabase && userId && <Raye2VoiceControls supabase={supabase} userId={userId} conversationId={selected?.kind === "direct" ? selected.conversationId : null} peerUserId={selected?.kind === "direct" ? selected.otherUserId : null} peerName={selected?.title ?? ""} locale={locale} />}</div>
      <header className={styles.header}>
        <Link href="/" className={styles.brand} aria-label="Raye2 home">RAYE<span>2</span></Link>
        <nav className={styles.platformNav} aria-label={isAr ? "التنقل الرئيسي" : "Main navigation"}>
          {platformNav.map(item => <Link key={item.href} href={item.href} className={pathname === item.href || (item.href !== "/raye2/home" && pathname.startsWith(item.href + "/")) ? styles.platformNavActive : ""} aria-current={pathname === item.href ? "page" : undefined}>
            <span className={styles.platformNavIcon} aria-hidden="true">{item.icon}</span><span>{isAr ? item.ar : item.en}</span>
          </Link>)}
        </nav>
        <div className={styles.headerActions}>
          <span className={styles.headerMember}>{profile?.display_name ?? profile?.handle ?? "Member"}</span>
          <button className={styles.utilityToggle} type="button" onClick={switchLocale} aria-label={isAr ? "Switch to English" : "التبديل إلى العربية"}>{isAr ? "EN" : "عربي"}</button>
          <button className={styles.themeToggle} type="button" aria-label={theme === "dark" ? (isAr ? "تفعيل المظهر الفاتح" : "Switch to light theme") : (isAr ? "تفعيل المظهر الداكن" : "Switch to dark theme")} onClick={() => { const next = theme === "dark" ? "light" : "dark"; setTheme(next); try { window.localStorage.setItem("raye2-theme", next); } catch { /* Theme remains active for this session. */ } }}><span aria-hidden="true">{theme === "dark" ? "☼" : "◐"}</span>{theme === "dark" ? (isAr ? "فاتح" : "Light") : (isAr ? "داكن" : "Dark")}</button>
          <button onClick={() => void supabase.auth.signOut().then(() => router.push("/"))}>{t.signOut}</button>
        </div>
      </header>
      <nav className={styles.mobilePlatformNav} aria-label={isAr ? "التنقل السريع" : "Quick navigation"}>
        {platformNav.slice(0, 6).map(item => <Link key={item.href} href={item.href} className={item.href === "/raye2" ? styles.platformNavActive : ""} aria-current={item.href === "/raye2" ? "page" : undefined}><span aria-hidden="true">{item.icon}</span>{isAr ? item.ar : item.en}</Link>)}
      </nav>
      <section className={styles.intro}><div><span className={styles.kicker}>RAYE2 / COMMUNITY LAYER</span><h1>{t.title}</h1><p>{t.intro}</p></div><div className={styles.introMark}><span>R</span><i>✳</i></div></section>
      <section className={styles.workspace}>
        <aside className={`${styles.sidebar} ${mobilePane === "chat" ? styles.hideMobile : ""}`}>
          <div className={styles.sideTop}><div><span className={styles.kicker}>{t.rooms}</span><h2>{t.chats}</h2></div><button className={styles.iconButton} onClick={() => { setTab("chats"); setPersonQuery(""); setPeople([]); document.getElementById("raye2-people-search")?.focus(); }} aria-label={t.newMessage}>＋</button></div>
          <label className={styles.searchBox}><span>⌕</span><input value={query} onChange={event => setQuery(event.target.value)} placeholder={t.search}/></label>
          <div className={styles.tabs}>
            <button className={tab === "notifications" ? styles.activeTab : ""} onClick={() => setTab("notifications")}>{t.notifications}{notifications.some(item => !item.read_at) ? <i className={styles.notificationDot}/> : null}</button>
            <button className={tab === "chats" ? styles.activeTab : ""} onClick={() => setTab("chats")}>{t.chats}</button>
            <button className={tab === "groups" ? styles.activeTab : ""} onClick={() => setTab("groups")}>{t.groups}</button>
            <button className={tab === "discover" ? styles.activeTab : ""} onClick={() => setTab("discover")}>{t.discover}</button>
            <button className={tab === "saved" ? styles.activeTab : ""} onClick={() => setTab("saved")}>{t.saved}</button>
            <button className={tab === "memories" ? styles.activeTab : ""} onClick={() => setTab("memories")}>{t.memories}</button>
          </div>
          {tab === "notifications" ? <div className={styles.threadList}>
            <section className={styles.notificationSettings}>
              <b>{t.notificationSettings}</b>
              <label><span>{t.directNotifications}</span><input type="checkbox" checked={notificationPreferences.direct_messages} disabled={notificationSaving} onChange={event => void saveNotificationPreferences({ ...notificationPreferences, direct_messages: event.target.checked })}/></label>
              <label><span>{t.groupNotifications}</span><input type="checkbox" checked={notificationPreferences.group_messages} disabled={notificationSaving} onChange={event => void saveNotificationPreferences({ ...notificationPreferences, group_messages: event.target.checked })}/></label>
              <div className={styles.quietHours}><b>{t.quietHours}</b><label><span>{t.quietHoursEnable}</span><input type="checkbox" checked={notificationPreferences.quiet_hours_enabled} disabled={notificationSaving} onChange={event => void saveNotificationPreferences({ ...notificationPreferences, quiet_hours_enabled: event.target.checked, quiet_hours_timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC" })}/></label><div><label>{t.quietStart}<input type="time" value={notificationPreferences.quiet_hours_start.slice(0,5)} disabled={notificationSaving || !notificationPreferences.quiet_hours_enabled} onChange={event => setNotificationPreferences(current => ({ ...current, quiet_hours_start: event.target.value }))} onBlur={() => void saveNotificationPreferences(notificationPreferences)}/></label><label>{t.quietEnd}<input type="time" value={notificationPreferences.quiet_hours_end.slice(0,5)} disabled={notificationSaving || !notificationPreferences.quiet_hours_enabled} onChange={event => setNotificationPreferences(current => ({ ...current, quiet_hours_end: event.target.value }))} onBlur={() => void saveNotificationPreferences(notificationPreferences)}/></label></div></div>
            </section>
            <section className={styles.groupNotificationOverrides}><b>{t.groupOverrides}</b>{groups.map(group => <label key={group.id}><span>{group.name}</span><select value={groupNotificationPreferences[group.id] ?? "inherit"} disabled={notificationSaving} onChange={event => void saveGroupNotificationPreference(group.id, event.target.value as GroupNotificationPreference["mode"])}><option value="inherit">{t.inherit}</option><option value="all">{t.allNotifications}</option><option value="muted">{t.muted}</option></select></label>)}</section>
            <section className={styles.notificationSettings}><b>{t.contactSettings}</b><label><span>{t.allowRequests}</span><input type="checkbox" checked={allowMessageRequests} disabled={contactSaving} onChange={event => void saveContactPreferences(event.target.checked)}/></label><label><span>{t.allowVoiceCalls}</span><input type="checkbox" checked={allowPrivateCalls} disabled={voicePreferenceSaving} onChange={event => void saveVoicePreferences(event.target.checked)}/></label></section>
            <section className={styles.requestInbox}><b>{t.messageRequests} · {messageRequests.filter(item => item.recipient_id === userId).length}</b>
              {messageRequests.filter(item => item.recipient_id === userId).map(item => { const person = requestProfiles[item.sender_id]; return <article key={item.id} className={styles.requestItem}><div className={styles.avatar}>{initials(person?.display_name ?? person?.handle ?? "R")}</div><div className={styles.personInfo}><b>{person?.display_name ?? person?.handle ?? (isAr ? "عضو" : "Member")}</b><small>{item.initial_message || t.requestPending}</small><small>{relative(item.created_at, locale)}</small></div><button className={styles.miniButton} disabled={busy} onClick={() => void reviewMessageRequest(item,"accepted")}>{t.acceptRequest}</button><button className={styles.dangerButton} disabled={busy} onClick={() => void reviewMessageRequest(item,"declined")}>{t.declineRequest}</button></article>; })}
              {!messageRequests.some(item => item.recipient_id === userId) && <p className={styles.emptySmall}>{t.noMessageRequests}</p>}
              {messageRequests.filter(item => item.sender_id === userId).map(item => { const person = requestProfiles[item.recipient_id]; return <div key={item.id} className={styles.requestOutgoing}><span>{person?.display_name ?? person?.handle ?? (isAr ? "عضو" : "Member")} · {t.requestPending}</span><small>{relative(item.created_at, locale)}</small></div>; })}
            </section>
            {notifications.some(item => !item.read_at) && <button className={styles.miniButton} onClick={() => void markAllNotificationsRead()}>{t.markAllRead}</button>}
            {notifications.map(item => <button key={item.id} className={styles.notificationItem + " " + (!item.read_at ? styles.notificationUnread : "")} onClick={() => openNotification(item)}>
              <span className={styles.notificationGlyph}>{item.notification_type === "group_message" ? "◈" : "✉"}</span><span className={styles.notificationText}><b>{item.notification_type === "group_message" ? t.groups : t.chats}</b><span>{item.preview || (isAr ? "رسالة جديدة" : "New message")}</span><small>{relative(item.created_at, locale)}</small></span>{!item.read_at && <i/>}
            </button>)}
            {!notifications.length && <p className={styles.emptySmall}>{t.noNotifications}</p>}
          </div> : tab === "discover" ? <div className={styles.discoverPanel}>
            <span className={styles.kicker}>{t.people}</span><div className={styles.searchRow}><input id="raye2-people-search" value={personQuery} onChange={event => setPersonQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") void searchPeople(); }} placeholder={t.findPeople}/><button onClick={() => void searchPeople()}>⌕</button></div>
            {people.map(person => <article className={styles.personRow} key={person.user_id}><div className={styles.avatar}>{initials(person.display_name ?? person.handle ?? "R")}</div><div className={styles.personInfo}><b>{person.display_name ?? person.handle}</b><small>@{person.handle}</small></div><button className={styles.dangerButton} disabled={busy} onClick={() => { setReportTarget({ type: "user", id: person.user_id }); setReportReason("harassment"); }}>{t.report}</button><button className={styles.dangerButton} disabled={busy} onClick={() => void blockUser(person.user_id)}>{t.block}</button><button className={styles.miniButton} onClick={() => void openDirect(person)}>{t.startChat}</button></article>)}
            <span className={styles.kicker}>{t.publicGroups}</span>
            {discoverGroups.filter(group => group.name.toLowerCase().includes(query.toLowerCase())).map(group => <article className={styles.groupRow} key={group.id}><div className={styles.avatar}>#</div><div className={styles.personInfo}><b>{group.name}</b><small>{group.description || t.publicLabel}</small></div><button className={styles.miniButton} onClick={() => void joinGroup(group)}>{groups.some(item => item.id === group.id) ? t.joined : t.join}</button></article>)}
            {!people.length && !discoverGroups.length && <p className={styles.emptySmall}>{t.noResults}</p>}
          </div> : tab === "memories" ? <div className={styles.threadList}><p className={styles.modalHint}>{t.exportNote}</p>{groups.map(group => <article className={styles.groupRow} key={"memory-export-" + group.id}><div className={styles.personInfo}><b>{group.name}</b><small>{group.visibility === "private" ? t.privateLabel : t.publicLabel}</small></div><button className={styles.miniButton} disabled={busy} onClick={() => void exportSharedMemories(group.id)}>{t.exportMemories}</button></article>)}
            {memories.map(memory => <article className={styles.memoryCard} key={memory.id}>
              <div className={styles.memoryTop}><span>{memory.pinned ? "✦ PINNED" : "SHARED MEMORY"}</span><small>{relative(memory.created_at, locale)}</small></div>
              <b>{memory.title || (isAr ? "ذكرى مشتركة" : "Shared memory")}</b>
              <p>{String(memory.content.body ?? memory.caption ?? "")}</p>
              <small>{memory.retention_mode === "preserved" ? (isAr ? "محفوظة" : "Preserved") : memory.expires_at ? (isAr ? "تنتهي " : "Expires ") + relative(memory.expires_at, locale) : (isAr ? "مرتبطة بعمر المجموعة" : "Group lifetime")}</small>
              {memory.expires_at && new Date(memory.expires_at).getTime() - Date.now() < 7 * 86400000 && memory.retention_mode !== "preserved" && <small className={styles.expiryWarning}>⚠ {t.expirySoon}</small>}
              <div className={styles.memoryActions}>
                {memory.created_by === userId || ["owner","admin","moderator"].includes(groups.find(group => group.id === memory.group_id)?.memberRole ?? "member") ? <button className={styles.miniButton} disabled={busy || memory.retention_mode === "preserved"} onClick={() => void updateSharedMemory(memory, { retention_mode: "preserved", expires_at: null })}>✦ {t.preserveMemory}</button> : null}
                {["owner","admin","moderator"].includes(groups.find(group => group.id === memory.group_id)?.memberRole ?? "member") && <button className={styles.miniButton} disabled={busy} onClick={() => void updateSharedMemory(memory, { pinned: !memory.pinned })}>{memory.pinned ? t.unpinMemory : t.pinMemory}</button>}
                {groups.find(group => group.id === memory.group_id)?.conversation_id && <button className={styles.miniButton} onClick={() => { const group = groups.find(item => item.id === memory.group_id); if (group?.conversation_id) { setSelectedId(group.conversation_id); setTab("groups"); setMobilePane("chat"); } }}>{isAr ? "فتح المجموعة" : "Open group"}</button>}
              </div>
            </article>)}
            {!memories.length && <p className={styles.emptySmall}>{isAr ? "لا توجد ذكريات مشتركة بعد." : "No shared memories yet."}</p>}
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
            <div className={styles.chatHeader}><button className={styles.backButton} onClick={() => setMobilePane("list")}>← {t.back}</button><div className={styles.avatar}>{selected.avatar}</div><div className={styles.chatHeading}><h2>{selected.title}</h2><span>{typingUserIds.length ? (isAr ? "يكتب الآن…" : "Typing…") : (onlineUserIds.filter(id => id !== userId).length ? (isAr ? onlineUserIds.filter(id => id !== userId).length + " متصل" : onlineUserIds.filter(id => id !== userId).length + " online") : selected.subtitle)}</span></div><button className={styles.iconButton} title={t.saved} onClick={() => setTab("saved")}>⌑</button><button className={styles.iconButton} title={t.searchMessages} onClick={() => { setMessageSearchOpen(value => !value); setMessageSearchResults([]); }}>⌕</button>{selected?.kind === "direct" && selected.otherUserId && <><button className={styles.dangerButton} onClick={() => setReportTarget({ type: "user", id: selected.otherUserId! })}>{t.report}</button><button className={styles.dangerButton} onClick={() => void blockUser(selected.otherUserId!)}>{t.block}</button></>}{selected.kind === "group" && selectedGroup && supabase && userId && <><Raye2GroupVoiceControls supabase={supabase} userId={userId} groupId={selectedGroup.id} conversationId={selected.conversationId} groupName={selectedGroup.name} locale={locale} /><Raye2WatchTogetherControls supabase={supabase} conversationId={selected.conversationId} groupId={selectedGroup.id} groupName={selectedGroup.name} groupVisibility={selectedGroup.visibility} locale={locale} /></>}{selectedGroup && canManageSelectedGroup && <><button className={styles.miniButton} onClick={() => setShowGroupManage(true)}>{t.manageGroup}</button><button className={styles.miniButton} onClick={() => { setInviteUrl(""); setInviteId(null); setShowInvite(true); }}>{t.invite}</button></>}</div>
            {messageSearchOpen && <section className={styles.messageSearchPanel}><form onSubmit={event => { event.preventDefault(); void searchConversationMessages(); }}><input value={messageSearch} onChange={event => setMessageSearch(event.target.value)} placeholder={t.searchPlaceholder} maxLength={120}/><button type="submit" disabled={!messageSearch.trim() || messageSearchBusy}>{messageSearchBusy ? "…" : t.searchMessages}</button><button type="button" onClick={() => { setMessageSearchOpen(false); setMessageSearchResults([]); }}>{t.close}</button></form>{messageSearchResults.length ? messageSearchResults.map(result => <button key={result.id} className={styles.searchResult} onClick={() => { setMessages(current => current.some(item => item.id === result.id) ? current : [...current, result]); setMessageSearchOpen(false); setMessageSearchResults([]); }}><b>{profiles[result.sender_id]?.display_name ?? (isAr ? "عضو" : "Member")}</b><span>{result.body}</span><time>{stamp(result.created_at, locale)}</time></button>) : messageSearch && !messageSearchBusy ? <p className={styles.emptySmall}>{t.noSearchResults}</p> : null}</section>}
            {pinnedMessages.length > 0 && <section className={styles.pinnedPanel}><b>⌖ {t.pinnedMessages} · {pinnedMessages.length}</b><div>{pinnedMessages.slice(0,4).map(item => <button key={item.id} onClick={() => { setMessages(current => current.some(message => message.id === item.id) ? current : [...current, item]); setMessageSearchOpen(false); }}><span>{item.body}</span><small>{stamp(item.created_at, locale)}</small></button>)}</div></section>}
            {selected.kind === "group" && selectedGroup && <div className={styles.topicBar} role="group" aria-label={t.topics}>
              <button type="button" className={activeTopicId === null ? styles.topicActive : ""} aria-pressed={activeTopicId === null} onClick={() => setActiveTopicId(null)}>{t.topicAll}</button>
              {groupTopics.map(topic => <button type="button" key={topic.id} className={activeTopicId === topic.id ? styles.topicActive : ""} aria-pressed={activeTopicId === topic.id} onClick={() => setActiveTopicId(topic.id)}>{topic.name}{topic.message_count ? ` · ${topic.message_count}` : ""}</button>)}
              {canManageSelectedGroup && <button type="button" className={styles.topicManage} aria-pressed={showTopicManage} onClick={() => setShowTopicManage(value => !value)}>{t.manageTopics}</button>}
            </div>}
            {selected.kind === "group" && selectedGroup && showTopicManage && canManageSelectedGroup && <section className={styles.topicPanel}>
              <div className={styles.topicCreate}><input value={newTopicName} onChange={event => setNewTopicName(event.target.value)} maxLength={60} placeholder={t.topicName} aria-label={t.topicName}/><button type="button" disabled={busy || !newTopicName.trim()} onClick={() => void createGroupTopic()}>{t.createTopic}</button></div>
              {groupTopics.length === 0 ? <p className={styles.emptySmall}>{t.noTopics}</p> : <ul className={styles.topicList}>{groupTopics.map(topic => <li key={topic.id}><span>{topic.name} · {topic.message_count}</span><button type="button" disabled={busy} onClick={() => void deleteGroupTopic(topic.id)}>{t.deleteTopic}</button></li>)}</ul>}
            </section>}
            <div className={styles.messageArea}>
              {visibleMessages.length === 0 && <div className={styles.emptyConversation}><div>✳</div><h3>{t.noMessages}</h3></div>}
              {visibleMessages.map(message => {
                const mine = message.sender_id === userId;
                const author = profiles[message.sender_id];
                const parent = message.parent_message_id ? messages.find(item => item.id === message.parent_message_id) : null;
                return <article key={message.id} className={`${styles.messageRow} ${mine ? styles.ownMessage : ""}`}>
                  {!mine && <div className={styles.messageAvatar}>{initials(author?.display_name ?? author?.handle ?? "R")}</div>}
                  <div className={styles.messageBody}>
                    {!mine && <span className={styles.author}>{author?.display_name ?? author?.handle ?? "Member"}</span>}
                    {parent && <div className={styles.replyQuote}>{parent.body}</div>}
                    <div className={styles.bubble}>{message.body}</div>
                    {message.topic_id && <span className={styles.topicChip}>{t.postInTopic} {groupTopics.find(topic => topic.id === message.topic_id)?.name ?? ""}</span>}
                    <div className={styles.messageMeta}><time>{stamp(message.created_at, locale)}</time>{message.edited_at && <span>{t.edited}</span>}
                      <button onClick={() => setReplyTo(message)}>{t.reply}</button>{(selected?.kind === "direct" || canManageSelectedGroup) && <button onClick={() => void togglePinnedMessage(message)}>{pinnedMessages.some(item => item.id === message.id) ? t.unpinMessage : t.pinMessage}</button>}{!mine && <button onClick={() => setReportTarget({ type: "message", id: message.id, conversationId: message.conversation_id })}>{t.report}</button>}<button onClick={() => void toggleBookmark(message)}>{savedIds.includes(message.id) ? "⌑" : "＋"}</button>{selected?.kind === "group" && <button title={t.saveMemory} onClick={() => void saveSharedMemory(message)}>✦</button>}
                      {mine && <><button onClick={() => void editMessage(message)}>{t.edit}</button><button onClick={() => void deleteMessage(message)}>×</button></>}
                    </div>
                    <div className={styles.reactionStrip}>{reactionOptions.map((emoji, index) => { const key = ["love", "like", "laugh", "spark", "fire"][index]; const count = reactionCounts[message.id]?.[key] ?? 0; return <button key={key} className={myReactions[message.id]?.includes(key) ? styles.reacted : ""} onClick={() => void toggleReaction(message, key)}>{emoji}{count > 0 && <small>{count}</small>}</button>; })}</div>
                  </div>
                </article>;
              })}
            </div>
            <div className={styles.composerWrap}>
              {replyTo && <div className={styles.replyingTo}><span>{t.reply}: {replyTo.body.slice(0, 100)}</span><button onClick={() => setReplyTo(null)}>×</button></div>}
              <form className={styles.composer} onSubmit={event => { event.preventDefault(); void sendMessage(); }}><textarea value={compose} onChange={event => { setCompose(event.target.value); if (event.target.value.trim() && !typingActive.current) { typingActive.current = true; broadcastTyping(true); } else if (!event.target.value.trim() && typingActive.current) { typingActive.current = false; broadcastTyping(false); } }} onBlur={() => { if (typingActive.current) { typingActive.current = false; broadcastTyping(false); } }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={selected.canSend ? t.message : (isAr ? "هذه المجموعة للقراءة فقط حاليًا" : "This group is currently read-only")} disabled={!selected.canSend} maxLength={5000} rows={1}/><button type="submit" disabled={!compose.trim() || busy || !selected.canSend}>{t.send} ↗</button></form><div className={styles.composerFoot}><span>RAYE2 • PRIVATE BY DESIGN</span><span>{compose.length}/5000</span></div>
            </div>
          </> : <div className={styles.blankState}><div className={styles.blankOrbit}>R</div><span className={styles.kicker}>{t.eyebrow}</span><h2>{t.emptyTitle}</h2><p>{t.emptyText}</p><button className={styles.primaryButton} onClick={() => { setTab("discover"); setMobilePane("list"); }}>{t.discover} ↗</button></div>}
        </section>
      </section>
      {status && <div className={styles.status} role="status">{status}<button onClick={() => setStatus("")}>×</button></div>}
      {reportTarget && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setReportTarget(null); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="raye2-report-title"><button className={styles.modalClose} onClick={() => setReportTarget(null)}>×</button><span className={styles.kicker}>RAYE2 / TRUST & SAFETY</span><h2 id="raye2-report-title">{t.reportTitle}</h2><label>{t.reportReason}<select value={reportReason} onChange={event => setReportReason(event.target.value)}><option value="spam">{t.reasons.spam}</option><option value="harassment">{t.reasons.harassment}</option><option value="hate">{t.reasons.hate}</option><option value="impersonation">{t.reasons.impersonation}</option><option value="copyright">{t.reasons.copyright}</option><option value="other">{t.reasons.other}</option></select></label><label>{t.reportDetails}<textarea value={reportDetails} onChange={event => setReportDetails(event.target.value)} maxLength={500} rows={4}/></label><div className={styles.modalActions}><button onClick={() => setReportTarget(null)}>{t.cancel}</button><button className={styles.primaryButton} disabled={busy} onClick={() => void submitSafetyReport()}>{t.report}</button></div></section></div>}
      {showGroupManage && selectedGroup && canManageSelectedGroup && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowGroupManage(false); }}><section className={styles.modal + " " + styles.groupManageModal} role="dialog" aria-modal="true" aria-labelledby="raye2-manage-title"><button className={styles.modalClose} onClick={() => setShowGroupManage(false)}>×</button><span className={styles.kicker}>RAYE2 / COMMUNITY CONTROL</span><h2 id="raye2-manage-title">{t.manageGroup}</h2><p className={styles.modalHint}>{selectedGroup.name} · {selectedGroup.visibility === "private" ? t.privateLabel : t.publicLabel}</p>
        {groupManageLoading ? <p className={styles.emptySmall}>{t.loading}</p> : <>
          {activeRules.length > 0 && <div className={styles.manageSection}><div className={styles.manageSectionTitle}><b>{t.limitsLabel}</b><span>{activeRules.length}</span></div><p className={styles.emptySmall}>{t.limitsHint}</p><ul className={styles.ruleList}>{activeRules.map(rule => <li key={rule.rule_key}><span>{rule.rule_key}</span><b>{typeof rule.rule_value === "object" ? JSON.stringify(rule.rule_value) : String(rule.rule_value)}</b></li>)}</ul></div>}
          <div className={styles.manageSection}><div className={styles.manageSectionTitle}><b>{t.pendingRequests}</b><span>{joinRequests.length}</span></div>
            {!joinRequests.length && <p className={styles.emptySmall}>{t.noRequests}</p>}
            {joinRequests.map(request => <article className={styles.manageRow} key={request.id}><div className={styles.personInfo}><b>{request.profile?.display_name ?? request.profile?.handle ?? (isAr ? "عضو جديد" : "New member")}</b><small>{request.note || relative(request.created_at, locale)}</small></div><button className={styles.miniButton} disabled={busy} onClick={() => void reviewJoinRequest(request, "approved")}>{t.approve}</button><button className={styles.dangerButton} disabled={busy} onClick={() => void reviewJoinRequest(request, "declined")}>{t.decline}</button></article>)}
          </div>
          <div className={styles.manageSection}>
            <div className={styles.manageSectionTitle}><b>{t.memoryPermissions}</b><span>SHARED</span></div>
            <label>{t.contributions}<select value={memorySettings.contribution_policy} disabled={memorySettingsSaving} onChange={event => setMemorySettings(current => ({ ...current, contribution_policy: event.target.value as MemorySettings["contribution_policy"] }))}><option value="all_members">{t.allMembers}</option><option value="managers_only">{t.managersOnly}</option></select></label>
            <label>{t.exports}<select value={memorySettings.export_policy} disabled={memorySettingsSaving} onChange={event => setMemorySettings(current => ({ ...current, export_policy: event.target.value as MemorySettings["export_policy"] }))}><option value="all_members">{t.allMembers}</option><option value="managers_only">{t.managersOnly}</option><option value="disabled">{t.exportsDisabled}</option></select></label>
            <button className={styles.miniButton} disabled={memorySettingsSaving} onClick={() => void saveMemoryPermissions()}>{t.saveMemorySettings}</button>
          </div>
          <div className={styles.manageSection}><div className={styles.manageSectionTitle}><b>{t.memberList}</b><span>{groupMembers.length}</span></div>
            {!groupMembers.length && <p className={styles.emptySmall}>{t.noMembers}</p>}
            {groupMembers.map(member => { const isOwner = member.role === "owner"; const actor = selectedGroup.memberRole ?? "member"; const canChange = !isOwner && member.user_id !== userId && (actor === "owner" || (actor === "admin" && member.role !== "admin")); const roleLabel = member.role === "owner" ? t.roleOwner : member.role === "admin" ? t.roleAdmin : member.role === "moderator" ? t.roleModerator : t.roleMember; return <article className={styles.manageRow} key={member.user_id}><div className={styles.personInfo}><b>{member.profile?.display_name ?? member.profile?.handle ?? (isAr ? "عضو" : "Member")}</b><small>{member.profile?.handle ? "@" + member.profile.handle : member.user_id.slice(0, 8)}</small></div><span className={styles.rolePill}>{roleLabel}</span>{canChange && <select aria-label={(isAr ? "صلاحية " : "Role for ") + (member.profile?.display_name ?? member.profile?.handle ?? "member")} value={member.role} disabled={busy} onChange={event => void changeMemberRole(member, event.target.value as "admin" | "moderator" | "member")}><option value="member">{t.roleMember}</option><option value="moderator">{t.roleModerator}</option>{actor === "owner" && <option value="admin">{t.roleAdmin}</option>}</select>}{!isOwner && member.user_id !== userId && (actor === "owner" || (actor === "admin" && member.role !== "admin") || (actor === "moderator" && member.role === "member")) && <><button className={styles.dangerButton} disabled={busy} onClick={() => void banGroupMember(member)}>{t.banMember}</button><button className={styles.dangerButton} disabled={busy} onClick={() => void removeGroupMember(member)}>{t.removeMember}</button></>}</article>; })}
          </div>
          <div className={styles.manageSection}><div className={styles.manageSectionTitle}><b>{t.bannedMembers}</b><span>{bannedMembers.length}</span></div>
            {!bannedMembers.length && <p className={styles.emptySmall}>{t.noBans}</p>}
            {bannedMembers.map(member => <article className={styles.manageRow} key={member.user_id}><div className={styles.personInfo}><b>{member.profile?.display_name ?? member.profile?.handle ?? (isAr ? "عضو" : "Member")}</b><small>{member.profile?.handle ? "@" + member.profile.handle : member.user_id.slice(0, 8)}{member.joined_at ? " · " + relative(member.joined_at, locale) : ""}</small></div><span className={styles.rolePill}>{t.roleMember}</span><button className={styles.miniButton} disabled={busy} onClick={() => void unbanGroupMember(member)}>{t.unbanMember}</button></article>)}
          </div>

        </>}
        <div className={styles.modalActions}><button className={styles.primaryButton} onClick={() => setShowGroupManage(false)}>{t.close}</button></div>
      </section></div>}
      {showInvite && selectedGroup && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowInvite(false); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="raye2-invite-title"><button className={styles.modalClose} onClick={() => setShowInvite(false)}>×</button><span className={styles.kicker}>RAYE2 / PRIVATE INVITE</span><h2 id="raye2-invite-title">{t.invite}</h2><p className={styles.modalHint}>{selectedGroup.name} · {isAr ? "الرابط لا يكشف المجموعة في الاكتشاف العام." : "The invite does not make this private group publicly discoverable."}</p>
        {!inviteUrl ? <><label>{t.inviteExpiry}<input type="number" min="1" max="2160" value={inviteHours} onChange={event => setInviteHours(event.target.value)}/></label><label>{t.inviteUses}<input type="number" min="1" max="10000" value={inviteUses} onChange={event => setInviteUses(event.target.value)}/></label><div className={styles.modalActions}><button onClick={() => setShowInvite(false)}>{t.cancel}</button><button className={styles.primaryButton} disabled={busy} onClick={() => void createGroupInvite()}>{t.createInvite} ↗</button></div></> : <><label>{isAr ? "رابط الدعوة" : "Invite URL"}<input readOnly value={inviteUrl}/></label><div className={styles.modalActions}><button onClick={() => void navigator.clipboard?.writeText(inviteUrl)}>{t.copyInvite}</button><button onClick={() => void revokeGroupInvite()} disabled={busy}>{t.revokeInvite}</button><button className={styles.primaryButton} onClick={() => setShowInvite(false)}>{t.cancel}</button></div></>}
      </section></div>}
      {showCreateGroup && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) setShowCreateGroup(false); }}><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="raye2-group-title"><button className={styles.modalClose} onClick={() => setShowCreateGroup(false)}>×</button><span className={styles.kicker}>RAYE2 / GROUP SETUP</span><h2 id="raye2-group-title">{t.newGroup}</h2><label>{t.groupName}<input value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80}/></label><label>{t.groupDesc}<textarea value={groupDescription} onChange={event => setGroupDescription(event.target.value)} maxLength={1000} rows={3}/></label><div className={styles.visibilityPicker}><button className={groupVisibility === "public" ? styles.visibilityActive : ""} onClick={() => setGroupVisibility("public")}>◎ {t.public}</button><button className={groupVisibility === "private" ? styles.visibilityActive : ""} onClick={() => setGroupVisibility("private")}>◇ {t.private}</button></div><p className={styles.modalHint}>{groupVisibility === "private" ? t.inviteOnly + " — " + t.safety : t.publicLabel + " — " + t.safety}</p><div className={styles.modalActions}><button onClick={() => setShowCreateGroup(false)}>{t.cancel}</button><button className={styles.primaryButton} disabled={busy || groupName.trim().length < 2} onClick={() => void createGroup()}>{t.create} ↗</button></div></section></div>}
    </main>
  );
}

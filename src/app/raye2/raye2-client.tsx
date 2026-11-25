"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./raye2.module.css";
import Raye2VoiceControls from "./raye2-voice-controls";
import Raye2GroupVoiceControls from "./raye2-group-voice-controls";
import Raye2WatchTogetherControls from "./raye2-watch-together-controls";
import Raye2MessagePoll from "./raye2-message-poll";
import ShellTopBar from "@/app/raye2-shell/shell-top";
import AuthBrand from "@/app/raye2-shell/auth-brand";

type Profile = { user_id: string; handle: string | null; display_name: string | null; avatar_url?: string | null };
type Group = { id: string; name: string; slug: string; description: string; visibility: "public" | "private"; status: string; conversation_id: string | null; owner_id: string; slow_mode_seconds?: number; rules?: string; image_url?: string | null; topics?: string[]; memberRole?: "owner" | "admin" | "moderator" | "member" };
type SharedMemory = { id: string; group_id: string | null; created_by: string; source_message_id: string | null; memory_type: string; title: string; caption: string; content: Record<string, unknown>; retention_mode: "temporary" | "group_lifetime" | "preserved"; expires_at: string | null; pinned: boolean; created_at: string };
type MemorySettings = { group_id: string; contribution_policy: "all_members" | "managers_only"; export_policy: "all_members" | "managers_only" | "disabled" };
type GroupMember = { group_id: string; user_id: string; role: "owner" | "admin" | "moderator" | "member"; status: string; joined_at: string; profile?: Profile };
type JoinRequest = { id: string; group_id: string; user_id: string; note: string; status: "pending" | "approved" | "declined" | "cancelled"; created_at: string; profile?: Profile };
type Conversation = { id: string; conversation_type: "direct" | "group"; group_id: string | null; status: string; created_at: string; disappearing_seconds: number | null };
type Message = { id: string; conversation_id: string; sender_id: string; body: string; parent_message_id: string | null; edited_at: string | null; created_at: string; topic_id?: string | null; attachment?: { kind?: string; slug?: string; clip_id?: string; start_seconds?: number | null; title?: string } | null };
type GroupTopic = { id: string; slug: string; name: string; topic_position: number; message_count: number };
type ActiveRule = { rule_key: string; category: string; rule_value: unknown; description: string };
type Thread = { id: string; kind: "direct" | "group"; title: string; subtitle: string; conversationId: string; groupId: string | null; otherUserId: string | null; avatar: string; updatedAt: string; lastMessage: string; unread: number; canSend: boolean; disappearingSeconds: number | null };
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

// WhatsApp-style day divider label: Today / Yesterday / weekday + date.
function dayLabel(iso: string, locale: "en" | "ar") {
  const date = new Date(iso);
  const startOf = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const diff = Math.round((startOf(new Date()) - startOf(date)) / 86400000);
  if (diff === 0) return locale === "ar" ? "اليوم" : "Today";
  if (diff === 1) return locale === "ar" ? "أمس" : "Yesterday";
  return date.toLocaleDateString(locale === "ar" ? "ar" : "en", { weekday: "long", month: "short", day: "numeric" });
}

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
  const [memories, setMemories] = useState<SharedMemory[]>([]);
  const [memorySettings, setMemorySettings] = useState<MemorySettings>({ group_id: "", contribution_policy: "all_members", export_policy: "all_members" });
  const [memorySettingsSaving, setMemorySettingsSaving] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showGroupManage, setShowGroupManage] = useState(false);
  const [groupMembers, setGroupMembers] = useState<GroupMember[]>([]);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [bannedMembers, setBannedMembers] = useState<GroupMember[]>([]);
  const [groupManageLoading, setGroupManageLoading] = useState(false);
  const [moderationLog, setModerationLog] = useState<Array<{ id: number; action: string; actor_id: string | null; target_user_id: string | null; details: Record<string, unknown>; created_at: string }>>([]);
  const [profileDescription, setProfileDescription] = useState("");
  const [profileRules, setProfileRules] = useState("");
  const [profileTopics, setProfileTopics] = useState("");
  const [profileImageUrl, setProfileImageUrl] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [onlineUserIds, setOnlineUserIds] = useState<string[]>([]);
  const [typingUserIds, setTypingUserIds] = useState<string[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [otherDeliveredAt, setOtherDeliveredAt] = useState<string | null>(null);
  const [otherReadAt, setOtherReadAt] = useState<string | null>(null);
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
  const [pendingDeleteTopicId, setPendingDeleteTopicId] = useState<string | null>(null);
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
  const [showPollCompose, setShowPollCompose] = useState(false);
  const [pollQuestion, setPollQuestion] = useState("");
  const [pollOptions, setPollOptions] = useState<string[]>(["", ""]);
  const [pollMultiple, setPollMultiple] = useState(false);
  const [personQuery, setPersonQuery] = useState("");
  const [people, setPeople] = useState<Profile[]>([]);
  const [groupName, setGroupName] = useState("");
  const [groupDescription, setGroupDescription] = useState("");
  const [groupVisibility, setGroupVisibility] = useState<"public" | "private">("private");
  const [showCreateGroup, setShowCreateGroup] = useState(false);
  const [groupCreateStep, setGroupCreateStep] = useState<1 | 2 | 3>(1);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [savedIds, setSavedIds] = useState<string[]>([]);
  const [savedItems, setSavedItems] = useState<SavedItem[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [reactionCounts, setReactionCounts] = useState<Record<string, Record<string, number>>>({});
  const [myReactions, setMyReactions] = useState<Record<string, string[]>>({});
  const [mobilePane, setMobilePane] = useState<"list" | "chat">("list");
  useEffect(() => { document.body.dataset.raye2Thread = mobilePane === "chat" ? "open" : "list"; return () => { delete document.body.dataset.raye2Thread; }; }, [mobilePane]);

  const isAr = locale === "ar";
  const t = isAr ? {
    eyebrow:"مساحات RAYE2", title:"تواصل أقرب.", intro:"رسائلك ومجموعاتك ومجتمعاتك في مساحة واحدة.", chats:"المحادثات", groups:"مجموعاتي", discover:"اكتشف", saved:"المحفوظات", memories:"الذكريات المشتركة", invite:"دعوة أعضاء", createInvite:"إنشاء رابط دعوة", copyInvite:"نسخ الرابط", revokeInvite:"إلغاء الرابط", inviteExpiry:"صلاحية الرابط (ساعات)", inviteUses:"عدد مرات الاستخدام", inviteReady:"تم إنشاء رابط الدعوة.", inviteRevoked:"تم إلغاء رابط الدعوة.", saveMemory:"حفظ في الذكريات", memorySaved:"تم حفظ الذكرى للمجموعة.", search:"ابحث في المحادثات…", newMessage:"رسالة جديدة", newGroup:"مجموعة جديدة", groupName:"اسم المجموعة", groupDesc:"وصف مختصر (اختياري)", public:"عامة", private:"خاصة", create:"إنشاء المجموعة", cancel:"إلغاء", send:"إرسال", message:"اكتب رسالة…", emptyTitle:"اختر محادثة للبدء", emptyText:"ابدأ محادثة خاصة أو انضم إلى مجموعة.", noThreads:"لا توجد محادثات بعد", noGroups:"لم تنضم إلى مجموعات بعد", findPeople:"ابحث بالاسم أو اسم المستخدم", people:"الأعضاء", startChat:"ابدأ محادثة", join:"انضم", joined:"عضو بالفعل", publicGroups:"مجموعات عامة", noResults:"لا توجد نتائج مطابقة.", signIn:"سجّل الدخول لاستخدام Raye2", signInText:"المحادثات والمجموعات مرتبطة بحسابك وتحميها صلاحيات الوصول.", home:"الرئيسية", loading:"جارٍ التحميل…", failed:"تعذر تحميل البيانات. تحقق من اتصالك ثم أعد المحاولة.", sendError:"تعذر إرسال الرسالة.", createError:"تعذر إنشاء المجموعة. تأكد من الاسم وحاول مجددًا.", searchError:"تعذر إكمال البحث.", savedEmpty:"لا توجد رسائل محفوظة بعد.", save:"حفظ", unsave:"إزالة الحفظ", reply:"رد", edit:"تعديل", delete:"حذف", edited:"معدّلة", react:"تفاعل", privateLabel:"خاصة", publicLabel:"عامة", members:"الأعضاء", noMessages:"ابدأ المحادثة برسالة بسيطة.", back:"رجوع", groupReady:"تم إنشاء المجموعة.", chatReady:"تم فتح المحادثة.", profile:"الملف الشخصي", signOut:"تسجيل الخروج", inviteOnly:"دعوة فقط", rooms:"المساحات", safety:"تظل المجموعات الخاصة مخفية عن غير أعضائها.", loadingChat:"تحميل المحادثة…", manageGroup:"إدارة المجموعة", pendingRequests:"طلبات الانضمام", memberList:"الأعضاء", noRequests:"لا توجد طلبات معلقة.", noMembers:"لا يوجد أعضاء لعرضهم.", approve:"قبول", decline:"رفض", removeMember:"إزالة", roleOwner:"مالك", roleAdmin:"مشرف", roleModerator:"منسق", roleMember:"عضو", roleUpdated:"تم تحديث صلاحية العضو.", memberRemoved:"تمت إزالة العضو.",bannedMembers:"الأعضاء المحظورون", banMember:"حظر", unbanMember:"رفع الحظر", memberBanned:"تم حظر العضو.", memberUnbanned:"تم رفع الحظر.", noBans:"لا يوجد أعضاء محظورون.", requestReviewed:"تمت مراجعة الطلب.", preserveMemory:"احتفاظ دائم", preserveMemoryHint:"لن تنتهي هذه الذكرى تلقائيًا.",expireMemory:"تنتهي بعد ٣٠ يومًا", pinMemory:"تثبيت", unpinMemory:"إلغاء التثبيت", expirySoon:"تقترب هذه الذكرى من الانتهاء.", memoryUpdated:"تم تحديث الذكرى.", close:"إغلاق", leaveGroup:"مغادرة المجموعة", leaveGroupConfirm:"هل تريد مغادرة هذه المجموعة؟", leaveGroupDone:"تم مغادرة المجموعة.", leaveGroupOwner:"انقل الملكية قبل المغادرة.", transferOwnership:"نقل الملكية", transferConfirm:"نقل ملكية المجموعة إلى هذا العضو؟", transferDone:"تم نقل الملكية.", archiveGroup:"أرشفة المجموعة", reactivateGroup:"إعادة تنشيط المجموعة", archiveConfirm:"أرشفة المجموعة؟ سيتوقف الأعضاء عن إرسال الرسائل.", archiveDone:"تمت أرشفة المجموعة.", reactivateDone:"تمت إعادة تنشيط المجموعة.", statusArchived:"مؤرشفة", statusReadOnly:"للقراءة فقط", lifecycle:"دورة حياة المجموعة", lifecycleError:"تعذر تحديث حالة المجموعة.", sent:"أُرسلت", delivered:"وصلت", seen:"شوهدت", searchMessages:"البحث في الرسائل", searchPlaceholder:"ابحث داخل هذه المحادثة…", noSearchResults:"لا توجد نتائج مطابقة.", pinnedMessages:"الرسائل المثبتة", pinMessage:"تثبيت", unpinMessage:"إلغاء التثبيت", messagePinned:"تم تثبيت الرسالة.", messageUnpinned:"تم إلغاء تثبيت الرسالة.", report:"إبلاغ", block:"حظر", reportTitle:"الإبلاغ عن محتوى أو حساب", reportReason:"سبب الإبلاغ", reportDetails:"تفاصيل إضافية (اختياري)", reportSent:"تم إرسال البلاغ للمراجعة.", blockConfirm:"هل تريد حظر هذا الحساب؟ لن يتمكن أي منكما من بدء محادثة جديدة.", blocked:"تم حظر الحساب.", reasons:{spam:"رسائل مزعجة",harassment:"مضايقة",hate:"خطاب كراهية",impersonation:"انتحال",copyright:"حقوق ملكية",other:"سبب آخر"}, notifications:"الإشعارات", messageRequests:"طلبات المراسلة", allowRequests:"السماح بطلبات مراسلة جديدة", requestPending:"بانتظار الرد", requestSent:"تم إرسال طلب المراسلة.", requestAccepted:"تم قبول الطلب وفتح المحادثة.", requestDeclined:"تم رفض طلب المراسلة.", requestUnavailable:"هذا الحساب لا يستقبل طلبات مراسلة جديدة.", acceptRequest:"قبول", declineRequest:"رفض", noMessageRequests:"لا توجد طلبات مراسلة معلقة.", contactSettings:"من يمكنه بدء محادثة معك؟", allowVoiceCalls:"السماح بالمكالمات الصوتية الخاصة", notificationSettings:"إعدادات الإشعارات", directNotifications:"رسائل خاصة", groupNotifications:"رسائل المجموعات", quietHours:"ساعات الهدوء", quietHoursEnable:"تفعيل ساعات الهدوء", quietStart:"من", quietEnd:"إلى", groupOverrides:"إعدادات إشعارات كل مجموعة", inherit:"افتراضي", allNotifications:"الكل", muted:"مكتومة", noNotifications:"لا توجد إشعارات جديدة.", markAllRead:"تحديد الكل كمقروء", notificationSaved:"تم حفظ إعدادات الإشعارات.",eventReminders:"تذكيرات الفعاليات", memoryPermissions:"صلاحيات الذكريات المشتركة", contributions:"من يمكنه إضافة الذكريات؟", exports:"من يمكنه تصدير الذكريات؟", allMembers:"كل الأعضاء", managersOnly:"المشرفون فقط", exportsDisabled:"التصدير معطّل", saveMemorySettings:"حفظ الصلاحيات", memorySettingsSaved:"تم تحديث صلاحيات الذكريات.", exportMemories:"تصدير JSON", exportNote:"يحتوي التصدير على النصوص والبيانات الوصفية فقط، ولا ينسخ ملفات الوسائط.",poll:"استطلاع",pollNew:"إنشاء استطلاع",pollQuestion:"السؤال",pollOption:"خيار",pollAddOption:"إضافة خيار",pollMultiple:"السماح باختيارات متعددة",pollCreate:"نشر الاستطلاع",pollCreated:"تم نشر الاستطلاع.",pollError:"تعذر إنشاء الاستطلاع.",pollQuestionRequired:"اكتب سؤال الاستطلاع.",pollOptionsRequired:"أضف خيارين على الأقل.",disappearing:"الرسائل المؤقتة",disappearingNone:"معطّلة",disappearingDay:"٢٤ ساعة",disappearingWeek:"٧ أيام",disappearingMonth:"٣٠ يومًا",disappearingOn:"تم تشغيل الرسائل المؤقتة.",disappearingOff:"تم إيقاف الرسائل المؤقتة.",disappearingError:"تعذر تحديث الرسائل المؤقتة.",disappearingBadge:"تختفي تلقائيًا",slowMode:"الوضع البطيء",slowModeOff:"معطّل",slowModeSaved:"تم تحديث الوضع البطيء.",slowModeError:"تعذر تحديث الوضع البطيء.",slowModeNote:"ثوانٍ بين رسائل العضو نفسه.",groupProfile:"ملف المجموعة",groupDescription:"الوصف",groupRules:"قواعد المجموعة",groupTopics:"المواضيع (افصل بينها بفواصل)",groupImageUrl:"رابط صورة الغلاف",groupProfileSave:"حفظ الملف",groupProfileSaved:"تم تحديث ملف المجموعة.",groupProfileError:"تعذر تحديث ملف المجموعة.",moderationLog:"سجل الإشراف",noModerationLog:"لا يوجد نشاط إشراف بعد.",logMemberAdded:"عضو جديد",logMemberRemoved:"إزالة عضو",logRoleChanged:"تغيير صلاحية",logMemberBanned:"حظر عضو",logMemberUnbanned:"رفع حظر",logMemberStatusChanged:"تغيير حالة العضو",logOwnershipTransferred:"نقل الملكية",logGroupStatusChanged:"تغيير حالة المجموعة",limitsLabel:"حدود المنصة المفعّلة",limitsHint:"تُضبط هذه الحدود من مسؤولي المنصة ويطبّقها الخادم."
  ,topics:"القنوات",topicAll:"كل الرسائل",topicGeneral:"عام",newTopic:"قناة جديدة",topicName:"اسم القناة",createTopic:"إنشاء",deleteTopic:"حذف",manageTopics:"إدارة القنوات",noTopics:"لا توجد قنوات بعد.",topicCreated:"تم إنشاء القناة.",topicDeleted:"تم حذف القناة.",topicError:"تعذر تحديث القناة.",postInTopic:"منشور في"} : {
    eyebrow:"RAYE2 / YOUR SPACES", title:"Closer conversations.", intro:"Your messages, groups and communities — connected in one place.", chats:"Chats", groups:"My groups", discover:"Discover", saved:"Saved", memories:"Shared Memories", invite:"Invite members", createInvite:"Create invite link", copyInvite:"Copy link", revokeInvite:"Revoke link", inviteExpiry:"Link expiry (hours)", inviteUses:"Maximum uses", inviteReady:"Invite link created.", inviteRevoked:"Invite link revoked.", saveMemory:"Save to Memories", memorySaved:"Saved to group memories.", search:"Search conversations…", newMessage:"New message", newGroup:"New group", groupName:"Group name", groupDesc:"A short description (optional)", public:"Public", private:"Private", create:"Create group", cancel:"Cancel", send:"Send", message:"Write a message…", emptyTitle:"Choose a conversation", emptyText:"Start a private chat or join a community group.", noThreads:"No conversations yet", noGroups:"You haven't joined any groups yet", findPeople:"Search by name or handle", people:"People", startChat:"Message", join:"Join group", joined:"Joined", publicGroups:"Public groups", noResults:"No matching results.", signIn:"Sign in to use Raye2", signInText:"Your conversations and groups are connected to your account and protected by access controls.", home:"Home", loading:"Loading…", failed:"Couldn't load your spaces. Check your connection and try again.", sendError:"Message couldn't be sent.", createError:"Couldn't create the group. Check the name and try again.", searchError:"Search couldn't be completed.", savedEmpty:"No saved messages yet.", save:"Save", unsave:"Unsave", reply:"Reply", edit:"Edit", delete:"Delete", edited:"edited", react:"React", privateLabel:"Private", publicLabel:"Public", members:"members", noMessages:"Start the conversation with a message.", back:"Back", groupReady:"Your group is ready.", chatReady:"Conversation opened.", profile:"Profile", signOut:"Sign out", inviteOnly:"Invite only", rooms:"Spaces", safety:"Private groups stay hidden from people who aren't members.", loadingChat:"Loading conversation…", manageGroup:"Manage group", pendingRequests:"Join requests", memberList:"Members", noRequests:"No pending requests.", noMembers:"No members to show.", approve:"Approve", decline:"Decline", removeMember:"Remove", roleOwner:"Owner", roleAdmin:"Admin", roleModerator:"Moderator", roleMember:"Member", roleUpdated:"Member permissions updated.", memberRemoved:"Member removed.",bannedMembers:"Banned members", banMember:"Ban", unbanMember:"Unban", memberBanned:"Member banned.", memberUnbanned:"Ban lifted.", noBans:"No banned members.", requestReviewed:"Request reviewed.", preserveMemory:"Preserve permanently", preserveMemoryHint:"This memory will not expire automatically.",expireMemory:"Expire in 30 days", pinMemory:"Pin", unpinMemory:"Unpin", expirySoon:"This memory is approaching expiry.", memoryUpdated:"Memory updated.", close:"Close", leaveGroup:"Leave group", leaveGroupConfirm:"Leave this group?", leaveGroupDone:"You left the group.", leaveGroupOwner:"Transfer ownership before leaving.", transferOwnership:"Transfer ownership", transferConfirm:"Transfer group ownership to this member?", transferDone:"Ownership transferred.", archiveGroup:"Archive group", reactivateGroup:"Reactivate group", archiveConfirm:"Archive this group? Members will not be able to send messages.", archiveDone:"Group archived.", reactivateDone:"Group reactivated.", statusArchived:"Archived", statusReadOnly:"Read only", lifecycle:"Group lifecycle", lifecycleError:"Could not update the group status.", sent:"Sent", delivered:"Delivered", seen:"Seen", searchMessages:"Search messages", searchPlaceholder:"Search this conversation…", noSearchResults:"No matching messages.", pinnedMessages:"Pinned messages", pinMessage:"Pin", unpinMessage:"Unpin", messagePinned:"Message pinned.", messageUnpinned:"Message unpinned.", report:"Report", block:"Block", reportTitle:"Report content or account", reportReason:"Report reason", reportDetails:"Additional details (optional)", reportSent:"Your report was submitted for review.", blockConfirm:"Block this account? Neither of you will be able to start a new conversation.", blocked:"Account blocked.", reasons:{spam:"Spam",harassment:"Harassment",hate:"Hate speech",impersonation:"Impersonation",copyright:"Copyright",other:"Other"}, notifications:"Notifications", messageRequests:"Message requests", allowRequests:"Allow new message requests", requestPending:"Awaiting response", requestSent:"Message request sent.", requestAccepted:"Request accepted. Conversation opened.", requestDeclined:"Message request declined.", requestUnavailable:"This account is not accepting new message requests.", acceptRequest:"Accept", declineRequest:"Decline", noMessageRequests:"No pending message requests.", contactSettings:"Who can start a conversation with you?", allowVoiceCalls:"Allow private voice calls", notificationSettings:"Notification settings", directNotifications:"Direct messages", groupNotifications:"Group messages", quietHours:"Quiet hours", quietHoursEnable:"Enable quiet hours", quietStart:"From", quietEnd:"Until", groupOverrides:"Per-group notifications", inherit:"Default", allNotifications:"All", muted:"Muted", noNotifications:"All caught up.", markAllRead:"Mark all as read", notificationSaved:"Notification settings saved.",eventReminders:"Event reminders", memoryPermissions:"Shared Memories permissions", contributions:"Who can add memories?", exports:"Who can export memories?", allMembers:"All members", managersOnly:"Managers only", exportsDisabled:"Export disabled", saveMemorySettings:"Save permissions", memorySettingsSaved:"Memory permissions updated.", exportMemories:"Export JSON", exportNote:"Exports include text and metadata only; media files are not copied.",poll:"Poll",pollNew:"New poll",pollQuestion:"Question",pollOption:"Option",pollAddOption:"Add option",pollMultiple:"Allow multiple choices",pollCreate:"Post poll",pollCreated:"Poll posted.",pollError:"Couldn't create the poll.",pollQuestionRequired:"Enter a poll question.",pollOptionsRequired:"Add at least two options.",disappearing:"Disappearing messages",disappearingNone:"Off",disappearingDay:"24 hours",disappearingWeek:"7 days",disappearingMonth:"30 days",disappearingOn:"Disappearing messages on.",disappearingOff:"Disappearing messages off.",disappearingError:"Could not update disappearing messages.",disappearingBadge:"Disappears",slowMode:"Slow mode",slowModeOff:"Off",slowModeSaved:"Slow mode updated.",slowModeError:"Could not update slow mode.",slowModeNote:"Seconds between messages from the same member.",groupProfile:"Group profile",groupDescription:"Description",groupRules:"Group rules",groupTopics:"Topics (comma-separated)",groupImageUrl:"Cover image URL",groupProfileSave:"Save profile",groupProfileSaved:"Group profile updated.",groupProfileError:"Could not update the group profile.",moderationLog:"Moderation log",noModerationLog:"No moderation activity yet.",logMemberAdded:"Member added",logMemberRemoved:"Member removed",logRoleChanged:"Role changed",logMemberBanned:"Member banned",logMemberUnbanned:"Ban lifted",logMemberStatusChanged:"Member status changed",logOwnershipTransferred:"Ownership transferred",logGroupStatusChanged:"Group status changed",limitsLabel:"Active platform limits",limitsHint:"These limits are set by platform administrators and enforced by the server."
  ,topics:"Channels",topicAll:"All messages",topicGeneral:"General",newTopic:"New channel",topicName:"Channel name",createTopic:"Create",deleteTopic:"Delete",manageTopics:"Manage channels",noTopics:"No channels yet.",topicCreated:"Channel created.",topicDeleted:"Channel deleted.",topicError:"Could not update the channel.",postInTopic:"Posted in"};

  const groupWizard = isAr ? {
    step: "الخطوة", of: "من", basicsTitle: "ابدأ مجموعتك", basicsHint: "اختر اسمًا واضحًا وأضف وصفًا قصيرًا يعرّف الأعضاء بمجموعتك.",
    privacyTitle: "اختر الخصوصية", privacyHint: "حدّد كيف سيعثر الأشخاص على مجموعتك وينضمون إليها.",
    reviewTitle: "راجع إعداداتك", reviewHint: "تأكد من التفاصيل قبل إنشاء المجموعة. يمكنك دعوة الأعضاء وإدارة الأدوار بعدها.",
    next: "التالي", back: "السابق", steps: ["الأساسيات", "الخصوصية", "المراجعة"],
    publicHint: "يمكن للجميع العثور على المجموعة وطلب الانضمام إليها.",
    privateHint: "تظل المجموعة مخفية، وينضم إليها الأعضاء عبر الدعوة.",
    visibility: "الخصوصية", noDescription: "لم تتم إضافة وصف."
  } : {
    step: "Step", of: "of", basicsTitle: "Start your group", basicsHint: "Choose a clear name and add a short description so people know what your group is about.",
    privacyTitle: "Choose privacy", privacyHint: "Decide how people can discover your group and become members.",
    reviewTitle: "Review your setup", reviewHint: "Check the details before creating your group. You can invite members and manage roles next.",
    next: "Continue", back: "Back", steps: ["Basics", "Privacy", "Review"],
    publicHint: "Anyone can discover the group and request to join.",
    privateHint: "The group stays hidden. Members join through an invitation.",
    visibility: "Privacy", noDescription: "No description added."
  };

  useEffect(() => {
    const match = document.cookie.match(/(?:^|; )raye2_locale=(en|ar)(?:;|$)/);
    if (match) setLocale(match[1] as Locale);
  }, []);

  useEffect(() => {
    if (!supabase) return;
    // Best-effort maintenance sweep so Admin-configured message retention runs as people open their spaces.
    void supabase.rpc("raye2_run_maintenance");
  }, [supabase]);

  const loadData = useCallback(async (uid: string) => {
    if (!supabase) return;
    const [{ data: ownProfile }, { data: memberships }, { data: memberConversations }, { data: publicGroups }] = await Promise.all([
      supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").eq("user_id", uid).maybeSingle(),
      supabase.from("raye2_group_members").select("group_id,role").eq("user_id", uid).eq("status", "active"),
      supabase.from("raye2_conversation_members").select("conversation_id,last_read_at,conversations:raye2_conversations!inner(id,conversation_type,group_id,status,created_at,disappearing_seconds)").eq("user_id", uid),
      supabase.from("raye2_groups").select("id,name,slug,description,visibility,status,conversation_id,owner_id,slow_mode_seconds,rules,image_url,topics").eq("visibility", "public").in("status", ["active", "read_only"]).order("created_at", { ascending: false }).limit(40)
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
      ? await supabase.from("raye2_groups").select("id,name,slug,description,visibility,status,conversation_id,owner_id,slow_mode_seconds,rules,image_url,topics").in("id", groupIds)
      : { data: [] };
    const roleMap = new Map<string, NonNullable<Group["memberRole"]>>((memberships ?? []).map((row: { group_id: string; role: NonNullable<Group["memberRole"]> }) => [row.group_id, row.role]));
    const groupRows = ((ownGroups ?? []) as Group[]).map(group => ({ ...group, memberRole: roleMap.get(group.id) ?? "member" }));
    setGroups(groupRows);
    setDiscoverGroups((publicGroups ?? []) as Group[]);
    const groupMap = new Map(groupRows.map(group => [group.id, group]));
    const conversationIds = conversationRows.map(row => row.id);
    const [{ data: roster }, { data: messageRows }] = await Promise.all([
      conversationIds.length ? supabase.from("raye2_conversation_members").select("conversation_id,user_id").in("conversation_id", conversationIds) : Promise.resolve({ data: [] }),
      conversationIds.length ? supabase.from("raye2_messages").select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at,topic_id,attachment").in("conversation_id", conversationIds).order("created_at", { ascending: false }).limit(600) : Promise.resolve({ data: [] })
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
      return { id: conversation.id, kind: conversation.conversation_type, title, subtitle: conversation.conversation_type === "group" ? (group?.visibility === "public" ? t.publicLabel : t.privateLabel) : (other?.handle ? "@" + other.handle : t.chats), conversationId: conversation.id, groupId: conversation.group_id, otherUserId: conversation.conversation_type === "direct" ? (otherId ?? null) : null, avatar: initials(title), updatedAt: last?.created_at ?? conversation.created_at, lastMessage: last?.body ?? "", unread, canSend: conversation.conversation_type === "direct" || group?.status === "active", disappearingSeconds: conversation.disappearing_seconds ?? null };
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
          .select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at,attachment")
          .eq("conversation_id", selected.conversationId).in("id", ids);
        if (active) setPinnedMessages(((result.data ?? []) as PinnedMessage[]).sort((a,b) => a.created_at.localeCompare(b.created_at)));
      });
    return () => { active = false; };
  }, [supabase, selected?.conversationId]);

  useEffect(() => {
    const groupId = selectedGroup?.id;
    // A topic ID belongs to one group only; never carry it into another group's conversation.
    setGroupTopics([]);
    setActiveTopicId(null);
    setShowTopicManage(false);
    setNewTopicName("");
    setPendingDeleteTopicId(null);
    if (!supabase || !groupId) return;
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

  useEffect(() => {
    if (!supabase || !userId || !selected || selected.kind !== "direct") { setOtherDeliveredAt(null); setOtherReadAt(null); return; }
    const conversationId = selected.conversationId;
    let active = true;
    const refresh = async () => {
      const { data } = await supabase.rpc("raye2_message_receipt_status", { p_conversation_id: conversationId });
      if (!active) return;
      const row = Array.isArray(data) ? data[0] : data;
      setOtherDeliveredAt((row as { other_delivered_at: string | null } | null)?.other_delivered_at ?? null);
      setOtherReadAt((row as { other_read_at: string | null } | null)?.other_read_at ?? null);
    };
    void refresh();
    void supabase.rpc("raye2_mark_messages_delivered", { p_conversation_id: conversationId });
    const channel = supabase.channel("raye2:receipts:" + conversationId)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "raye2_message_deliveries", filter: "conversation_id=eq." + conversationId }, () => { void refresh(); })
      .subscribe();
    return () => { active = false; void supabase.removeChannel(channel); };
    // Re-run only when the conversation or message count changes; `selected` is a derived object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase, userId, selected?.conversationId, selected?.kind, currentMessages.length]);

  async function searchConversationMessages() {
    if (!supabase || !selected || !messageSearch.trim() || messageSearchBusy) return;
    setMessageSearchBusy(true);
    try {
      const term = messageSearch.trim().replace(/[\\%_]/g, "\\  async function blockUser(targetUserId: string) {").slice(0, 120);
      const { data, error } = await supabase.from("raye2_messages")
        .select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at,attachment")
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
    setProfileDescription(selectedGroup.description ?? "");
    setProfileRules(selectedGroup.rules ?? "");
    setProfileTopics((selectedGroup.topics ?? []).join(", "));
    setProfileImageUrl(selectedGroup.image_url ?? "");
    let alive = true;
    setGroupManageLoading(true);
    void (async () => {
      const [{ data: memberRows, error: memberError }, { data: requestRows, error: requestError }, { data: memoryPolicy, error: memoryPolicyError }, { data: banRows, error: banError }, { data: logRows }] = await Promise.all([
        supabase.from("raye2_group_members").select("group_id,user_id,role,status,joined_at").eq("group_id", selectedGroup.id).eq("status", "active").order("joined_at", { ascending: true }),
        supabase.from("raye2_group_join_requests").select("id,group_id,user_id,note,status,created_at").eq("group_id", selectedGroup.id).eq("status", "pending").order("created_at", { ascending: true }),
        supabase.from("raye2_group_memory_settings").select("group_id,contribution_policy,export_policy").eq("group_id", selectedGroup.id).maybeSingle(),
        supabase.rpc("raye2_get_group_bans", { p_group_id: selectedGroup.id, p_limit: 200 }),
        supabase.rpc("raye2_list_group_moderation_log", { p_group_id: selectedGroup.id, p_limit: 60 })
      ]);
      if (!alive) return;
      if (memoryPolicy) setMemorySettings(memoryPolicy as MemorySettings);
      setModerationLog((logRows ?? []) as typeof moderationLog);
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
      setShowCreateGroup(false); setGroupCreateStep(1); setGroupName(""); setGroupDescription(""); setSelectedId(created?.conversation_id ?? null); setTab("groups"); setMobilePane("chat"); setStatus(t.groupReady);
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

  async function leaveGroup() {
    if (!supabase || !selectedGroup || busy || selectedGroup.memberRole === "owner") return;
    if (!window.confirm(t.leaveGroupConfirm)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_leave_group", { p_group_id: selectedGroup.id });
      if (error) throw error;
      setShowGroupManage(false);
      setSelectedId(null);
      setMobilePane("list");
      setStatus(t.leaveGroupDone);
      if (userId) await loadData(userId);
    } catch { setStatus(t.lifecycleError); }
    finally { setBusy(false); }
  }

  async function transferOwnership(member: GroupMember) {
    if (!supabase || !selectedGroup || busy || selectedGroup.memberRole !== "owner" || member.user_id === userId) return;
    if (!window.confirm(t.transferConfirm)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_transfer_group_ownership", { p_group_id: selectedGroup.id, p_new_owner: member.user_id });
      if (error) throw error;
      setStatus(t.transferDone);
      if (userId) await loadData(userId);
    } catch { setStatus(t.lifecycleError); }
    finally { setBusy(false); }
  }

  async function setGroupStatus(next: "active" | "read_only" | "archived") {
    if (!supabase || !selectedGroup || busy || selectedGroup.memberRole !== "owner") return;
    if (next === "archived" && !window.confirm(t.archiveConfirm)) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_set_group_status", { p_group_id: selectedGroup.id, p_status: next });
      if (error) throw error;
      setGroups(current => current.map(group => group.id === selectedGroup.id ? { ...group, status: next } : group));
      setStatus(next === "archived" ? t.archiveDone : t.reactivateDone);
    } catch { setStatus(t.lifecycleError); }
    finally { setBusy(false); }
  }

  async function setSlowMode(seconds: number) {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || busy) return;
    setBusy(true); setStatus("");
    try {
      const { error } = await supabase.rpc("raye2_set_group_slow_mode", { p_group_id: selectedGroup.id, p_seconds: seconds });
      if (error) throw error;
      setGroups(current => current.map(group => group.id === selectedGroup.id ? { ...group, slow_mode_seconds: seconds } : group));
      setStatus(t.slowModeSaved);
    } catch { setStatus(t.slowModeError); }
    finally { setBusy(false); }
  }

  async function setDisappearing(seconds: number | null) {
    if (!supabase || !selected || busy) return;
    if (selected.kind === "group" && !canManageSelectedGroup) return;
    setBusy(true); setStatus("");
    try {
      const { error } = await supabase.rpc("raye2_set_conversation_disappearing", { p_conversation_id: selected.conversationId, p_seconds: seconds });
      if (error) throw error;
      setThreads(current => current.map(thread => thread.id === selected.id ? { ...thread, disappearingSeconds: seconds } : thread));
      setStatus(seconds ? t.disappearingOn : t.disappearingOff);
    } catch { setStatus(t.disappearingError); }
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

  async function refreshMemory(memoryId: string) {
    if (!supabase) return;
    const { data } = await supabase.from("raye2_shared_memories")
      .select("id,group_id,created_by,source_message_id,memory_type,title,caption,content,retention_mode,expires_at,pinned,created_at")
      .eq("id", memoryId).maybeSingle();
    if (data) setMemories(current => current.map(item => item.id === memoryId ? data as SharedMemory : item));
  }
  async function preserveMemory(memory: SharedMemory) {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_preserve_memory", { p_memory_id: memory.id });
      if (error) throw error;
      await refreshMemory(memory.id);
      setStatus(t.memoryUpdated);
    } catch { setStatus(t.searchError); }
    finally { setBusy(false); }
  }
  async function setMemoryExpiry(memory: SharedMemory, days: number) {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.rpc("raye2_set_memory_expiry", { p_memory_id: memory.id, p_days: days });
      if (error) throw error;
      await refreshMemory(memory.id);
      setStatus(t.memoryUpdated);
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
      if (error || !data) throw error ?? new Error(isAr ? "التصدير غير متاح" : "Export unavailable");
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
      if (error || !data) throw error ?? new Error(isAr ? "لا تملك صلاحية على الذكريات" : "Memory permission denied");
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
      const { data, error } = await supabase.from("raye2_messages").insert({ conversation_id: selected.conversationId, sender_id: userId, body, parent_message_id: optimistic.parent_message_id, topic_id: activeTopicId ?? null }).select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at,topic_id,attachment").single();
      if (error) throw error;
      setMessages(current => [...current.filter(message => message.id !== tempId), data as Message]);
      setThreads(current => current.map(thread => thread.id === selected.id ? { ...thread, lastMessage: body, updatedAt: (data as Message).created_at } : thread).sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()));
    } catch {
      setMessages(current => current.filter(message => message.id !== tempId)); setCompose(body); setStatus(t.sendError);
    } finally { setBusy(false); }
  }

  async function createPoll() {
    if (!supabase || !selected || !userId || busy || !selected.canSend) return;
    const question = pollQuestion.trim();
    const options = pollOptions.map(option => option.trim()).filter(Boolean);
    if (!question) { setStatus(t.pollQuestionRequired); return; }
    if (options.length < 2) { setStatus(t.pollOptionsRequired); return; }
    setBusy(true); setStatus("");
    try {
      const { data, error } = await supabase.rpc("raye2_create_message_poll", {
        p_conversation_id: selected.conversationId, p_question: question, p_options: options, p_allow_multiple: pollMultiple
      });
      if (error) throw error;
      const { data: created } = await supabase.from("raye2_messages")
        .select("id,conversation_id,sender_id,body,parent_message_id,edited_at,created_at,topic_id,attachment")
        .eq("id", data).single();
      if (created) setMessages(current => [...current, created as Message]);
      setShowPollCompose(false); setPollQuestion(""); setPollOptions(["", ""]); setPollMultiple(false);
      setStatus(t.pollCreated);
    } catch { setStatus(t.pollError); }
    finally { setBusy(false); }
  }

  async function saveGroupProfile() {
    if (!supabase || !selectedGroup || !canManageSelectedGroup || profileSaving) return;
    setProfileSaving(true); setStatus("");
    try {
      const { error } = await supabase.rpc("raye2_update_group_profile", {
        p_group_id: selectedGroup.id,
        p_description: profileDescription.trim(),
        p_image_url: profileImageUrl.trim(),
        p_rules: profileRules.trim(),
        p_topics: profileTopics.split(",").map(topic => topic.trim()).filter(Boolean).slice(0, 12)
      });
      if (error) throw error;
      setGroups(current => current.map(group => group.id === selectedGroup.id
        ? { ...group, description: profileDescription.trim(), image_url: profileImageUrl.trim() || null, rules: profileRules.trim(), topics: profileTopics.split(",").map(topic => topic.trim()).filter(Boolean).slice(0, 12) }
        : group));
      setStatus(t.groupProfileSaved);
    } catch { setStatus(t.groupProfileError); }
    finally { setProfileSaving(false); }
  }

  function moderationLabel(action: string) {
    const map: Record<string, string> = {
      member_added: t.logMemberAdded, member_removed: t.logMemberRemoved, role_changed: t.logRoleChanged,
      member_banned: t.logMemberBanned, member_unbanned: t.logMemberUnbanned, member_status_changed: t.logMemberStatusChanged,
      ownership_transferred: t.logOwnershipTransferred, group_status_changed: t.logGroupStatusChanged
    };
    return map[action] ?? action;
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
      setPendingDeleteTopicId(null);
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

  const reactionOptions = ["❤️", "👍", "😂", "✨", "🔥"];
  if (!supabase) return <main className={styles.authGate}><AuthBrand /><h1>{t.signIn}</h1><p>{t.signInText}</p><Link className={styles.primaryButton} href="/community#join">{t.signIn}</Link></main>;
  if (!userId) return <main className={styles.authGate}><AuthBrand /><h1>{t.signIn}</h1><p>{t.signInText}</p><Link className={styles.primaryButton} href="/community#join">{t.signIn}</Link><Link className={styles.backLink} href="/">{t.home}</Link></main>;

  return (
    <main className={styles.page} dir={isAr ? "rtl" : "ltr"} lang={locale}>
      <div className={styles.voiceGlobalWrap}>{supabase && userId && <Raye2VoiceControls supabase={supabase} userId={userId} conversationId={selected?.kind === "direct" ? selected.conversationId : null} peerUserId={selected?.kind === "direct" ? selected.otherUserId : null} peerName={selected?.title ?? ""} locale={locale} />}</div>
      <ShellTopBar locale={isAr ? "ar" : "en"} member={profile?.handle ? { handle: profile.handle } : null} onSignOut={() => void supabase.auth.signOut().then(() => router.push("/"))} />
                  <section className={styles.workspace}>
<nav className={styles.rail} aria-label={t.groups}>
          <button className={`${styles.railItem} ${tab !== "groups" && tab !== "discover" ? styles.railActive : ""}`} title={t.chats} aria-label={t.chats} onClick={() => { setTab("chats"); setMobilePane("list"); }}><img src="/brand/raye2-mark.png" alt="" width={30} height={30} /></button>
          <i className={styles.railDivider} />
          {groups.filter(group => group.conversation_id).map(group => { const unread = threads.find(thread => thread.conversationId === group.conversation_id)?.unread ?? 0; return <button key={group.id} className={`${styles.railItem} ${selected?.groupId === group.id ? styles.railActive : ""}`} title={group.name} aria-label={group.name} onClick={() => { setSelectedId(group.conversation_id as string); setTab("groups"); setMobilePane("chat"); }}>{initials(group.name)}{unread > 0 ? <i className={styles.railBadge}>{unread > 9 ? "9+" : unread}</i> : null}</button>; })}
          <button className={`${styles.railItem} ${styles.railAdd}`} title={t.newGroup} aria-label={t.newGroup} onClick={() => setShowCreateGroup(true)}>+</button>
          <button className={`${styles.railItem} ${styles.railAdd} ${tab === "discover" ? styles.railActive : ""}`} title={t.discover} aria-label={t.discover} onClick={() => { setTab("discover"); setMobilePane("list"); }}>&#9678;</button>
        </nav>
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
              <div className={styles.memoryTop}><span>{memory.pinned ? (isAr ? "مثبّتة" : "PINNED") : (isAr ? "ذكرى مشتركة" : "SHARED MEMORY")}</span><small>{relative(memory.created_at, locale)}</small></div>
              <b>{memory.title || (isAr ? "ذكرى مشتركة" : "Shared memory")}</b>
              <p>{String(memory.content.body ?? memory.caption ?? "")}</p>
              <small>{memory.retention_mode === "preserved" ? (isAr ? "محفوظة" : "Preserved") : memory.expires_at ? (isAr ? "تنتهي " : "Expires ") + relative(memory.expires_at, locale) : (isAr ? "مرتبطة بعمر المجموعة" : "Group lifetime")}</small>
              {memory.expires_at && new Date(memory.expires_at).getTime() - Date.now() < 7 * 86400000 && memory.retention_mode !== "preserved" && <small className={styles.expiryWarning}>⚠ {t.expirySoon}</small>}
              <div className={styles.memoryActions}>
                {memory.created_by === userId || ["owner","admin","moderator"].includes(groups.find(group => group.id === memory.group_id)?.memberRole ?? "member") ? <><button className={styles.miniButton} disabled={busy || memory.retention_mode === "preserved"} onClick={() => void preserveMemory(memory)}>✦ {t.preserveMemory}</button><button className={styles.miniButton} disabled={busy || memory.retention_mode === "temporary"} onClick={() => void setMemoryExpiry(memory, 30)}>⏳ {t.expireMemory}</button></> : null}
                {["owner","admin","moderator"].includes(groups.find(group => group.id === memory.group_id)?.memberRole ?? "member") && <button className={styles.miniButton} disabled={busy} onClick={() => void updateSharedMemory(memory, { pinned: !memory.pinned })}>{memory.pinned ? t.unpinMemory : t.pinMemory}</button>}
                {groups.find(group => group.id === memory.group_id)?.conversation_id && <button className={styles.miniButton} onClick={() => { const group = groups.find(item => item.id === memory.group_id); if (group?.conversation_id) { setSelectedId(group.conversation_id); setTab("groups"); setMobilePane("chat"); } }}>{isAr ? "فتح المجموعة" : "Open group"}</button>}
              </div>
            </article>)}
            {!memories.length && <p className={styles.emptySmall}>{isAr ? "لا توجد ذكريات مشتركة بعد." : "No shared memories yet."}</p>}
          </div> : tab === "saved" ? <div className={styles.threadList}>{savedMessages.map(message => <button className={styles.thread} key={message.id} onClick={() => { const thread = message.originalConversationId ? threads.find(item => item.conversationId === message.originalConversationId) : null; if (thread) { setSelectedId(thread.id); setTab(thread.kind === "group" ? "groups" : "chats"); setMobilePane("chat"); } }}><div className={styles.avatar}>{initials(profiles[message.senderId]?.display_name ?? "R")}</div><div className={styles.threadText}><b>{profiles[message.senderId]?.display_name ?? (isAr ? "رسالة محفوظة" : "Saved message")}</b><span>{message.body || (isAr ? "تم الاحتفاظ بالنسخة المحفوظة" : "Preserved saved copy")}</span></div></button>)}{!savedMessages.length && <p className={styles.emptySmall}>{t.savedEmpty}</p>}</div> : <div className={styles.threadList}>
            {tab === "groups" && <button className={styles.createGroupButton} onClick={() => { setGroupCreateStep(1); setShowCreateGroup(true); }}>＋ {t.newGroup}</button>}
            {visibleThreads.map(thread => <button key={thread.id} className={`${styles.thread} ${selectedId === thread.id ? styles.selectedThread : ""}`} onClick={() => { setSelectedId(thread.id); setMobilePane("chat"); }}>
              <div className={styles.avatar}>{thread.avatar}</div><div className={styles.threadText}><b>{thread.title}</b><span>{thread.lastMessage || thread.subtitle}</span></div><div className={styles.threadMeta}><time>{relative(thread.updatedAt, locale)}</time>{thread.unread > 0 && <i>{thread.unread}</i>}</div>
            </button>)}
            {!visibleThreads.length && <p className={styles.emptySmall}>{tab === "groups" ? t.noGroups : t.noThreads}</p>}
            <p className={styles.privacyNote}>◇ {t.safety}</p>
          </div>}
        </aside>
        <section className={`${styles.conversation} ${mobilePane === "list" ? styles.hideMobile : ""}`}>
          {selected ? <>
            <div className={styles.chatHeader}><button className={styles.backButton} onClick={() => setMobilePane("list")}>← {t.back}</button><div className={styles.avatar}>{selected.avatar}</div><div className={styles.chatHeading}><h2>{selected.title}</h2><span>{typingUserIds.length ? (isAr ? "يكتب الآن…" : "Typing…") : (onlineUserIds.filter(id => id !== userId).length ? (isAr ? onlineUserIds.filter(id => id !== userId).length + " متصل" : onlineUserIds.filter(id => id !== userId).length + " online") : selected.subtitle)}</span>{selected.disappearingSeconds ? <span className={styles.ephemeralBadge}>⏳ {t.disappearingBadge}</span> : null}</div><button className={styles.iconButton} title={t.saved} onClick={() => setTab("saved")}>⌑</button><button className={styles.iconButton} title={t.searchMessages} onClick={() => { setMessageSearchOpen(value => !value); setMessageSearchResults([]); }}>⌕</button>{selected?.kind === "direct" && selected.otherUserId && <><button className={styles.dangerButton} onClick={() => setReportTarget({ type: "user", id: selected.otherUserId! })}>{t.report}</button><button className={styles.dangerButton} onClick={() => void blockUser(selected.otherUserId!)}>{t.block}</button></>}{selected.kind === "group" && selectedGroup && supabase && userId && <><Raye2GroupVoiceControls supabase={supabase} userId={userId} groupId={selectedGroup.id} conversationId={selected.conversationId} groupName={selectedGroup.name} locale={locale} /><Raye2WatchTogetherControls supabase={supabase} conversationId={selected.conversationId} groupId={selectedGroup.id} groupName={selectedGroup.name} groupVisibility={selectedGroup.visibility} locale={locale} /></>}{selectedGroup && selectedGroup.memberRole !== "owner" && <button className={styles.dangerButton} disabled={busy} onClick={() => void leaveGroup()}>{t.leaveGroup}</button>}{selectedGroup && canManageSelectedGroup && <><button className={styles.miniButton} onClick={() => setShowGroupManage(true)}>{t.manageGroup}</button><button className={styles.miniButton} onClick={() => { setInviteUrl(""); setInviteId(null); setShowInvite(true); }}>{t.invite}</button></>}</div>
            {messageSearchOpen && <section className={styles.messageSearchPanel}><form onSubmit={event => { event.preventDefault(); void searchConversationMessages(); }}><input value={messageSearch} onChange={event => setMessageSearch(event.target.value)} placeholder={t.searchPlaceholder} maxLength={120}/><button type="submit" disabled={!messageSearch.trim() || messageSearchBusy}>{messageSearchBusy ? "…" : t.searchMessages}</button><button type="button" onClick={() => { setMessageSearchOpen(false); setMessageSearchResults([]); }}>{t.close}</button></form>{messageSearchResults.length ? messageSearchResults.map(result => <button key={result.id} className={styles.searchResult} onClick={() => { setMessages(current => current.some(item => item.id === result.id) ? current : [...current, result]); setMessageSearchOpen(false); setMessageSearchResults([]); }}><b>{profiles[result.sender_id]?.display_name ?? (isAr ? "عضو" : "Member")}</b><span>{result.body}</span><time>{stamp(result.created_at, locale)}</time></button>) : messageSearch && !messageSearchBusy ? <p className={styles.emptySmall}>{t.noSearchResults}</p> : null}</section>}
            {pinnedMessages.length > 0 && <section className={styles.pinnedPanel}><b>⌖ {t.pinnedMessages} · {pinnedMessages.length}</b><div>{pinnedMessages.slice(0,4).map(item => <button key={item.id} onClick={() => { setMessages(current => current.some(message => message.id === item.id) ? current : [...current, item]); setMessageSearchOpen(false); }}><span>{item.body}</span><small>{stamp(item.created_at, locale)}</small></button>)}</div></section>}
            {selected.kind === "group" && selectedGroup && <div className={styles.topicBar} role="group" aria-label={t.topics}>
              <button type="button" className={activeTopicId === null ? styles.topicActive : ""} aria-pressed={activeTopicId === null} onClick={() => setActiveTopicId(null)}>{t.topicAll}</button>
              {groupTopics.map(topic => <button type="button" key={topic.id} className={activeTopicId === topic.id ? styles.topicActive : ""} aria-pressed={activeTopicId === topic.id} onClick={() => setActiveTopicId(topic.id)}>{topic.name}{topic.message_count ? ` · ${topic.message_count}` : ""}</button>)}
              {canManageSelectedGroup && <button type="button" className={styles.topicManage} aria-pressed={showTopicManage} onClick={() => setShowTopicManage(value => !value)}>{t.manageTopics}</button>}
            </div>}
            {selected.kind === "group" && selectedGroup && showTopicManage && canManageSelectedGroup && <section className={styles.topicPanel}>
              <div className={styles.topicCreate}><input value={newTopicName} onChange={event => setNewTopicName(event.target.value)} maxLength={60} placeholder={t.topicName} aria-label={t.topicName}/><button type="button" disabled={busy || !newTopicName.trim()} onClick={() => void createGroupTopic()}>{t.createTopic}</button></div>
              {groupTopics.length === 0 ? <p className={styles.emptySmall}>{t.noTopics}</p> : <ul className={styles.topicList}>{groupTopics.map(topic => <li key={topic.id}><span>{topic.name} · {topic.message_count}</span>{pendingDeleteTopicId === topic.id ? <span className={styles.topicDeleteConfirm}><span>{isAr ? "حذف القناة؟" : "Delete channel?"}</span><button type="button" className={styles.dangerButton} disabled={busy} onClick={() => void deleteGroupTopic(topic.id)}>{isAr ? "تأكيد" : "Confirm"}</button><button type="button" disabled={busy} onClick={() => setPendingDeleteTopicId(null)}>{isAr ? "إلغاء" : "Cancel"}</button></span> : <button type="button" disabled={busy} onClick={() => setPendingDeleteTopicId(topic.id)}>{t.deleteTopic}</button>}</li>)}</ul>}
            </section>}
            <div className={styles.messageArea}>
              {visibleMessages.length === 0 && <div className={styles.emptyConversation}><div>✳</div><h3>{t.noMessages}</h3></div>}
              {visibleMessages.map((message, index) => {
                const previous = index > 0 ? visibleMessages[index - 1] : null;
                const newDay = !previous || new Date(previous.created_at).toDateString() !== new Date(message.created_at).toDateString();
                const grouped = !newDay && previous?.sender_id === message.sender_id && new Date(message.created_at).getTime() - new Date(previous.created_at).getTime() < 5 * 60000;
                const mine = message.sender_id === userId;
                const author = profiles[message.sender_id];
                const parent = message.parent_message_id ? messages.find(item => item.id === message.parent_message_id) : null;
                return <Fragment key={message.id}>{newDay && <div className={styles.dayDivider}><span>{dayLabel(message.created_at, locale)}</span></div>}<article tabIndex={0} className={`${styles.messageRow} ${mine ? styles.ownMessage : ""} ${grouped ? styles.grouped : ""}`}>
                  {!mine && <div className={styles.messageAvatar}>{initials(author?.display_name ?? author?.handle ?? "R")}</div>}
                  <div className={styles.messageBody}>
                    {!mine && <span className={styles.author}>{author?.display_name ?? author?.handle ?? "Member"}</span>}
                    {parent && <div className={styles.replyQuote}>{parent.body}</div>}
                    <div className={styles.bubble}>{message.body}
                      {message.attachment?.kind === "clip_share" && message.attachment.clip_id && <Link className={styles.sharedLink} href={"/clips/" + message.attachment.clip_id}>▶ {isAr ? "مقطع مشترك" : "Shared clip"}</Link>}
                      {message.attachment?.kind === "video_share" && message.attachment.slug && <Link className={styles.sharedLink} href={"/watch/" + message.attachment.slug + (message.attachment.start_seconds ? "?t=" + message.attachment.start_seconds : "")}>▶ {isAr ? "فيديو مشترك" : "Shared video"}</Link>}
                      {message.attachment?.kind === "poll" && supabase && <Raye2MessagePoll supabase={supabase} messageId={message.id} locale={locale} canClose={mine || (selected?.kind === "group" && canManageSelectedGroup)} />}
                    </div>
                    {message.topic_id && <span className={styles.topicChip}>{t.postInTopic} {groupTopics.find(topic => topic.id === message.topic_id)?.name ?? ""}</span>}
                    <div className={styles.messageMeta}><time>{stamp(message.created_at, locale)}</time>{message.edited_at && <span>{t.edited}</span>}
                      <button onClick={() => setReplyTo(message)}>{t.reply}</button>{(selected?.kind === "direct" || canManageSelectedGroup) && <button onClick={() => void togglePinnedMessage(message)}>{pinnedMessages.some(item => item.id === message.id) ? t.unpinMessage : t.pinMessage}</button>}{!mine && <button onClick={() => setReportTarget({ type: "message", id: message.id, conversationId: message.conversation_id })}>{t.report}</button>}<button onClick={() => void toggleBookmark(message)}>{savedIds.includes(message.id) ? "⌑" : "＋"}</button>{selected?.kind === "group" && <button title={t.saveMemory} onClick={() => void saveSharedMemory(message)}>✦</button>}
                      {mine && selected?.kind === "direct" && <span className={styles.receiptState}>{otherReadAt && new Date(otherReadAt) >= new Date(message.created_at) ? t.seen : otherDeliveredAt && new Date(otherDeliveredAt) >= new Date(message.created_at) ? t.delivered : t.sent}</span>}{mine && <><button onClick={() => void editMessage(message)}>{t.edit}</button><button onClick={() => void deleteMessage(message)}>×</button></>}
                    </div>
                    <div className={styles.reactionStrip}>{reactionOptions.map((emoji, index) => { const key = ["love", "like", "laugh", "spark", "fire"][index]; const count = reactionCounts[message.id]?.[key] ?? 0; return <button key={key} className={myReactions[message.id]?.includes(key) ? styles.reacted : ""} onClick={() => void toggleReaction(message, key)}>{emoji}{count > 0 && <small>{count}</small>}</button>; })}</div>
                  </div>
                </article></Fragment>;
              })}
            </div>
            <div className={styles.composerWrap}>
              {replyTo && <div className={styles.replyingTo}><span>{t.reply}: {replyTo.body.slice(0, 100)}</span><button onClick={() => setReplyTo(null)}>×</button></div>}
              <div className={styles.composeTools}><button type="button" className={styles.miniButton} disabled={busy || !selected.canSend} onClick={() => setShowPollCompose(value => !value)}>📊 {t.pollNew}</button></div>
              {showPollCompose && <section className={styles.pollComposer}>
                <label>{t.pollQuestion}<input value={pollQuestion} onChange={event => setPollQuestion(event.target.value)} maxLength={160}/></label>
                {pollOptions.map((option, index) => <div className={styles.pollOptionRow} key={index}><input value={option} placeholder={t.pollOption + " " + (index + 1)} maxLength={80} onChange={event => setPollOptions(current => current.map((item, position) => position === index ? event.target.value : item))}/>{pollOptions.length > 2 && <button type="button" onClick={() => setPollOptions(current => current.filter((_, position) => position !== index))}>×</button>}</div>)}
                {pollOptions.length < 10 && <button type="button" className={styles.miniButton} onClick={() => setPollOptions(current => [...current, ""])}>+ {t.pollAddOption}</button>}
                <label className={styles.pollToggle}><input type="checkbox" checked={pollMultiple} onChange={event => setPollMultiple(event.target.checked)}/>{t.pollMultiple}</label>
                <div className={styles.pollComposerActions}><button type="button" className={styles.miniButton} onClick={() => setShowPollCompose(false)}>{t.cancel}</button><button type="button" className={styles.primaryButton} disabled={busy} onClick={() => void createPoll()}>{t.pollCreate}</button></div>
              </section>}
              <form className={styles.composer} onSubmit={event => { event.preventDefault(); void sendMessage(); }}><textarea value={compose} onChange={event => { setCompose(event.target.value); if (event.target.value.trim() && !typingActive.current) { typingActive.current = true; broadcastTyping(true); } else if (!event.target.value.trim() && typingActive.current) { typingActive.current = false; broadcastTyping(false); } }} onBlur={() => { if (typingActive.current) { typingActive.current = false; broadcastTyping(false); } }} onKeyDown={event => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} placeholder={selected.canSend ? t.message : (isAr ? "هذه المجموعة للقراءة فقط حاليًا" : "This group is currently read-only")} disabled={!selected.canSend} maxLength={5000} rows={1}/><button type="submit" disabled={!compose.trim() || busy || !selected.canSend}>{t.send} ↗</button></form><div className={styles.composerFoot}><span>RAYE2 • PRIVATE BY DESIGN</span><label className={styles.disappearingControl}>{t.disappearing}<select aria-label={t.disappearing} value={selected.disappearingSeconds ?? 0} disabled={busy || (selected.kind === "group" && !canManageSelectedGroup)} onChange={event => { const next = Number(event.target.value); void setDisappearing(next === 0 ? null : next); }}><option value={0}>{t.disappearingNone}</option><option value={86400}>{t.disappearingDay}</option><option value={604800}>{t.disappearingWeek}</option><option value={2592000}>{t.disappearingMonth}</option></select></label><span>{compose.length}/5000</span></div>
            </div>
          </> : <div className={styles.blankState}><div className={styles.blankOrbit}><img src="/brand/raye2-mark.png" alt="" width={72} height={72} /></div><span className={styles.kicker}>{t.eyebrow}</span><h2>{t.emptyTitle}</h2><p>{t.emptyText}</p><button className={styles.primaryButton} onClick={() => { setTab("discover"); setMobilePane("list"); }}>{t.discover} ↗</button></div>}
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
            {groupMembers.map(member => { const isOwner = member.role === "owner"; const actor = selectedGroup.memberRole ?? "member"; const canChange = !isOwner && member.user_id !== userId && (actor === "owner" || (actor === "admin" && member.role !== "admin")); const roleLabel = member.role === "owner" ? t.roleOwner : member.role === "admin" ? t.roleAdmin : member.role === "moderator" ? t.roleModerator : t.roleMember; return <article className={styles.manageRow} key={member.user_id}><div className={styles.personInfo}><b>{member.profile?.display_name ?? member.profile?.handle ?? (isAr ? "عضو" : "Member")}</b><small>{member.profile?.handle ? "@" + member.profile.handle : member.user_id.slice(0, 8)}</small></div><span className={styles.rolePill}>{roleLabel}</span>{canChange && <select aria-label={(isAr ? "صلاحية " : "Role for ") + (member.profile?.display_name ?? member.profile?.handle ?? "member")} value={member.role} disabled={busy} onChange={event => void changeMemberRole(member, event.target.value as "admin" | "moderator" | "member")}><option value="member">{t.roleMember}</option><option value="moderator">{t.roleModerator}</option>{actor === "owner" && <option value="admin">{t.roleAdmin}</option>}</select>}{!isOwner && member.user_id !== userId && (actor === "owner" || (actor === "admin" && member.role !== "admin") || (actor === "moderator" && member.role === "member")) && <><button className={styles.dangerButton} disabled={busy} onClick={() => void banGroupMember(member)}>{t.banMember}</button><button className={styles.dangerButton} disabled={busy} onClick={() => void removeGroupMember(member)}>{t.removeMember}</button></>}{actor === "owner" && !isOwner && member.user_id !== userId && <button className={styles.miniButton} disabled={busy} onClick={() => void transferOwnership(member)}>{t.transferOwnership}</button>}</article>; })}
          </div>
          {selectedGroup.memberRole === "owner" && <div className={styles.manageSection}><div className={styles.manageSectionTitle}><b>{t.lifecycle}</b><span>{selectedGroup.status === "archived" ? t.statusArchived : selectedGroup.status === "read_only" ? t.statusReadOnly : "—"}</span></div><div className={styles.manageRow}>{selectedGroup.status === "archived" ? <button className={styles.miniButton} disabled={busy} onClick={() => void setGroupStatus("active")}>{t.reactivateGroup}</button> : <><button className={styles.miniButton} disabled={busy} onClick={() => void setGroupStatus("read_only")}>{t.statusReadOnly}</button><button className={styles.dangerButton} disabled={busy} onClick={() => void setGroupStatus("archived")}>{t.archiveGroup}</button></>}</div></div>}
          <div className={styles.manageSection}><div className={styles.manageSectionTitle}><b>{t.slowMode}</b><span>{selectedGroup.slow_mode_seconds ? selectedGroup.slow_mode_seconds + "s" : t.slowModeOff}</span></div><label>{t.slowMode}<select value={selectedGroup.slow_mode_seconds ?? 0} disabled={busy} onChange={event => void setSlowMode(Number(event.target.value))}><option value={0}>{t.slowModeOff}</option><option value={5}>5</option><option value={10}>10</option><option value={30}>30</option><option value={60}>60</option><option value={300}>300</option></select></label><p className={styles.emptySmall}>{t.slowModeNote}</p></div>
          <div className={styles.manageSection}><div className={styles.manageSectionTitle}><b>{t.groupProfile}</b><span>{isAr ? "الملف" : "PROFILE"}</span></div>
            <label>{t.groupDescription}<textarea value={profileDescription} onChange={event => setProfileDescription(event.target.value)} maxLength={1000} rows={2}/></label>
            <label>{t.groupRules}<textarea value={profileRules} onChange={event => setProfileRules(event.target.value)} maxLength={3000} rows={3}/></label>
            <label>{t.groupTopics}<input value={profileTopics} onChange={event => setProfileTopics(event.target.value)} maxLength={600} placeholder={isAr ? "عام، نقاش، ألعاب" : "General, discussion, gaming"}/></label>
            <label>{t.groupImageUrl}<input value={profileImageUrl} onChange={event => setProfileImageUrl(event.target.value)} maxLength={600} placeholder="https://…"/></label>
            <div className={styles.manageRow}><button className={styles.primaryButton} disabled={profileSaving} onClick={() => void saveGroupProfile()}>{t.groupProfileSave}</button></div>
          </div>
          <div className={styles.manageSection}><div className={styles.manageSectionTitle}><b>{t.moderationLog}</b><span>{moderationLog.length}</span></div>
            {moderationLog.length === 0 ? <p className={styles.emptySmall}>{t.noModerationLog}</p> : <ul className={styles.ruleList}>{moderationLog.map(entry => <li key={entry.id}><span>{moderationLabel(entry.action)}</span><b>{stamp(entry.created_at, locale)}</b></li>)}</ul>}
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
      {showCreateGroup && <div className={styles.modalBackdrop} role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) { setShowCreateGroup(false); setGroupCreateStep(1); } }}>
        <section className={styles.modal + " " + styles.groupWizard} role="dialog" aria-modal="true" aria-labelledby="raye2-group-title">
          <button type="button" className={styles.modalClose} aria-label={t.close} onClick={() => { setShowCreateGroup(false); setGroupCreateStep(1); }}>×</button>
          <span className={styles.kicker}>RAYE2 / GROUP SETUP</span>
          <div className={styles.groupWizardProgress}>
            <div className={styles.groupWizardStepLine}><span>{groupWizard.step} {groupCreateStep} {groupWizard.of} 3</span><strong>{groupWizard.steps[groupCreateStep - 1]}</strong></div>
            <div className={styles.groupWizardTrack} data-step={groupCreateStep} role="progressbar" aria-valuemin={1} aria-valuemax={3} aria-valuenow={groupCreateStep} aria-label={groupWizard.steps[groupCreateStep - 1]}><span /></div>
          </div>
          <h2 id="raye2-group-title">{groupCreateStep === 1 ? groupWizard.basicsTitle : groupCreateStep === 2 ? groupWizard.privacyTitle : groupCreateStep === 3 ? groupWizard.reviewTitle : groupWizard.reviewTitle}</h2>
          <p className={styles.groupWizardHint}>{groupCreateStep === 1 ? groupWizard.basicsHint : groupCreateStep === 2 ? groupWizard.privacyHint : groupWizard.reviewHint}</p>
          {groupCreateStep === 1 ? <>
            <label>{t.groupName}<input autoFocus value={groupName} onChange={event => setGroupName(event.target.value)} maxLength={80} minLength={2} /></label>
            <label>{t.groupDesc}<textarea value={groupDescription} onChange={event => setGroupDescription(event.target.value)} maxLength={1000} rows={3} /></label>
            <p className={styles.modalHint}>{groupName.trim().length}/80</p>
          </> : groupCreateStep === 2 ? <>
            <div className={styles.groupWizardOptions}>
              <button type="button" aria-pressed={groupVisibility === "public"} className={groupVisibility === "public" ? styles.groupWizardOptionActive : ""} onClick={() => setGroupVisibility("public")}>
                <span className={styles.groupWizardOptionIcon}>◎</span><span><strong>{t.public}</strong><small>{groupWizard.publicHint}</small></span>
              </button>
              <button type="button" aria-pressed={groupVisibility === "private"} className={groupVisibility === "private" ? styles.groupWizardOptionActive : ""} onClick={() => setGroupVisibility("private")}>
                <span className={styles.groupWizardOptionIcon}>◇</span><span><strong>{t.private}</strong><small>{groupWizard.privateHint}</small></span>
              </button>
            </div>
          </> : <>
            <dl className={styles.groupWizardReview}>
              <div><dt>{t.groupName}</dt><dd>{groupName.trim()}</dd></div>
              <div><dt>{t.groupDesc}</dt><dd>{groupDescription.trim() || groupWizard.noDescription}</dd></div>
              <div><dt>{groupWizard.visibility}</dt><dd>{groupVisibility === "private" ? t.private : t.public}</dd></div>
            </dl>
            <p className={styles.modalHint}>{groupVisibility === "private" ? groupWizard.privateHint : groupWizard.publicHint}</p>
          </>}
          <div className={styles.modalActions}>
            <button type="button" onClick={() => { if (groupCreateStep === 1) { setShowCreateGroup(false); setGroupCreateStep(1); } else setGroupCreateStep(step => (step - 1) as 1 | 2 | 3); }}>{groupCreateStep === 1 ? t.cancel : groupWizard.back}</button>
            {groupCreateStep < 3
              ? <button type="button" className={styles.primaryButton} disabled={groupCreateStep === 1 && groupName.trim().length < 2} onClick={() => setGroupCreateStep(step => (step + 1) as 1 | 2 | 3)}>{groupWizard.next} ↗</button>
              : <button type="button" className={styles.primaryButton} disabled={busy || groupName.trim().length < 2} onClick={() => void createGroup()}>{t.create} ↗</button>}
          </div>
        </section>
      </div>}
    </main>
  );
}

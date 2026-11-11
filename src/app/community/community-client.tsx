"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NhenReactionArt from "@/app/watch/[slug]/nhen-reaction-art";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import "./raye2-community.css";

type Author = { handle: string; display_name: string; avatar_url: string | null };
export type CommunityPoll = { id: string; question: string; options: Array<{ option: string; votes: number }>; total: number; closesAt: string | null; myVote: string | null };
export type CommunityPost = { id: string; authorId: string; type: string; body: string; createdAt: string; linkedVideoId: string | null; pinned?: boolean; reactionCount?: number; commentCount?: number; poll?: CommunityPoll | null; topicSlug?: string | null; topicName?: string | null; author: Author };
export type CommunityTopic = { slug: string; name: string; postCount: number };
type Member = { id: string; handle: string; displayName: string };
type SuggestedMember = { userId: string; handle: string; displayName: string };
type MomentVideo = { media_id: string; slug: string; title: string; duration_seconds: number | null };
type MomentCatalogRow = { media_id: string; slug: string; duration_seconds: number | null; media_items: { title: string; is_published: boolean; media_type: string } | Array<{ title: string; is_published: boolean; media_type: string }> | null };

const reactions = [{ key: "like", label: "Like", icon: "♡" }, { key: "love", label: "Love", icon: "♥" }, { key: "insightful", label: "Insightful", icon: "✦" }, { key: "funny", label: "Funny", icon: "笑" }, { key: "spark", label: "Spark", icon: "✧" }, { key: "hype", label: "Hype", icon: "⚡" }, { key: "respect", label: "Respect", icon: "✊" }, { key: "curious", label: "Curious", icon: "◉" }] as const;


function communityReactionArt(key: string): string {
  const art: Record<string,string> = { like: "support", love: "support", insightful: "mindblown", funny: "laugh", spark: "spark", hype: "legend", respect: "legend", curious: "orbit" };
  return art[key] ?? "spark";
}

type Comment = {id:string;body:string;author_id:string;created_at:string;author_handle?:string|null;author_display_name?:string|null;reply_count:number;reaction_count:number;my_reaction:string|null};
type CommentReply = {comment_id:string;author_id:string;author_handle:string|null;author_display_name:string|null;body:string;created_at:string;reaction_count:number;my_reaction:string|null};

export default function CommunityClient({ initialPosts, topics = [], selectedFeed, selectedSort = "latest", unreadNotificationCount, suggestedMembers, canModerate = false }: { initialPosts: CommunityPost[]; topics?: CommunityTopic[]; selectedFeed: "following" | "latest"; selectedSort?: "latest" | "hot"; unreadNotificationCount: number; suggestedMembers: SuggestedMember[]; canModerate?: boolean }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [member, setMember] = useState<Member | null>(null);
  const [followedSuggestions, setFollowedSuggestions] = useState<string[]>([]);
  const [followBusy, setFollowBusy] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [body, setBody] = useState("");
  const [pollMode,setPollMode]=useState(false);
  const [pollQuestion,setPollQuestion]=useState("");
  const [pollOptions,setPollOptions]=useState<string[]>(["",""]);
  const [pollVotes,setPollVotes]=useState<Record<string,string>>({});
  const [momentVideos, setMomentVideos] = useState<MomentVideo[]>([]);
  const [momentVideoId, setMomentVideoId] = useState("");
  const [momentStart, setMomentStart] = useState("0");
  const [momentEnd, setMomentEnd] = useState("15");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [reactionsByPost, setReactionsByPost] = useState<Record<string, { count: number; mine: string | null }>>({});
  const [savedByPost, setSavedByPost] = useState<Record<string, boolean>>({});
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Comment[]>([]);
  const [commentText, setCommentText] = useState("");
  const [commentReplies,setCommentReplies]=useState<Record<string,CommentReply[]>>({});
  const [replyOpen,setReplyOpen]=useState<string|null>(null);
  const [replyDraft,setReplyDraft]=useState("");
  const [commentCounts,setCommentCounts]=useState<Record<string,number>>(()=>Object.fromEntries(initialPosts.map(post=>[post.id,Number(post.commentCount)||0])));
  const [locale,setLocale]=useState<"en"|"ar">("en");
  const [postFilter,setPostFilter]=useState<"all"|"official"|"members">("all");
  const [topicFilter,setTopicFilter]=useState<string>("all");
  const [topicDraft,setTopicDraft]=useState<string>("");
  const [reactionMenuFor,setReactionMenuFor]=useState<string|null>(null);
  const [editingPost,setEditingPost]=useState<string|null>(null);
  const [editBody,setEditBody]=useState("");
  const [pinnedPosts,setPinnedPosts]=useState<Record<string,boolean>>(()=>Object.fromEntries(initialPosts.map(post=>[post.id,!!post.pinned])));
  const [deletedPosts,setDeletedPosts]=useState<string[]>([]);
  const [myDrafts,setMyDrafts]=useState<Array<{id:string;body:string;publishAt:string|null}>>([]);
  const [publishAt,setPublishAt]=useState("");
  const [collections,setCollections]=useState<Array<{id:string;name:string;itemCount:number}>>([]);
  const [collectionMenuFor,setCollectionMenuFor]=useState<string|null>(null);
  const [newCollectionName,setNewCollectionName]=useState("");
  useEffect(() => {
    if (!supabase) return;
    const channel = supabase.channel("nhen-community-live-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "community_posts" }, () => router.refresh())
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [supabase, router]);

  const isArabic=locale==="ar";
  const visiblePosts=useMemo(()=>initialPosts.filter(post=>!deletedPosts.includes(post.id)).filter(post=>postFilter==="all"||(postFilter==="official"?post.type==="official":post.type!=="official")).filter(post=>topicFilter==="all"||post.topicSlug===topicFilter),[initialPosts,postFilter,topicFilter,deletedPosts]);
  const t=isArabic?{
    search:"ابحث في Raye2",join:"انضم إلى رايق",home:"الرئيسية",community:"المجتمع",official:"رسمي",latest:"الأحدث",hot:"الأكثر تفاعلًا",newest:"الأجدد",yourSpace:"مساحتك",profile:"الملف الشخصي",saved:"المحفوظات",communityTitle:"مجتمع رايق",headline:"هنا تبدأ الحكاية.",intro:"مساحة تجمع صانع المحتوى والمهتمين بما يقدمه. التحديثات الرسمية واضحة، ومنشورات الأعضاء تصل فورًا، والبلاغات تصل للمشرفين.",share:"شارك المجتمع شيئًا",memberPost:"منشور عضو",compose:"ابدأ نقاشًا مفيدًا…",attach:"أرفق لحظة فيديو (اختياري)",noMoment:"بدون لحظة فيديو",start:"البداية (بالثواني)",end:"النهاية (بالثواني)",upTo:"حتى 3 دقائق من فيديو رسمي.",publish:"انشر ↗",posts:"منشور",joinCommunity:"انضم إلى المجتمع",free:"حساب مجاني",create:"إنشاء حساب",signIn:"تسجيل الدخول",handle:"اختر اسم مستخدم (اختياري)",email:"البريد الإلكتروني",password:"كلمة المرور",pleaseWait:"انتظر…",membership:"عضوية المجتمع منفصلة عن صلاحيات المبدعين والإدارة. لا تشارك كلمة مرورك.",following:"تتابعهم",fromFollowing:"من الأشخاص الذين تتابعهم",latestConversations:"أحدث النقاشات",first:"في انتظار أول نقاش.",empty:"ستظهر التحديثات الرسمية ومنشورات الأعضاء المعتمدة هنا.",officialUpdates:"تحديثات رسمية",report:"الإبلاغ عن المنشور",sharedMoment:"لحظة فيديو مشتركة ↗",react:"تفاعل",comments:"التعليقات",discussion:"النقاش",reply:"اكتب ردًا…",send:"إرسال",instant:"تظهر الردود فورًا. أبلغ عن أي محتوى يخالف قواعد المجتمع.",fromCreator:"من صانع المحتوى",announcements:"تظهر إعلانات رايق الرسمية بوضوح بعيدًا عن نقاشات الأعضاء.",exploreUpdates:"استكشف التحديثات ↗",standard:"معايير المجتمع",respect:"كن محترمًا وبنّاءً.",rights:"انشر فقط محتوى تملك حقوقه.",privacy:"لا تنشر معلومات خاصة.",reportProblems:"أبلغ عن المشكلات بدلًا من تصعيدها.",sharePost:"مشاركة المنشور",shareCopied:"تم نسخ رابط المنشور.",shareError:"تعذرت مشاركة المنشور تلقائيًا.",allPosts:"الكل",officialPosts:"رسمي",memberPosts:"الأعضاء",filteredEmpty:"لا توجد منشورات في هذا التصنيف حاليًا.",followingEmpty:"لا توجد منشورات جديدة ممن تتابعهم. اكتشف أعضاءً جددًا وابدأ بمتابعتهم.",signInToFollow:"سجّل الدخول لمشاهدة منشورات الأشخاص الذين تتابعهم.",discoverMembers:"اكتشف الأعضاء ↗",suggested:"قد يعجبك",followMember:"متابعة",followingMember:"تتابعه",followError:"تعذرت متابعة هذا العضو. حاول مرة أخرى.",notifications:"الإشعارات",postsPublish:"تُنشر المنشورات فورًا",momentUnavailable:"الفيديو المرتبط غير متاح حاليًا.",editPost:"تعديل",saveEdit:"حفظ",cancelEdit:"إلغاء",deletePost:"حذف",confirmDeletePost:"سيتم حذف هذا المنشور نهائيًا مع تعليقاته وتفاعلاته. هل تريد المتابعة؟",deleteComment:"حذف",pinPost:"تثبيت",unpinPost:"إلغاء التثبيت",pinned:"مثبّت",editError:"تعذر حفظ التعديل.",deleteError:"تعذر حذف المحتوى.",pinError:"تعذر تحديث التثبيت.",postUpdated:"تم تحديث منشورك.",postDeleted:"تم حذف منشورك.",commentDeleted:"تم حذف التعليق.",postPinned:"تم تثبيت المنشور.",postUnpinned:"تم إلغاء تثبيت المنشور.",drafts:"المسودات",saveDraft:"حفظ كمسودة",scheduled:"مجدول",schedulePost:"جدولة",scheduleTime:"وقت النشر",publishNow:"انشر الآن",draftSaved:"تم حفظ المسودة.",scheduledSaved:"تمت جدولة المنشور.",scheduleError:"تعذر جدولة المنشور.",draftError:"تعذر حفظ المسودة.",scheduleFuture:"اختر وقتًا في المستقبل.",scheduledFor:"يُنشر في",cancelScheduled:"إلغاء الجدولة",cancelScheduledError:"تعذر إلغاء الجدولة.",publishNowError:"تعذر نشر المنشور الآن.",collections:"المجموعات",newCollection:"مجموعة جديدة",collectionName:"اسم المجموعة",addToCollection:"أضف إلى مجموعة",noCollections:"لا توجد مجموعات بعد.",collectionCreated:"تم إنشاء المجموعة.",collectionError:"تعذر تحديث المجموعة.",removeFromCollection:"إزالة",replyBtn:"رد",replyPlaceholder:"اكتب ردًا…",replyAction:"رد ↗",showReplies:"اعرض الردود",hideReplies:"أخفِ الردود",replyPending:"تم إرسال ردك.",noReplies:"لا توجد ردود بعد.",reactComment:"تفاعل مع التعليق",commentReactError:"تعذر حفظ تفاعل التعليق.",pollAdd:"أنشئ استطلاعًا",pollQuestion:"سؤال الاستطلاع",pollOption:"خيار",pollAddOption:"إضافة خيار",pollPublish:"انشر الاستطلاع ↗",pollVotes:"صوت",pollCloses:"يُغلق",pollCreated:"تم نشر الاستطلاع.",pollError:"تعذر حفظ الاستطلاع.",pollNeedOptions:"أضف سؤالًا وخيارين على الأقل.",pollDup:"يجب أن تكون الخيارات مختلفة."
 ,topicLabel:"القناة",topicAll:"كل القنوات",topicNone:"بدون قناة",topicFilterLabel:"تصفية حسب القناة",topicSetError:"تعذر تعيين قناة المنشور."}:{
    search:"Search Raye2",join:"Join Raye2",home:"Home",community:"Community",official:"Official",latest:"Latest",hot:"Hot",newest:"New",yourSpace:"YOUR SPACE",profile:"Profile",saved:"Saved",communityTitle:"RAYE2 COMMUNITY",headline:"The conversation starts here.",intro:"A space for the creator and the people around the work. Official updates are clearly marked. Member posts publish instantly; reports go to moderators.",share:"Share something with the community",memberPost:"MEMBER POST",compose:"Start a thoughtful conversation…",attach:"Attach a video moment (optional)",noMoment:"No video moment",start:"Start (seconds)",end:"End (seconds)",upTo:"Up to 3 minutes from an official video.",publish:"Publish ↗",posts:"posts",joinCommunity:"Join the community",free:"FREE ACCOUNT",create:"Create account",signIn:"Sign in",handle:"Choose a handle (optional)",email:"Email address",password:"Password",pleaseWait:"Please wait…",membership:"Community membership is separate from creator/admin access. Never share your password.",following:"Following",fromFollowing:"From people you follow",latestConversations:"Latest conversations",first:"The first conversation is waiting.",empty:"Official updates and approved member posts will appear here.",officialUpdates:"Official updates",report:"Report post",sharedMoment:"Shared video moment ↗",react:"React",comments:"Comments",discussion:"Discussion",reply:"Write a reply…",send:"Send",instant:"Replies appear instantly. Report anything that breaks the community rules.",fromCreator:"FROM THE CREATOR",announcements:"Announcements from Raye2 are marked and kept distinct from member discussions.",exploreUpdates:"Explore updates ↗",standard:"COMMUNITY STANDARD",respect:"Be respectful and constructive.",rights:"Share only content you have rights to.",privacy:"Do not post private information.",reportProblems:"Report problems rather than escalating.",sharePost:"Share post",shareCopied:"Post link copied.",shareError:"This post could not be shared automatically.",allPosts:"All",officialPosts:"Official",memberPosts:"Members",filteredEmpty:"There are no posts in this category yet.",followingEmpty:"No new posts from people you follow. Discover members and follow a few to build your feed.",signInToFollow:"Sign in to see posts from people you follow.",discoverMembers:"Discover members ↗",suggested:"People you may like",followMember:"Follow",followingMember:"Following",followError:"Could not follow this member. Please try again.",notifications:"Notifications",postsPublish:"Posts publish instantly",momentUnavailable:"The linked video is currently unavailable.",editPost:"Edit",saveEdit:"Save",cancelEdit:"Cancel",deletePost:"Delete",confirmDeletePost:"This permanently removes the post along with its comments and reactions. Continue?",deleteComment:"Delete",pinPost:"Pin",unpinPost:"Unpin",pinned:"Pinned",editError:"Could not save your edit.",deleteError:"Could not delete that content.",pinError:"Could not update the pin.",postUpdated:"Your post was updated.",postDeleted:"Your post was deleted.",commentDeleted:"Comment deleted.",postPinned:"Post pinned.",postUnpinned:"Post unpinned.",drafts:"Drafts",saveDraft:"Save draft",scheduled:"Scheduled",schedulePost:"Schedule",scheduleTime:"Publish time",publishNow:"Publish now",draftSaved:"Draft saved.",scheduledSaved:"Post scheduled.",scheduleError:"Could not schedule the post.",draftError:"Could not save the draft.",scheduleFuture:"Choose a future time.",scheduledFor:"Publishes",cancelScheduled:"Cancel schedule",cancelScheduledError:"Could not cancel the schedule.",publishNowError:"Could not publish the post now.",collections:"Collections",newCollection:"New collection",collectionName:"Collection name",addToCollection:"Add to collection",noCollections:"No collections yet.",collectionCreated:"Collection created.",collectionError:"Could not update the collection.",removeFromCollection:"Remove",replyBtn:"Reply",replyPlaceholder:"Write a reply…",replyAction:"Reply ↗",showReplies:"Show replies",hideReplies:"Hide replies",replyPending:"Your reply is live.",noReplies:"No replies yet.",reactComment:"React to comment",commentReactError:"Could not save the comment reaction.",pollAdd:"Create a poll",pollQuestion:"Poll question",pollOption:"Option",pollAddOption:"Add option",pollPublish:"Publish poll ↗",pollVotes:"votes",pollCloses:"Closes",pollCreated:"Your poll is live.",pollError:"Could not save the poll.",pollNeedOptions:"Add a question and at least two options.",pollDup:"Options must be different."
 ,topicLabel:"Channel",topicAll:"All channels",topicNone:"No channel",topicFilterLabel:"Filter by channel",topicSetError:"Could not set the post channel."};
  const reactionLabels:Record<string,string>=isArabic?{like:"إعجاب",love:"أحببته",insightful:"مفيد",funny:"مضحك",spark:"شرارة",hype:"حماس",respect:"احترام",curious:"فضول"}:{like:"Like",love:"Love",insightful:"Insightful",funny:"Funny",spark:"Spark",hype:"Hype",respect:"Respect",curious:"Curious"};
  useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);

  useEffect(() => {
    if (!member) return;
    const token = new URLSearchParams(window.location.search).get("raye2_invite");
    if (token && token.length >= 32 && token.length <= 256) {
      router.replace("/raye2/invite?token=" + encodeURIComponent(token));
    }
  }, [member, router]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.auth.getUser().then(async ({ data }: { data: { user: { id: string } | null } }) => {
      if (!alive || !data.user) return;
      const { data: profile } = await supabase.from("member_profiles").select("handle,display_name").eq("user_id", data.user.id).maybeSingle();
      if (alive) setMember({ id: data.user.id, handle: profile?.handle ?? "member", displayName: profile?.display_name ?? "Member" });
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event: string, session: { user: { id: string } } | null) => {
      if (!alive) return;
      if (!session?.user) setMember(null);
      else void supabase.from("member_profiles").select("handle,display_name").eq("user_id", session.user.id).maybeSingle().then(({data:profile}: {data: {handle?: string | null; display_name?: string | null} | null}) => {
        if (alive) setMember({ id: session.user.id, handle: profile?.handle ?? "member", displayName: profile?.display_name ?? "Member" });
      });
    });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !member) { setMyDrafts([]); setCollections([]); return; }
    let alive = true;
    void Promise.all([
      supabase.from("community_posts").select("id,body,publish_at,status").eq("author_id", member.id).eq("status", "scheduled").order("created_at", { ascending: false }).limit(20),
      supabase.rpc("raye2_get_my_collections")
    ]).then(([drafts, cols]: [{ data: Array<{id:string;body:string;publish_at:string|null}> | null }, { data: Array<{id:string;name:string;item_count:number}> | null }]) => {
      if (!alive) return;
      setMyDrafts((drafts.data ?? []).map(row => ({ id: row.id, body: row.body, publishAt: row.publish_at })));
      setCollections((cols.data ?? []).map(row => ({ id: row.id, name: row.name, itemCount: Number(row.item_count) })));
    });
    return () => { alive = false; };
  }, [supabase, member]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    void supabase.from("video_catalog").select("media_id,slug,duration_seconds,media_items!video_catalog_media_id_fkey!inner(title,is_published,media_type)").not("published_at","is",null).eq("media_items.is_published",true).then(({data,error}: {data: MomentCatalogRow[] | null; error: unknown}) => {
      if (!alive || error) return;
      const rows = (data ?? []).flatMap(item => {
        const media = Array.isArray(item.media_items) ? item.media_items[0] : item.media_items;
        return media?.is_published && media.media_type === "video" ? [{media_id:item.media_id,slug:item.slug,title:media.title,duration_seconds:item.duration_seconds}] : [];
      });
      setMomentVideos(rows);
    });
    return () => { alive = false; };
  }, [supabase]);

  useEffect(() => {
    if (!supabase || !initialPosts.length) return;
    let alive = true;
    void (async () => {
      const ids = initialPosts.map(post => post.id);
      const [countResult, userResult] = await Promise.all([
        supabase.rpc("get_community_reaction_counts", { p_post_ids: ids }),
        supabase.auth.getUser()
      ]);
      if (!alive) return;
      const grouped: Record<string,{count:number;mine:string|null}> = {};
      for (const post of initialPosts) grouped[post.id] = { count: Number(post.reactionCount)||0, mine: null };
      for (const item of countResult.data ?? []) {
        grouped[item.post_id].count = Number(item.reaction_count) || 0;
      }
      if (userResult.data.user) {
        const { data: ownReactions } = await supabase.from("community_reactions").select("post_id,reaction").eq("user_id", userResult.data.user.id).in("post_id", ids);
        for (const item of ownReactions ?? []) grouped[item.post_id].mine = item.reaction;
      }
      setReactionsByPost(grouped);
      if (userResult.data.user) {
        const { data: saved } = await supabase.from("community_bookmarks").select("post_id").eq("user_id", userResult.data.user.id).in("post_id", ids);
        if (!alive) return;
        const savedMap: Record<string, boolean> = {};
        for (const item of saved ?? []) savedMap[item.post_id] = true;
        setSavedByPost(savedMap);
      }
    })();
    return () => { alive = false; };
  }, [supabase, initialPosts]);

  async function followSuggested(userId: string) {
    if (!supabase || !member || followBusy) return;
    setFollowBusy(userId);
    const { data, error } = await supabase.rpc("raye2_toggle_follow", { p_target_id: userId });
    if (error || data !== true) setStatus(t.followError); else setFollowedSuggestions(current => [...current, userId]);
    setFollowBusy(null);
  }

  async function authenticate() {
    if (!supabase || busy) return;
    setBusy(true); setStatus("");
    try {
      if (authMode === "signup") {
        const result = await supabase.auth.signUp({ email: email.trim(), password });
        if (result.error) throw result.error;
        if (!result.data.session) {
          setStatus("Check your email to confirm your account, then sign in here.");
        } else {
          if (handle.trim()) {
            const safeHandle = handle.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0,24);
            if (safeHandle.length >= 3) {
              const { error } = await supabase.from("member_profiles").update({ handle: safeHandle, display_name: handle.trim().slice(0,40) }).eq("user_id", result.data.user!.id);
              if (error) setStatus("Account created. Your profile handle can be edited later in profile settings.");
            }
          }
          router.refresh();
        }
      } else {
        const result = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (result.error) throw result.error;
        router.refresh();
      }
    } catch {
      setStatus("We could not complete sign-in. Check your details and connection, then try again.");
    } finally { setBusy(false); }
  }

  async function signOut() {
    if (!supabase || busy) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
      setMember(null); setStatus("You have signed out."); router.refresh();
    } catch {
      setStatus("We could not sign you out because the connection failed. Please try again.");
    } finally { setBusy(false); }
  }

  async function submitPost() {
    if (!supabase || !member || busy || !body.trim()) return;
    setBusy(true); setStatus("");
    try {
      const start = Number(momentStart), end = Number(momentEnd);
      if (momentVideoId && (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end - start > 180)) throw new Error("Choose a valid moment between 1 and 180 seconds.");
      const selectedVideo = momentVideos.find(video => video.media_id === momentVideoId);
      if (selectedVideo?.duration_seconds && end > selectedVideo.duration_seconds) throw new Error("The moment ends after this video.");
      const { data: created, error } = await supabase.from("community_posts").insert({ author_id: member.id, post_type: "member", body: body.trim(), status: "published", linked_video_id: selectedVideo?.media_id ?? null, moment_start_seconds: selectedVideo ? start : null, moment_end_seconds: selectedVideo ? end : null }).select("id").single();
      if (error) throw error;
      if (topicDraft && created?.id) { const { error: topicError } = await supabase.rpc("raye2_set_post_topic", { p_post_id: created.id, p_topic_slug: topicDraft }); if (topicError) throw topicError; }
      setBody(""); setMomentVideoId(""); setMomentStart("0"); setMomentEnd("15"); setTopicDraft(""); setStatus("Your post is live in the community."); router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Post submission failed."); }
    finally { setBusy(false); }
  }

  async function submitPoll() {
    if (!supabase || !member || busy) return;
    const question = pollQuestion.trim();
    const options = pollOptions.map(o => o.trim()).filter(Boolean);
    if (!question || options.length < 2) { setStatus(t.pollNeedOptions); return; }
    setBusy(true); setStatus("");
    try {
      const { error } = await supabase.rpc("raye2_create_community_poll", { p_question: question, p_options: options, p_closes_at: null });
      if (error) throw error;
      setPollMode(false); setPollQuestion(""); setPollOptions(["", ""]); setStatus(t.pollCreated); router.refresh();
    } catch (error) { setStatus(error instanceof Error && /unique/i.test(error.message) ? t.pollDup : t.pollError); }
    finally { setBusy(false); }
  }

  async function votePoll(postId: string, pollId: string, option: string) {
    if (!supabase || !member || busy) return;
    setBusy(true); setPollVotes(current => ({ ...current, [postId]: option }));
    const { error } = await supabase.rpc("raye2_vote_community_poll", { p_poll_id: pollId, p_option_key: option });
    if (error) { setStatus(t.pollError); setPollVotes(current => { const next = { ...current }; delete next[postId]; return next; }); }
    else router.refresh();
    setBusy(false);
  }

  function momentFields() {
    const start = Number(momentStart), end = Number(momentEnd);
    if (momentVideoId && (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || end <= start || end - start > 180)) throw new Error("Choose a valid moment between 1 and 180 seconds.");
    const selectedVideo = momentVideos.find(video => video.media_id === momentVideoId);
    if (selectedVideo?.duration_seconds && end > selectedVideo.duration_seconds) throw new Error("The moment ends after this video.");
    return { linked_video_id: selectedVideo?.media_id ?? null, moment_start_seconds: selectedVideo ? start : null, moment_end_seconds: selectedVideo ? end : null };
  }

  async function loadMyDrafts() {
    if (!supabase || !member) return;
    const { data } = await supabase.from("community_posts").select("id,body,publish_at,status").eq("author_id", member.id).eq("status", "scheduled").order("created_at", { ascending: false }).limit(20);
    setMyDrafts((data ?? []).map((row: {id:string;body:string;publish_at:string|null}) => ({ id: row.id, body: row.body, publishAt: row.publish_at })));
  }

  async function saveDraft() {
    if (!supabase || !member || busy || !body.trim()) return;
    setBusy(true); setStatus("");
    try {
      const { error } = await supabase.from("community_posts").insert({ author_id: member.id, post_type: "member", body: body.trim(), status: "scheduled", pinned: false, ...momentFields() });
      if (error) throw error;
      setBody(""); setMomentVideoId(""); setMomentStart("0"); setMomentEnd("15"); setStatus(t.draftSaved); await loadMyDrafts();
    } catch (error) { setStatus(error instanceof Error ? error.message : t.draftError); }
    finally { setBusy(false); }
  }

  async function scheduleDraft() {
    if (!supabase || !member || busy || !body.trim()) return;
    if (!publishAt) { setStatus(t.scheduleFuture); return; }
    const when = new Date(publishAt);
    if (Number.isNaN(when.getTime()) || when.getTime() <= Date.now()) { setStatus(t.scheduleFuture); return; }
    setBusy(true); setStatus("");
    try {
      const { data: created, error } = await supabase.from("community_posts").insert({ author_id: member.id, post_type: "member", body: body.trim(), status: "scheduled", pinned: false, ...momentFields() }).select("id").single();
      if (error) throw error;
      const { error: schedError } = await supabase.rpc("raye2_schedule_community_post", { p_post_id: created.id, p_publish_at: when.toISOString() });
      if (schedError) throw schedError;
      setBody(""); setMomentVideoId(""); setMomentStart("0"); setMomentEnd("15"); setPublishAt(""); setStatus(t.scheduledSaved); await loadMyDrafts();
    } catch (error) { setStatus(error instanceof Error ? error.message : t.scheduleError); }
    finally { setBusy(false); }
  }

  async function publishDraftNow(postId: string) {
    if (!supabase || busy) return;
    setBusy(true); setStatus("");
    try {
      const { error } = await supabase.rpc("raye2_publish_community_post", { p_post_id: postId });
      if (error) throw error;
      setMyDrafts(current => current.filter(draft => draft.id !== postId));
      setStatus(t.postUpdated); router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : t.publishNowError); }
    finally { setBusy(false); }
  }

  async function cancelScheduled(postId: string) {
    if (!supabase || busy) return;
    setBusy(true); setStatus("");
    try {
      const { error } = await supabase.from("community_posts").delete().eq("id", postId).eq("author_id", member?.id ?? "");
      if (error) throw error;
      setMyDrafts(current => current.filter(draft => draft.id !== postId));
      setStatus(t.postDeleted);
    } catch (error) { setStatus(error instanceof Error ? error.message : t.cancelScheduledError); }
    finally { setBusy(false); }
  }

  async function createCollection() {
    if (!supabase || !member || !newCollectionName.trim()) return;
    setBusy(true); setStatus("");
    try {
      const { data, error } = await supabase.rpc("raye2_create_collection", { p_name: newCollectionName.trim() });
      if (error) throw error;
      setCollections(current => [{ id: data as string, name: newCollectionName.trim(), itemCount: 0 }, ...current]);
      setNewCollectionName(""); setStatus(t.collectionCreated);
    } catch (error) { setStatus(error instanceof Error ? error.message : t.collectionError); }
    finally { setBusy(false); }
  }

  async function addToCollection(collectionId: string, postId: string) {
    if (!supabase || busy) return;
    setBusy(true); setStatus("");
    try {
      const { error } = await supabase.rpc("raye2_add_to_collection", { p_collection_id: collectionId, p_kind: "post", p_item_id: postId });
      if (error) throw error;
      setCollections(current => current.map(item => item.id === collectionId ? { ...item, itemCount: item.itemCount + 1 } : item));
      setCollectionMenuFor(null); setStatus(t.collectionCreated);
    } catch (error) { setStatus(error instanceof Error ? error.message : t.collectionError); }
    finally { setBusy(false); }
  }

  async function react(postId: string, reaction: string) {
    setReactionMenuFor(null);
    if (!supabase || !member) { setStatus("Sign in to react to community posts."); return; }
    const previous = reactionsByPost[postId] ?? { count: 0, mine: null };
    const next = previous.mine === reaction ? null : reaction;
    setReactionsByPost(value => ({ ...value, [postId]: { count: Math.max(0, previous.count + (previous.mine ? (next ? 0 : -1) : 1)), mine: next } }));
    try {
      const result = next
        ? await supabase.from("community_reactions").upsert({ post_id: postId, user_id: member.id, reaction: next }, { onConflict: "post_id,user_id" })
        : await supabase.from("community_reactions").delete().eq("post_id", postId).eq("user_id", member.id);
      if (result.error) throw result.error;
      setStatus(next ? "Reaction saved." : "Reaction removed.");
    } catch {
      setReactionsByPost(value => ({ ...value, [postId]: previous }));
      setStatus("Could not save that reaction. Your previous reaction has been restored.");
    }
  }

  async function openComments(postId: string) {
    if (!supabase) return;
    setCommentsFor(postId); setComments([]);
    try {
      const { data, error } = await supabase.rpc("raye2_get_post_comments", { p_post_id: postId, p_limit: 50 });
      if (error) throw error;
      const rows = (data ?? []) as Comment[];
      setComments(rows);
      setCommentCounts(current => ({ ...current, [postId]: rows.length }));
    } catch {
      setStatus("Comments could not be loaded. Check your connection and try again.");
    }
  }

  async function submitComment() {
    if (!supabase || !member || !commentsFor || !commentText.trim() || busy) { setStatus("Sign in to join the discussion."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("community_comments").insert({ post_id: commentsFor, author_id: member.id, body: commentText.trim(), status: "published" });
      if (error) throw error;
      setCommentText(""); setStatus("Your reply is live."); void openComments(commentsFor);
    } catch {
      setStatus("Comment submission failed. Your text is still here so you can retry.");
    } finally { setBusy(false); }
  }

  async function loadReplies(rootId: string) {
    if (!supabase) return;
    const { data, error } = await supabase.rpc("raye2_get_post_comment_replies", { p_parent_id: rootId, p_limit: 50 });
    if (error) { setStatus("Replies could not be loaded. Check your connection and try again."); return; }
    setCommentReplies(current => ({ ...current, [rootId]: (data ?? []) as CommentReply[] }));
  }

  async function toggleReplies(rootId: string) {
    if (commentReplies[rootId]) { setCommentReplies(current => { const next = { ...current }; delete next[rootId]; return next; }); return; }
    await loadReplies(rootId);
  }

  async function submitReply(rootId: string) {
    if (!supabase || !member || !commentsFor || !replyDraft.trim() || busy) { setStatus("Sign in to join the discussion."); return; }
    setBusy(true);
    try {
      const { error } = await supabase.from("community_comments").insert({ post_id: commentsFor, author_id: member.id, body: replyDraft.trim(), status: "published", parent_comment_id: rootId });
      if (error) throw error;
      setReplyDraft(""); setReplyOpen(null); setStatus(t.replyPending);
      if (commentReplies[rootId]) await loadReplies(rootId);
      void openComments(commentsFor);
    } catch {
      setStatus("Reply submission failed. Your text is still here so you can retry.");
    } finally { setBusy(false); }
  }

  async function reactToComment(commentId: string, isReply: boolean, current: string | null) {
    if (!supabase || !member) { setStatus("Sign in to react."); return; }
    if (busy) return;
    const reaction = "spark";
    const next = current === reaction ? null : reaction;
    const delta = next && !current ? 1 : !next && current ? -1 : 0;
    setBusy(true);
    if (isReply) setCommentReplies(all => { const copy = { ...all }; for (const key of Object.keys(copy)) copy[key] = copy[key].map(r => r.comment_id === commentId ? { ...r, my_reaction: next, reaction_count: Math.max(0, r.reaction_count + delta) } : r); return copy; });
    else setComments(list => list.map(c => c.id === commentId ? { ...c, my_reaction: next, reaction_count: Math.max(0, c.reaction_count + delta) } : c));
    try {
      const { error } = await supabase.rpc("raye2_toggle_post_comment_reaction", { p_comment_id: commentId, p_reaction: next });
      if (error) throw error;
    } catch {
      setStatus(t.commentReactError);
      if (isReply) setCommentReplies(all => { const copy = { ...all }; for (const key of Object.keys(copy)) copy[key] = copy[key].map(r => r.comment_id === commentId ? { ...r, my_reaction: current, reaction_count: Math.max(0, r.reaction_count - delta) } : r); return copy; });
      else setComments(list => list.map(c => c.id === commentId ? { ...c, my_reaction: current, reaction_count: Math.max(0, c.reaction_count - delta) } : c));
    } finally { setBusy(false); }
  }

  async function toggleSave(postId: string) {
    if (!supabase || !member) { setStatus("Sign in to save community posts."); return; }
    const previous = !!savedByPost[postId];
    const next = !previous;
    setSavedByPost(value => ({ ...value, [postId]: next }));
    try {
      const result = next
        ? await supabase.from("community_bookmarks").insert({ post_id: postId, user_id: member.id })
        : await supabase.from("community_bookmarks").delete().eq("post_id", postId).eq("user_id", member.id);
      if (result.error) throw result.error;
      setStatus(next ? "Post saved." : "Post removed from saved items.");
    } catch {
      setSavedByPost(value => ({ ...value, [postId]: previous }));
      setStatus("Could not update saved posts. Your previous setting has been restored.");
    }
  }

  async function sharePost(post: CommunityPost) {
    const url = window.location.origin + "/community#post-" + post.id;
    try {
      if (typeof navigator.share === "function") {
        await navigator.share({ title: "Raye2", text: post.body.slice(0,180), url });
      } else if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setStatus(t.shareCopied);
      } else {
        setStatus(t.shareError);
      }
    } catch (error) {
      if (error instanceof Error && error.name === "AbortError") return;
      setStatus(t.shareError);
    }
  }

  async function report(postId: string) {
    if (!supabase || !member) { setStatus("Sign in to report content."); return; }
    try {
      const { error } = await supabase.from("content_reports").insert({ reporter_id: member.id, target_type: "post", target_id: postId, reason: "other", details: "Reported from the community feed." });
      if (error) throw error;
      setStatus("Report sent to the moderation team for review.");
    } catch {
      setStatus("We could not send your report. Please try again later.");
    }
  }

  function startEditPost(post: CommunityPost) {
    setEditingPost(post.id);
    setEditBody(post.body);
  }

  async function saveEditPost(postId: string) {
    if (!supabase || !member) { setStatus(t.signIn); return; }
    const trimmed = editBody.trim();
    if (!trimmed) return;
    try {
      const { error } = await supabase.rpc("raye2_update_community_post", { p_post_id: postId, p_body: trimmed });
      if (error) throw error;
      setEditingPost(null);
      setStatus(t.postUpdated);
      router.refresh();
    } catch {
      setStatus(t.editError);
    }
  }

  async function deletePost(postId: string) {
    if (!supabase || !member) { setStatus(t.signIn); return; }
    if (!window.confirm(t.confirmDeletePost)) return;
    try {
      const { error } = await supabase.rpc("raye2_delete_community_post", { p_post_id: postId });
      if (error) throw error;
      setDeletedPosts(list => [...list, postId]);
      setStatus(t.postDeleted);
      router.refresh();
    } catch {
      setStatus(t.deleteError);
    }
  }

  async function deleteComment(commentId: string) {
    if (!supabase || !member) { setStatus(t.signIn); return; }
    try {
      const { error } = await supabase.rpc("raye2_delete_community_comment", { p_comment_id: commentId });
      if (error) throw error;
      setComments(list => list.filter(item => item.id !== commentId));
      setStatus(t.commentDeleted);
    } catch {
      setStatus(t.deleteError);
    }
  }

  async function togglePin(postId: string) {
    if (!supabase || !member) { setStatus(t.signIn); return; }
    const next = !pinnedPosts[postId];
    try {
      const { error } = await supabase.rpc("raye2_set_community_post_pin", { p_post_id: postId, p_pinned: next });
      if (error) throw error;
      setPinnedPosts(value => ({ ...value, [postId]: next }));
      setStatus(next ? t.postPinned : t.postUnpinned);
      router.refresh();
    } catch {
      setStatus(t.pinError);
    }
  }

  return <main className="nhen-app-shell raye2-community-page" data-raye2-surface="community" dir={isArabic?"rtl":"ltr"} lang={locale}>
    <header className="nhen-app-header">
      <Link className="nhen-brand" href="/raye2/home" aria-label="Raye2 home"><span className="raye2-community-mark">R</span></Link>
      <form className="nhen-search-form" action="/search"><input className="nhen-search" type="search" name="q" placeholder={t.search} aria-label="Search Raye2" maxLength={80}/></form>
      <div className="nhen-header-actions">{member ? <><Link className="nhen-muted" href={"/u/"+member.handle}>@{member.handle}</Link><Link className="nhen-icon-button" href="/notifications" aria-label={unreadNotificationCount>0?`${t.notifications}, ${unreadNotificationCount} unread`:t.notifications} title={t.notifications} style={{position:"relative"}}>♧{unreadNotificationCount>0&&<span aria-hidden="true" style={{position:"absolute",top:-5,right:-5,minWidth:17,height:17,padding:"0 4px",borderRadius:99,background:"var(--nhen-accent)",color:"white",fontSize:10,fontWeight:800,lineHeight:"17px",textAlign:"center"}}>{unreadNotificationCount>99?"99+":unreadNotificationCount}</span>}</Link><button className="nhen-icon-button" onClick={signOut} aria-label="Sign out">↗</button></> : <Link className="nhen-pill" href="#join">{t.join}</Link>}</div>
    </header>
    <div className="nhen-platform-grid">
      <aside className="nhen-sidebar" aria-label={t.community}>
        <Link className="nhen-sidebar-link" href="/raye2/home"><span>⌂</span> {t.home}</Link>
        <a className="nhen-sidebar-link" aria-current="page" href="/community"><span>◉</span> {t.community}</a>
        <a className="nhen-sidebar-link" href="#official"><span>✦</span> {t.official}</a>
        <a className="nhen-sidebar-link" href="#latest"><span>◷</span> {t.latest}</a>
        <span className="nhen-section-label">{t.yourSpace}</span>
        <a className="nhen-sidebar-link" href="#join"><span>◎</span> {t.profile}</a>
        <Link className="nhen-sidebar-link" href="/saved"><span>♡</span> {t.saved}</Link>
      </aside>
      <section className="nhen-feed-column">
        <div className="nhen-card nhen-card-pad">
          <div className="nhen-card-heading"><div><span className="nhen-section-label">{t.communityTitle}</span><h1 className="nhen-card-title" style={{fontSize:28,marginTop:6}}>{t.headline}</h1></div><span className="nhen-pill nhen-pill-official">EARLY ACCESS</span></div>
          <p className="nhen-muted" style={{fontSize:14,lineHeight:1.7}}>{t.intro}</p>
        </div>
        {member ? <section className="nhen-card nhen-card-pad" aria-label="Create a community post">
          <div className="nhen-card-heading"><strong>{t.share}</strong><span className="nhen-pill">{t.memberPost}</span></div>
          <textarea value={body} onChange={event=>setBody(event.target.value)} maxLength={2000} rows={4} placeholder={t.compose} style={{width:"100%",resize:"vertical",border:"1px solid var(--nhen-line)",borderRadius:16,background:"var(--nhen-bg)",color:"var(--nhen-ink)",padding:15}} />
          <div className="nhen-moment-compose"><label>{t.attach}<select value={momentVideoId} onChange={e=>setMomentVideoId(e.target.value)}><option value="">{t.noMoment}</option>{momentVideos.map(video=><option key={video.media_id} value={video.media_id}>{video.title}</option>)}</select></label>{momentVideoId && <div className="nhen-moment-time-fields"><label>{t.start}<input type="number" min="0" value={momentStart} onChange={e=>setMomentStart(e.target.value)}/></label><label>{t.end}<input type="number" min="1" value={momentEnd} onChange={e=>setMomentEnd(e.target.value)}/></label><span>{t.upTo}</span></div>}</div>
          {topics.length>0 && <div className="nhen-topic-compose"><label>{t.topicLabel}<select value={topicDraft} onChange={e=>setTopicDraft(e.target.value)}><option value="">{t.topicNone}</option>{topics.map(topic=><option key={topic.slug} value={topic.slug}>{topic.name}</option>)}</select></label></div>}
          <div className="nhen-poll-compose">
            <button type="button" className="nhen-action" aria-pressed={pollMode} onClick={()=>setPollMode(v=>!v)}>{t.pollAdd}</button>
            {pollMode && <div className="nhen-poll-compose-fields">
              <input className="nhen-search" value={pollQuestion} onChange={e=>setPollQuestion(e.target.value)} maxLength={200} placeholder={t.pollQuestion} aria-label={t.pollQuestion}/>
              {pollOptions.map((opt,i)=><div className="nhen-poll-compose-option" key={i}><input className="nhen-search" value={opt} onChange={e=>setPollOptions(list=>list.map((o,j)=>j===i?e.target.value:o))} maxLength={80} placeholder={t.pollOption+" "+(i+1)} aria-label={t.pollOption+" "+(i+1)}/>{pollOptions.length>2 && <button type="button" className="nhen-action" aria-label="Remove option" onClick={()=>setPollOptions(list=>list.filter((_,j)=>j!==i))}>✕</button>}</div>)}
              <div className="nhen-poll-compose-actions">{pollOptions.length<6 && <button type="button" className="nhen-action" onClick={()=>setPollOptions(list=>[...list,""])}>{t.pollAddOption}</button>}<button type="button" className="button button-primary" disabled={busy||!pollQuestion.trim()||pollOptions.filter(o=>o.trim()).length<2} onClick={()=>void submitPoll()}>{t.pollPublish}</button></div>
            </div>}
          </div>
          <div className="nhen-schedule-row"><label>{t.scheduleTime}<input type="datetime-local" value={publishAt} onChange={e=>setPublishAt(e.target.value)} /></label></div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,gap:12,flexWrap:"wrap"}}><span className="nhen-muted" style={{fontSize:11}}>{body.length}/2000 · {t.postsPublish}</span><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button className="nhen-action" disabled={busy || !body.trim()} onClick={()=>void saveDraft()}>{t.saveDraft}</button><button className="nhen-action" disabled={busy || !body.trim() || !publishAt} onClick={()=>void scheduleDraft()}>{t.schedulePost}</button><button className="button button-primary" disabled={busy || !body.trim()} onClick={submitPost}>{t.publish}</button></div></div>
        </section> : <section id="join" className="nhen-card nhen-card-pad">
          <div className="nhen-card-heading"><strong>{t.joinCommunity}</strong><span className="nhen-pill">{t.free}</span></div>
          <div style={{display:"flex",gap:8,marginBottom:14}}><button className="nhen-action" onClick={()=>setAuthMode("signup")} aria-pressed={authMode==="signup"}>{t.create}</button><button className="nhen-action" onClick={()=>setAuthMode("signin")} aria-pressed={authMode==="signin"}>{t.signIn}</button></div>
          {authMode==="signup" && <input className="nhen-search" style={{marginBottom:10}} value={handle} onChange={e=>setHandle(e.target.value)} placeholder={t.handle} maxLength={24} />}
          <input className="nhen-search" style={{marginBottom:10}} type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder={t.email} />
          <input className="nhen-search" style={{marginBottom:10}} type="password" autoComplete={authMode==="signup"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder={t.password} />
          <button className="button button-primary" disabled={busy || !email.trim() || password.length<8} onClick={authenticate}>{busy?t.pleaseWait:authMode==="signup"?t.create:t.signIn} ↗</button>
          <p className="nhen-muted" style={{fontSize:11,marginTop:12}}>{t.membership}</p>
        </section>}
        {status && <p role="status" aria-live="polite" className="nhen-card nhen-card-pad" style={{fontSize:13}}>{status}</p>}
        {member && myDrafts.length>0 && <section className="nhen-card nhen-card-pad" aria-label={t.drafts}>
          <div className="nhen-card-heading"><strong>{t.drafts}</strong><span className="nhen-pill">{myDrafts.length}</span></div>
          <div style={{display:"grid",gap:10,marginTop:10}}>{myDrafts.map(draft=><div key={draft.id} style={{display:"flex",gap:10,alignItems:"center",justifyContent:"space-between",border:"1px solid var(--nhen-line)",borderRadius:14,padding:"10px 12px"}}><div style={{minWidth:0,flex:1}}><span className="nhen-muted" style={{fontSize:11,display:"block"}}>{draft.publishAt?<>{t.scheduledFor} {new Date(draft.publishAt).toLocaleString(isArabic?"ar-EG":"en-US")}</>:t.drafts}</span><span style={{fontSize:13,display:"block",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{draft.body}</span></div><div style={{display:"flex",gap:8}}><button className="nhen-action" disabled={busy} onClick={()=>void publishDraftNow(draft.id)}>{t.publishNow}</button><button className="nhen-action" disabled={busy} onClick={()=>void cancelScheduled(draft.id)}>{t.cancelScheduled}</button></div></div>)}</div>
        </section>}
        <div className="nhen-feed-tabs"><Link className={selectedFeed==="latest"?"active":""} href={selectedSort==="hot"?"/community?sort=hot":"/community"}>{t.allPosts}</Link><Link className={selectedFeed==="following"?"active":""} href={selectedSort==="hot"?"/community?feed=following&sort=hot":"/community?feed=following"}>{t.following}</Link></div>
        <div className="nhen-feed-filter" role="group" aria-label={isArabic?"ترتيب المنشورات":"Sort posts"}>
          <Link className={selectedSort==="latest"?"active":""} aria-current={selectedSort==="latest"?"true":undefined} href={selectedFeed==="following"?"/community?feed=following":"/community"}>{t.newest}</Link>
          <Link className={selectedSort==="hot"?"active":""} aria-current={selectedSort==="hot"?"true":undefined} href={selectedFeed==="following"?"/community?feed=following&sort=hot":"/community?sort=hot"}>{t.hot}</Link>
        </div>
        <div className="nhen-feed-filter" role="group" aria-label={isArabic?"تصفية المنشورات":"Filter posts"}>
          <button type="button" className={postFilter==="all"?"active":""} aria-pressed={postFilter==="all"} onClick={()=>setPostFilter("all")}>{t.allPosts}</button>
          <button type="button" className={postFilter==="official"?"active":""} aria-pressed={postFilter==="official"} onClick={()=>setPostFilter("official")}>{t.officialPosts}</button>
          <button type="button" className={postFilter==="members"?"active":""} aria-pressed={postFilter==="members"} onClick={()=>setPostFilter("members")}>{t.memberPosts}</button>
        </div>
        {topics.length>0 && <div className="nhen-feed-filter" role="group" aria-label={t.topicFilterLabel}><button type="button" className={topicFilter==="all"?"active":""} aria-pressed={topicFilter==="all"} onClick={()=>setTopicFilter("all")}>{t.topicAll}</button>{topics.map(topic=><button key={topic.slug} type="button" className={topicFilter===topic.slug?"active":""} aria-pressed={topicFilter===topic.slug} onClick={()=>setTopicFilter(topic.slug)}>{topic.name}{topic.postCount?` · ${topic.postCount}`:""}</button>)}</div>}
        <div className="nhen-card-heading" id="latest"><h2 className="nhen-card-title">{selectedFeed==="following"?t.fromFollowing:t.latestConversations}</h2><span className="nhen-muted" style={{fontSize:12}}>{visiblePosts.length} {t.posts}</span></div>
        {visiblePosts.length===0 ? <div className="nhen-card nhen-empty-state"><div><div style={{fontSize:32,marginBottom:12}}>✳</div><strong>{selectedFeed==="following"?(member?t.followingEmpty:t.signInToFollow):(initialPosts.length===0?t.first:t.filteredEmpty)}</strong><p className="nhen-muted">{selectedFeed==="following"&&!member?t.signInToFollow:selectedFeed==="following"?t.followingEmpty:initialPosts.length===0?t.empty:t.filteredEmpty}</p>{selectedFeed==="following"&&member&&<Link className="nhen-action" href="/search">{t.discoverMembers}</Link>}{selectedFeed==="following"&&!member&&<a className="nhen-action" href="#join">{t.join}</a>}</div></div> : visiblePosts.map(post=><article className="nhen-card" id={"post-"+post.id} key={post.id}>
          <div className="nhen-post-header"><div className="nhen-avatar" style={{display:"grid",placeItems:"center",fontWeight:800,color:"var(--nhen-accent)"}}>{post.author.display_name.slice(0,1).toUpperCase()}</div><div style={{minWidth:0,flex:1}}><strong style={{fontSize:13}}>{post.author.display_name}</strong><div className="nhen-muted" style={{fontSize:11,marginTop:3}}>@{post.author.handle} · {new Date(post.createdAt).toLocaleDateString(isArabic?"ar-EG":"en-US")}</div></div>{post.type==="official" && <span className="nhen-pill nhen-pill-official">✦ {t.official}</span>}{post.topicName && <span className="nhen-pill">#{post.topicName}</span>}{pinnedPosts[post.id] && <span className="nhen-pill">📌 {t.pinned}</span>}<button className="nhen-action" onClick={()=>void report(post.id)} aria-label={t.report}>•••</button></div>
          {editingPost===post.id ? <div style={{display:"grid",gap:8,marginTop:10}}><textarea className="nhen-search" style={{width:"100%",minHeight:90,resize:"vertical",padding:12}} value={editBody} onChange={e=>setEditBody(e.target.value)} maxLength={2000}/><div style={{display:"flex",gap:8}}><button className="button button-primary" disabled={!editBody.trim()} onClick={()=>void saveEditPost(post.id)}>{t.saveEdit}</button><button className="nhen-action" onClick={()=>setEditingPost(null)}>{t.cancelEdit}</button></div></div> : <div className="nhen-post-body">{post.body}</div>}{post.linkedVideoId && <Link className="nhen-action" href={"/watch/"+momentVideos.find(video=>video.media_id===post.linkedVideoId)?.slug}>▶ {t.sharedMoment}</Link>}{post.poll && <div className="nhen-poll">
            <strong className="nhen-poll-question">{post.poll.question}</strong>
            <div className="nhen-poll-options">{post.poll.options.map(opt=>{const optimisticVote=pollVotes[post.id];const myVote=optimisticVote??post.poll!.myVote;const revealed=!!myVote;const total=post.poll!.total+(optimisticVote&&!post.poll!.myVote?1:0);const votes=opt.votes+(optimisticVote===opt.option&&!post.poll!.myVote?1:0);const pct=total?Math.round((votes/total)*100):0;const chosen=myVote===opt.option;return <button type="button" key={opt.option} className={"nhen-poll-option"+(chosen?" is-chosen":"")+(revealed?" is-revealed":"")} disabled={revealed||busy||!member} aria-pressed={chosen} onClick={()=>void votePoll(post.id,post.poll!.id,opt.option)}><span className="nhen-poll-bar" style={{width:(revealed?pct:0)+"%"}}/><span className="nhen-poll-option-label">{opt.option}</span>{revealed && <span className="nhen-poll-option-pct">{pct}% · {votes}</span>}</button>})}</div>
            <div className="nhen-poll-meta"><span>{post.poll.total} {t.pollVotes}</span>{post.poll.closesAt && <span>{t.pollCloses} {new Date(post.poll.closesAt).toLocaleDateString(isArabic?"ar-EG":"en-US")}</span>}{!member && <span>{t.signIn}</span>}</div>
          </div>}
          <div className="nhen-post-actions"><div className={"nhen-reaction-picker"+(reactionMenuFor===post.id?" is-open":"")} onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget as Node|null))setReactionMenuFor(null)}} onKeyDown={event=>{if(event.key==="Escape"){setReactionMenuFor(null);(event.currentTarget.querySelector(".nhen-reaction-trigger") as HTMLButtonElement|null)?.focus()}}}><button type="button" className="nhen-action nhen-reaction-trigger" aria-haspopup="true" aria-expanded={reactionMenuFor===post.id} aria-label="Choose a reaction" onClick={()=>setReactionMenuFor(current=>current===post.id?null:post.id)}>{reactionsByPost[post.id]?.mine ? <NhenReactionArt reaction={communityReactionArt(reactionsByPost[post.id].mine ?? "spark")} size={20}/> : <NhenReactionArt reaction="spark" size={20}/>} {(reactionsByPost[post.id]?.mine ? reactionLabels[reactionsByPost[post.id].mine as string] : t.react)} ▾</button><div className="nhen-reaction-menu" role="group" aria-label={t.react}>{reactions.map(item=><button className="nhen-action" key={item.key} aria-pressed={reactionsByPost[post.id]?.mine===item.key} onClick={()=>void react(post.id,item.key)} title={reactionLabels[item.key]}><NhenReactionArt reaction={communityReactionArt(item.key)} size={23}/> <span>{reactionLabels[item.key]}</span></button>)}</div></div><button className="nhen-action" onClick={()=>void openComments(post.id)}>{t.comments}{commentCounts[post.id]?` · ${commentCounts[post.id]}`:""}</button><button className="nhen-action" aria-pressed={!!savedByPost[post.id]} onClick={()=>void toggleSave(post.id)}>{savedByPost[post.id]?"▣ "+(isArabic?"تم الحفظ":"Saved"):"▢ "+(isArabic?"حفظ":"Save")}</button>{member && collections.length>0 && <div className="nhen-collection-picker"><button className="nhen-action" aria-haspopup="true" aria-expanded={collectionMenuFor===post.id} onClick={()=>setCollectionMenuFor(current=>current===post.id?null:post.id)}>{t.addToCollection} ▾</button>{collectionMenuFor===post.id && <div className="nhen-reaction-menu" role="group" aria-label={t.collections}>{collections.map(col=><button className="nhen-action" key={col.id} onClick={()=>void addToCollection(col.id,post.id)}>{col.name} · {col.itemCount}</button>)}</div>}</div>}<button className="nhen-action" onClick={()=>void sharePost(post)} aria-label={t.sharePost}>↗ {t.sharePost}</button>{member && member.id===post.authorId && editingPost!==post.id && <button className="nhen-action" onClick={()=>startEditPost(post)}>{t.editPost}</button>}{member && member.id===post.authorId && <button className="nhen-action" onClick={()=>void deletePost(post.id)}>{t.deletePost}</button>}{member && canModerate && <button className="nhen-action" aria-pressed={!!pinnedPosts[post.id]} onClick={()=>void togglePin(post.id)}>{pinnedPosts[post.id]?t.unpinPost:t.pinPost}</button>}</div>
          {commentsFor===post.id && <div className="nhen-card-pad" style={{borderTop:"1px solid var(--nhen-line)"}}><strong style={{fontSize:13}}>{t.discussion}</strong>{comments.map(comment=><div key={comment.id} className="nhen-comment-item"><p style={{fontSize:13,padding:"8px 0",borderBottom:"1px solid var(--nhen-line)",display:"flex",justifyContent:"space-between",alignItems:"center",gap:10}}><span style={{minWidth:0}}><strong style={{fontSize:11,display:"block",color:"var(--nhen-accent)"}}>@{comment.author_handle??"member"}{comment.author_display_name?` · ${comment.author_display_name}`:""}</strong>{comment.body}</span>{member && member.id===comment.author_id && <button className="nhen-action" onClick={()=>void deleteComment(comment.id)}>{t.deleteComment}</button>}</p><div className="nhen-comment-actions"><button type="button" className={comment.my_reaction?"nhen-action is-active":"nhen-action"} aria-pressed={!!comment.my_reaction} aria-label={t.reactComment} onClick={()=>void reactToComment(comment.id,false,comment.my_reaction)}>✨ {comment.reaction_count}</button>{member&&<button type="button" className="nhen-action" onClick={()=>{setReplyOpen(open=>open===comment.id?null:comment.id);setReplyDraft("")}}>{t.replyBtn}</button>}{comment.reply_count>0&&<button type="button" className="nhen-action" onClick={()=>void toggleReplies(comment.id)}>{commentReplies[comment.id]?t.hideReplies:t.showReplies} · {comment.reply_count}</button>}</div>{replyOpen===comment.id&&<div style={{display:"flex",gap:8,marginTop:8}}><input className="nhen-search" value={replyDraft} onChange={e=>setReplyDraft(e.target.value)} placeholder={t.replyPlaceholder} maxLength={1000}/><button className="nhen-action" onClick={()=>void submitReply(comment.id)}>{t.replyAction}</button></div>}{commentReplies[comment.id]&&<div className="nhen-comment-replies">{(commentReplies[comment.id]??[]).length?(commentReplies[comment.id]??[]).map(reply=><div key={reply.comment_id}><p style={{fontSize:13,padding:"8px 0",borderBottom:"1px solid var(--nhen-line)"}}><span style={{minWidth:0}}><strong style={{fontSize:11,display:"block",color:"var(--nhen-accent)"}}>@{reply.author_handle??"member"}{reply.author_display_name?` · ${reply.author_display_name}`:""}</strong>{reply.body}</span></p><div className="nhen-comment-actions"><button type="button" className={reply.my_reaction?"nhen-action is-active":"nhen-action"} aria-pressed={!!reply.my_reaction} aria-label={t.reactComment} onClick={()=>void reactToComment(reply.comment_id,true,reply.my_reaction)}>✨ {reply.reaction_count}</button></div></div>):<p className="nhen-muted">{t.noReplies}</p>}</div>}</div>)}{member && <div style={{display:"flex",gap:8,marginTop:12}}><input className="nhen-search" value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder={t.reply} maxLength={1000}/><button className="nhen-action" onClick={()=>void submitComment()}>{t.send}</button></div>}<p className="nhen-muted" style={{fontSize:10,marginTop:8}}>{t.instant}</p></div>}
        </article>)}
      </section>
      <aside className="nhen-discovery-column">
        {member&&suggestedMembers.length>0&&<section className="nhen-card nhen-card-pad"><span className="nhen-section-label">{t.suggested}</span><div style={{display:"grid",gap:13,marginTop:14}}>{suggestedMembers.map(person=><div key={person.userId} style={{display:"flex",alignItems:"center",gap:9,minWidth:0}}><Link href={"/u/"+person.handle} style={{flex:1,minWidth:0,textDecoration:"none"}}><strong style={{display:"block",fontSize:13,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{person.displayName}</strong><span className="nhen-muted" style={{fontSize:11}}>@{person.handle}</span></Link><button type="button" className="nhen-action" disabled={followBusy===person.userId||followedSuggestions.includes(person.userId)} onClick={()=>void followSuggested(person.userId)}>{followedSuggestions.includes(person.userId)?t.followingMember:followBusy===person.userId?"…":t.followMember}</button></div>)}</div><Link className="nhen-action" href="/search" style={{display:"inline-block",marginTop:14}}>{t.discoverMembers}</Link></section>}
        {member&&<section className="nhen-card nhen-card-pad" aria-label={t.collections}><span className="nhen-section-label">{t.collections}</span><div style={{display:"flex",gap:8,marginTop:12}}><input className="nhen-search" value={newCollectionName} onChange={e=>setNewCollectionName(e.target.value)} placeholder={t.collectionName} maxLength={60}/><button className="nhen-action" disabled={busy||!newCollectionName.trim()} onClick={()=>void createCollection()}>{t.newCollection}</button></div>{collections.length===0?<p className="nhen-muted" style={{fontSize:12,marginTop:12}}>{t.noCollections}</p>:<div style={{display:"grid",gap:10,marginTop:12}}>{collections.map(col=><div key={col.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:8}}><strong style={{fontSize:13}}>{col.name}</strong><span className="nhen-muted" style={{fontSize:11}}>{col.itemCount}</span></div>)}</div>}</section>}
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">{t.fromCreator}</span><h2 className="nhen-card-title" style={{marginTop:9}}>{t.officialUpdates}</h2><p className="nhen-muted" style={{fontSize:13,lineHeight:1.65}}>{t.announcements}</p><a className="nhen-action" href="#official">{t.exploreUpdates}</a></section>
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">{t.standard}</span><h2 className="nhen-card-title" style={{marginTop:9}}>{isArabic?"اجعلها مساحة تستحق القراءة.":"Make it worth reading."}</h2><ul className="nhen-muted" style={{fontSize:12,lineHeight:1.9,paddingLeft:18}}><li>{t.respect}</li><li>{t.rights}</li><li>{t.privacy}</li><li>{t.reportProblems}</li></ul></section>
      </aside>
    </div>
    <nav className="nhen-mobile-nav" aria-label="Mobile navigation"><Link href="/raye2/home">⌂<span>{t.home}</span></Link><a aria-current="page" href="/community">◉<span>{t.community}</span></a><a href="#latest">◷<span>{t.latest}</span></a><a href="#join">◎<span>{t.profile}</span></a></nav>
  </main>;
}

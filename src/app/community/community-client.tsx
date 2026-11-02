"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NhenReactionArt from "@/app/watch/[slug]/nhen-reaction-art";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Author = { handle: string; display_name: string; avatar_url: string | null };
export type CommunityPost = { id: string; authorId: string; type: string; body: string; createdAt: string; linkedVideoId: string | null; author: Author };
type Member = { id: string; handle: string; displayName: string };
type MomentVideo = { media_id: string; slug: string; title: string; duration_seconds: number | null };
type MomentCatalogRow = { media_id: string; slug: string; duration_seconds: number | null; media_items: { title: string; is_published: boolean; media_type: string } | Array<{ title: string; is_published: boolean; media_type: string }> | null };

const reactions = [{ key: "like", label: "Like", icon: "♡" }, { key: "love", label: "Love", icon: "♥" }, { key: "insightful", label: "Insightful", icon: "✦" }, { key: "funny", label: "Funny", icon: "笑" }, { key: "spark", label: "Spark", icon: "✧" }, { key: "hype", label: "Hype", icon: "⚡" }, { key: "respect", label: "Respect", icon: "✊" }, { key: "curious", label: "Curious", icon: "◉" }] as const;


function communityReactionArt(key: string): string {
  const art: Record<string,string> = { like: "support", love: "support", insightful: "mindblown", funny: "laugh", spark: "spark", hype: "legend", respect: "legend", curious: "orbit" };
  return art[key] ?? "spark";
}

export default function CommunityClient({ initialPosts, selectedFeed, unreadNotificationCount }: { initialPosts: CommunityPost[]; selectedFeed: "following" | "latest"; unreadNotificationCount: number }) {
  const router = useRouter();
  const supabase = useMemo(() => getSupabaseBrowserClient(), []);
  const [member, setMember] = useState<Member | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [handle, setHandle] = useState("");
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signup");
  const [body, setBody] = useState("");
  const [momentVideos, setMomentVideos] = useState<MomentVideo[]>([]);
  const [momentVideoId, setMomentVideoId] = useState("");
  const [momentStart, setMomentStart] = useState("0");
  const [momentEnd, setMomentEnd] = useState("15");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [reactionsByPost, setReactionsByPost] = useState<Record<string, { count: number; mine: string | null }>>({});
  const [savedByPost, setSavedByPost] = useState<Record<string, boolean>>({});
  const [commentsFor, setCommentsFor] = useState<string | null>(null);
  const [comments, setComments] = useState<Array<{id:string;body:string;author_id:string;created_at:string}>>([]);
  const [commentText, setCommentText] = useState("");
  const [locale,setLocale]=useState<"en"|"ar">("en");
  const [postFilter,setPostFilter]=useState<"all"|"official"|"members">("all");
  const isArabic=locale==="ar";
  const visiblePosts=useMemo(()=>initialPosts.filter(post=>postFilter==="all"||(postFilter==="official"?post.type==="official":post.type!=="official")),[initialPosts,postFilter]);
  const t=isArabic?{
    search:"ابحث في NHEN",join:"انضم إلى NHEN",home:"الرئيسية",community:"المجتمع",official:"رسمي",latest:"الأحدث",yourSpace:"مساحتك",profile:"الملف الشخصي",saved:"المحفوظات",communityTitle:"مجتمع NHEN",headline:"هنا تبدأ الحكاية.",intro:"مساحة تجمع صانع المحتوى والمهتمين بما يقدمه. التحديثات الرسمية واضحة، ومنشورات الأعضاء تصل فورًا، والبلاغات تصل للمشرفين.",share:"شارك المجتمع شيئًا",memberPost:"منشور عضو",compose:"ابدأ نقاشًا مفيدًا…",attach:"أرفق لحظة فيديو (اختياري)",noMoment:"بدون لحظة فيديو",start:"البداية (بالثواني)",end:"النهاية (بالثواني)",upTo:"حتى 3 دقائق من فيديو رسمي.",publish:"انشر ↗",posts:"منشور",joinCommunity:"انضم إلى المجتمع",free:"حساب مجاني",create:"إنشاء حساب",signIn:"تسجيل الدخول",handle:"اختر اسم مستخدم (اختياري)",email:"البريد الإلكتروني",password:"كلمة المرور",pleaseWait:"انتظر…",membership:"عضوية المجتمع منفصلة عن صلاحيات المبدعين والإدارة. لا تشارك كلمة مرورك.",following:"تتابعهم",fromFollowing:"من الأشخاص الذين تتابعهم",latestConversations:"أحدث النقاشات",first:"في انتظار أول نقاش.",empty:"ستظهر التحديثات الرسمية ومنشورات الأعضاء المعتمدة هنا.",officialUpdates:"تحديثات رسمية",report:"الإبلاغ عن المنشور",sharedMoment:"لحظة فيديو مشتركة ↗",react:"تفاعل",comments:"التعليقات",discussion:"النقاش",reply:"اكتب ردًا…",send:"إرسال",instant:"تظهر الردود فورًا. أبلغ عن أي محتوى يخالف قواعد المجتمع.",fromCreator:"من صانع المحتوى",announcements:"تظهر إعلانات NHEN الرسمية بوضوح بعيدًا عن نقاشات الأعضاء.",exploreUpdates:"استكشف التحديثات ↗",standard:"معايير المجتمع",respect:"كن محترمًا وبنّاءً.",rights:"انشر فقط محتوى تملك حقوقه.",privacy:"لا تنشر معلومات خاصة.",reportProblems:"أبلغ عن المشكلات بدلًا من تصعيدها.",sharePost:"مشاركة المنشور",shareCopied:"تم نسخ رابط المنشور.",shareError:"تعذرت مشاركة المنشور تلقائيًا.",allPosts:"الكل",officialPosts:"رسمي",memberPosts:"الأعضاء",filteredEmpty:"لا توجد منشورات في هذا التصنيف حاليًا.",followingEmpty:"لا توجد منشورات جديدة ممن تتابعهم. اكتشف أعضاءً جددًا وابدأ بمتابعتهم.",signInToFollow:"سجّل الدخول لمشاهدة منشورات الأشخاص الذين تتابعهم.",discoverMembers:"اكتشف الأعضاء ↗",notifications:"الإشعارات",postsPublish:"تُنشر المنشورات فورًا",momentUnavailable:"الفيديو المرتبط غير متاح حاليًا."
  }:{
    search:"Search NHEN",join:"Join NHEN",home:"Home",community:"Community",official:"Official",latest:"Latest",yourSpace:"YOUR SPACE",profile:"Profile",saved:"Saved",communityTitle:"NHEN COMMUNITY",headline:"The conversation starts here.",intro:"A space for the creator and the people around the work. Official updates are clearly marked. Member posts publish instantly; reports go to moderators.",share:"Share something with the community",memberPost:"MEMBER POST",compose:"Start a thoughtful conversation…",attach:"Attach a video moment (optional)",noMoment:"No video moment",start:"Start (seconds)",end:"End (seconds)",upTo:"Up to 3 minutes from an official video.",publish:"Publish ↗",posts:"posts",joinCommunity:"Join the community",free:"FREE ACCOUNT",create:"Create account",signIn:"Sign in",handle:"Choose a handle (optional)",email:"Email address",password:"Password",pleaseWait:"Please wait…",membership:"Community membership is separate from creator/admin access. Never share your password.",following:"Following",fromFollowing:"From people you follow",latestConversations:"Latest conversations",first:"The first conversation is waiting.",empty:"Official updates and approved member posts will appear here.",officialUpdates:"Official updates",report:"Report post",sharedMoment:"Shared video moment ↗",react:"React",comments:"Comments",discussion:"Discussion",reply:"Write a reply…",send:"Send",instant:"Replies appear instantly. Report anything that breaks the community rules.",fromCreator:"FROM THE CREATOR",announcements:"Announcements from NHEN are marked and kept distinct from member discussions.",exploreUpdates:"Explore updates ↗",standard:"COMMUNITY STANDARD",respect:"Be respectful and constructive.",rights:"Share only content you have rights to.",privacy:"Do not post private information.",reportProblems:"Report problems rather than escalating.",sharePost:"Share post",shareCopied:"Post link copied.",shareError:"This post could not be shared automatically.",allPosts:"All",officialPosts:"Official",memberPosts:"Members",filteredEmpty:"There are no posts in this category yet.",followingEmpty:"No new posts from people you follow. Discover members and follow a few to build your feed.",signInToFollow:"Sign in to see posts from people you follow.",discoverMembers:"Discover members ↗",notifications:"Notifications",postsPublish:"Posts publish instantly",momentUnavailable:"The linked video is currently unavailable."
  };
  const reactionLabels:Record<string,string>=isArabic?{like:"إعجاب",love:"أحببته",insightful:"مفيد",funny:"مضحك",spark:"شرارة",hype:"حماس",respect:"احترام",curious:"فضول"}:{like:"Like",love:"Love",insightful:"Insightful",funny:"Funny",spark:"Spark",hype:"Hype",respect:"Respect",curious:"Curious"};
  useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);

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
    if (!supabase) return;
    let alive = true;
    void supabase.from("video_catalog").select("media_id,slug,duration_seconds,media_items!inner(title,is_published,media_type)").not("published_at","is",null).eq("media_items.is_published",true).then(({data,error}: {data: MomentCatalogRow[] | null; error: unknown}) => {
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
      for (const id of ids) grouped[id] = { count: 0, mine: null };
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
      const { error } = await supabase.from("community_posts").insert({ author_id: member.id, post_type: "member", body: body.trim(), status: "published", linked_video_id: selectedVideo?.media_id ?? null, moment_start_seconds: selectedVideo ? start : null, moment_end_seconds: selectedVideo ? end : null });
      if (error) throw error;
      setBody(""); setMomentVideoId(""); setMomentStart("0"); setMomentEnd("15"); setStatus("Your post is live in the community."); router.refresh();
    } catch (error) { setStatus(error instanceof Error ? error.message : "Post submission failed."); }
    finally { setBusy(false); }
  }

  async function react(postId: string, reaction: string) {
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
      const { data, error } = await supabase.from("community_comments").select("id,body,author_id,created_at").eq("post_id",postId).eq("status","published").order("created_at",{ascending:true}).limit(30);
      if (error) throw error;
      setComments(data ?? []);
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
        await navigator.share({ title: "NHEN", text: post.body.slice(0,180), url });
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

  return <main className="nhen-app-shell" dir={isArabic?"rtl":"ltr"} lang={locale}>
    <header className="nhen-app-header">
      <Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link>
      <form className="nhen-search-form" action="/search"><input className="nhen-search" type="search" name="q" placeholder={t.search} aria-label="Search NHEN" maxLength={80}/></form>
      <div className="nhen-header-actions">{member ? <><Link className="nhen-muted" href={"/u/"+member.handle}>@{member.handle}</Link><Link className="nhen-icon-button" href="/notifications" aria-label={unreadNotificationCount>0?`${t.notifications}, ${unreadNotificationCount} unread`:t.notifications} title={t.notifications} style={{position:"relative"}}>♧{unreadNotificationCount>0&&<span aria-hidden="true" style={{position:"absolute",top:-5,right:-5,minWidth:17,height:17,padding:"0 4px",borderRadius:99,background:"var(--nhen-accent)",color:"white",fontSize:10,fontWeight:800,lineHeight:"17px",textAlign:"center"}}>{unreadNotificationCount>99?"99+":unreadNotificationCount}</span>}</Link><button className="nhen-icon-button" onClick={signOut} aria-label="Sign out">↗</button></> : <Link className="nhen-pill" href="#join">{t.join}</Link>}</div>
    </header>
    <div className="nhen-platform-grid">
      <aside className="nhen-sidebar" aria-label={t.community}>
        <Link className="nhen-sidebar-link" href="/"><span>⌂</span> {t.home}</Link>
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
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,gap:12}}><span className="nhen-muted" style={{fontSize:11}}>{body.length}/2000 · Posts publish instantly</span><button className="button button-primary" disabled={busy || !body.trim()} onClick={submitPost}>{t.publish}</button></div>
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
        <div className="nhen-feed-tabs"><Link className={selectedFeed==="latest"?"active":""} href="/community">{t.latest}</Link><Link className={selectedFeed==="following"?"active":""} href="/community?feed=following">{t.following}</Link></div>
        <div className="nhen-feed-filter" role="group" aria-label={isArabic?"تصفية المنشورات":"Filter posts"}>
          <button type="button" className={postFilter==="all"?"active":""} aria-pressed={postFilter==="all"} onClick={()=>setPostFilter("all")}>{t.allPosts}</button>
          <button type="button" className={postFilter==="official"?"active":""} aria-pressed={postFilter==="official"} onClick={()=>setPostFilter("official")}>{t.officialPosts}</button>
          <button type="button" className={postFilter==="members"?"active":""} aria-pressed={postFilter==="members"} onClick={()=>setPostFilter("members")}>{t.memberPosts}</button>
        </div>
        <div className="nhen-card-heading" id="latest"><h2 className="nhen-card-title">{selectedFeed==="following"?t.fromFollowing:t.latestConversations}</h2><span className="nhen-muted" style={{fontSize:12}}>{visiblePosts.length} {t.posts}</span></div>
        {visiblePosts.length===0 ? <div className="nhen-card nhen-empty-state"><div><div style={{fontSize:32,marginBottom:12}}>✳</div><strong>{selectedFeed==="following"?(member?t.followingEmpty:t.signInToFollow):(initialPosts.length===0?t.first:t.filteredEmpty)}</strong><p className="nhen-muted">{selectedFeed==="following"&&!member?t.signInToFollow:selectedFeed==="following"?t.followingEmpty:initialPosts.length===0?t.empty:t.filteredEmpty}</p>{selectedFeed==="following"&&member&&<Link className="nhen-action" href="/search">{t.discoverMembers}</Link>}{selectedFeed==="following"&&!member&&<a className="nhen-action" href="#join">{t.join}</a>}</div></div> : visiblePosts.map(post=><article className="nhen-card" id={"post-"+post.id} key={post.id}>
          <div className="nhen-post-header"><div className="nhen-avatar" style={{display:"grid",placeItems:"center",fontWeight:800,color:"var(--nhen-accent)"}}>{post.author.display_name.slice(0,1).toUpperCase()}</div><div style={{minWidth:0,flex:1}}><strong style={{fontSize:13}}>{post.author.display_name}</strong><div className="nhen-muted" style={{fontSize:11,marginTop:3}}>@{post.author.handle} · {new Date(post.createdAt).toLocaleDateString(isArabic?"ar-EG":"en-US")}</div></div>{post.type==="official" && <span className="nhen-pill nhen-pill-official">✦ {t.official}</span>}<button className="nhen-action" onClick={()=>void report(post.id)} aria-label={t.report}>•••</button></div>
          <div className="nhen-post-body">{post.body}</div>{post.linkedVideoId && <Link className="nhen-action" href={"/watch/"+momentVideos.find(video=>video.media_id===post.linkedVideoId)?.slug}>▶ {t.sharedMoment}</Link>}
          <div className="nhen-post-actions"><div className="nhen-reaction-picker"><button className="nhen-action nhen-reaction-trigger" aria-haspopup="true" aria-label="Choose a reaction">{reactionsByPost[post.id]?.mine ? <NhenReactionArt reaction={communityReactionArt(reactionsByPost[post.id].mine ?? "spark")} size={20}/> : <NhenReactionArt reaction="spark" size={20}/>} {(reactionsByPost[post.id]?.mine ? reactionLabels[reactionsByPost[post.id].mine as string] : t.react)} ▾</button><div className="nhen-reaction-menu" role="group" aria-label={t.react}>{reactions.map(item=><button className="nhen-action" key={item.key} aria-pressed={reactionsByPost[post.id]?.mine===item.key} onClick={()=>void react(post.id,item.key)} title={reactionLabels[item.key]}><NhenReactionArt reaction={communityReactionArt(item.key)} size={23}/> <span>{reactionLabels[item.key]}</span></button>)}</div></div><button className="nhen-action" onClick={()=>void openComments(post.id)}>{t.comments}</button><button className="nhen-action" aria-pressed={!!savedByPost[post.id]} onClick={()=>void toggleSave(post.id)}>{savedByPost[post.id]?"▣ "+(isArabic?"تم الحفظ":"Saved"):"▢ "+(isArabic?"حفظ":"Save")}</button><button className="nhen-action" onClick={()=>void sharePost(post)} aria-label={t.sharePost}>↗ {t.sharePost}</button></div>
          {commentsFor===post.id && <div className="nhen-card-pad" style={{borderTop:"1px solid var(--nhen-line)"}}><strong style={{fontSize:13}}>{t.discussion}</strong>{comments.map(comment=><p key={comment.id} style={{fontSize:13,padding:"8px 0",borderBottom:"1px solid var(--nhen-line)"}}>{comment.body}</p>)}{member && <div style={{display:"flex",gap:8,marginTop:12}}><input className="nhen-search" value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder={t.reply} maxLength={1000}/><button className="nhen-action" onClick={()=>void submitComment()}>{t.send}</button></div>}<p className="nhen-muted" style={{fontSize:10,marginTop:8}}>{t.instant}</p></div>}
        </article>)}
      </section>
      <aside className="nhen-discovery-column">
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">{t.fromCreator}</span><h2 className="nhen-card-title" style={{marginTop:9}}>{t.officialUpdates}</h2><p className="nhen-muted" style={{fontSize:13,lineHeight:1.65}}>{t.announcements}</p><a className="nhen-action" href="#official">{t.exploreUpdates}</a></section>
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">{t.standard}</span><h2 className="nhen-card-title" style={{marginTop:9}}>{isArabic?"اجعلها مساحة تستحق القراءة.":"Make it worth reading."}</h2><ul className="nhen-muted" style={{fontSize:12,lineHeight:1.9,paddingLeft:18}}><li>{t.respect}</li><li>{t.rights}</li><li>{t.privacy}</li><li>{t.reportProblems}</li></ul></section>
      </aside>
    </div>
    <nav className="nhen-mobile-nav" aria-label="Mobile navigation"><Link href="/">⌂<span>{t.home}</span></Link><a aria-current="page" href="/community">◉<span>{t.community}</span></a><a href="#latest">◷<span>{t.latest}</span></a><a href="#join">◎<span>{t.profile}</span></a></nav>
  </main>;
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type Author = { handle: string; display_name: string; avatar_url: string | null };
export type CommunityPost = { id: string; authorId: string; type: string; body: string; createdAt: string; linkedVideoId: string | null; author: Author };
type Member = { id: string; handle: string; displayName: string };
type MomentVideo = { media_id: string; slug: string; title: string; duration_seconds: number | null };
type MomentCatalogRow = { media_id: string; slug: string; duration_seconds: number | null; media_items: { title: string; is_published: boolean; media_type: string } | Array<{ title: string; is_published: boolean; media_type: string }> | null };

const reactions = [{ key: "like", label: "Like", icon: "♡" }, { key: "love", label: "Love", icon: "♥" }, { key: "insightful", label: "Insightful", icon: "✦" }, { key: "funny", label: "Funny", icon: "笑" }, { key: "spark", label: "Spark", icon: "✧" }, { key: "hype", label: "Hype", icon: "⚡" }, { key: "respect", label: "Respect", icon: "✊" }, { key: "curious", label: "Curious", icon: "◉" }] as const;

export default function CommunityClient({ initialPosts, selectedFeed }: { initialPosts: CommunityPost[]; selectedFeed: "following" | "latest" }) {
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

  return <main className="nhen-app-shell">
    <header className="nhen-app-header">
      <Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link>
      <form className="nhen-search-form" action="/search"><input className="nhen-search" type="search" name="q" placeholder="Search NHEN" aria-label="Search NHEN" maxLength={80}/></form>
      <div className="nhen-header-actions">{member ? <><Link className="nhen-muted" href={"/u/"+member.handle}>@{member.handle}</Link><Link className="nhen-icon-button" href="/notifications" aria-label="Notifications">♧</Link><button className="nhen-icon-button" onClick={signOut} aria-label="Sign out">↗</button></> : <Link className="nhen-pill" href="#join">Join NHEN</Link>}</div>
    </header>
    <div className="nhen-platform-grid">
      <aside className="nhen-sidebar" aria-label="Community navigation">
        <Link className="nhen-sidebar-link" href="/"><span>⌂</span> Home</Link>
        <a className="nhen-sidebar-link" aria-current="page" href="/community"><span>◉</span> Community</a>
        <a className="nhen-sidebar-link" href="#official"><span>✦</span> Official</a>
        <a className="nhen-sidebar-link" href="#latest"><span>◷</span> Latest</a>
        <span className="nhen-section-label">YOUR SPACE</span>
        <a className="nhen-sidebar-link" href="#join"><span>◎</span> Profile</a>
        <Link className="nhen-sidebar-link" href="/saved"><span>♡</span> Saved</Link>
      </aside>
      <section className="nhen-feed-column">
        <div className="nhen-card nhen-card-pad">
          <div className="nhen-card-heading"><div><span className="nhen-section-label">NHEN COMMUNITY</span><h1 className="nhen-card-title" style={{fontSize:28,marginTop:6}}>The conversation starts here.</h1></div><span className="nhen-pill nhen-pill-official">EARLY ACCESS</span></div>
          <p className="nhen-muted" style={{fontSize:14,lineHeight:1.7}}>A space for the creator and the people around the work. Official updates are clearly marked. Member posts publish instantly; reports go to moderators.</p>
        </div>
        {member ? <section className="nhen-card nhen-card-pad" aria-label="Create a community post">
          <div className="nhen-card-heading"><strong>Share something with the community</strong><span className="nhen-pill">MEMBER POST</span></div>
          <textarea value={body} onChange={event=>setBody(event.target.value)} maxLength={2000} rows={4} placeholder="Start a thoughtful conversation…" style={{width:"100%",resize:"vertical",border:"1px solid var(--nhen-line)",borderRadius:16,background:"var(--nhen-bg)",color:"var(--nhen-ink)",padding:15}} />
          <div className="nhen-moment-compose"><label>Attach a video moment (optional)<select value={momentVideoId} onChange={e=>setMomentVideoId(e.target.value)}><option value="">No video moment</option>{momentVideos.map(video=><option key={video.media_id} value={video.media_id}>{video.title}</option>)}</select></label>{momentVideoId && <div className="nhen-moment-time-fields"><label>Start (seconds)<input type="number" min="0" value={momentStart} onChange={e=>setMomentStart(e.target.value)}/></label><label>End (seconds)<input type="number" min="1" value={momentEnd} onChange={e=>setMomentEnd(e.target.value)}/></label><span>Up to 3 minutes from an official video.</span></div>}</div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginTop:12,gap:12}}><span className="nhen-muted" style={{fontSize:11}}>{body.length}/2000 · Posts publish instantly</span><button className="button button-primary" disabled={busy || !body.trim()} onClick={submitPost}>Publish ↗</button></div>
        </section> : <section id="join" className="nhen-card nhen-card-pad">
          <div className="nhen-card-heading"><strong>Join the community</strong><span className="nhen-pill">FREE ACCOUNT</span></div>
          <div style={{display:"flex",gap:8,marginBottom:14}}><button className="nhen-action" onClick={()=>setAuthMode("signup")} aria-pressed={authMode==="signup"}>Create account</button><button className="nhen-action" onClick={()=>setAuthMode("signin")} aria-pressed={authMode==="signin"}>Sign in</button></div>
          {authMode==="signup" && <input className="nhen-search" style={{marginBottom:10}} value={handle} onChange={e=>setHandle(e.target.value)} placeholder="Choose a handle (optional)" maxLength={24} />}
          <input className="nhen-search" style={{marginBottom:10}} type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="Email address" />
          <input className="nhen-search" style={{marginBottom:10}} type="password" autoComplete={authMode==="signup"?"new-password":"current-password"} value={password} onChange={e=>setPassword(e.target.value)} placeholder="Password" />
          <button className="button button-primary" disabled={busy || !email.trim() || password.length<8} onClick={authenticate}>{busy?"Please wait…":authMode==="signup"?"Create account":"Sign in"} ↗</button>
          <p className="nhen-muted" style={{fontSize:11,marginTop:12}}>Community membership is separate from creator/admin access. Never share your password.</p>
        </section>}
        {status && <p role="status" aria-live="polite" className="nhen-card nhen-card-pad" style={{fontSize:13}}>{status}</p>}
        <div className="nhen-feed-tabs"><Link className={selectedFeed==="latest"?"active":""} href="/community">Latest</Link><Link className={selectedFeed==="following"?"active":""} href="/community?feed=following">Following</Link></div><div className="nhen-card-heading" id="latest"><h2 className="nhen-card-title">{selectedFeed==="following"?"From people you follow":"Latest conversations"}</h2><span className="nhen-muted" style={{fontSize:12}}>{initialPosts.length} posts</span></div>
        {initialPosts.length===0 ? <div className="nhen-card nhen-empty-state"><div><div style={{fontSize:32,marginBottom:12}}>✳</div><strong>The first conversation is waiting.</strong><p className="nhen-muted">Official updates and approved member posts will appear here.</p></div></div> : initialPosts.map(post=><article className="nhen-card" key={post.id}>
          <div className="nhen-post-header"><div className="nhen-avatar" style={{display:"grid",placeItems:"center",fontWeight:800,color:"var(--nhen-accent)"}}>{post.author.display_name.slice(0,1).toUpperCase()}</div><div style={{minWidth:0,flex:1}}><strong style={{fontSize:13}}>{post.author.display_name}</strong><div className="nhen-muted" style={{fontSize:11,marginTop:3}}>@{post.author.handle} · {new Date(post.createdAt).toLocaleDateString()}</div></div>{post.type==="official" && <span className="nhen-pill nhen-pill-official">✦ OFFICIAL</span>}<button className="nhen-action" onClick={()=>void report(post.id)} aria-label="Report post">•••</button></div>
          <div className="nhen-post-body">{post.body}</div>{post.linkedVideoId && <Link className="nhen-action" href={"/watch/"+momentVideos.find(video=>video.media_id===post.linkedVideoId)?.slug}>▶ Shared video moment ↗</Link>}
          <div className="nhen-post-actions"><div className="nhen-reaction-picker"><button className="nhen-action nhen-reaction-trigger" aria-haspopup="true" aria-label="Choose a reaction">{reactions.find(item=>item.key===reactionsByPost[post.id]?.mine)?.icon ?? "☺"} {reactions.find(item=>item.key===reactionsByPost[post.id]?.mine)?.label ?? "React"} ▾</button><div className="nhen-reaction-menu" role="group" aria-label="Choose your reaction">{reactions.map(item=><button className="nhen-action" key={item.key} aria-pressed={reactionsByPost[post.id]?.mine===item.key} onClick={()=>void react(post.id,item.key)} title={item.label}>{item.icon} <span>{item.label}</span></button>)}</div></div><button className="nhen-action" onClick={()=>void openComments(post.id)}>Comments</button><button className="nhen-action" aria-pressed={!!savedByPost[post.id]} onClick={()=>void toggleSave(post.id)}>{savedByPost[post.id]?"▣ Saved":"▢ Save"}</button></div>
          {commentsFor===post.id && <div className="nhen-card-pad" style={{borderTop:"1px solid var(--nhen-line)"}}><strong style={{fontSize:13}}>Discussion</strong>{comments.map(comment=><p key={comment.id} style={{fontSize:13,padding:"8px 0",borderBottom:"1px solid var(--nhen-line)"}}>{comment.body}</p>)}{member && <div style={{display:"flex",gap:8,marginTop:12}}><input className="nhen-search" value={commentText} onChange={e=>setCommentText(e.target.value)} placeholder="Write a reply…" maxLength={1000}/><button className="nhen-action" onClick={()=>void submitComment()}>Send</button></div>}<p className="nhen-muted" style={{fontSize:10,marginTop:8}}>Replies appear instantly. Report anything that breaks the community rules.</p></div>}
        </article>)}
      </section>
      <aside className="nhen-discovery-column">
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">FROM THE CREATOR</span><h2 className="nhen-card-title" style={{marginTop:9}}>Official updates</h2><p className="nhen-muted" style={{fontSize:13,lineHeight:1.65}}>Announcements from NHEN are marked and kept distinct from member discussions.</p><a className="nhen-action" href="#official">Explore updates ↗</a></section>
        <section className="nhen-card nhen-card-pad"><span className="nhen-section-label">COMMUNITY STANDARD</span><h2 className="nhen-card-title" style={{marginTop:9}}>Make it worth reading.</h2><ul className="nhen-muted" style={{fontSize:12,lineHeight:1.9,paddingLeft:18}}><li>Be respectful and constructive.</li><li>Share only content you have rights to.</li><li>Do not post private information.</li><li>Report problems rather than escalating.</li></ul></section>
      </aside>
    </div>
    <nav className="nhen-mobile-nav" aria-label="Mobile navigation"><Link href="/">⌂<span>Home</span></Link><a aria-current="page" href="/community">◉<span>Community</span></a><a href="#latest">◷<span>Latest</span></a><a href="#join">◎<span>Profile</span></a></nav>
  </main>;
}

"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
import PublicVideoPlayer from "@/app/videos/public-video-player";

type Props={startAt?:number;mediaId:string;title:string;description:string;src:string;youtubeEmbedUrl?:string|null;publishedAt:string;allowComments:boolean;category:string;tags:string[]};
type Comment={id:string;body:string;created_at:string;author_id:string};

export default function WatchDetailClient(props:Props){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [member,setMember]=useState<string|null>(null);
 const [liked,setLiked]=useState(false);
 const [saved,setSaved]=useState(false);
 const [likes,setLikes]=useState(0);
 const [comments,setComments]=useState<Comment[]>([]);
 const [comment,setComment]=useState("");
 const [notice,setNotice]=useState("");
 const [actionBusy,setActionBusy]=useState(false);

 useEffect(()=>{
  if(!supabase)return;
  let alive=true;
  void (async()=>{
   try{
    const [counts,user]=await Promise.all([
     supabase.rpc("get_video_reaction_counts",{p_media_ids:[props.mediaId]}),
     supabase.auth.getUser()
    ]);
    if(!alive)return;
    if(counts.error)throw counts.error;
    setLikes(Number(counts.data?.[0]?.reaction_count??0));
    if(user.error)throw user.error;
    const userId=user.data.user?.id??null;
    setMember(userId);
    const [reaction,bookmark,commentRows]=await Promise.all([
     userId?supabase.from("video_reactions").select("media_id").eq("media_id",props.mediaId).eq("user_id",userId).maybeSingle():Promise.resolve({data:null,error:null}),
     userId?supabase.from("video_bookmarks").select("media_id").eq("media_id",props.mediaId).eq("user_id",userId).maybeSingle():Promise.resolve({data:null,error:null}),
     props.allowComments?supabase.from("video_comments").select("id,body,created_at,author_id").eq("media_id",props.mediaId).eq("status","published").order("created_at",{ascending:false}).limit(50):Promise.resolve({data:[],error:null})
    ]);
    if(!alive)return;
    if(reaction.error||bookmark.error||commentRows.error)throw reaction.error??bookmark.error??commentRows.error;
    setLiked(!!reaction.data);setSaved(!!bookmark.data);setComments((commentRows.data??[]) as Comment[]);
    const view=await supabase.rpc("record_video_view",{p_media_id:props.mediaId});
    if(view.error&&alive)setNotice("Your video is playing, but its view could not be recorded right now.");
   }catch{
    if(alive)setNotice("Some video details could not be loaded. Check your connection and refresh to try again.");
   }
  })();
  return()=>{alive=false};
 },[supabase,props.mediaId,props.allowComments]);

 async function toggleReaction(){
  if(!supabase||!member){setNotice("Sign in to react to videos.");return}
  if(actionBusy)return;
  const previousLiked=liked,previousLikes=likes,next=!previousLiked;
  setActionBusy(true);setLiked(next);setLikes(Math.max(0,previousLikes+(next?1:-1)));
  try{
   const result=next
    ?await supabase.from("video_reactions").upsert({media_id:props.mediaId,user_id:member,reaction:"like"},{onConflict:"media_id,user_id"})
    :await supabase.from("video_reactions").delete().eq("media_id",props.mediaId).eq("user_id",member);
   if(result.error)throw result.error;
   setNotice(next?"Reaction saved.":"Reaction removed.");
  }catch{
   setLiked(previousLiked);setLikes(previousLikes);setNotice("Could not save your reaction. Your previous reaction has been restored.");
  }finally{setActionBusy(false)}
 }

 async function toggleBookmark(){
  if(!supabase||!member){setNotice("Sign in to save videos.");return}
  if(actionBusy)return;
  const previous=saved,next=!previous;
  setActionBusy(true);setSaved(next);
  try{
   const result=next
    ?await supabase.from("video_bookmarks").insert({media_id:props.mediaId,user_id:member})
    :await supabase.from("video_bookmarks").delete().eq("media_id",props.mediaId).eq("user_id",member);
   if(result.error)throw result.error;
   setNotice(next?"Video saved.":"Video removed from saved videos.");
  }catch{
   setSaved(previous);setNotice("Could not update saved videos. Your previous setting has been restored.");
  }finally{setActionBusy(false)}
 }

 async function sendComment(){
  if(!supabase||!member){setNotice("Sign in to comment.");return}
  if(!comment.trim()||actionBusy)return;
  setActionBusy(true);
  try{
   const {error}=await supabase.from("video_comments").insert({media_id:props.mediaId,author_id:member,body:comment.trim(),status:"pending"});
   if(error)throw error;
   setComment("");setNotice("Comment submitted for creator review.");
  }catch{
   setNotice("Comment could not be submitted. Your text is still here so you can retry.");
  }finally{setActionBusy(false)}
 }

 async function shareVideo(){
  try{
   if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
   await navigator.clipboard.writeText(window.location.href);
   setNotice("Video link copied.");
  }catch{
   setNotice("Could not copy the link automatically. You can copy the page address from your browser.");
  }
 }

 return <main className="nhen-watch-page">
  <header className="nhen-watch-top"><Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link><nav><Link href="/">Home</Link><Link href="/community">Community</Link><Link href="/notifications">Notifications</Link><Link href="/series">Series</Link><Link href="/shorts">Shorts</Link><Link href="/#videos">Videos</Link></nav></header>
  <div className="nhen-watch-layout">
   <article className="nhen-watch-main">
    <div className="nhen-watch-player"><PublicVideoPlayer startAt={props.startAt} src={props.src} title={props.title} description={props.description} youtubeEmbedUrl={props.youtubeEmbedUrl}/></div>
    <div className="nhen-watch-title-row"><div><span className="nhen-section-label">{props.category} / NHEN WATCH</span><h1>{props.title}</h1><p className="nhen-muted">{new Date(props.publishedAt).toLocaleDateString()} · Official creator upload</p></div><span className="nhen-pill nhen-pill-official">✦ OFFICIAL</span></div>
    <div className="nhen-watch-actions"><button className={liked?"active":""} onClick={()=>void toggleReaction()} disabled={actionBusy}>♡ {likes} Likes</button><button className={saved?"active":""} onClick={()=>void toggleBookmark()} disabled={actionBusy}>▣ {saved?"Saved":"Save"}</button><button onClick={()=>void shareVideo()}>↗ Share</button></div>
    <section className="nhen-card nhen-card-pad nhen-watch-description"><h2>About this video</h2><p>{props.description||"No description has been added yet."}</p>{props.tags.length>0&&<div className="nhen-watch-tags">{props.tags.map(t=><span key={t}>#{t}</span>)}</div>}</section>
    {props.allowComments?<section className="nhen-card nhen-card-pad nhen-watch-comments"><div className="nhen-card-heading"><h2>Discussion</h2><span className="nhen-muted">{comments.length} comments</span></div>
     {member?<div className="nhen-watch-comment-compose"><textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} maxLength={1500} placeholder="Add a thoughtful comment…"/><button className="button button-primary" onClick={()=>void sendComment()} disabled={!comment.trim()||actionBusy}>{actionBusy?"Sending…":"Comment ↗"}</button></div>:<p className="nhen-muted">Sign in to join the discussion. Comments are reviewed before publication.</p>}
     {comments.map(c=><article className="nhen-watch-comment" key={c.id}><span className="nhen-avatar">✦</span><div><strong>NHEN member</strong><small>{new Date(c.created_at).toLocaleDateString()}</small><p>{c.body}</p></div></article>)}
    </section>:<section className="nhen-card nhen-card-pad"><h2>Discussion disabled</h2><p className="nhen-muted">Comments are turned off for this video.</p></section>}
    {notice&&<p className="nhen-mod-notice" role="status" aria-live="polite">{notice}</p>}
   </article>
   <aside className="nhen-watch-aside"><div className="nhen-card nhen-card-pad"><span className="nhen-section-label">NHEN WATCH</span><h2>Creator videos, made to be watched.</h2><p className="nhen-muted">Official uploads, series and community discussions in one place.</p><Link className="button button-secondary" href="/#videos">Explore more videos ↗</Link></div></aside>
  </div>
 </main>
}

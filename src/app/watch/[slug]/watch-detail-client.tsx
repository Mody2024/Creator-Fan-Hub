"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
import PublicVideoPlayer from "@/app/videos/public-video-player";

type Props={mediaId:string;title:string;description:string;src:string;publishedAt:string;allowComments:boolean;category:string;tags:string[]};
type Comment={id:string;body:string;created_at:string;author_id:string};

export default function WatchDetailClient(props:Props){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [member,setMember]=useState<string|null>(null),[liked,setLiked]=useState(false),[saved,setSaved]=useState(false),[likes,setLikes]=useState(0),[comments,setComments]=useState<Comment[]>([]),[comment,setComment]=useState(""),[notice,setNotice]=useState("");
 useEffect(()=>{
  if(!supabase)return;let alive=true;
  void (async()=>{
   const [counts,user]=await Promise.all([supabase.rpc("get_video_reaction_counts",{p_media_ids:[props.mediaId]}),supabase.auth.getUser()]);
   if(!alive)return;setLikes(Number(counts.data?.[0]?.reaction_count??0));
   if(user.data.user){setMember(user.data.user.id);
    const [reaction,bookmark,commentRows]=await Promise.all([
     supabase.from("video_reactions").select("media_id").eq("media_id",props.mediaId).eq("user_id",user.data.user.id).maybeSingle(),
     supabase.from("video_bookmarks").select("media_id").eq("media_id",props.mediaId).eq("user_id",user.data.user.id).maybeSingle(),
     supabase.from("video_comments").select("id,body,created_at,author_id").eq("media_id",props.mediaId).eq("status","published").order("created_at",{ascending:false}).limit(50)
    ]);
    if(!alive)return;setLiked(!!reaction.data);setSaved(!!bookmark.data);setComments(commentRows.data??[]);
   }else{
    const {data}=await supabase.from("video_comments").select("id,body,created_at,author_id").eq("media_id",props.mediaId).eq("status","published").order("created_at",{ascending:false}).limit(50);
    if(alive)setComments(data??[]);
   }
   await supabase.rpc("record_video_view",{p_media_id:props.mediaId});
  })();
  return()=>{alive=false};
 },[supabase,props.mediaId]);
 async function toggleReaction(){
  if(!supabase||!member){setNotice("Sign in to react to videos.");return}
  const next=!liked;setLiked(next);setLikes(n=>Math.max(0,n+(next?1:-1)));
  const result=next?await supabase.from("video_reactions").upsert({media_id:props.mediaId,user_id:member,reaction:"like"},{onConflict:"media_id,user_id"}):await supabase.from("video_reactions").delete().eq("media_id",props.mediaId).eq("user_id",member);
  if(result.error){setLiked(!next);setLikes(n=>Math.max(0,n+(next?-1:1)));setNotice("Could not save your reaction.");}
 }
 async function toggleBookmark(){
  if(!supabase||!member){setNotice("Sign in to save videos.");return}
  const next=!saved;setSaved(next);
  const result=next?await supabase.from("video_bookmarks").insert({media_id:props.mediaId,user_id:member}):await supabase.from("video_bookmarks").delete().eq("media_id",props.mediaId).eq("user_id",member);
  if(result.error){setSaved(!next);setNotice("Could not update your saved videos.");}
 }
 async function sendComment(){
  if(!supabase||!member){setNotice("Sign in to comment.");return}
  if(!comment.trim())return;
  const {error}=await supabase.from("video_comments").insert({media_id:props.mediaId,author_id:member,body:comment.trim(),status:"pending"});
  if(error)setNotice("Comment could not be submitted.");else{setComment("");setNotice("Comment submitted for creator review.");}
 }
 return <main className="nhen-watch-page">
  <header className="nhen-watch-top"><Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link><nav><Link href="/">Home</Link><Link href="/community">Community</Link><Link href="/notifications">Notifications</Link><Link href="/series">Series</Link><Link href="/#videos">Videos</Link></nav></header>
  <div className="nhen-watch-layout">
   <article className="nhen-watch-main">
    <div className="nhen-watch-player"><PublicVideoPlayer src={props.src} title={props.title} description={props.description}/></div>
    <div className="nhen-watch-title-row"><div><span className="nhen-section-label">{props.category} / NHEN WATCH</span><h1>{props.title}</h1><p className="nhen-muted">{new Date(props.publishedAt).toLocaleDateString()} · Official creator upload</p></div><span className="nhen-pill nhen-pill-official">✦ OFFICIAL</span></div>
    <div className="nhen-watch-actions"><button className={liked?"active":""} onClick={()=>void toggleReaction()}>♡ {likes} Likes</button><button className={saved?"active":""} onClick={()=>void toggleBookmark()}>▣ {saved?"Saved":"Save"}</button><button onClick={()=>{void navigator.clipboard?.writeText(window.location.href);setNotice("Video link copied.");}}>↗ Share</button></div>
    <section className="nhen-card nhen-card-pad nhen-watch-description"><h2>About this video</h2><p>{props.description||"No description has been added yet."}</p>{props.tags.length>0&&<div className="nhen-watch-tags">{props.tags.map(t=><span key={t}>#{t}</span>)}</div>}</section>
    {props.allowComments?<section className="nhen-card nhen-card-pad nhen-watch-comments"><div className="nhen-card-heading"><h2>Discussion</h2><span className="nhen-muted">{comments.length} comments</span></div>
     {member?<div className="nhen-watch-comment-compose"><textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} maxLength={1500} placeholder="Add a thoughtful comment…"/><button className="button button-primary" onClick={()=>void sendComment()} disabled={!comment.trim()}>Comment ↗</button></div>:<p className="nhen-muted">Sign in to join the discussion. Comments are reviewed before publication.</p>}
     {comments.map(c=><article className="nhen-watch-comment" key={c.id}><span className="nhen-avatar">✦</span><div><strong>NHEN member</strong><small>{new Date(c.created_at).toLocaleDateString()}</small><p>{c.body}</p></div></article>)}
    </section>:<section className="nhen-card nhen-card-pad"><h2>Discussion disabled</h2><p className="nhen-muted">Comments are turned off for this video.</p></section>}
    {notice&&<p className="nhen-mod-notice" role="status">{notice}</p>}
   </article>
   <aside className="nhen-watch-aside"><div className="nhen-card nhen-card-pad"><span className="nhen-section-label">NHEN WATCH</span><h2>Creator videos, made to be watched.</h2><p className="nhen-muted">Official uploads, series and community discussions in one place.</p><Link className="button button-secondary" href="/#videos">Explore more videos ↗</Link></div></aside>
  </div>
 </main>
}

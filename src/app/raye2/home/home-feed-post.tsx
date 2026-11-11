"use client";

import Link from "next/link";
import Image from "next/image";
import { useMemo, useState } from "react";
import NhenReactionArt from "@/app/watch/[slug]/nhen-reaction-art";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import styles from "./home.module.css";

type Props = {
  post: { id:string; body:string; post_type:string; created_at:string; author_id:string };
  author: { handle:string; display_name:string; avatar_url?:string|null } | undefined;
  isArabic: boolean;
  currentUserId: string|null;
  initialCount: number;
  initialMine: string|null;
  initialSaved: boolean;
  initialFollowing: boolean;
};
const reactions = [
  {key:"like",labelEn:"Like",labelAr:"إعجاب",art:"support"},
  {key:"love",labelEn:"Love",labelAr:"أحببته",art:"support"},
  {key:"insightful",labelEn:"Insightful",labelAr:"مفيد",art:"mindblown"},
  {key:"funny",labelEn:"Funny",labelAr:"مضحك",art:"laugh"},
  {key:"spark",labelEn:"Spark",labelAr:"شرارة",art:"spark"},
  {key:"hype",labelEn:"Hype",labelAr:"حماس",art:"legend"},
  {key:"respect",labelEn:"Respect",labelAr:"احترام",art:"legend"},
  {key:"curious",labelEn:"Curious",labelAr:"فضول",art:"orbit"}
] as const;

type HomeComment={id:string;author_id:string;author_handle:string|null;author_display_name:string|null;body:string;created_at:string;reply_count:number;reaction_count:number;my_reaction:string|null};
type HomeCommentReply={comment_id:string;author_id:string;author_handle:string|null;author_display_name:string|null;body:string;created_at:string;reaction_count:number;my_reaction:string|null};
export default function HomeFeedPost({post,author,isArabic,currentUserId,initialCount,initialMine,initialSaved,initialFollowing}:Props){
  const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
  const [count,setCount]=useState(initialCount);
  const [mine,setMine]=useState<string|null>(initialMine);
  const [saved,setSaved]=useState(initialSaved);
  const [picker,setPicker]=useState(false);
  const [commentsOpen,setCommentsOpen]=useState(false);
  const [comments,setComments]=useState<HomeComment[]>([]);
  const [commentReplies,setCommentReplies]=useState<Record<string,HomeCommentReply[]>>({});
  const [replyOpen,setReplyOpen]=useState<string|null>(null);
  const [replyDraft,setReplyDraft]=useState("");
  const [comment,setComment]=useState("");
  const [busy,setBusy]=useState(false);
  const [notice,setNotice]=useState("");
  const [following,setFollowing]=useState(initialFollowing);
  const [followBusy,setFollowBusy]=useState(false);
  const labels={react:isArabic?"تفاعل":"React",comments:isArabic?"التعليقات":"Comments",save:isArabic?"حفظ":"Save",saved:isArabic?"تم الحفظ":"Saved",share:isArabic?"مشاركة":"Share",reply:isArabic?"اكتب تعليقًا…":"Write a comment…",send:isArabic?"إرسال":"Send",discussion:isArabic?"النقاش":"Discussion",replyBtn:isArabic?"رد":"Reply",replyPlaceholder:isArabic?"اكتب ردًا…":"Write a reply…",replyAction:isArabic?"رد ↗":"Reply ↗",showReplies:isArabic?"اعرض الردود":"Show replies",hideReplies:isArabic?"أخفِ الردود":"Hide replies",noReplies:isArabic?"لا توجد ردود بعد.":"No replies yet.",reactComment:isArabic?"تفاعل مع التعليق":"React to comment",follow:isArabic?"متابعة":"Follow",following:isArabic?"تتابعه":"Following",official:isArabic?"رسمي":"OFFICIAL",member:isArabic?"المجتمع":"COMMUNITY",signIn:isArabic?"سجّل الدخول للتفاعل مع المنشورات.":"Sign in to interact with posts.",error:isArabic?"تعذر إكمال العملية. حاول مرة أخرى.":"That action could not be completed. Please try again."};
  async function react(key:string){
    if(!supabase||!currentUserId){setNotice(labels.signIn);setPicker(false);return;}
    const old=mine;const next=old===key?null:key;
    setMine(next);setCount(n=>Math.max(0,n+(old?(next?-0:-1):1)));setPicker(false);
    const result=next?await supabase.from("community_reactions").upsert({post_id:post.id,user_id:currentUserId,reaction:next},{onConflict:"post_id,user_id"}):await supabase.from("community_reactions").delete().eq("post_id",post.id).eq("user_id",currentUserId);
    if(result.error){setMine(old);setCount(n=>Math.max(0,n+(old?(next?0:1):-1)));setNotice(labels.error);}
  }
  async function toggleSave(){
    if(!supabase||!currentUserId){setNotice(labels.signIn);return;}
    const old=saved;setSaved(!old);
    const result=old?await supabase.from("community_bookmarks").delete().eq("post_id",post.id).eq("user_id",currentUserId):await supabase.from("community_bookmarks").insert({post_id:post.id,user_id:currentUserId});
    if(result.error){setSaved(old);setNotice(labels.error);}
  }
  async function loadThread(){
    if(!supabase)return;
    const {data,error}=await supabase.rpc("raye2_get_post_comments",{p_post_id:post.id,p_limit:50});
    if(error)setNotice(labels.error);else setComments((data??[]) as HomeComment[]);
  }
  async function loadComments(){
    if(!supabase)return;
    setCommentsOpen(v=>!v);
    if(commentsOpen)return;
    await loadThread();
  }
  async function sendComment(){
    if(!supabase||!currentUserId||!comment.trim()||busy){setNotice(labels.signIn);return;}
    setBusy(true);
    const {error}=await supabase.from("community_comments").insert({post_id:post.id,author_id:currentUserId,body:comment.trim(),status:"published"});
    if(error)setNotice(labels.error);else{setComment("");await loadThread();}
    setBusy(false);
  }
  async function toggleReplies(rootId:string){
    if(!supabase)return;
    if(commentReplies[rootId]){setCommentReplies(current=>{const next={...current};delete next[rootId];return next});return}
    const {data,error}=await supabase.rpc("raye2_get_post_comment_replies",{p_parent_id:rootId,p_limit:50});
    if(error)setNotice(labels.error);else setCommentReplies(current=>({...current,[rootId]:(data??[]) as HomeCommentReply[]}));
  }
  async function sendReply(rootId:string){
    if(!supabase||!currentUserId||!replyDraft.trim()||busy){setNotice(labels.signIn);return;}
    setBusy(true);
    const {error}=await supabase.from("community_comments").insert({post_id:post.id,author_id:currentUserId,body:replyDraft.trim(),status:"published",parent_comment_id:rootId});
    if(error)setNotice(labels.error);
    else{setReplyDraft("");setReplyOpen(null);const {data}=await supabase.rpc("raye2_get_post_comment_replies",{p_parent_id:rootId,p_limit:50});if(commentReplies[rootId])setCommentReplies(current=>({...current,[rootId]:(data??[]) as HomeCommentReply[]}));await loadThread();}
    setBusy(false);
  }
  async function reactToComment(commentId:string,isReply:boolean,current:string|null){
    if(!supabase||!currentUserId){setNotice(labels.signIn);return;}
    if(busy)return;
    const next=current==="spark"?null:"spark";
    const delta=next&&!current?1:!next&&current?-1:0;
    setBusy(true);
    if(isReply)setCommentReplies(all=>{const copy={...all};for(const key of Object.keys(copy))copy[key]=copy[key].map(r=>r.comment_id===commentId?{...r,my_reaction:next,reaction_count:Math.max(0,r.reaction_count+delta)}:r);return copy});
    else setComments(list=>list.map(c=>c.id===commentId?{...c,my_reaction:next,reaction_count:Math.max(0,c.reaction_count+delta)}:c));
    const {error}=await supabase.rpc("raye2_toggle_post_comment_reaction",{p_comment_id:commentId,p_reaction:next});
    if(error){
      setNotice(labels.error);
      if(isReply)setCommentReplies(all=>{const copy={...all};for(const key of Object.keys(copy))copy[key]=copy[key].map(r=>r.comment_id===commentId?{...r,my_reaction:current,reaction_count:Math.max(0,r.reaction_count-delta)}:r);return copy});
      else setComments(list=>list.map(c=>c.id===commentId?{...c,my_reaction:current,reaction_count:Math.max(0,c.reaction_count-delta)}:c));
    }
    setBusy(false);
  }
  async function follow(){
    if(!supabase||!currentUserId||currentUserId===post.author_id)return;
    setFollowBusy(true);
    const result=following?await supabase.from("member_follows").delete().eq("follower_id",currentUserId).eq("followed_id",post.author_id):await supabase.from("member_follows").insert({follower_id:currentUserId,followed_id:post.author_id});
    if(!result.error)setFollowing(!following);else setNotice(labels.error);
    setFollowBusy(false);
  }
  async function share(){
    const url=window.location.origin+"/raye2/home#post-"+post.id;
    try{if(navigator.share)await navigator.share({title:"Raye2",text:post.body.slice(0,150),url});else if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(url);setNotice(isArabic?"تم نسخ الرابط":"Link copied");}}
    catch(error){if(error instanceof Error&&error.name!=="AbortError")setNotice(labels.error);}
  }
  const selected=reactions.find(r=>r.key===mine);
  return <article className={styles.post} id={"post-"+post.id}>
    <div className={styles.postHead}>
      {author?.avatar_url?<Image className={styles.avatarImage} src={author.avatar_url} alt="" width={38} height={38} unoptimized />:<div className={styles.avatar}>{(author?.display_name??"R").slice(0,1).toUpperCase()}</div>}
      <div className={styles.authorMeta}><Link className={styles.author} href={author?.handle?`/u/${author.handle}`:"/community"}>{author?.display_name??(isArabic?"عضو Raye2":"Raye2 member")}</Link><div className={styles.handle}>@{author?.handle??"member"} · <time className={styles.date} dateTime={post.created_at}>{new Date(post.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US",{month:"short",day:"numeric"})}</time></div></div>
      {currentUserId&&currentUserId!==post.author_id&&<button className={styles.followButton} type="button" onClick={()=>void follow()} disabled={followBusy}>{followBusy?"…":following?labels.following:labels.follow}</button>}
      <span className={styles.postType}>{post.post_type==="official"?labels.official:labels.member}</span>
    </div>
    <p className={styles.body}>{post.body}</p>
    <div className={styles.postActions}>
      <div className={styles.reactionWrap}>
        <button className={styles.actionButton} type="button" aria-expanded={picker} onClick={()=>setPicker(v=>!v)}><NhenReactionArt reaction={selected?.art??"spark"} size={19}/>{selected?(isArabic?selected.labelAr:selected.labelEn):labels.react} <span className={styles.actionCount}>{count}</span></button>
        {picker&&<div className={styles.reactionMenu} role="group" aria-label={labels.react}>{reactions.map(r=><button key={r.key} type="button" onClick={()=>void react(r.key)} aria-pressed={mine===r.key}><NhenReactionArt reaction={r.art} size={22}/><span>{isArabic?r.labelAr:r.labelEn}</span></button>)}</div>}
      </div>
      <button className={styles.actionButton} type="button" onClick={()=>void loadComments()}>◷ {labels.comments}</button>
      <button className={styles.actionButton} type="button" onClick={()=>void toggleSave()} aria-pressed={saved}>{saved?"▣":"▢"} {saved?labels.saved:labels.save}</button>
      <button className={styles.actionButton} type="button" onClick={()=>void share()}>↗ {labels.share}</button>
    </div>
    {commentsOpen&&<section className={styles.commentsPanel}><strong>{labels.discussion}</strong>{comments.map(item=><div className={styles.commentItem} key={item.id}><div className={styles.commentHead}><strong className={styles.commentAuthor}>@{item.author_handle??"member"}</strong>{item.author_display_name&&<span className={styles.commentAuthor}>{item.author_display_name}</span>}<time className={styles.commentTime}>{new Date(item.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</time></div><p className={styles.commentBody}>{item.body}</p><div className={styles.commentActions}><button type="button" className={item.my_reaction?styles.active:""} aria-pressed={!!item.my_reaction} aria-label={labels.reactComment} onClick={()=>void reactToComment(item.id,false,item.my_reaction)}>✨ {item.reaction_count}</button>{currentUserId&&<button type="button" onClick={()=>{setReplyOpen(open=>open===item.id?null:item.id);setReplyDraft("")}}>{labels.replyBtn}</button>}{item.reply_count>0&&<button type="button" onClick={()=>void toggleReplies(item.id)}>{commentReplies[item.id]?labels.hideReplies:labels.showReplies} · {item.reply_count}</button>}</div>{replyOpen===item.id&&<form onSubmit={event=>{event.preventDefault();void sendReply(item.id);}}><input value={replyDraft} onChange={event=>setReplyDraft(event.target.value)} maxLength={1000} placeholder={labels.replyPlaceholder}/><button type="submit" disabled={busy||!replyDraft.trim()}>{labels.replyAction}</button></form>}{commentReplies[item.id]&&<div className={styles.commentReplies}>{(commentReplies[item.id]??[]).length?(commentReplies[item.id]??[]).map(reply=><div className={styles.commentItem} key={reply.comment_id}><div className={styles.commentHead}><strong className={styles.commentAuthor}>@{reply.author_handle??"member"}</strong><time className={styles.commentTime}>{new Date(reply.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</time></div><p className={styles.commentBody}>{reply.body}</p><div className={styles.commentActions}><button type="button" className={reply.my_reaction?styles.active:""} aria-pressed={!!reply.my_reaction} aria-label={labels.reactComment} onClick={()=>void reactToComment(reply.comment_id,true,reply.my_reaction)}>✨ {reply.reaction_count}</button></div></div>):<p className={styles.commentBody}>{labels.noReplies}</p>}</div>}</div>)}{currentUserId&&<form onSubmit={event=>{event.preventDefault();void sendComment();}}><input value={comment} onChange={event=>setComment(event.target.value)} maxLength={1000} placeholder={labels.reply}/><button type="submit" disabled={busy||!comment.trim()}>{labels.send}</button></form>}</section>}
    {notice&&<p className={styles.notice} role="status">{notice}</p>}
  </article>;
}

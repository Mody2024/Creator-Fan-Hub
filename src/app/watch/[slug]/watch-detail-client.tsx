"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import Image from "next/image";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import NhenReactionArt from "./nhen-reaction-art";

type Props={startAt?:number;hlsSrc?:string|null;mediaId:string;title:string;description:string;src:string;poster?:string|null;youtubeEmbedUrl?:string|null;publishedAt:string;allowComments:boolean;category:string;tags:string[];related?:RelatedVideo[];context?:WatchContext|null};
type WatchContext={creator_user_id:string;creator_handle:string|null;creator_display_name:string|null;creator_avatar_url:string|null;follower_count:number;is_following:boolean;series_slug:string|null;series_title:string|null;series_position:number|null;series_episode_count:number|null};
type ThreadComment={comment_id:string;author_id:string;author_handle:string|null;author_display_name:string|null;author_avatar_url:string|null;body:string;created_at:string;reply_count:number;reaction_count:number;my_reaction:string|null};
type ThreadReply={comment_id:string;author_id:string;author_handle:string|null;author_display_name:string|null;author_avatar_url:string|null;body:string;created_at:string;reaction_count:number;my_reaction:string|null};
type RelatedVideo={slug:string;title:string;category:string;description:string;published_at:string};

export default function WatchDetailClient(props:Props){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [member,setMember]=useState<string|null>(null);
 const [liked,setLiked]=useState(false);
 const [myReaction,setMyReaction]=useState<string|null>(null);
 const [reactionPicker,setReactionPicker]=useState(false);
 const [saved,setSaved]=useState(false);
 const [likes,setLikes]=useState(0);
 const [comments,setComments]=useState<ThreadComment[]>([]);
 const [comment,setComment]=useState("");
 const [replies,setReplies]=useState<Record<string,ThreadReply[]>>({});
 const [replyOpen,setReplyOpen]=useState<string|null>(null);
 const [replyDraft,setReplyDraft]=useState("");
 const [threadBusy,setThreadBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const [actionBusy,setActionBusy]=useState(false);
 const [locale,setLocale]=useState<"en"|"ar">("en");
 const [following,setFollowing]=useState(!!props.context?.is_following);
 const [followers,setFollowers]=useState(Number(props.context?.follower_count??0));
 const [followBusy,setFollowBusy]=useState(false);
 const isArabic=locale==="ar";
 const t=isArabic?{
  home:"الرئيسية",community:"المجتمع",notifications:"الإشعارات",series:"السلاسل",shorts:"المقاطع",videos:"الفيديوهات",official:"فيديو رسمي من صانع المحتوى",react:"تفاعل",spark:"شرارة",orbit:"مدار",legend:"أسطوري",laugh:"مضحك",mindblown:"مذهل",support:"دعم",saved:"تم الحفظ",save:"حفظ",share:"مشاركة",about:"عن هذا الفيديو",noDescription:"لم تتم إضافة وصف بعد.",discussion:"النقاش",comments:"تعليق",commentPlaceholder:"اكتب تعليقًا مفيدًا…",sending:"جارٍ الإرسال…",commentAction:"علّق ↗",signIn:"سجّل الدخول للمشاركة في النقاش. تتم مراجعة التعليقات قبل نشرها.",choose:"اختر تفاعلك مع Raye2",viewError:"الفيديو يعمل، لكن تعذر تسجيل المشاهدة حاليًا.",loadError:"تعذر تحميل بعض تفاصيل الفيديو. تحقق من الاتصال وحدّث الصفحة للمحاولة مجددًا.",signReact:"سجّل الدخول للتفاعل مع الفيديوهات.",reactLive:"تم نشر تفاعلك على Raye2.",reactRemoved:"تمت إزالة تفاعلك.",reactError:"تعذر حفظ التفاعل. تمت استعادة تفاعلك السابق.",signSave:"سجّل الدخول لحفظ الفيديوهات.",savedVideo:"تم حفظ الفيديو.",unsavedVideo:"تمت إزالة الفيديو من المحفوظات.",saveError:"تعذر تحديث المحفوظات. تمت استعادة إعدادك السابق.",signComment:"سجّل الدخول للتعليق.",commentSent:"تم إرسال التعليق لمراجعة المبدع.",commentError:"تعذر إرسال التعليق. لا يزال النص موجودًا لتتمكن من المحاولة مجددًا.",shareCopied:"تم نسخ رابط الفيديو.",shareError:"تعذر نسخ الرابط تلقائيًا. يمكنك نسخ عنوان الصفحة من المتصفح.",related:"المزيد كهذا",relatedEmpty:"لا توجد فيديوهات مشابهة بعد.",creator:"صانع المحتوى",follow:"متابعة",following:"تتابعه",followerCount:"متابع",fromSeries:"من السلسلة",episode:"الحلقة",episodes:"حلقة",viewSeries:"اعرض السلسلة ↗",viewProfile:"الملف الشخصي ↗",signFollow:"سجّل الدخول لمتابعة صانع المحتوى.",followError:"تعذر تحديث قائمة المتابعة.",followingNow:"تتابع الآن.",replies:"ردود",reply:"رد",replyPlaceholder:"اكتب ردًا…",replyAction:"رد ↗",showReplies:"اعرض الردود",hideReplies:"أخفِ الردود",replySent:"تم إرسال الرد لمراجعة المبدع.",reactComment:"تفاعل مع التعليق",noReplies:"لا توجد ردود بعد."
 }:{
  home:"Home",community:"Community",notifications:"Notifications",series:"Series",shorts:"Shorts",videos:"Videos",official:"Official creator upload",react:"React",spark:"Spark",orbit:"Orbit",legend:"Legend",laugh:"Laugh",mindblown:"Mind-blown",support:"Support",saved:"Saved",save:"Save",share:"Share",about:"About this video",noDescription:"No description has been added yet.",discussion:"Discussion",comments:"comments",commentPlaceholder:"Add a thoughtful comment…",sending:"Sending…",commentAction:"Comment ↗",signIn:"Sign in to join the discussion. Comments are reviewed before publication.",choose:"Choose a Raye2 reaction",viewError:"Your video is playing, but its view could not be recorded right now.",loadError:"Some video details could not be loaded. Check your connection and refresh to try again.",signReact:"Sign in to react to videos.",reactLive:"Your Raye2 reaction is live.",reactRemoved:"Your reaction was removed.",reactError:"Could not save your reaction. Your previous reaction has been restored.",signSave:"Sign in to save videos.",savedVideo:"Video saved.",unsavedVideo:"Video removed from saved videos.",saveError:"Could not update saved videos. Your previous setting has been restored.",signComment:"Sign in to comment.",commentSent:"Comment submitted for creator review.",commentError:"Comment could not be submitted. Your text is still here so you can retry.",shareCopied:"Video link copied.",shareError:"Could not copy the link automatically. You can copy the page address from your browser.",related:"More like this",relatedEmpty:"No similar videos yet.",creator:"Creator",follow:"Follow",following:"Following",followerCount:"followers",fromSeries:"From the series",episode:"Episode",episodes:"episodes",viewSeries:"View series ↗",viewProfile:"View profile ↗",signFollow:"Sign in to follow this creator.",followError:"Could not update your following list.",followingNow:"You are now following.",replies:"replies",reply:"Reply",replyPlaceholder:"Write a reply…",replyAction:"Reply ↗",showReplies:"Show replies",hideReplies:"Hide replies",replySent:"Reply submitted for creator review.",reactComment:"React to comment",noReplies:"No replies yet."
 };
 useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);

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
     userId?supabase.from("video_reactions").select("media_id,reaction").eq("media_id",props.mediaId).eq("user_id",userId).maybeSingle():Promise.resolve({data:null,error:null}),
     userId?supabase.from("video_bookmarks").select("media_id").eq("media_id",props.mediaId).eq("user_id",userId).maybeSingle():Promise.resolve({data:null,error:null}),
     props.allowComments?supabase.rpc("raye2_get_video_comment_thread",{p_media_id:props.mediaId,p_limit:50}):Promise.resolve({data:[],error:null})
    ]);
    if(!alive)return;
    if(reaction.error||bookmark.error||commentRows.error)throw reaction.error??bookmark.error??commentRows.error;
    setLiked(!!reaction.data);setMyReaction(reaction.data?.reaction??null);setSaved(!!bookmark.data);setComments((commentRows.data??[]) as ThreadComment[]);
    const view=await supabase.rpc("record_video_view",{p_media_id:props.mediaId});
    if(view.error&&alive)setNotice(t.viewError);
   }catch{
    if(alive)setNotice(t.loadError);
   }
  })();
  return()=>{alive=false};
 },[supabase,props.mediaId,props.allowComments,t.viewError,t.loadError]);

 async function chooseReaction(reaction:string){
  if(!supabase||!member){setNotice(t.signReact);return}
  if(actionBusy)return;
  const previous=myReaction,previousLikes=likes;
  const next=previous===reaction?null:reaction;
  setActionBusy(true);setReactionPicker(false);setMyReaction(next);setLiked(!!next);
  setLikes(Math.max(0,previousLikes+(next&&!previous?1:!next&&previous?-1:0)));
  try{
   const result=next
    ?await supabase.from("video_reactions").upsert({media_id:props.mediaId,user_id:member,reaction:next},{onConflict:"media_id,user_id"})
    :await supabase.from("video_reactions").delete().eq("media_id",props.mediaId).eq("user_id",member);
   if(result.error)throw result.error;
   setNotice(next?t.reactLive:t.reactRemoved);
  }catch{
   setMyReaction(previous);setLiked(!!previous);setLikes(previousLikes);setNotice(t.reactError);
  }finally{setActionBusy(false)}
 }


 async function toggleBookmark(){
  if(!supabase||!member){setNotice(t.signSave);return}
  if(actionBusy)return;
  const previous=saved,next=!previous;
  setActionBusy(true);setSaved(next);
  try{
   const result=next
    ?await supabase.from("video_bookmarks").insert({media_id:props.mediaId,user_id:member})
    :await supabase.from("video_bookmarks").delete().eq("media_id",props.mediaId).eq("user_id",member);
   if(result.error)throw result.error;
   setNotice(next?t.savedVideo:t.unsavedVideo);
  }catch{
   setSaved(previous);setNotice(t.saveError);
  }finally{setActionBusy(false)}
 }

 async function sendComment(){
  if(!supabase||!member){setNotice(t.signComment);return}
  if(!comment.trim()||actionBusy)return;
  setActionBusy(true);
  try{
   const {error}=await supabase.from("video_comments").insert({media_id:props.mediaId,author_id:member,body:comment.trim(),status:"pending"});
   if(error)throw error;
   setComment("");setNotice(t.commentSent);
  }catch{
   setNotice(t.commentError);
  }finally{setActionBusy(false)}
 }

 async function toggleReplies(rootId:string){
  if(!supabase)return;
  if(replies[rootId]){setReplies(current=>{const next={...current};delete next[rootId];return next});return}
  setThreadBusy(rootId);
  try{
   const {data,error}=await supabase.rpc("raye2_get_video_comment_replies",{p_parent_id:rootId,p_limit:50});
   if(error)throw error;
   setReplies(current=>({...current,[rootId]:(data??[]) as ThreadReply[]}));
  }catch{
   setNotice(t.loadError);
  }finally{setThreadBusy(null)}
 }

 async function sendReply(rootId:string){
  if(!supabase||!member){setNotice(t.signComment);return}
  if(!replyDraft.trim()||threadBusy)return;
  setThreadBusy(rootId);
  try{
   const {error}=await supabase.from("video_comments").insert({media_id:props.mediaId,author_id:member,body:replyDraft.trim(),status:"pending",parent_comment_id:rootId});
   if(error)throw error;
   setReplyDraft("");setReplyOpen(null);setNotice(t.replySent);
  }catch{
   setNotice(t.commentError);
  }finally{setThreadBusy(null)}
 }

 async function reactToComment(commentId:string,isReply:boolean,current:string|null,reaction:string){
  if(!supabase||!member){setNotice(t.signReact);return}
  if(threadBusy)return;
  const next=current===reaction?null:reaction;
  const apply=(list:ThreadReply[])=>list.map(r=>r.comment_id===commentId?{...r,my_reaction:next,reaction_count:Math.max(0,r.reaction_count+(next&&!current?1:!next&&current?-1:0))}:r);
  if(isReply){
   setReplies(all=>{const next2={...all};for(const key of Object.keys(next2))next2[key]=apply(next2[key]);return next2});
  }else{
   setComments(list=>list.map(c=>c.comment_id===commentId?{...c,my_reaction:next,reaction_count:Math.max(0,c.reaction_count+(next&&!current?1:!next&&current?-1:0))}:c));
  }
  setThreadBusy(commentId);
  try{
   const {error}=await supabase.rpc("raye2_toggle_comment_reaction",{p_comment_id:commentId,p_reaction:next});
   if(error)throw error;
  }catch{
   if(isReply){setReplies(all=>{const next2={...all};for(const key of Object.keys(next2))next2[key]=next2[key].map(r=>r.comment_id===commentId?{...r,my_reaction:current,reaction_count:Math.max(0,r.reaction_count+(current&&!next?1:!current&&next?-1:0))}:r);return next2})}
   else{setComments(list=>list.map(c=>c.comment_id===commentId?{...c,my_reaction:current,reaction_count:Math.max(0,c.reaction_count+(current&&!next?1:!current&&next?-1:0))}:c))}
   setNotice(t.reactError);
  }finally{setThreadBusy(null)}
 }

 async function shareVideo(){
  try{
   if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
   await navigator.clipboard.writeText(window.location.href);
   setNotice(t.shareCopied);
  }catch{
   setNotice(t.shareError);
  }
 }

 async function toggleFollow(){
  if(!supabase){return}
  if(!member){setNotice(t.signFollow);return}
  if(followBusy||member===props.context?.creator_user_id)return;
  setFollowBusy(true);
  const previous=following;
  setFollowing(!previous);
  setFollowers(n=>Math.max(0,n+(previous?-1:1)));
  try{
   const {data,error}=await supabase.rpc("raye2_toggle_follow",{p_target_id:props.context!.creator_user_id});
   if(error)throw error;
   const next=!!data;
   if(next!==!previous){setFollowing(next);setFollowers(n=>Math.max(0,n+(next?1:-1)));}
   if(next)setNotice(t.followingNow);
  }catch{
   setFollowing(previous);
   setFollowers(n=>Math.max(0,n+(previous?1:-1)));
   setNotice(t.followError);
  }finally{setFollowBusy(false)}
 }

 async function saveProgress(position:number,duration:number){
  if(!supabase||!member)return;
  try{
   await supabase.rpc("raye2_record_watch_progress",{p_media_id:props.mediaId,p_position:position,p_duration:duration});
  }catch{}
 }

 return <main className="raye2-detail-page" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className="raye2-detail-header"><Link className="raye2-detail-brand" href="/raye2/home">Raye2<span className="raye2-detail-brand-mark">.</span></Link><nav><Link href="/raye2/home">{t.home}</Link><Link href="/community">{t.community}</Link><Link href="/notifications">{t.notifications}</Link><Link href="/series">{t.series}</Link><Link href="/shorts">{t.shorts}</Link><Link href="/#videos">{t.videos}</Link></nav></header>
  <div className="raye2-detail-layout">
   <article className="raye2-detail-main">
    <div className="raye2-detail-player"><PublicVideoPlayer startAt={props.startAt} hlsSrc={props.hlsSrc} src={props.src} poster={props.poster} title={props.title} description={props.description} youtubeEmbedUrl={props.youtubeEmbedUrl} locale={locale} onProgress={saveProgress}/></div>
    <div className="raye2-detail-title"><div><span className="nhen-section-label">{props.category} / RAYE2 WATCH</span><h1>{props.title}</h1><p className="nhen-muted">{new Date(props.publishedAt).toLocaleDateString(isArabic?"ar-EG":"en-US")} · {t.official}</p></div><span className="nhen-pill nhen-pill-official">✦ OFFICIAL</span></div>
    {props.context?.creator_user_id&&<section className="raye2-detail-creator" aria-label={t.creator}>
     <Link className="raye2-detail-creator-id" href={"/u/"+props.context.creator_handle}>
      <span className="raye2-detail-creator-avatar">{props.context.creator_avatar_url?<Image src={props.context.creator_avatar_url} alt="" fill unoptimized />:"◎"}</span>
      <span className="raye2-detail-creator-copy"><strong>{props.context.creator_display_name??"Raye2"}</strong><small>@{props.context.creator_handle} · {followers} {t.followerCount}</small></span>
     </Link>
     <div className="raye2-detail-creator-actions">
      <button className={following?"active":""} onClick={()=>void toggleFollow()} disabled={followBusy||member===props.context.creator_user_id}>{following?t.following:t.follow}</button>
      <Link href={"/u/"+props.context.creator_handle}>{t.viewProfile}</Link>
     </div>
    </section>}
    {props.context?.series_slug&&<section className="raye2-detail-series" aria-label={t.fromSeries}>
     <span className="nhen-section-label">{t.fromSeries}</span>
     <div className="raye2-detail-series-body"><Link href={"/series/"+props.context.series_slug}><strong>{props.context.series_title}</strong><small>{t.episode} {Number(props.context.series_position)+1} / {Number(props.context.series_episode_count)} {t.episodes}</small></Link><Link href={"/series/"+props.context.series_slug}>{t.viewSeries}</Link></div>
    </section>}
    <div className="raye2-detail-actions"><div className="raye2-detail-reaction"><button className={liked?"active":""} aria-expanded={reactionPicker} aria-haspopup="menu" onClick={()=>setReactionPicker(value=>!value)} disabled={actionBusy}>{myReaction?<NhenReactionArt reaction={myReaction} size={19}/>:<NhenReactionArt reaction="spark" size={19}/>} {myReaction?({spark:"Spark",orbit:"Orbit",legend:"Legend",laugh:"Laugh",mindblown:"Mind-blown",support:"Support"} as Record<string,string>)[myReaction]??t.react:t.react} · {likes}</button>{reactionPicker&&<div className="raye2-detail-picker" role="menu" aria-label={t.choose}>{[{id:"spark",icon:"✦",name:t.spark},{id:"orbit",icon:"◉",name:t.orbit},{id:"legend",icon:"♛",name:t.legend},{id:"laugh",icon:"≋",name:t.laugh},{id:"mindblown",icon:"✧",name:t.mindblown},{id:"support",icon:"♡",name:t.support}].map(item=><button type="button" role="menuitem" key={item.id} className={myReaction===item.id?"active":""} onClick={()=>void chooseReaction(item.id)} disabled={actionBusy}><NhenReactionArt reaction={item.id} size={25}/><span>{item.name}</span></button>)}</div>}</div><button className={saved?"active":""} onClick={()=>void toggleBookmark()} disabled={actionBusy}>▣ {saved?t.saved:t.save}</button><button onClick={()=>void shareVideo()}>↗ {t.share}</button></div>
    <section className="nhen-card nhen-card-pad raye2-detail-description"><h2>{t.about}</h2><p>{props.description||t.noDescription}</p>{props.tags.length>0&&<div className="raye2-detail-tags">{props.tags.map(tag=><Link key={tag} href={"/topics/"+encodeURIComponent(tag)}>#{tag}</Link>)}</div>}</section>
    {(props.related??[]).length>0&&<section className="raye2-detail-related" aria-label={t.related}><div className="raye2-detail-related-head"><h2>{t.related}</h2><Link href={"/topics/"+encodeURIComponent(props.category.toLowerCase())}>{props.category} ↗</Link></div><div className="raye2-detail-related-grid">{props.related!.map(item=><article className="raye2-detail-related-card" key={item.slug}><Link href={"/watch/"+item.slug}><div className="raye2-detail-related-thumb">▶</div><div className="raye2-detail-related-copy"><span className="nhen-section-label">{item.category.toUpperCase()}</span><h3>{item.title}</h3><p>{item.description}</p></div></Link></article>)}</div></section>}
    {props.allowComments?<section className="nhen-card nhen-card-pad raye2-detail-comments"><div className="nhen-card-heading"><h2>{t.discussion}</h2><span className="nhen-muted">{comments.length} {t.comments}</span></div>
     {member?<div className="raye2-detail-compose"><textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} maxLength={1500} placeholder={t.commentPlaceholder}/><button className="button button-primary" onClick={()=>void sendComment()} disabled={!comment.trim()||actionBusy}>{actionBusy?t.sending:t.commentAction}</button></div>:<p className="nhen-muted">{t.signIn}</p>}
     {comments.map(c=><article className="raye2-detail-comment" key={c.comment_id}>
      <div className="raye2-detail-comment-head"><Link href={c.author_handle?("/u/"+c.author_handle):"#"} className="raye2-detail-comment-author"><span className="raye2-detail-comment-avatar">{c.author_avatar_url?<Image src={c.author_avatar_url} alt="" fill unoptimized/>:(c.author_display_name??"R").slice(0,1).toUpperCase()}</span><strong>{c.author_display_name??c.author_handle??"Raye2"}</strong></Link><time>{new Date(c.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</time></div>
      <p>{c.body}</p>
      <div className="raye2-detail-comment-actions"><button type="button" className={c.my_reaction?"active":""} onClick={()=>void reactToComment(c.comment_id,false,c.my_reaction,"spark")} disabled={!!threadBusy} aria-label={t.reactComment}><NhenReactionArt reaction={c.my_reaction??"spark"} size={15}/> {c.reaction_count}</button><button type="button" onClick={()=>{setReplyOpen(open=>open===c.comment_id?null:c.comment_id);setReplyDraft("")}} disabled={!member}>{t.reply}</button>{c.reply_count>0&&<button type="button" onClick={()=>void toggleReplies(c.comment_id)} disabled={threadBusy===c.comment_id}>{replies[c.comment_id]?t.hideReplies:t.showReplies} · {c.reply_count}</button>}</div>
      {replyOpen===c.comment_id&&<div className="raye2-detail-compose raye2-detail-reply-compose"><textarea value={replyDraft} onChange={e=>setReplyDraft(e.target.value)} rows={2} maxLength={1500} placeholder={t.replyPlaceholder}/><button className="button button-primary" onClick={()=>void sendReply(c.comment_id)} disabled={!replyDraft.trim()||!!threadBusy}>{threadBusy===c.comment_id?t.sending:t.replyAction}</button></div>}
      {replies[c.comment_id]&&<div className="raye2-detail-replies">{(replies[c.comment_id]??[]).length?(replies[c.comment_id]??[]).map(r=><article className="raye2-detail-comment raye2-detail-reply" key={r.comment_id}>
       <div className="raye2-detail-comment-head"><Link href={r.author_handle?("/u/"+r.author_handle):"#"} className="raye2-detail-comment-author"><span className="raye2-detail-comment-avatar">{r.author_avatar_url?<Image src={r.author_avatar_url} alt="" fill unoptimized/>:(r.author_display_name??"R").slice(0,1).toUpperCase()}</span><strong>{r.author_display_name??r.author_handle??"Raye2"}</strong></Link><time>{new Date(r.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</time></div>
       <p>{r.body}</p>
       <div className="raye2-detail-comment-actions"><button type="button" className={r.my_reaction?"active":""} onClick={()=>void reactToComment(r.comment_id,true,r.my_reaction,"spark")} disabled={!!threadBusy} aria-label={t.reactComment}><NhenReactionArt reaction={r.my_reaction??"spark"} size={15}/> {r.reaction_count}</button></div>
      </article>):<p className="nhen-muted">{t.noReplies}</p>}</div>}
     </article>)}
    </section>:null}
    {notice&&<p className="nhen-mod-notice" role="status" aria-live="polite">{notice}</p>}
   </article>
  </div>
 </main>;
}

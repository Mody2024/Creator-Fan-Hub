"use client";

import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
import PublicVideoPlayer from "@/app/videos/public-video-player";
import NhenReactionArt from "./nhen-reaction-art";

type Props={startAt?:number;hlsSrc?:string|null;mediaId:string;title:string;description:string;src:string;poster?:string|null;youtubeEmbedUrl?:string|null;publishedAt:string;allowComments:boolean;category:string;tags:string[];related?:RelatedVideo[]};
type Comment={id:string;body:string;created_at:string;author_id:string};
type RelatedVideo={slug:string;title:string;category:string;description:string;published_at:string};

export default function WatchDetailClient(props:Props){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [member,setMember]=useState<string|null>(null);
 const [liked,setLiked]=useState(false);
 const [myReaction,setMyReaction]=useState<string|null>(null);
 const [reactionPicker,setReactionPicker]=useState(false);
 const [saved,setSaved]=useState(false);
 const [likes,setLikes]=useState(0);
 const [comments,setComments]=useState<Comment[]>([]);
 const [comment,setComment]=useState("");
 const [notice,setNotice]=useState("");
 const [actionBusy,setActionBusy]=useState(false);
 const [locale,setLocale]=useState<"en"|"ar">("en");
 const isArabic=locale==="ar";
 const t=isArabic?{
  home:"الرئيسية",community:"المجتمع",notifications:"الإشعارات",series:"السلاسل",shorts:"المقاطع",videos:"الفيديوهات",official:"فيديو رسمي من صانع المحتوى",react:"تفاعل",spark:"شرارة",orbit:"مدار",legend:"أسطوري",laugh:"مضحك",mindblown:"مذهل",support:"دعم",saved:"تم الحفظ",save:"حفظ",share:"مشاركة",about:"عن هذا الفيديو",noDescription:"لم تتم إضافة وصف بعد.",discussion:"النقاش",comments:"تعليق",commentPlaceholder:"اكتب تعليقًا مفيدًا…",sending:"جارٍ الإرسال…",commentAction:"علّق ↗",signIn:"سجّل الدخول للمشاركة في النقاش. تتم مراجعة التعليقات قبل نشرها.",choose:"اختر تفاعلك مع Raye2",viewError:"الفيديو يعمل، لكن تعذر تسجيل المشاهدة حاليًا.",loadError:"تعذر تحميل بعض تفاصيل الفيديو. تحقق من الاتصال وحدّث الصفحة للمحاولة مجددًا.",signReact:"سجّل الدخول للتفاعل مع الفيديوهات.",reactLive:"تم نشر تفاعلك على Raye2.",reactRemoved:"تمت إزالة تفاعلك.",reactError:"تعذر حفظ التفاعل. تمت استعادة تفاعلك السابق.",signSave:"سجّل الدخول لحفظ الفيديوهات.",savedVideo:"تم حفظ الفيديو.",unsavedVideo:"تمت إزالة الفيديو من المحفوظات.",saveError:"تعذر تحديث المحفوظات. تمت استعادة إعدادك السابق.",signComment:"سجّل الدخول للتعليق.",commentSent:"تم إرسال التعليق لمراجعة المبدع.",commentError:"تعذر إرسال التعليق. لا يزال النص موجودًا لتتمكن من المحاولة مجددًا.",shareCopied:"تم نسخ رابط الفيديو.",shareError:"تعذر نسخ الرابط تلقائيًا. يمكنك نسخ عنوان الصفحة من المتصفح.",related:"المزيد كهذا",relatedEmpty:"لا توجد فيديوهات مشابهة بعد."
 }:{
  home:"Home",community:"Community",notifications:"Notifications",series:"Series",shorts:"Shorts",videos:"Videos",official:"Official creator upload",react:"React",spark:"Spark",orbit:"Orbit",legend:"Legend",laugh:"Laugh",mindblown:"Mind-blown",support:"Support",saved:"Saved",save:"Save",share:"Share",about:"About this video",noDescription:"No description has been added yet.",discussion:"Discussion",comments:"comments",commentPlaceholder:"Add a thoughtful comment…",sending:"Sending…",commentAction:"Comment ↗",signIn:"Sign in to join the discussion. Comments are reviewed before publication.",choose:"Choose a Raye2 reaction",viewError:"Your video is playing, but its view could not be recorded right now.",loadError:"Some video details could not be loaded. Check your connection and refresh to try again.",signReact:"Sign in to react to videos.",reactLive:"Your Raye2 reaction is live.",reactRemoved:"Your reaction was removed.",reactError:"Could not save your reaction. Your previous reaction has been restored.",signSave:"Sign in to save videos.",savedVideo:"Video saved.",unsavedVideo:"Video removed from saved videos.",saveError:"Could not update saved videos. Your previous setting has been restored.",signComment:"Sign in to comment.",commentSent:"Comment submitted for creator review.",commentError:"Comment could not be submitted. Your text is still here so you can retry.",shareCopied:"Video link copied.",shareError:"Could not copy the link automatically. You can copy the page address from your browser.",related:"More like this",relatedEmpty:"No similar videos yet."
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
     props.allowComments?supabase.from("video_comments").select("id,body,created_at,author_id").eq("media_id",props.mediaId).eq("status","published").order("created_at",{ascending:false}).limit(50):Promise.resolve({data:[],error:null})
    ]);
    if(!alive)return;
    if(reaction.error||bookmark.error||commentRows.error)throw reaction.error??bookmark.error??commentRows.error;
    setLiked(!!reaction.data);setMyReaction(reaction.data?.reaction??null);setSaved(!!bookmark.data);setComments((commentRows.data??[]) as Comment[]);
    const view=await supabase.rpc("record_video_view",{p_media_id:props.mediaId});
    if(view.error&&alive)setNotice(t.viewError);
   }catch{
    if(alive)setNotice(t.loadError);
   }
  })();
  return()=>{alive=false};
 },[supabase,props.mediaId,props.allowComments]);

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

 async function shareVideo(){
  try{
   if(!navigator.clipboard?.writeText)throw new Error("Clipboard unavailable");
   await navigator.clipboard.writeText(window.location.href);
   setNotice(t.shareCopied);
  }catch{
   setNotice(t.shareError);
  }
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
    <div className="raye2-detail-actions"><div className="raye2-detail-reaction"><button className={liked?"active":""} aria-expanded={reactionPicker} aria-haspopup="menu" onClick={()=>setReactionPicker(value=>!value)} disabled={actionBusy}>{myReaction?<NhenReactionArt reaction={myReaction} size={19}/>:<NhenReactionArt reaction="spark" size={19}/>} {myReaction?({spark:"Spark",orbit:"Orbit",legend:"Legend",laugh:"Laugh",mindblown:"Mind-blown",support:"Support"} as Record<string,string>)[myReaction]??t.react:t.react} · {likes}</button>{reactionPicker&&<div className="raye2-detail-picker" role="menu" aria-label={t.choose}>{[{id:"spark",icon:"✦",name:t.spark},{id:"orbit",icon:"◉",name:t.orbit},{id:"legend",icon:"♛",name:t.legend},{id:"laugh",icon:"≋",name:t.laugh},{id:"mindblown",icon:"✧",name:t.mindblown},{id:"support",icon:"♡",name:t.support}].map(item=><button type="button" role="menuitem" key={item.id} className={myReaction===item.id?"active":""} onClick={()=>void chooseReaction(item.id)} disabled={actionBusy}><NhenReactionArt reaction={item.id} size={25}/><span>{item.name}</span></button>)}</div>}</div><button className={saved?"active":""} onClick={()=>void toggleBookmark()} disabled={actionBusy}>▣ {saved?t.saved:t.save}</button><button onClick={()=>void shareVideo()}>↗ {t.share}</button></div>
    <section className="nhen-card nhen-card-pad raye2-detail-description"><h2>{t.about}</h2><p>{props.description||t.noDescription}</p>{props.tags.length>0&&<div className="raye2-detail-tags">{props.tags.map(tag=><Link key={tag} href={"/topics/"+encodeURIComponent(tag)}>#{tag}</Link>)}</div>}</section>
    {(props.related??[]).length>0&&<section className="raye2-detail-related" aria-label={t.related}><div className="raye2-detail-related-head"><h2>{t.related}</h2><Link href={"/topics/"+encodeURIComponent(props.category.toLowerCase())}>{props.category} ↗</Link></div><div className="raye2-detail-related-grid">{props.related!.map(item=><article className="raye2-detail-related-card" key={item.slug}><Link href={"/watch/"+item.slug}><div className="raye2-detail-related-thumb">▶</div><div className="raye2-detail-related-copy"><span className="nhen-section-label">{item.category.toUpperCase()}</span><h3>{item.title}</h3><p>{item.description}</p></div></Link></article>)}</div></section>}
    {props.allowComments?<section className="nhen-card nhen-card-pad raye2-detail-comments"><div className="nhen-card-heading"><h2>{t.discussion}</h2><span className="nhen-muted">{comments.length} {t.comments}</span></div>
     {member?<div className="raye2-detail-compose"><textarea value={comment} onChange={e=>setComment(e.target.value)} rows={3} maxLength={1500} placeholder={t.commentPlaceholder}/><button className="button button-primary" onClick={()=>void sendComment()} disabled={!comment.trim()||actionBusy}>{actionBusy?t.sending:t.commentAction}</button></div>:<p className="nhen-muted">{t.signIn}</p>}
     {comments.map(c=><article className="raye2-detail-comment" key={c.id}><p>{c.body}</p><time>{new Date(c.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</time></article>)}
    </section>:null}
    {notice&&<p className="nhen-mod-notice" role="status" aria-live="polite">{notice}</p>}
   </article>
  </div>
 </main>;
}

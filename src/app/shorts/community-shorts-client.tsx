"use client";

import { useCallback,useEffect,useMemo,useRef,useState } from "react";
import Link from "next/link";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import { getResumableUploadSession, uploadToSupabaseStorage } from "@/lib/supabase/resumable-upload";

type ShortRow={id:string;author_id:string;title:string;caption:string;storage_path:string;duration_seconds:number;created_at:string;status:string};
type ShortProfile={user_id:string;handle:string;display_name:string;avatar_url:string|null};
type ShortReaction="spark"|"orbit"|"legend"|"laugh"|"mindblown"|"support";
type ShortComment={comment_id:string;author_id:string;author_handle:string|null;author_display_name:string|null;author_avatar_url:string|null;body:string;created_at:string;reply_count:number;reaction_count:number;my_reaction:string|null};
type ShortCommentReply={comment_id:string;author_id:string;author_handle:string|null;author_display_name:string|null;author_avatar_url:string|null;body:string;created_at:string;reaction_count:number;my_reaction:string|null};
const SHORT_REACTIONS:ShortReaction[]=["spark","orbit","legend","laugh","mindblown","support"];
const REACTION_ICON:Record<ShortReaction,string>={spark:"✨",orbit:"🪐",legend:"🏆",laugh:"😂",mindblown:"🤯",support:"💙"};
type ShortCard=ShortRow&{handle:string;displayName:string;avatarUrl:string|null;src:string};
const MAX_BYTES=50*1024*1024;
const MAX_SECONDS=180;

export default function CommunityShortsClient(){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const input=useRef<HTMLInputElement>(null);
 const [userId,setUserId]=useState<string|null>(null);
 const [items,setItems]=useState<ShortCard[]>([]);
 const [reactionCounts,setReactionCounts]=useState<Record<string,Record<string,number>>>({});
 const [myReactions,setMyReactions]=useState<Record<string,ShortReaction>>({});
 const [comments,setComments]=useState<Record<string,ShortComment[]>>({});
 const [commentDrafts,setCommentDrafts]=useState<Record<string,string>>({});
 const [openComments,setOpenComments]=useState<Record<string,boolean>>({});
 const [commentReplies,setCommentReplies]=useState<Record<string,ShortCommentReply[]>>({});
 const [replyOpen,setReplyOpen]=useState<string|null>(null);
 const [replyDraft,setReplyDraft]=useState("");
 const [engagementBusy,setEngagementBusy]=useState<string|null>(null);
 const [title,setTitle]=useState("");
 const [caption,setCaption]=useState("");
 const [file,setFile]=useState<File|null>(null);
 const [duration,setDuration]=useState(0);
 const [busy,setBusy]=useState(false);
 const [uploadProgress,setUploadProgress]=useState<number|null>(null);
 const [status,setStatus]=useState("");
 const [loading,setLoading]=useState(true);
 const [locale,setLocale]=useState<"en"|"ar">("en");
 const isArabic=locale==="ar";
 const t=isArabic?{
  stream:"محتوى المجتمع",shared:"مقاطع من المجتمع",members:"فيديوهات الأعضاء",moment:"لحظتك",share:"شارك مقطع Nhenbit",limits:"يمكن للأعضاء نشر مقاطع MP4 أو WebM حتى 3 دقائق و50 ميجابايت للفيديو.",title:"اكتب عنوان الفيديو",caption:"أضف وصفًا (اختياري)",choose:"＋ اختر فيديو",none:"لم يتم اختيار فيديو",publish:"انشر Nhenbit ↗",publishing:"جارٍ النشر…",signIn:"انضم أو سجّل الدخول لنشر مقطع مجتمعي ↗",loading:"جارٍ تحميل مقاطع المجتمع…",empty:"لا توجد مقاطع Nhenbit بعد. كن أول من يشارك.",remove:"احذف مقطعك",confirm:"هل تريد إزالة هذا المقطع من المجتمع؟",upload:"جارٍ الرفع",resume:"إذا توقف الرفع، اختر الملف نفسه مرة أخرى للاستكمال.",ready:"الفيديو جاهز. أضف عنوانًا وانشره للمجتمع.",live:"مقطعك أصبح متاحًا للمجتمع.",removed:"تم حذف المقطع والفيديو المخزن.",invalid:"اختر فيديو MP4 أو WebM.",tooLarge:"حجم الفيديو يتجاوز حد الرفع الحالي البالغ 50 ميجابايت.",tooLong:"يجب ألا تتجاوز مدة Nhenbit ثلاث دقائق.",feedError:"تعذر تحميل مقاطع المجتمع. حدّث الصفحة.",videoRead:"تعذر قراءة هذا الفيديو. جرّب ملف MP4 أو WebM آخر.",genericRead:"تعذر قراءة الفيديو.",uploadInterrupted:"توقف الرفع. تم الاحتفاظ بجلسة الاستكمال؛ اختر الملف نفسه مرة أخرى للمتابعة.",uploadCleanup:"تعذر حفظ المنشور، ويحتاج الملف المرفوع إلى مراجعة المسؤول.",deleteBackup:"تعذر التحقق من نسخة الفيديو الأصلية قبل الحذف.",deleteFailed:"تعذر حذف المقطع؛ تمت استعادة الفيديو الأصلي.",restoreFailed:"فشل الحذف وتعذرت استعادة نسخة الفيديو. تواصل مع المسؤول.",fileTitle:"عنوان الفيديو",fileCaption:"وصف الفيديو",uploadProgress:"تقدم رفع فيديو المجتمع",react:"تفاعل",comments:"التعليقات",commentPlaceholder:"اكتب تعليقًا…",sendComment:"إرسال",signInReact:"سجّل الدخول للتفاعل أو التعليق.",commentPending:"تم إرسال تعليقك للمراجعة.",commentError:"تعذر إرسال التعليق.",reactionError:"تعذر حفظ التفاعل.",commentsError:"تعذر تحميل التعليقات.",noComments:"لا توجد تعليقات منشورة بعد.",reply:"رد",replyPlaceholder:"اكتب ردًا…",replyAction:"رد ↗",showReplies:"اعرض الردود",hideReplies:"أخفِ الردود",replyPending:"تم إرسال الرد للمراجعة.",noReplies:"لا توجد ردود بعد.",reactComment:"تفاعل مع التعليق",commentReactError:"تعذر حفظ تفاعل التعليق."
 }:{
  stream:"COMMUNITY STREAM",shared:"Shared by the community",members:"Member videos",moment:"YOUR MOMENT",share:"Share a Nhenbit",limits:"Community members can publish MP4 or WebM · up to 3 minutes · 50 MB per video.",title:"Give your video a title",caption:"Add a caption (optional)",choose:"＋ Choose video",none:"No video selected",publish:"Publish Nhenbit ↗",publishing:"Publishing…",signIn:"Join or sign in to upload a community Nhenbit ↗",loading:"Loading community videos…",empty:"No community Nhenbits yet. Be the first to share one.",remove:"Remove your video",confirm:"Remove this Nhenbit from the community?",upload:"Uploading",resume:"If interrupted, choose the same file again to resume.",ready:"Video ready. Add a title and publish it to the community.",live:"Your Nhenbit is live in the community.",removed:"Your Nhenbit and its stored video were removed.",invalid:"Choose an MP4 or WebM video.",tooLarge:"This video exceeds the current 50 MB community upload limit.",tooLong:"Nhenbits must be 3 minutes or shorter.",feedError:"The Nhenbits feed could not load. Please refresh.",videoRead:"This video could not be read. Try another MP4 or WebM file.",genericRead:"Could not read this video.",uploadInterrupted:"Upload interrupted. Your resumable session is retained; choose the same file again to continue.",uploadCleanup:"The post could not be saved and its uploaded file needs administrator cleanup.",deleteBackup:"Could not verify the original video before removal.",deleteFailed:"Could not remove this Nhenbit; the original video was restored.",restoreFailed:"Removal failed and the video backup could not be restored. Contact an administrator.",fileTitle:"Video title",fileCaption:"Video caption",uploadProgress:"Community upload progress",react:"React",comments:"Comments",commentPlaceholder:"Write a comment…",sendComment:"Send",signInReact:"Sign in to react or comment.",commentPending:"Your comment was submitted for moderation.",commentError:"Could not submit comment.",reactionError:"Could not save reaction.",commentsError:"Could not load comments.",noComments:"No published comments yet.",reply:"Reply",replyPlaceholder:"Write a reply…",replyAction:"Reply ↗",showReplies:"Show replies",hideReplies:"Hide replies",replyPending:"Your reply was submitted for moderation.",noReplies:"No replies yet.",reactComment:"React to comment",commentReactError:"Could not save the comment reaction."
 };
 useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);

 const load=useCallback(async()=>{
  if(!supabase){setLoading(false);return;}
  setLoading(true);
  const {data,error}=await supabase.from("community_short_videos").select("id,author_id,title,caption,storage_path,duration_seconds,created_at,status").eq("status","published").order("created_at",{ascending:false}).limit(60);
  if(error){setStatus(t.feedError);setLoading(false);return;}
  const rows=(data??[]) as ShortRow[];
  const ids=[...new Set(rows.map(row=>row.author_id))];
  const {data:profiles}=ids.length?await supabase.from("member_profiles").select("user_id,handle,display_name,avatar_url").in("user_id",ids):{data:[]};
  const profileRows=(profiles??[]) as ShortProfile[];
  const byId=new Map<string,ShortProfile>(profileRows.map(p=>[p.user_id,p] as const));
  setItems(rows.map(row=>{
   const profile=byId.get(row.author_id);
   return {...row,handle:profile?.handle??"member",displayName:profile?.display_name??"NHEN member",avatarUrl:profile?.avatar_url??null,src:supabase.storage.from("nhen-community-shorts").getPublicUrl(row.storage_path).data.publicUrl};
  }));
  if(rows.length){
   const shortIds=rows.map(row=>row.id);
   const [{data:aggregateCounts,error:countsError},{data:ownReactions,error:ownError}]=await Promise.all([
    supabase.rpc("get_community_short_reaction_counts",{p_short_ids:shortIds}),
    userId?supabase.from("community_short_reactions").select("short_id,reaction").in("short_id",shortIds).eq("user_id",userId):Promise.resolve({data:[],error:null})
   ]);
   if(countsError||ownError){setStatus(t.reactionError);}
   const counts:Record<string,Record<string,number>>={};
   (aggregateCounts??[]).forEach((r:{short_id:string;reaction:ShortReaction;reaction_count:number|string})=>{counts[r.short_id]??={};counts[r.short_id][r.reaction]=Number(r.reaction_count)||0;});
   const mine:Record<string,ShortReaction>={};
   (ownReactions??[]).forEach((r:{short_id:string;reaction:ShortReaction})=>{mine[r.short_id]=r.reaction;});
   setReactionCounts(counts);setMyReactions(mine);
  }else{setReactionCounts({});setMyReactions({});}
  setLoading(false);
 },[supabase,userId]);

 useEffect(()=>{
  if(!supabase)return;
  let alive=true;
  void supabase.auth.getUser().then(({data}:{data:{user:{id:string}|null}})=>{if(alive)setUserId(data.user?.id??null);});
  const {data:listener}=supabase.auth.onAuthStateChange((_event:string,session:{user:{id:string}}|null)=>{if(alive)setUserId(session?.user?.id??null);});
  void load();
  return()=>{alive=false;listener.subscription.unsubscribe();};
 },[supabase,load]);

 async function react(shortId:string,reaction:ShortReaction){
  if(!supabase||!userId){setStatus(t.signInReact);return;}
  if(engagementBusy)return;
  setEngagementBusy(shortId);
  const previous=myReactions[shortId];
  try{
   if(previous===reaction){
    const {error}=await supabase.from("community_short_reactions").delete().eq("short_id",shortId).eq("user_id",userId);
    if(error)throw error;
    setMyReactions(current=>{const next={...current};delete next[shortId];return next;});
    setReactionCounts(current=>({...current,[shortId]:{...(current[shortId]??{}),[reaction]:Math.max(0,(current[shortId]?.[reaction]??0)-1)}}));
   }else{
    const {error}=await supabase.from("community_short_reactions").upsert({short_id:shortId,user_id:userId,reaction},{onConflict:"short_id,user_id"});
    if(error)throw error;
    setMyReactions(current=>({...current,[shortId]:reaction}));
    setReactionCounts(current=>{const counts={...(current[shortId]??{})};if(previous)counts[previous]=Math.max(0,(counts[previous]??0)-1);counts[reaction]=(counts[reaction]??0)+1;return {...current,[shortId]:counts};});
   }
  }catch{setStatus(t.reactionError);}finally{setEngagementBusy(null);}
 }
 async function toggleComments(shortId:string){
  const opening=!openComments[shortId];
  setOpenComments(current=>({...current,[shortId]:opening}));
  if(!opening||comments[shortId]||!supabase)return;
  const {data,error}=await supabase.rpc("raye2_get_short_comment_thread",{p_short_id:shortId,p_limit:40});
  if(error){setStatus(t.commentsError);return;}
  setComments(current=>({...current,[shortId]:(data??[]) as ShortComment[]}));
 }
 async function sendComment(shortId:string){
  const body=(commentDrafts[shortId]??"").trim();
  if(!supabase||!userId||!body||engagementBusy)return;
  setEngagementBusy(shortId);
  const {error}=await supabase.from("community_short_comments").insert({short_id:shortId,author_id:userId,body,status:"pending"});
  setStatus(error?t.commentError:t.commentPending);
  if(!error)setCommentDrafts(current=>({...current,[shortId]:""}));
  setEngagementBusy(null);
 }
 async function toggleReplies(rootId:string){
  if(!supabase)return;
  if(commentReplies[rootId]){setCommentReplies(current=>{const next={...current};delete next[rootId];return next});return}
  setEngagementBusy(rootId);
  const {data,error}=await supabase.rpc("raye2_get_short_comment_replies",{p_parent_id:rootId,p_limit:40});
  if(error)setStatus(t.commentsError);
  else setCommentReplies(current=>({...current,[rootId]:(data??[]) as ShortCommentReply[]}));
  setEngagementBusy(null);
 }
 async function sendReply(shortId:string,rootId:string){
  const body=replyDraft.trim();
  if(!supabase||!userId||!body||engagementBusy)return;
  setEngagementBusy(rootId);
  const {error}=await supabase.from("community_short_comments").insert({short_id:shortId,author_id:userId,body,status:"pending",parent_comment_id:rootId});
  setStatus(error?t.commentError:t.replyPending);
  if(!error){setReplyDraft("");setReplyOpen(null);}
  setEngagementBusy(null);
 }
 async function reactToComment(commentId:string,isReply:boolean,current:string|null){
  if(!supabase||!userId){setStatus(t.signInReact);return;}
  if(engagementBusy)return;
  const reaction:ShortReaction="spark";
  const next=current===reaction?null:reaction;
  setEngagementBusy(commentId);
  const apply=(list:ShortCommentReply[])=>list.map(r=>r.comment_id===commentId?{...r,my_reaction:next,reaction_count:Math.max(0,r.reaction_count+(next&&!current?1:!next&&current?-1:0))}:r);
  const delta=next&&!current?1:!next&&current?-1:0;
  if(isReply)setCommentReplies(all=>{const copy={...all};for(const key of Object.keys(copy))copy[key]=apply(copy[key]);return copy;});
  else setComments(all=>{const copy={...all};for(const key of Object.keys(copy))copy[key]=copy[key].map(c=>c.comment_id===commentId?{...c,my_reaction:next,reaction_count:Math.max(0,c.reaction_count+delta)}:c);return copy;});
  const {error}=await supabase.rpc("raye2_toggle_short_comment_reaction",{p_comment_id:commentId,p_reaction:next});
  if(error){
   setStatus(t.commentReactError);
   if(isReply)setCommentReplies(all=>{const copy={...all};for(const key of Object.keys(copy))copy[key]=copy[key].map(r=>r.comment_id===commentId?{...r,my_reaction:current,reaction_count:Math.max(0,r.reaction_count-delta)}:r);return copy;});
   else setComments(all=>{const copy={...all};for(const key of Object.keys(copy))copy[key]=copy[key].map(c=>c.comment_id===commentId?{...c,my_reaction:current,reaction_count:Math.max(0,c.reaction_count-delta)}:c);return copy;});
  }
  setEngagementBusy(null);
 }
 async function chooseFile(selected:File|null){
  setFile(null);setDuration(0);setStatus("");
  if(!selected)return;
  if(!["video/mp4","video/webm"].includes(selected.type)){setStatus(t.invalid);if(input.current)input.current.value="";return;}
  if(selected.size>MAX_BYTES){setStatus(t.tooLarge);if(input.current)input.current.value="";return;}
  const url=URL.createObjectURL(selected);
  try{
   const seconds=await new Promise<number>((resolve,reject)=>{
    const video=document.createElement("video");video.preload="metadata";video.onloadedmetadata=()=>resolve(video.duration);video.onerror=()=>reject(new Error(t.videoRead));video.src=url;
   });
   if(!Number.isFinite(seconds)||seconds<=0||seconds>MAX_SECONDS)throw new Error(t.tooLong);
   setFile(selected);setDuration(Math.ceil(seconds));setTitle(value=>value||selected.name.replace(/\.[^.]+$/,"").slice(0,100));setStatus(t.ready);
  }catch(error){setStatus(error instanceof Error?error.message:t.genericRead);if(input.current)input.current.value="";}
  finally{URL.revokeObjectURL(url);}
 }

 async function publish(){
  if(!supabase||!userId||!file||!title.trim()||busy)return;
  setBusy(true);setStatus("");
  let reservationId:string|null=null;
  let uploadSession:ReturnType<typeof getResumableUploadSession>|null=null;
  let uploaded=false;
  try{
   uploadSession=getResumableUploadSession(userId,"nhen-community-shorts",file);
   const previousReservation=uploadSession.getReservationId();
   if(previousReservation){
    const {data:reused,error:reuseError}=await supabase.rpc("reuse_nhen_media_upload_reservation",{p_reservation_id:previousReservation,p_bytes:file.size,p_bucket:"nhen-community-shorts"});
    if(!reuseError&&reused)reservationId=previousReservation;
   }
   if(!reservationId){
    const {data:reservation,error:reservationError}=await supabase.rpc("reserve_nhen_media_upload",{p_bytes:file.size,p_bucket:"nhen-community-shorts"});
    if(reservationError || !reservation?.[0]?.reservation_id) throw reservationError??new Error("NHEN free storage capacity is unavailable. No upload was started.");
    const newReservationId=reservation[0].reservation_id as string;
    reservationId=newReservationId;
    uploadSession.saveReservation(newReservationId);
   }
   const path=uploadSession.objectName;
   await uploadToSupabaseStorage({client:supabase,bucketName:"nhen-community-shorts",objectName:path,file,onProgress:setUploadProgress});
   uploaded=true;
   const {error:saveError}=await supabase.from("community_short_videos").insert({author_id:userId,title:title.trim(),caption:caption.trim(),storage_path:path,duration_seconds:duration,status:"published",provider:"supabase",asset_key:path,playback_kind:"file",processing_status:"ready",size_bytes:file.size,mime_type:file.type});
   if(saveError){
    const {error:cleanupError}=await supabase.storage.from("nhen-community-shorts").remove([path]);
    if(cleanupError)throw new Error(t.uploadCleanup);
    throw saveError;
   }
   setTitle("");setCaption("");setFile(null);setDuration(0);if(input.current)input.current.value="";
   setStatus(t.live);await load();
  }catch(error){setStatus(!uploaded?t.uploadInterrupted+" "+(error instanceof Error?error.message:""):error instanceof Error?error.message:t.uploadCleanup);}
  finally{
   if(uploaded&&uploadSession){
    uploadSession.clear();
    if(reservationId) { try { await supabase.rpc("release_nhen_media_upload_reservation",{p_reservation_id:reservationId}); } catch { /* reservation expires automatically */ } }
   }
   setUploadProgress(null);
   setBusy(false);
  }
 }

 async function remove(item:ShortCard){
  if(!supabase||!userId||item.author_id!==userId)return;
  if(!window.confirm(t.confirm))return;
  setBusy(true);
  let backup:Blob|null=null;
  let storageRemoved=false;
  try{
   const {data:download,error:downloadError}=await supabase.storage.from("nhen-community-shorts").download(item.storage_path);
   if(downloadError||!download)throw downloadError??new Error(t.deleteBackup);
   backup=download;
   const {error:storageError}=await supabase.storage.from("nhen-community-shorts").remove([item.storage_path]);
   if(storageError)throw storageError;
   storageRemoved=true;
   const {error:rowError}=await supabase.from("community_short_videos").delete().eq("id",item.id).eq("author_id",userId);
   if(rowError){
    if(!backup) throw new Error("The original video backup is unavailable. Contact an administrator.");
    const {error:restoreError}=await supabase.storage.from("nhen-community-shorts").upload(item.storage_path,backup,{contentType:backup.type||"video/mp4",upsert:false});
    if(restoreError)throw new Error(t.restoreFailed);
    storageRemoved=false;
    throw rowError;
   }
   setStatus(t.removed);
   await load();
  }catch(error){
   if(storageRemoved&&backup){
    const {error:restoreError}=await supabase.storage.from("nhen-community-shorts").upload(item.storage_path,backup,{contentType:backup.type||"video/mp4",upsert:false});
    if(restoreError)setStatus(t.restoreFailed);
    else setStatus(error instanceof Error?error.message:t.deleteFailed);
   }else setStatus(error instanceof Error?error.message:t.deleteFailed);
  }finally{setBusy(false);}
 }

 return <section className="nhen-community-shorts-section" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <div className="nhen-card-heading"><div><span className="nhen-section-label">{t.stream}</span><h2>{t.shared}</h2></div><span className="nhen-muted">{t.members}</span></div>
  <section className="nhen-community-short-composer">
   <div><span className="nhen-section-label">{t.moment}</span><h2>{t.share}</h2><p>{t.limits}</p></div>
   {userId?<div className="nhen-community-short-fields">
    <input value={title} onChange={e=>setTitle(e.target.value)} maxLength={100} placeholder={t.title} aria-label={t.fileTitle}/>
    <textarea value={caption} onChange={e=>setCaption(e.target.value)} maxLength={500} rows={2} placeholder={t.caption} aria-label={t.fileCaption}/>
    <div className="nhen-community-short-controls"><label className="nhen-short-file-label"><input ref={input} type="file" accept="video/mp4,video/webm" onChange={e=>void chooseFile(e.target.files?.[0]??null)}/><span>{t.choose}</span></label><span className="nhen-muted">{file?file.name+" · "+duration+" sec":t.none}</span><button className="button button-primary" disabled={!file||!title.trim()||busy} onClick={()=>void publish()}>{busy?t.publishing:t.publish}</button></div>
   </div>:<p><Link className="nhen-action" href="/community#join">{t.signIn}</Link></p>}
   {uploadProgress!==null&&<div className="media-upload-note" role="status"><strong>{t.upload} · {uploadProgress}%</strong><progress max={100} value={uploadProgress} aria-label={t.uploadProgress}/><small>{t.resume}</small></div>}{status&&<p role="status" aria-live="polite" className="nhen-muted">{status}</p>}
  </section>
  <div className="nhen-community-shorts-grid">{loading?<div className="nhen-card nhen-empty-state">{t.loading}</div>:items.length?items.map(item=><article className="nhen-community-short-card" key={item.id}>
   <video src={item.src} controls playsInline preload="metadata" aria-label={item.title}/>
   <div className="nhen-community-short-card-body"><div className="nhen-community-short-author">{item.avatarUrl?<img src={item.avatarUrl} alt=""/>:<span>{item.displayName.slice(0,1).toUpperCase()}</span>}<Link href={"/u/"+item.handle}>@{item.handle}</Link><time>{new Date(item.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</time></div><h3>{item.title}</h3>{item.caption&&<p>{item.caption}</p>}<div className="nhen-community-short-engagement"><div className="nhen-community-short-reactions" aria-label={t.react}>{SHORT_REACTIONS.map(reaction=><button type="button" key={reaction} className={myReactions[item.id]===reaction?"nhen-action is-active":"nhen-action"} aria-pressed={myReactions[item.id]===reaction} disabled={engagementBusy===item.id} onClick={()=>void react(item.id,reaction)}><span aria-hidden="true">{REACTION_ICON[reaction]}</span><span>{reactionCounts[item.id]?.[reaction]??0}</span></button>)}<button type="button" className="nhen-action nhen-short-comments-toggle" aria-expanded={!!openComments[item.id]} onClick={()=>void toggleComments(item.id)}>💬 {t.comments}</button></div>{openComments[item.id]&&<section className="nhen-short-comments-panel"><div className="nhen-short-comments-list">{(comments[item.id]??[]).length?comments[item.id].map(comment=><article className="nhen-short-comment" key={comment.comment_id}><div className="nhen-short-comment-head"><span className="nhen-short-comment-avatar">{(comment.author_display_name??comment.author_handle??"M").slice(0,1).toUpperCase()}</span><Link href={"/u/"+(comment.author_handle??"")}><strong>{comment.author_display_name??comment.author_handle??"Member"}</strong></Link><time>{new Date(comment.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</time></div><p>{comment.body}</p><div className="nhen-short-comment-actions"><button type="button" className={comment.my_reaction?"is-active":""} aria-pressed={!!comment.my_reaction} aria-label={t.reactComment} disabled={engagementBusy===comment.comment_id} onClick={()=>void reactToComment(comment.comment_id,false,comment.my_reaction)}><span aria-hidden="true">✨</span> {comment.reaction_count}</button><button type="button" disabled={!userId} onClick={()=>{setReplyOpen(open=>open===comment.comment_id?null:comment.comment_id);setReplyDraft("")}}>{t.reply}</button>{comment.reply_count>0&&<button type="button" disabled={engagementBusy===comment.comment_id} onClick={()=>void toggleReplies(comment.comment_id)}>{commentReplies[comment.comment_id]?t.hideReplies:t.showReplies} · {comment.reply_count}</button>}</div>{replyOpen===comment.comment_id&&<form className="nhen-short-reply-form" onSubmit={event=>{event.preventDefault();void sendReply(item.id,comment.comment_id);}}><input value={replyDraft} maxLength={1000} placeholder={t.replyPlaceholder} aria-label={t.replyPlaceholder} onChange={event=>setReplyDraft(event.target.value)}/><button type="submit" disabled={!replyDraft.trim()||!!engagementBusy}>{t.replyAction}</button></form>}{commentReplies[comment.comment_id]&&<div className="nhen-short-replies">{(commentReplies[comment.comment_id]??[]).length?(commentReplies[comment.comment_id]??[]).map(reply=><article className="nhen-short-comment nhen-short-comment-reply" key={reply.comment_id}><div className="nhen-short-comment-head"><span className="nhen-short-comment-avatar">{(reply.author_display_name??reply.author_handle??"M").slice(0,1).toUpperCase()}</span><Link href={"/u/"+(reply.author_handle??"")}><strong>{reply.author_display_name??reply.author_handle??"Member"}</strong></Link><time>{new Date(reply.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</time></div><p>{reply.body}</p><div className="nhen-short-comment-actions"><button type="button" className={reply.my_reaction?"is-active":""} aria-pressed={!!reply.my_reaction} aria-label={t.reactComment} disabled={engagementBusy===reply.comment_id} onClick={()=>void reactToComment(reply.comment_id,true,reply.my_reaction)}><span aria-hidden="true">✨</span> {reply.reaction_count}</button></div></article>):<p className="nhen-muted">{t.noReplies}</p>}</div>}</article>):<p className="nhen-muted">{t.noComments}</p>}</div>{userId?<form onSubmit={event=>{event.preventDefault();void sendComment(item.id);}}><input value={commentDrafts[item.id]??""} maxLength={1000} placeholder={t.commentPlaceholder} aria-label={t.commentPlaceholder} onChange={event=>setCommentDrafts(current=>({...current,[item.id]:event.target.value}))}/><button type="submit" disabled={!commentDrafts[item.id]?.trim()||engagementBusy===item.id}>{t.sendComment}</button></form>:<p className="nhen-muted">{t.signInReact}</p>}</section>}</div>{item.author_id===userId&&<button className="nhen-action" disabled={busy} onClick={()=>void remove(item)}>{t.remove}</button>}</div>
  </article>):<div className="nhen-card nhen-empty-state">{t.empty}</div>}</div>
 </section>;
}

"use client";

import {useEffect,useMemo,useState} from "react";
import {useRouter} from "next/navigation";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

export type QueueItem={id:string;kind:"post"|"comment"|"video_comment"|"short_comment";body:string;status:string;createdAt:string;author:string;handle:string;postType?:string;postId?:string};
export type ReportItem={id:string;targetType:string;targetId:string;reason:string;details:string;status:string;createdAt:string};

export default function CommunityModerationClient({initialPosts,initialComments,initialVideoComments,initialShortComments,initialReports}:{initialPosts:QueueItem[];initialComments:QueueItem[];initialVideoComments:QueueItem[];initialShortComments:QueueItem[];initialReports:ReportItem[]}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const router=useRouter();
 const [posts,setPosts]=useState(initialPosts),[comments,setComments]=useState(initialComments),[videoComments,setVideoComments]=useState(initialVideoComments),[shortComments,setShortComments]=useState(initialShortComments),[reports,setReports]=useState(initialReports);
 const [tab,setTab]=useState<"posts"|"comments"|"video_comments"|"short_comments"|"reports">("posts"),[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState("");
 const [locale,setLocale]=useState<"en"|"ar">("en");
 const isArabic=locale==="ar";
 const t=isArabic?{
  posts:"منشورات للمراجعة",comments:"تعليقات للمراجعة",videoComments:"تعليقات الفيديو",reports:"بلاغات مفتوحة",refresh:"تحديث القائمة ↻",member:"منشورات الأعضاء بانتظار الموافقة",community:"مجتمع",video:"فيديو",total:"عناصر تحتاج إلى مراجعة",approve:"موافقة ونشر",reject:"رفض",remove:"إزالة",noPosts:"لا توجد منشورات بانتظار المراجعة.",noComments:"لا توجد تعليقات بانتظار المراجعة.",noVideo:"لا توجد تعليقات فيديو بانتظار المراجعة.",noShortComments:"لا توجد تعليقات مقاطع قصيرة بانتظار المراجعة.",noReports:"لا توجد بلاغات مفتوحة.",post:"منشور عضو",comment:"تعليق",videoComment:"تعليق فيديو",shortComment:"تعليق مقطع قصير",report:"بلاغ",reviewing:"قيد المراجعة",resolve:"حل البلاغ",dismiss:"تجاهل",markReview:"وضع قيد المراجعة",confirmRemove:"إزالة هذا المحتوى من المجتمع؟ لا يمكن التراجع عن هذا الإجراء من هنا.",confirmReject:"رفض هذه المشاركة؟ ستظل خارج المجتمع العام.",confirmResolved:"وضع علامة تم الحل على هذا البلاغ؟",confirmDismiss:"تجاهل هذا البلاغ دون اتخاذ إجراء آخر؟",noUpdate:"لم يتم تأكيد أي تحديث. ربما لا تسمح صلاحياتك بهذا الإجراء أو ربما تغير العنصر. حدّث الصفحة وحاول مرة أخرى.",approved:"تمت الموافقة والنشر.",rejected:"تم رفض المشاركة.",removed:"تمت إزالة المحتوى.",connection:"تعذر تأكيد التحديث بسبب الاتصال. حدّث قائمة المراجعة للتحقق من الحالة.",reportUpdated:"تم تحديث حالة البلاغ.",reportError:"لم يتم تأكيد تحديث البلاغ. تحقق من صلاحياتك وحدّث القائمة.",reportConnection:"تعذر تأكيد تحديث البلاغ بسبب الاتصال. حدّث الصفحة للتحقق من الحالة.",details:"لا توجد تفاصيل إضافية.",count:"عنصر"
 }:{
  posts:"POSTS TO REVIEW",comments:"COMMENTS TO REVIEW",videoComments:"VIDEO COMMENTS",reports:"OPEN REPORTS",refresh:"Refresh queue ↻",member:"Member submissions awaiting approval",community:"community",video:"video",total:"total items need attention",approve:"Approve & publish",reject:"Reject",remove:"Remove",noPosts:"No posts waiting for review.",noComments:"No comments waiting for review.",noVideo:"No video comments waiting for review.",noShortComments:"No community Shorts comments waiting for review.",noReports:"No open reports.",post:"MEMBER POST",comment:"COMMENT",videoComment:"VIDEO COMMENT",shortComment:"SHORT COMMENT",report:"REPORT",reviewing:"REVIEWING",resolve:"Resolve",dismiss:"Dismiss",markReview:"Mark reviewing",confirmRemove:"Remove this content from the community? This action cannot be undone here.",confirmReject:"Reject this submission? It will stay out of the public community.",confirmResolved:"Mark this report resolved?",confirmDismiss:"Dismiss this report without further action?",noUpdate:"No update was confirmed. Your role may not allow this action, or the item may have changed. Refresh and retry.",approved:"Approved and published.",rejected:"Submission rejected.",removed:"Content removed.",connection:"The connection failed before the update could be confirmed. Refresh the queue to check the current status.",reportUpdated:"Report status updated.",reportError:"No report update was confirmed. Check your role and refresh the queue.",reportConnection:"The connection failed before the report update could be confirmed. Refresh to check its current status.",details:"No additional details supplied.",count:"items"
 };
 useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);
 async function moderate(kind:"post"|"comment"|"video_comment"|"short_comment",id:string,status:"published"|"rejected"|"removed"){
  if(!supabase||busy)return;
  if((status==="rejected"||status==="removed")&&!window.confirm(status==="removed"?t.confirmRemove:t.confirmReject))return;
  setBusy(id);setNotice("");
  const table=kind==="post"?"community_posts":kind==="video_comment"?"video_comments":kind==="short_comment"?"community_short_comments":"community_comments";
  try {
   const result=await supabase.from(table).update({status,...(kind==="post"?{updated_at:new Date().toISOString()}: {})}).eq("id",id).select("id").maybeSingle();
   if(result.error||!result.data?.id){setNotice(t.noUpdate);return;}
   if(kind==="post")setPosts(items=>items.filter(x=>x.id!==id));else if(kind==="video_comment")setVideoComments(items=>items.filter(x=>x.id!==id));else if(kind==="short_comment")setShortComments(items=>items.filter(x=>x.id!==id));else setComments(items=>items.filter(x=>x.id!==id));
   setNotice(status==="published"?t.approved:status==="rejected"?t.rejected:t.removed);
  } catch {
   setNotice(t.connection);
  } finally {setBusy(null);}
 }
 async function updateReport(id:string,status:"reviewing"|"resolved"|"dismissed"){
  if(!supabase||busy)return;
  if((status==="resolved"||status==="dismissed")&&!window.confirm(status==="resolved"?t.confirmResolved:t.confirmDismiss))return;
  setBusy(id);setNotice("");
  try {
   const result=await supabase.from("content_reports").update({status}).eq("id",id).select("id").maybeSingle();
   if(result.error||!result.data?.id){setNotice(t.reportError);return;}
   setReports(items=>items.map(x=>x.id===id?{...x,status}:x));setNotice(t.reportUpdated);
  } catch {
   setNotice(t.reportConnection);
  } finally {setBusy(null);}
 }
 const count=posts.length+comments.length+videoComments.length+shortComments.length+reports.filter(x=>x.status==="open").length;
 return <section className="nhen-mod-workspace" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <div className="nhen-mod-toolbar"><button type="button" disabled={!!busy} onClick={()=>{setNotice("");router.refresh();}}>{t.refresh}</button></div>
  <div className="dashboard-stats"><article><span>{t.posts}</span><strong>{posts.length}</strong><small>{t.member}</small></article><article><span>{t.comments}</span><strong>{comments.length+videoComments.length}</strong><small>{comments.length} {t.community} · {videoComments.length} {t.video}</small></article><article><span>{isArabic?"تعليقات المقاطع القصيرة":"SHORTS COMMENTS"}</span><strong>{shortComments.length}</strong><small>{isArabic?"بانتظار المراجعة":"Awaiting moderation"}</small></article><article><span>{t.reports}</span><strong>{reports.filter(x=>x.status==="open").length}</strong><small>{count} {t.total}</small></article></div>
  <div className="nhen-mod-tabs" role="tablist" aria-label={isArabic?"قوائم المراجعة":"Moderation queues"}>
   <button className={tab==="posts"?"active":""} onClick={()=>setTab("posts")}>{isArabic?"المنشورات":"Posts"} <b>{posts.length}</b></button>
   <button className={tab==="comments"?"active":""} onClick={()=>setTab("comments")}>{isArabic?"تعليقات المنشورات":"Post comments"} <b>{comments.length}</b></button>
   <button className={tab==="video_comments"?"active":""} onClick={()=>setTab("video_comments")}>{isArabic?"تعليقات الفيديو":"Video comments"} <b>{videoComments.length}</b></button>
   <button className={tab==="short_comments"?"active":""} onClick={()=>setTab("short_comments")}>{isArabic?"تعليقات المقاطع":"Shorts comments"} <b>{shortComments.length}</b></button>
   <button className={tab==="reports"?"active":""} onClick={()=>setTab("reports")}>{isArabic?"البلاغات":"Reports"} <b>{reports.filter(x=>x.status==="open").length}</b></button>
  </div>
  {notice&&<p role="status" className="nhen-mod-notice">{notice}</p>}
  {tab==="posts"&&<div className="nhen-mod-list">{posts.length?posts.map(item=><article className="nhen-mod-item" key={item.id}><div className="nhen-mod-meta"><strong>{item.author}</strong><span>@{item.handle}</span><span>{new Date(item.createdAt).toLocaleString()}</span><span className="nhen-pill">{t.post}</span></div><p>{item.body}</p><div className="nhen-mod-actions"><button disabled={!!busy} onClick={()=>void moderate("post",item.id,"published")}>{t.approve}</button><button disabled={!!busy} onClick={()=>void moderate("post",item.id,"rejected")}>{t.reject}</button><button disabled={!!busy} onClick={()=>void moderate("post",item.id,"removed")}>{t.remove}</button></div></article>):<div className="nhen-empty-state">{t.noPosts}</div>}</div>}
  {tab==="comments"&&<div className="nhen-mod-list">{comments.length?comments.map(item=><article className="nhen-mod-item" key={item.id}><div className="nhen-mod-meta"><strong>{item.author}</strong><span>@{item.handle}</span><span>{new Date(item.createdAt).toLocaleString()}</span><span className="nhen-pill">{t.comment}</span></div><p>{item.body}</p><div className="nhen-mod-actions"><button disabled={!!busy} onClick={()=>void moderate("comment",item.id,"published")}>{isArabic?"موافقة": "Approve"}</button><button disabled={!!busy} onClick={()=>void moderate("comment",item.id,"rejected")}>{t.reject}</button><button disabled={!!busy} onClick={()=>void moderate("comment",item.id,"removed")}>{t.remove}</button></div></article>):<div className="nhen-empty-state">{t.noComments}</div>}</div>}
  {tab==="video_comments"&&<div className="nhen-mod-list">{videoComments.length?videoComments.map(item=><article className="nhen-mod-item" key={item.id}><div className="nhen-mod-meta"><strong>{item.author}</strong><span>@{item.handle}</span><span>{new Date(item.createdAt).toLocaleString()}</span><span className="nhen-pill">{t.videoComment}</span></div><p>{item.body}</p><div className="nhen-mod-actions"><button disabled={!!busy} onClick={()=>void moderate("video_comment",item.id,"published")}>{t.approve}</button><button disabled={!!busy} onClick={()=>void moderate("video_comment",item.id,"rejected")}>Reject</button><button disabled={!!busy} onClick={()=>void moderate("video_comment",item.id,"removed")}>Remove</button></div></article>):<div className="nhen-empty-state">{t.noVideo}</div>}</div>}
  {tab==="short_comments"&&<div className="nhen-mod-list">{shortComments.length?shortComments.map(item=><article className="nhen-mod-item" key={item.id}><div className="nhen-mod-meta"><strong>{item.author}</strong><span>@{item.handle}</span><span>{new Date(item.createdAt).toLocaleString()}</span><span className="nhen-pill">{t.shortComment}</span></div><p>{item.body}</p><div className="nhen-mod-actions"><button disabled={!!busy} onClick={()=>void moderate("short_comment",item.id,"published")}>{t.approve}</button><button disabled={!!busy} onClick={()=>void moderate("short_comment",item.id,"rejected")}>{t.reject}</button><button disabled={!!busy} onClick={()=>void moderate("short_comment",item.id,"removed")}>{t.remove}</button></div></article>):<div className="nhen-empty-state">{t.noShortComments}</div>}</div>}
  {tab==="reports"&&<div className="nhen-mod-list">{reports.length?reports.map(item=><article className="nhen-mod-item" key={item.id}><div className="nhen-mod-meta"><strong>{item.targetType} report</strong><span>{item.reason}</span><span>{new Date(item.createdAt).toLocaleString()}</span><span className="nhen-pill">{isArabic?(item.status==="open"?"مفتوح":item.status==="reviewing"?t.reviewing:item.status==="resolved"?"تم الحل":"تم التجاهل"):item.status.toUpperCase()}</span></div><p>{item.details||"No additional details supplied."}</p><code>{item.targetId}</code><div className="nhen-mod-actions"><button disabled={!!busy} onClick={()=>void updateReport(item.id,"reviewing")}>{t.markReview}</button><button disabled={!!busy} onClick={()=>void updateReport(item.id,"resolved")}>{t.resolve}</button><button disabled={!!busy} onClick={()=>void updateReport(item.id,"dismissed")}>{t.dismiss}</button></div></article>):<div className="nhen-empty-state">{t.noReports}</div>}</div>}
 </section>;
}

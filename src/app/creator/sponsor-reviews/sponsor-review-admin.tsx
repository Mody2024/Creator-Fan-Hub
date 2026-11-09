"use client";
import {useCallback,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Campaign={id:string;creator_id:string;media_id:string;sponsor_name:string;disclosure_text:string;placement:string;status:string;approval_status:string;approval_requested_at:string|null;approval_note:string;created_at:string};
type Event={id:string;campaign_id:string;creator_id:string;actor_id:string;event_type:string;note:string;created_at:string};
export default function SponsorReviewAdmin({locale}:{locale:"en"|"ar"}){
 const ar=locale==="ar";
 const [rows,setRows]=useState<Campaign[]>([]);
 const [events,setEvents]=useState<Event[]>([]);
 const [notes,setNotes]=useState<Record<string,string>>({});
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState(ar?"جارٍ تحميل طلبات المراجعة…":"Loading sponsor review requests…");
 const load=useCallback(async()=>{
  const db=getSupabaseBrowserClient();if(!db){setStatus(ar?"إعدادات Supabase غير مكتملة.":"Supabase is not configured.");return}
  setBusy(true);
  try{
   const [campaigns,history]=await Promise.all([
    db.from("raye2_creator_sponsor_campaigns").select("id,creator_id,media_id,sponsor_name,disclosure_text,placement,status,approval_status,approval_requested_at,approval_note,created_at").eq("approval_status","pending").order("approval_requested_at",{ascending:true}),
    db.from("raye2_creator_sponsor_review_events").select("id,campaign_id,creator_id,actor_id,event_type,note,created_at").order("created_at",{ascending:false}).limit(100)
   ]);
   if(campaigns.error)throw campaigns.error;if(history.error)throw history.error;
   setRows((campaigns.data??[]) as Campaign[]);setEvents((history.data??[]) as Event[]);
   setStatus(ar?"تم تحميل قائمة المراجعة وسجل القرارات.":"Review queue and decision history loaded.");
  }catch(e){setStatus(e instanceof Error?e.message:(ar?"تعذر تحميل قائمة مراجعة الرعاية.":"Could not load sponsor review queue."));}
  finally{setBusy(false)}
 },[ar]);
 useEffect(()=>{void load()},[load]);
 async function decide(id:string,decision:"approved"|"rejected"){
  const db=getSupabaseBrowserClient();if(!db||busy)return;
  const note=(notes[id]??"").trim();
  if(decision==="rejected"&&note.length<3){setStatus(ar?"أضف سبباً واضحاً للرفض.":"Add a clear reason before rejecting.");return}
  if(!window.confirm(decision==="approved"?(ar?"هل توافق على مراجعة عقد الرعاية فقط؟ لن يتم تفعيل عرض الإعلانات.":"Approve this sponsor contract for review purposes only? Delivery stays disabled."):(ar?"هل ترفض مسودة الرعاية وتعيدها إلى المبدع؟":"Reject this sponsor draft and return it to the creator?")))return;
  setBusy(true);
  try{
   const {data,error}=await db.rpc("raye2_admin_review_creator_sponsor",{p_campaign_id:id,p_decision:decision,p_note:note});
   if(error)throw error;
   if(data?.approval_status!==decision||data?.delivery_enabled!==false)throw new Error((ar?"استجابة مراجعة غير متوقعة. يظل عرض الإعلانات معطلاً.":"Unexpected review response. Delivery remains disabled."));
   setStatus(decision==="approved"?(ar?"تمت الموافقة على مراجعة العقد. لم يتم تفعيل الإعلانات أو عرضها.":"Contract review approved. This does not activate or deliver ads."):(ar?"تم رفض الحملة مع حفظ ملاحظة المراجعة.":"Campaign rejected with an audit note."));
   await load();
  }catch(e){setStatus(e instanceof Error?e.message:(ar?"تعذر حفظ قرار المراجعة.":"Could not record review decision."));}
  finally{setBusy(false)}
 }
 const labels:Record<string,string>=ar?{review_requested:"طُلبت المراجعة",resubmitted:"أُعيد الإرسال",approved:"تمت الموافقة",rejected:"مرفوض"}:{review_requested:"Review requested",resubmitted:"Resubmitted",approved:"Approved",rejected:"Rejected"};
 return <section className="creator-editor" aria-busy={busy}>
  <div className="editor-topline"><span className="eyebrow">{ar?"RAYE2 / حوكمة الرعاية":"RAYE2 / SPONSOR GOVERNANCE"}</span><button className="editor-reload" type="button" disabled={busy} onClick={()=>void load()}>{ar?"تحديث ↻":"Refresh ↻"}</button></div>
  <div className="module-heading"><div><span className="eyebrow">{ar?"مراجعة المبدعين":"OWNER & ADMIN ONLY"}</span><h1>{ar?"مراجعة حملات الرعاية":"Sponsor campaign review"}</h1><p>{ar?"راجع الإفصاح والمحتوى ودوّن القرار. الموافقة لا تعني تفعيل الإعلانات أو عرضها.":"Review sponsor disclosure and contract setup. Approval is a content/contract decision only; it never activates ad delivery."}</p></div></div>
  <div className="dashboard-stats"><article><span>{ar?"طلبات قيد المراجعة":"Pending review"}</span><strong>{rows.length}</strong><small>{ar?"مسودات الحملات فقط":"Draft campaigns only"}</small></article><article><span>{ar?"حالة العرض":"Delivery state"}</span><strong>{ar?"معطّل":"Disabled"}</strong><small>{ar?"قرارات المراجعة لا تفعّل عرض الإعلانات":"All review decisions are non-delivery"}</small></article></div>
  <div className="creator-achievement-list">
   {rows.map(row=><article className="creator-achievement-row" key={row.id}>
    <div><strong>{row.sponsor_name}</strong><p>{row.placement} · {row.disclosure_text}</p><small>{ar?"المبدع: ":"Creator: "}{row.creator_id} · {ar?"المحتوى: ":"Media: "}{row.media_id}</small><small>{ar?"تاريخ الطلب: ":"Requested: "}{row.approval_requested_at?new Date(row.approval_requested_at).toLocaleString(ar?"ar-EG":"en-US"):"—"}</small><label>{ar?"ملاحظة المراجعة":"Review note"}<textarea value={notes[row.id]??""} maxLength={500} onChange={e=>setNotes(old=>({...old,[row.id]:e.target.value}))} placeholder={ar?"اشرح شروط الموافقة أو سبب الرفض":"Explain approval conditions or rejection reason"}/></label></div>
    <div className="nhen-inline-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={()=>void decide(row.id,"approved")}>{ar?"الموافقة على المراجعة":"Approve review"}</button><button className="button button-secondary" type="button" disabled={busy||(notes[row.id]??"").trim().length<3} onClick={()=>void decide(row.id,"rejected")}>{ar?"رفض":"Reject"}</button></div>
   </article>)}
   {!rows.length&&<p className="editor-status">{ar?"لا توجد حملات رعاية بانتظار المراجعة.":"No sponsor campaigns are awaiting review."}</p>}
  </div>
  <div className="nhen-card"><h2>{ar?"سجل القرارات":"Decision history"}</h2>{events.length?<div className="creator-achievement-list">{events.map(event=><article className="creator-achievement-row" key={event.id}><div><strong>{labels[event.event_type]??event.event_type}</strong><p>{ar?"الحملة ":"Campaign "}{event.campaign_id} · {ar?"المبدع ":"Creator "}{event.creator_id}</p><small>{event.note||(ar?"لا توجد ملاحظة":"No reviewer note")} · {new Date(event.created_at).toLocaleString(ar?"ar-EG":"en-US")}</small></div></article>)}</div>:<p className="editor-status">{ar?"لا يوجد سجل مراجعة بعد.":"No review history yet."}</p>}</div>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>;
}

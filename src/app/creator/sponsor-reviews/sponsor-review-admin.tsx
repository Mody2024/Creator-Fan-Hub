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
  const db=getSupabaseBrowserClient();if(!db){setStatus("Supabase is not configured.");return}
  setBusy(true);
  try{
   const [campaigns,history]=await Promise.all([
    db.from("raye2_creator_sponsor_campaigns").select("id,creator_id,media_id,sponsor_name,disclosure_text,placement,status,approval_status,approval_requested_at,approval_note,created_at").eq("approval_status","pending").order("approval_requested_at",{ascending:true}),
    db.from("raye2_creator_sponsor_review_events").select("id,campaign_id,creator_id,actor_id,event_type,note,created_at").order("created_at",{ascending:false}).limit(100)
   ]);
   if(campaigns.error)throw campaigns.error;if(history.error)throw history.error;
   setRows((campaigns.data??[]) as Campaign[]);setEvents((history.data??[]) as Event[]);
   setStatus(ar?"تم تحميل قائمة المراجعة وسجل القرارات.":"Review queue and decision history loaded.");
  }catch(e){setStatus(e instanceof Error?e.message:"Could not load sponsor review queue.");}
  finally{setBusy(false)}
 },[ar]);
 useEffect(()=>{void load()},[load]);
 async function decide(id:string,decision:"approved"|"rejected"){
  const db=getSupabaseBrowserClient();if(!db||busy)return;
  const note=(notes[id]??"").trim();
  if(decision==="rejected"&&note.length<3){setStatus(ar?"أضف سبباً واضحاً للرفض.":"Add a clear reason before rejecting.");return}
  if(!window.confirm(decision==="approved"?"Approve this sponsor contract for review purposes only? Delivery stays disabled.":"Reject this sponsor draft and return it to the creator?"))return;
  setBusy(true);
  try{
   const {data,error}=await db.rpc("raye2_admin_review_creator_sponsor",{p_campaign_id:id,p_decision:decision,p_note:note});
   if(error)throw error;
   if(data?.approval_status!==decision||data?.delivery_enabled!==false)throw new Error("Unexpected review response. Delivery remains disabled.");
   setStatus(decision==="approved"?"Contract review approved. This does not activate or deliver ads.":"Campaign rejected with an audit note.");
   await load();
  }catch(e){setStatus(e instanceof Error?e.message:"Could not record review decision.");}
  finally{setBusy(false)}
 }
 const labels:Record<string,string>={review_requested:"Review requested",resubmitted:"Resubmitted",approved:"Approved",rejected:"Rejected"};
 return <section className="creator-editor" aria-busy={busy}>
  <div className="editor-topline"><span className="eyebrow">RAYE2 / SPONSOR GOVERNANCE</span><button className="editor-reload" type="button" disabled={busy} onClick={()=>void load()}>Refresh ↻</button></div>
  <div className="module-heading"><div><span className="eyebrow">{ar?"مراجعة المبدعين":"OWNER & ADMIN ONLY"}</span><h1>{ar?"مراجعة حملات الرعاية":"Sponsor campaign review"}</h1><p>{ar?"راجع الإفصاح والمحتوى ودوّن القرار. الموافقة لا تعني تفعيل الإعلانات أو عرضها.":"Review sponsor disclosure and contract setup. Approval is a content/contract decision only; it never activates ad delivery."}</p></div></div>
  <div className="dashboard-stats"><article><span>Pending review</span><strong>{rows.length}</strong><small>Draft campaigns only</small></article><article><span>Delivery state</span><strong>Disabled</strong><small>All review decisions are non-delivery</small></article></div>
  <div className="creator-achievement-list">
   {rows.map(row=><article className="creator-achievement-row" key={row.id}>
    <div><strong>{row.sponsor_name}</strong><p>{row.placement} · {row.disclosure_text}</p><small>Creator: {row.creator_id} · Media: {row.media_id}</small><small>Requested: {row.approval_requested_at?new Date(row.approval_requested_at).toLocaleString():"—"}</small><label>Review note<textarea value={notes[row.id]??""} maxLength={500} onChange={e=>setNotes(old=>({...old,[row.id]:e.target.value}))} placeholder="Explain approval conditions or rejection reason"/></label></div>
    <div className="nhen-inline-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={()=>void decide(row.id,"approved")}>Approve review</button><button className="button button-secondary" type="button" disabled={busy||(notes[row.id]??"").trim().length<3} onClick={()=>void decide(row.id,"rejected")}>Reject</button></div>
   </article>)}
   {!rows.length&&<p className="editor-status">No sponsor campaigns are awaiting review.</p>}
  </div>
  <div className="nhen-card"><h2>Decision history</h2>{events.length?<div className="creator-achievement-list">{events.map(event=><article className="creator-achievement-row" key={event.id}><div><strong>{labels[event.event_type]??event.event_type}</strong><p>Campaign {event.campaign_id} · Creator {event.creator_id}</p><small>{event.note||"No reviewer note"} · {new Date(event.created_at).toLocaleString()}</small></div></article>)}</div>:<p className="editor-status">No review history yet.</p>}</div>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>;
}

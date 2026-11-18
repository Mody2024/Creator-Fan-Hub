"use client";
import {useEffect,useMemo,useState} from "react";
import Link from "next/link";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type EventRow={id:string;title:string;description:string;starts_at:string|null;ends_at:string|null;status:string;event_type:string;going_count:number;host_count:number;my_rsvp:boolean;my_rsvp_status:string|null;space_group_slug?:string|null};
type QaRow={id:string;body:string;created_at:string;author_handle:string|null;author_display_name:string|null;answer_body:string|null;answered_at:string|null;answered_by_display_name:string|null};

export default function PublicEvents({initialEvents,locale="en",heading=true}:{initialEvents:EventRow[];locale?:"en"|"ar";heading?:boolean}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);const isArabic=locale==="ar";
 const [events,setEvents]=useState<EventRow[]>(initialEvents);
 const [signedIn,setSignedIn]=useState(false);
 const [busy,setBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const [hosts,setHosts]=useState<Record<string,string[]>>({});
 const [qaOpen,setQaOpen]=useState<string|null>(null);
 const [qa,setQa]=useState<Record<string,QaRow[]>>({});
 const [qaDraft,setQaDraft]=useState("");
 const [qaBusy,setQaBusy]=useState(false);
 const t=isArabic?{eyebrow:"المجتمع / التقويم",title:"احفظ",titleEm:"التاريخ.",intro:"لحظات المجتمع التي ينشرها صانع المحتوى.",tba:"التاريخ سيُعلن قريبًا",completed:"مكتمل",going:"سأحضر",goingShort:"حاضر",interested:"مهتم",cancel:"إلغاء التسجيل",attendees:"حاضر",signIn:"سجّل الدخول لتأكيد حضورك.",error:"تعذر تحديث تسجيلك. حاول مرة أخرى.",done:"تم تأكيد حضورك.",removed:"تم إلغاء تسجيلك.",hostedBy:"بتنظيم",typeCommunity:"مجتمعية",typeOfficeHours:"ساعات مكتبية",typeQa:"أسئلة وأجوبة",typeCollab:"تعاون",typeWatchParty:"مشاهدة جماعية",typeOther:"فعالية",qa:"أسئلة وأجوبة",askPlaceholder:"اطرح سؤالًا…",ask:"اسأل",answer:"أجب",answerPlaceholder:"اكتب إجابة المنظّم…",send:"إرسال",noQuestions:"لا توجد أسئلة بعد. كن أول من يسأل.",signInQa:"سجّل الدخول لطرح سؤال.",qaError:"تعذر التحميل أو الإرسال. حاول مرة أخرى.",hostAnswer:"المنظّم",openSpace:"افتح مساحة الفعالية ↗"}:{eyebrow:"COMMUNITY / CALENDAR",title:"Save the",titleEm:"date.",intro:"Community moments, published by the creator.",tba:"DATE TO BE ANNOUNCED",completed:"COMPLETED",going:"I'm going",goingShort:"Going",interested:"Interested",cancel:"Cancel RSVP",attendees:"going",signIn:"Sign in to RSVP.",error:"Could not update your RSVP. Please try again.",done:"You're going.",removed:"Your RSVP was removed.",hostedBy:"Hosted by",typeCommunity:"Community",typeOfficeHours:"Office hours",typeQa:"Q&A",typeCollab:"Collaboration",typeWatchParty:"Watch party",typeOther:"Event",qa:"Q&A",askPlaceholder:"Ask a question…",ask:"Ask",answer:"Answer",answerPlaceholder:"Write the host answer…",send:"Send",noQuestions:"No questions yet. Ask the first one.",signInQa:"Sign in to ask a question.",qaError:"Could not load or send. Try again.",hostAnswer:"Host",openSpace:"Open event space ↗"};
 useEffect(()=>{if(!supabase)return;let alive=true;void (async()=>{const ids=(initialEvents??[]).filter(e=>e.host_count>0).map(e=>e.id);if(!ids.length)return;const entries=await Promise.all(ids.map(async id=>{const {data}=await supabase.rpc("raye2_get_event_hosts",{p_event_id:id});return [id,((data??[]) as {display_name:string|null;handle:string|null}[]).map(h=>h.display_name??h.handle??"")] as const;}));if(alive)setHosts(Object.fromEntries(entries));})();return()=>{alive=false};},[supabase,initialEvents]);
 useEffect(()=>{if(!supabase)return;let alive=true;void supabase.auth.getUser().then(({data}:{data:{user:{id:string}|null}})=>{if(alive)setSignedIn(!!data.user)});const {data:listener}=supabase.auth.onAuthStateChange((_e:string,session:{user:{id:string}}|null)=>{if(alive)setSignedIn(!!session?.user)});return()=>{alive=false;listener.subscription.unsubscribe()}},[supabase]);
 async function toggleRsvp(event:EventRow,status:"going"|"interested"){
  if(!supabase){setNotice(t.error);return}
  if(!signedIn){setNotice(t.signIn);return}
  if(busy)return;
  setBusy(event.id);setNotice("");
  const previous={going_count:event.going_count,my_rsvp:event.my_rsvp};
  const removing=event.my_rsvp;
  setEvents(list=>list.map(item=>item.id===event.id?{...item,my_rsvp:!removing,going_count:Math.max(0,item.going_count+(removing?-1:(status==="going"?1:0)))}:item));
  try{
   const {data,error}=removing
    ? await supabase.rpc("raye2_clear_event_rsvp",{p_event_id:event.id})
    : await supabase.rpc("raye2_set_event_rsvp",{p_event_id:event.id,p_status:status});
   if(error)throw error;
   const count=typeof data==="number"?data:previous.going_count;
   setEvents(list=>list.map(item=>item.id===event.id?{...item,going_count:count,my_rsvp:!removing}:item));
   setNotice(removing?t.removed:t.done);
  }catch{
   setEvents(list=>list.map(item=>item.id===event.id?{...item,...previous}:item));
   setNotice(t.error);
  }finally{setBusy(null)}
 }
 async function openQa(eventId:string){
  if(!supabase)return;
  setQaOpen(eventId);setQaDraft("");
  const {data,error}=await supabase.rpc("raye2_list_event_questions",{p_event_id:eventId,p_limit:50});
  if(error){setNotice(t.qaError);return}
  setQa(current=>({...current,[eventId]:(data??[]) as QaRow[]}));
 }
 async function askQuestion(eventId:string){
  if(!supabase||qaBusy)return;
  if(!signedIn){setNotice(t.signInQa);return}
  const body=qaDraft.trim();if(!body)return;
  setQaBusy(true);setNotice("");
  try{
   const {error}=await supabase.rpc("raye2_ask_event_question",{p_event_id:eventId,p_body:body});
   if(error)throw error;
   setQaDraft("");
   const {data}=await supabase.rpc("raye2_list_event_questions",{p_event_id:eventId,p_limit:50});
   setQa(current=>({...current,[eventId]:(data??[]) as QaRow[]}));
  }catch{setNotice(t.qaError)}finally{setQaBusy(false)}
 }
 if(!events.length)return null;
 return <section className="public-events" id="events" dir={isArabic?"rtl":"ltr"} lang={locale}>
  {heading&&<div className="public-feed-heading"><span className="eyebrow">{t.eyebrow}</span><h2>{t.title} <em>{t.titleEm}</em></h2><p>{t.intro}</p></div>}
  {notice&&<p className="public-events-notice" role="status" aria-live="polite">{notice}</p>}
  <div className="public-events-grid">{events.map(event=><article className="public-event" key={event.id}>
   <span className="event-type-badge">{({community:t.typeCommunity,office_hours:t.typeOfficeHours,qa:t.typeQa,collab:t.typeCollab,watch_party:t.typeWatchParty,other:t.typeOther} as Record<string,string>)[event.event_type]??t.typeOther}</span><span className="eyebrow">{event.starts_at?<time dateTime={event.starts_at}>{new Date(event.starts_at).toLocaleString(isArabic?"ar-EG":"en-US",{dateStyle:"medium",timeStyle:"short"})}</time>:t.tba}</span>
   <h3>{event.title}</h3>
   <p>{event.description}</p>
   {event.status==="completed"&&<span className="event-completed">{t.completed}</span>}{event.host_count>0&&<p className="event-hosted">{t.hostedBy} {(hosts[event.id]??[]).filter(Boolean).join(" · ")}</p>}
   <div className="public-event-rsvp">
    <span className="public-event-count"><strong>{event.going_count}</strong> {t.attendees}</span>
    {event.status!=="completed"&&<div className="public-event-actions">
     <button type="button" className={event.my_rsvp?"is-going":""} aria-pressed={event.my_rsvp} disabled={busy===event.id} onClick={()=>void toggleRsvp(event,"going")}>{event.my_rsvp?t.cancel:t.going}</button>
     {!event.my_rsvp&&<button type="button" className="is-interested" disabled={busy===event.id} onClick={()=>void toggleRsvp(event,"interested")}>{t.interested}</button>}
    </div>}
   </div>
   {event.space_group_slug&&<p className="event-space"><Link href={"/groups/"+event.space_group_slug}>{t.openSpace}</Link></p>}
   <div className="public-event-qa">
    <button type="button" className="event-qa-toggle" aria-expanded={qaOpen===event.id} onClick={()=>qaOpen===event.id?setQaOpen(null):void openQa(event.id)}>{t.qa}{qa[event.id]?.length?` · ${qa[event.id].length}`:""}</button>
    {qaOpen===event.id&&<div className="event-qa-body">
     {signedIn?<div className="event-qa-ask"><input value={qaDraft} onChange={e=>setQaDraft(e.target.value)} maxLength={1000} placeholder={t.askPlaceholder} aria-label={t.askPlaceholder}/><button type="button" disabled={qaBusy||!qaDraft.trim()} onClick={()=>void askQuestion(event.id)}>{t.ask}</button></div>:<p className="raye2-muted">{t.signInQa}</p>}
     {(qa[event.id]??[]).length?<ul className="event-qa-list">{(qa[event.id]??[]).map(q=><li key={q.id}><p className="event-qa-q"><strong>{q.author_display_name??q.author_handle??"Member"}</strong> {q.body}</p>{q.answer_body?<p className="event-qa-a"><span>{t.hostAnswer}</span> {q.answer_body}</p>:null}</li>)}</ul>:<p className="raye2-muted">{t.noQuestions}</p>}
    </div>}
   </div>
  </article>)}</div>
 </section>;
}

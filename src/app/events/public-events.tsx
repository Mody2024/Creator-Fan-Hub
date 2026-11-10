"use client";
import {useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type EventRow={id:string;title:string;description:string;starts_at:string|null;ends_at:string|null;status:string;going_count:number;my_rsvp:boolean};

export default function PublicEvents({initialEvents,locale="en",heading=true}:{initialEvents:EventRow[];locale?:"en"|"ar";heading?:boolean}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);const isArabic=locale==="ar";
 const [events,setEvents]=useState<EventRow[]>(initialEvents);
 const [signedIn,setSignedIn]=useState(false);
 const [busy,setBusy]=useState<string|null>(null);
 const [notice,setNotice]=useState("");
 const t=isArabic?{eyebrow:"المجتمع / التقويم",title:"احفظ",titleEm:"التاريخ.",intro:"لحظات المجتمع التي ينشرها صانع المحتوى.",tba:"التاريخ سيُعلن قريبًا",completed:"مكتمل",going:"سأحضر",goingShort:"حاضر",interested:"مهتم",cancel:"إلغاء التسجيل",attendees:"حاضر",signIn:"سجّل الدخول لتأكيد حضورك.",error:"تعذر تحديث تسجيلك. حاول مرة أخرى.",done:"تم تأكيد حضورك.",removed:"تم إلغاء تسجيلك."}:{eyebrow:"COMMUNITY / CALENDAR",title:"Save the",titleEm:"date.",intro:"Community moments, published by the creator.",tba:"DATE TO BE ANNOUNCED",completed:"COMPLETED",going:"I'm going",goingShort:"Going",interested:"Interested",cancel:"Cancel RSVP",attendees:"going",signIn:"Sign in to RSVP.",error:"Could not update your RSVP. Please try again.",done:"You're going.",removed:"Your RSVP was removed."};
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
 if(!events.length)return null;
 return <section className="public-events" id="events" dir={isArabic?"rtl":"ltr"} lang={locale}>
  {heading&&<div className="public-feed-heading"><span className="eyebrow">{t.eyebrow}</span><h2>{t.title} <em>{t.titleEm}</em></h2><p>{t.intro}</p></div>}
  {notice&&<p className="public-events-notice" role="status" aria-live="polite">{notice}</p>}
  <div className="public-events-grid">{events.map(event=><article className="public-event" key={event.id}>
   <span className="eyebrow">{event.starts_at?<time dateTime={event.starts_at}>{new Date(event.starts_at).toLocaleString(isArabic?"ar-EG":"en-US",{dateStyle:"medium",timeStyle:"short"})}</time>:t.tba}</span>
   <h3>{event.title}</h3>
   <p>{event.description}</p>
   {event.status==="completed"&&<span className="event-completed">{t.completed}</span>}
   <div className="public-event-rsvp">
    <span className="public-event-count"><strong>{event.going_count}</strong> {t.attendees}</span>
    {event.status!=="completed"&&<div className="public-event-actions">
     <button type="button" className={event.my_rsvp?"is-going":""} aria-pressed={event.my_rsvp} disabled={busy===event.id} onClick={()=>void toggleRsvp(event,"going")}>{event.my_rsvp?t.cancel:t.going}</button>
     {!event.my_rsvp&&<button type="button" className="is-interested" disabled={busy===event.id} onClick={()=>void toggleRsvp(event,"interested")}>{t.interested}</button>}
    </div>}
   </div>
  </article>)}</div>
 </section>;
}

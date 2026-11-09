"use client";
import {useCallback,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type CreatorNotification={id:string;campaign_id:string;notification_type:string;title:string;body:string;created_at:string;read_at:string|null};
export default function CreatorNotifications({locale}:{locale:"en"|"ar"}){
 const ar=locale==="ar";
 const [items,setItems]=useState<CreatorNotification[]>([]);
 const [status,setStatus]=useState(ar?"جارٍ تحميل الإشعارات…":"Loading creator notifications…");
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  const db=getSupabaseBrowserClient();
  if(!db){setStatus(ar?"خدمة الإشعارات غير متاحة.":"Notifications are unavailable.");return}
  setBusy(true);
  try{
   const {data,error}=await db.from("raye2_creator_notifications").select("id,campaign_id,notification_type,title,body,created_at,read_at").order("created_at",{ascending:false}).limit(30);
   if(error)throw error;
   setItems((data??[]) as CreatorNotification[]);
   setStatus(ar?"تم تحديث الإشعارات.":"Notifications updated.");
  }catch(e){setStatus(e instanceof Error?e.message:(ar?"تعذر تحميل الإشعارات.":"Could not load notifications."));}
  finally{setBusy(false)}
 },[ar]);
 useEffect(()=>{void load()},[load]);
 async function markRead(id:string){
  const db=getSupabaseBrowserClient();if(!db||busy)return;
  setBusy(true);
  try{
   const {data,error}=await db.rpc("raye2_mark_creator_notification_read",{p_notification_id:id});
   if(error)throw error;
   if(data!==true)throw new Error(ar?"لم يتم العثور على الإشعار.":"Notification was not found.");
   setItems(old=>old.map(item=>item.id===id?{...item,read_at:item.read_at??new Date().toISOString()}:item));
   setStatus(ar?"تم وضع الإشعار كمقروء.":"Notification marked as read.");
  }catch(e){setStatus(e instanceof Error?e.message:(ar?"تعذر تحديث الإشعار.":"Could not update notification."));}
  finally{setBusy(false)}
 }
 const unread=items.filter(item=>!item.read_at).length;
 return <section className="nhen-card nhen-card-pad" aria-busy={busy} aria-label={ar?"إشعارات المبدع":"Creator notifications"}>
  <div className="editor-topline"><span className="eyebrow">{ar?"مركز المبدع / الإشعارات":"CREATOR CENTER / NOTIFICATIONS"}</span><button className="editor-reload" type="button" disabled={busy} onClick={()=>void load()}>{ar?"تحديث ↻":"Refresh ↻"}</button></div>
  <div className="module-heading"><div><h2>{ar?"الإشعارات":"Notifications"}{unread>0?" ("+unread+")":""}</h2><p>{ar?"تابع قرارات مراجعة حملات الرعاية والتنبيهات المرتبطة بها.":"Follow sponsorship review decisions and related creator updates."}</p></div></div>
  <div className="creator-achievement-list">
   {items.map(item=><article className="creator-achievement-row" key={item.id}>
    <div><strong>{item.title}</strong><p>{item.body}</p><small>{new Date(item.created_at).toLocaleString(ar?"ar-EG":"en-US")} · {item.read_at?(ar?"مقروء":"Read"):(ar?"جديد":"New")}</small><small>{ar?"معرّف الحملة: ":"Campaign: "}{item.campaign_id}</small></div>
    {!item.read_at&&<button className="button button-secondary" type="button" disabled={busy} onClick={()=>void markRead(item.id)}>{ar?"تحديد كمقروء":"Mark as read"}</button>}
   </article>)}
   {!items.length&&<p className="editor-status">{ar?"لا توجد إشعارات حتى الآن.":"No notifications yet."}</p>}
  </div>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>;
}

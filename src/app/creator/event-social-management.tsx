"use client";
import {FormEvent,useCallback,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

function toLocalDateTimeInput(value:string|null){if(!value)return "";const date=new Date(value);if(Number.isNaN(date.getTime()))return "";const local=new Date(date.getTime()-date.getTimezoneOffset()*60000);return local.toISOString().slice(0,16);}
type EventRow={event_id:string;title:string;description:string;starts_at:string|null;ends_at:string|null;status:string;created_at:string};
type LinkRow={link_id:string;label:string;url:string;platform:string;link_position:number;is_published:boolean};
export default function EventSocialManagement(){
 const [events,setEvents]=useState<EventRow[]>([]),[links,setLinks]=useState<LinkRow[]>([]);
 const [title,setTitle]=useState(""),[description,setDescription]=useState(""),[starts,setStarts]=useState(""),[ends,setEnds]=useState(""),[editingEventId,setEditingEventId]=useState("");
 const [label,setLabel]=useState(""),[url,setUrl]=useState(""),[platform,setPlatform]=useState("youtube"),[editingLinkId,setEditingLinkId]=useState(""),[busy,setBusy]=useState(true),[working,setWorking]=useState(""),[status,setStatus]=useState("Loading…");
 const [locale,setLocale]=useState<"en"|"ar">("en");const isArabic=locale==="ar";
 const t=isArabic?{
  loading:"جارٍ التحميل…",notConfigured:"Supabase غير مُعد.",loadError:"تعذر تحميل الفعاليات والروابط. تحقق من صلاحية حساب المبدع.",refreshed:"تم تحديث المحتوى.",connection:"فشل الاتصال أثناء تحميل الفعاليات والروابط. حدّث الصفحة للمحاولة مجددًا.",dateError:"يجب أن يكون موعد انتهاء الفعالية بعد موعد بدايتها.",eventSave:"تعذر حفظ الفعالية. تحقق من الحقول والتواريخ.",eventUpdated:"تم تحديث الفعالية مع الحفاظ على حالة النشر.",eventDraft:"تم حفظ الفعالية كمسودة.",eventConnection:"فشل الاتصال أثناء حفظ الفعالية. حدّث الصفحة للتحقق من حالتها.",event:"فعالية",couldNotEvent:"تعذر تحديث الفعالية.",eventStatus:"حالة الفعالية:",eventUpdateConnection:"فشل الاتصال أثناء تحديث الفعالية. حدّث الصفحة للتحقق من حالتها.",linkSave:"تعذر حفظ الرابط. أدخل عنوان URL صالحًا يبدأ بـ http أو https.",linkUpdated:"تم تحديث الرابط الاجتماعي.",linkPrivate:"تم حفظ الرابط بشكل خاص. يمكنك نشره بالأسفل.",linkConnection:"فشل الاتصال أثناء حفظ الرابط الاجتماعي. حدّث الصفحة للتحقق من حالته.",deleteConfirm:"هل تريد إزالة هذا الرابط نهائيًا من موقع المبدع؟",linkGone:"هذا الرابط لم يعد موجودًا. حدّث القائمة.",deleteFailed:"تعذر حذف هذا الرابط.",linkDeleted:"تم حذف الرابط الاجتماعي نهائيًا.",deleteConnection:"فشل الاتصال أثناء حذف الرابط. حدّث الصفحة للتحقق من حالته.",stale:"تغيرت قائمة الروابط في مكان آخر. حدّثها قبل إعادة الترتيب.",reorderFailed:"تعذر حفظ ترتيب الروابط الجديد.",orderSaved:"تم حفظ ترتيب الروابط الاجتماعية.",linkEdit:"جارٍ تعديل الرابط",saveUpdate:"احفظ لتطبيق التحديث.",linkPublishError:"تعذر تحديث الرابط.",unpublished:"تم إلغاء نشر الرابط.",published:"تم نشر الرابط.",toggleConnection:"فشل الاتصال أثناء تحديث الرابط الاجتماعي. حدّث الصفحة للتحقق من حالته.",content:"المحتوى / الفعاليات والروابط",heading:"اجمع الناس ",emphasis:"معًا.",intro:"أدر فعاليات المجتمع والروابط الخارجية. تظل المسودات خاصة.",refresh:"تحديث ↻",editEvent:"تعديل الفعالية",createEvent:"إنشاء فعالية",title:"العنوان",description:"الوصف",starts:"تبدأ في",ends:"تنتهي في",updateEvent:"تحديث الفعالية ↗",saveEvent:"حفظ مسودة الفعالية ↗",cancelEdit:"إلغاء التعديل",events:"الفعاليات",noEvents:"لا توجد فعاليات بعد.",noEventsNote:"أنشئ مسودة فعالية بالأعلى، ثم انشرها عندما تريد ظهورها للزوار.",edit:"تعديل",publish:"نشر",unpublish:"إلغاء النشر",cancel:"إلغاء",complete:"تحديد كمكتملة",editLink:"تعديل الرابط الاجتماعي",addLink:"إضافة رابط اجتماعي",label:"الاسم الظاهر",url:"الرابط",platform:"المنصة",labelPlaceholder:"شاهد على يوتيوب",urlPlaceholder:"https://…",updateLink:"تحديث الرابط ↗",saveLink:"حفظ الرابط ↗",links:"الروابط الاجتماعية",noLinks:"لا توجد روابط اجتماعية بعد.",noLinksNote:"أضف قناة بالأعلى، ثم انشرها لإظهارها على الموقع العام.",draft:"مسودة",moveUp:"تحريك لأعلى ↑",moveDown:"تحريك لأسفل ↓",publishLink:"نشر الرابط",delete:"حذف",cancelled:"تم إلغاء تعديل الفعالية.",linkCancelled:"تم إلغاء تعديل الرابط.",editingEvent:"جارٍ تعديل الفعالية:",editingLink:"جارٍ تعديل الرابط:",privatePreserved:"حالة النشر محفوظة."
 }:{
  loading:"Loading…",notConfigured:"Supabase is not configured.",loadError:"Could not load events and links. Check creator access.",refreshed:"Content refreshed.",connection:"Connection failed while loading events and links. Refresh to retry.",dateError:"The event end must be later than its start.",eventSave:"Event save failed. Check fields and dates.",eventUpdated:"Event updated; its publication status was preserved.",eventDraft:"Event saved as a draft.",eventConnection:"Connection failed while saving the event. Refresh to confirm its current state.",event:"Event",couldNotEvent:"Could not update event.",eventStatus:"Event ",eventUpdateConnection:"Connection failed while updating the event. Refresh to confirm its status.",linkSave:"Link save failed. Enter a valid http(s) URL.",linkUpdated:"Social link updated.",linkPrivate:"Link saved privately. Publish it below.",linkConnection:"Connection failed while saving the social link. Refresh to confirm its current state.",deleteConfirm:"Permanently remove this link from the creator site?",linkGone:"That link no longer exists. Refresh the list.",deleteFailed:"Could not delete this link.",linkDeleted:"Social link permanently removed.",deleteConnection:"Connection failed while deleting the link. Refresh to confirm its current state.",stale:"The link list changed elsewhere. Refresh before reordering.",reorderFailed:"Could not save the new link order.",orderSaved:"Social link order saved.",linkEdit:"Editing ",saveUpdate:"Save to apply the update.",linkPublishError:"Could not update link.",unpublished:"Link unpublished.",published:"Link published.",toggleConnection:"Connection failed while updating the social link. Refresh to confirm its status.",content:"CONTENT / EVENTS & SOCIALS",heading:"Bring people ",emphasis:"together.",intro:"Manage community events and external links. Draft content remains private.",refresh:"Refresh ↻",editEvent:"Edit event",createEvent:"Create event",title:"Title",description:"Description",starts:"Starts at",ends:"Ends at",updateEvent:"Update event ↗",saveEvent:"Save event draft ↗",cancelEdit:"Cancel edit",events:"Events",noEvents:"No events yet.",noEventsNote:"Create an event draft above; publish it when you are ready for visitors to see it.",edit:"Edit",publish:"Publish",unpublish:"Unpublish",cancel:"Cancel",complete:"Mark completed",editLink:"Edit social link",addLink:"Add social link",label:"Label",url:"URL",platform:"Platform",labelPlaceholder:"Watch on YouTube",urlPlaceholder:"https://…",updateLink:"Update link ↗",saveLink:"Save link ↗",links:"Social links",noLinks:"No social links yet.",noLinksNote:"Add a channel above, then publish it to show it on the public site.",draft:"DRAFT",moveUp:"Move up ↑",moveDown:"Move down ↓",publishLink:"Publish link",delete:"Delete",cancelled:"Event edit cancelled.",linkCancelled:"Link edit cancelled.",editingEvent:"Editing ",editingLink:"Editing "
 };
 useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);
 const load=useCallback(async()=>{
  const s=getSupabaseBrowserClient();
  if(!s){setStatus(t.notConfigured);setBusy(false);return;}
  setBusy(true);
  try {
   const [e,l]=await Promise.all([s.rpc("get_creator_events",{p_limit:50}),s.rpc("get_creator_social_links",{p_limit:200})]);
   if(e.error||l.error){setStatus(t.loadError);return;}
   setEvents((e.data??[]) as EventRow[]);setLinks((l.data??[]) as LinkRow[]);setStatus(t.refreshed);
  } catch { setStatus(t.connection); }
  finally { setBusy(false); }
 },[]);
 useEffect(()=>{void load();},[load]);
 async function createEvent(ev:FormEvent<HTMLFormElement>){
  ev.preventDefault();
  if(starts&&ends&&new Date(ends)<=new Date(starts)){setStatus(t.dateError);return;}
  const s=getSupabaseBrowserClient();if(!s||working)return;
  const wasEditing=Boolean(editingEventId);setWorking("event");
  try {
   const {data,error}=await s.rpc("save_creator_event",{p_event_id:editingEventId||null,p_title:title.trim(),p_description:description.trim(),p_starts_at:starts?new Date(starts).toISOString():null,p_ends_at:ends?new Date(ends).toISOString():null});
   const r=Array.isArray(data)?data[0] as {saved:boolean}|undefined:undefined;
   if(error||!r?.saved){setStatus(t.eventSave);return;}
   setTitle("");setDescription("");setStarts("");setEnds("");setEditingEventId("");setStatus(wasEditing?t.eventUpdated:t.eventDraft);
   setBusy(true);await load();
  } catch { setStatus(t.eventConnection); }
  finally { setWorking(""); }
 }
 async function eventStatus(id:string,next:"published"|"draft"|"cancelled"|"completed"){
  const s=getSupabaseBrowserClient();if(!s||working)return;setWorking(id);
  try {
   const {data,error}=await s.rpc("set_creator_event_status",{p_event_id:id,p_status:next});
   const r=Array.isArray(data)?data[0] as {updated:boolean}|undefined:undefined;
   if(error||!r?.updated){setStatus(t.couldNotEvent);return;}
   setEvents(old=>old.map(e=>e.event_id===id?{...e,status:next}:e));setStatus(t.eventStatus+(isArabic?({published:"تم النشر",draft:"مسودة",cancelled:"تم الإلغاء",completed:"مكتملة"} as Record<string,string>)[next]:next)+".");
  } catch { setStatus(t.eventUpdateConnection); }
  finally { setWorking(""); }
 }
 async function createLink(ev:FormEvent<HTMLFormElement>){
  ev.preventDefault();const s=getSupabaseBrowserClient();if(!s||working)return;
  const wasEditing=Boolean(editingLinkId),existing=links.find(link=>link.link_id===editingLinkId);
  setWorking("link");
  try {
   const {data,error}=await s.rpc("save_creator_social_link",{p_link_id:editingLinkId||null,p_label:label.trim(),p_url:url.trim(),p_platform:platform,p_position:existing?.link_position??links.length,p_is_published:existing?.is_published??false});
   const r=Array.isArray(data)?data[0] as {saved:boolean}|undefined:undefined;
   if(error||!r?.saved){setStatus(t.linkSave);return;}
   setLabel("");setUrl("");setEditingLinkId("");setStatus(wasEditing?t.linkUpdated:t.linkPrivate);
   setBusy(true);await load();
  } catch { setStatus(t.linkConnection); }
  finally { setWorking(""); }
 }
 async function deleteLink(link:LinkRow){
  const s=getSupabaseBrowserClient();
  if(!s||working)return;
  if(!window.confirm(t.deleteConfirm))return;
  setWorking(link.link_id);
  try {
   const {data,error}=await s.rpc("delete_creator_social_link",{p_link_id:link.link_id});
   const result=Array.isArray(data)?data[0] as {deleted:boolean;result_code:string}|undefined:undefined;
   if(error||!result?.deleted){setStatus(result?.result_code==="not_found"?"That link no longer exists. Refresh the list.":"Could not delete this link.");return;}
   setLinks(old=>old.filter(item=>item.link_id!==link.link_id));
   if(editingLinkId===link.link_id){setEditingLinkId("");setLabel("");setUrl("");setPlatform("youtube");}
   setStatus(t.linkDeleted);
  } catch {setStatus(t.deleteConnection);}
  finally {setWorking("");}
 }
 async function moveLink(link:LinkRow,direction:-1|1){
  if(working)return;
  const index=links.findIndex(item=>item.link_id===link.link_id);
  const target=index+direction;
  if(index<0||target<0||target>=links.length)return;
  const next=[...links];
  [next[index],next[target]]=[next[target],next[index]];
  setWorking("reorder");
  try {
   const s=getSupabaseBrowserClient();
   if(!s)throw new Error("Supabase is not configured.");
   const {data,error}=await s.rpc("reorder_creator_social_links",{p_link_ids:next.map(item=>item.link_id)});
   const result=Array.isArray(data)?data[0] as {reordered:boolean;result_code:string}|undefined:undefined;
   if(error||!result?.reordered)throw new Error(result?.result_code==="stale_order"?"The link list changed elsewhere. Refresh before reordering.":"Could not save the new link order.");
   setLinks(next.map((item,position)=>({...item,link_position:position})));
   setStatus(t.orderSaved);
  } catch(e) {setStatus(e instanceof Error?e.message:"Could not reorder social links.");}
  finally {setWorking("");}
 }
 async function toggleLink(l:LinkRow){
  const s=getSupabaseBrowserClient();if(!s||working)return;setWorking(l.link_id);
  try {
   const {data,error}=await s.rpc("save_creator_social_link",{p_link_id:l.link_id,p_label:l.label,p_url:l.url,p_platform:l.platform,p_position:l.link_position,p_is_published:!l.is_published});
   const r=Array.isArray(data)?data[0] as {saved:boolean}|undefined:undefined;
   if(error||!r?.saved){setStatus(t.linkPublishError);return;}
   setLinks(old=>old.map(x=>x.link_id===l.link_id?{...x,is_published:!x.is_published}:x));setStatus(l.is_published?t.unpublished:t.published);
  } catch { setStatus(t.toggleConnection); }
  finally { setWorking(""); }
 }
 return <section id="creator-events-socials" className="moderation-panel content-manager" dir={isArabic?"rtl":"ltr"} lang={locale}><div className="moderation-heading"><div><span className="eyebrow">{t.content}</span><h2>{t.heading}<em>{t.emphasis}</em></h2><p>{t.intro}</p></div><button className="editor-reload" disabled={busy||!!working} onClick={()=>{setBusy(true);void load();}}>{t.refresh}</button></div>
 <div className="content-manager-grid"><div><h3>{editingEventId?t.editEvent:t.createEvent}</h3><form className="poll-create-form" onSubmit={createEvent}><label>{t.title}<input required minLength={3} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>{t.description}<textarea rows={3} maxLength={1200} value={description} onChange={e=>setDescription(e.target.value)}/></label><label>{t.starts}<input type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)}/></label><label>{t.ends}<input type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)}/></label><div className="moderation-actions"><button className="button button-primary" disabled={!!working}>{editingEventId?t.updateEvent:t.saveEvent}</button>{editingEventId&&<button type="button" disabled={!!working} onClick={()=>{setEditingEventId("");setTitle("");setDescription("");setStarts("");setEnds("");setStatus("Event edit cancelled.");}}>{t.cancelEdit}</button>}</div></form><h3>{t.events}</h3>{busy?<p className="editor-status" role="status" aria-live="polite">{status}</p>:events.length===0?<div className="moderation-empty" role="status"><h3>{t.noEvents}</h3><p>{t.noEventsNote}</p></div>:events.map(e=><article className="moderation-item" key={e.event_id}><span className="idea-status">{e.status.toUpperCase()}</span><h3>{e.title}</h3><p className="moderation-body">{e.description}</p><div className="moderation-actions"><button disabled={!!working} onClick={()=>{setEditingEventId(e.event_id);setTitle(e.title);setDescription(e.description??"");setStarts(toLocalDateTimeInput(e.starts_at));setEnds(toLocalDateTimeInput(e.ends_at));setStatus("Editing "+e.title+".");}}>{t.edit}</button>{e.status!=="published"&&<button disabled={!!working} onClick={()=>void eventStatus(e.event_id,"published")}>{t.publish}</button>}{e.status!=="draft"&&<button disabled={!!working} onClick={()=>void eventStatus(e.event_id,"draft")}>{t.unpublish}</button>}{e.status!=="cancelled"&&<button disabled={!!working} onClick={()=>void eventStatus(e.event_id,"cancelled")}>{t.cancel}</button>}{e.status==="published"&&<button disabled={!!working} onClick={()=>void eventStatus(e.event_id,"completed")}>{t.complete}</button>}</div></article>)}</div>
 <div><h3>{editingLinkId?t.editLink:t.addLink}</h3><form className="poll-create-form" onSubmit={createLink}><label>{t.label}<input required maxLength={80} value={label} onChange={e=>setLabel(e.target.value)} placeholder={t.labelPlaceholder}/></label><label>{t.url}<input required type="url" maxLength={2048} value={url} onChange={e=>setUrl(e.target.value)} placeholder={t.urlPlaceholder}/></label><label>{t.platform}<select value={platform} onChange={e=>setPlatform(e.target.value)}>{["youtube","kick","tiktok","instagram","facebook","twitch","discord","x","custom","other"].map(x=><option key={x} value={x}>{x.toUpperCase()}</option>)}</select></label><div className="moderation-actions"><button className="button button-primary" disabled={!!working}>{editingLinkId?t.updateLink:t.saveLink}</button>{editingLinkId&&<button type="button" disabled={!!working} onClick={()=>{setEditingLinkId("");setLabel("");setUrl("");setPlatform("youtube");setStatus("Link edit cancelled.");}}>Cancel edit</button>}</div></form><h3>{t.links}</h3>{busy?<p className="editor-status" role="status" aria-live="polite">{status}</p>:links.length===0?<div className="moderation-empty" role="status"><h3>{t.noLinks}</h3><p>{t.noLinksNote}</p></div>:links.map(l=><article className="moderation-item" key={l.link_id}><span className={"idea-status "+(l.is_published?"idea-status-approved":"idea-status-pending")}>{l.is_published?(isArabic?"منشور":t.publish):t.draft}</span><h3>{l.label}</h3><p className="moderation-body">{l.url}</p><div className="moderation-actions"><button type="button" disabled={!!working||links[0]?.link_id===l.link_id} onClick={()=>void moveLink(l,-1)} aria-label={`Move ${l.label} up`}>{t.moveUp}</button><button type="button" disabled={!!working||links[links.length-1]?.link_id===l.link_id} onClick={()=>void moveLink(l,1)} aria-label={`Move ${l.label} down`}>{t.moveDown}</button><button type="button" disabled={!!working} onClick={()=>{setEditingLinkId(l.link_id);setLabel(l.label);setUrl(l.url);setPlatform(l.platform);setStatus("Editing "+l.label+". Save to apply the update.");}}>Edit</button><button type="button" disabled={!!working} onClick={()=>void toggleLink(l)}>{l.is_published?"Unpublish":"Publish link"}</button><button type="button" className="button-secondary" disabled={!!working} onClick={()=>void deleteLink(l)}>{t.delete}</button></div></article>)}</div></div><p className="editor-status" role="status" aria-live="polite">{status}</p></section>;
}
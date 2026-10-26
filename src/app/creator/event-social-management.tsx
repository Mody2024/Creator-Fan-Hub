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
 const load=useCallback(async()=>{
  const s=getSupabaseBrowserClient();
  if(!s){setStatus("Supabase is not configured.");setBusy(false);return;}
  setBusy(true);
  try {
   const [e,l]=await Promise.all([s.rpc("get_creator_events",{p_limit:50}),s.rpc("get_creator_social_links",{p_limit:100})]);
   if(e.error||l.error){setStatus("Could not load events and links. Check creator access.");return;}
   setEvents((e.data??[]) as EventRow[]);setLinks((l.data??[]) as LinkRow[]);setStatus("Content refreshed.");
  } catch { setStatus("Connection failed while loading events and links. Refresh to retry."); }
  finally { setBusy(false); }
 },[]);
 useEffect(()=>{void load();},[load]);
 async function createEvent(ev:FormEvent<HTMLFormElement>){
  ev.preventDefault();
  if(starts&&ends&&new Date(ends)<=new Date(starts)){setStatus("The event end must be later than its start.");return;}
  const s=getSupabaseBrowserClient();if(!s||working)return;
  const wasEditing=Boolean(editingEventId);setWorking("event");
  try {
   const {data,error}=await s.rpc("save_creator_event",{p_event_id:editingEventId||null,p_title:title.trim(),p_description:description.trim(),p_starts_at:starts?new Date(starts).toISOString():null,p_ends_at:ends?new Date(ends).toISOString():null});
   const r=Array.isArray(data)?data[0] as {saved:boolean}|undefined:undefined;
   if(error||!r?.saved){setStatus("Event save failed. Check fields and dates.");return;}
   setTitle("");setDescription("");setStarts("");setEnds("");setEditingEventId("");setStatus(wasEditing?"Event updated; its publication status was preserved.":"Event saved as a draft.");
   setBusy(true);await load();
  } catch { setStatus("Connection failed while saving the event. Refresh to confirm its current state."); }
  finally { setWorking(""); }
 }
 async function eventStatus(id:string,next:"published"|"draft"|"cancelled"){
  const s=getSupabaseBrowserClient();if(!s||working)return;setWorking(id);
  try {
   const {data,error}=await s.rpc("set_creator_event_status",{p_event_id:id,p_status:next});
   const r=Array.isArray(data)?data[0] as {updated:boolean}|undefined:undefined;
   if(error||!r?.updated){setStatus("Could not update event.");return;}
   setEvents(old=>old.map(e=>e.event_id===id?{...e,status:next}:e));setStatus("Event "+next+".");
  } catch { setStatus("Connection failed while updating the event. Refresh to confirm its status."); }
  finally { setWorking(""); }
 }
 async function createLink(ev:FormEvent<HTMLFormElement>){
  ev.preventDefault();const s=getSupabaseBrowserClient();if(!s||working)return;
  const wasEditing=Boolean(editingLinkId),existing=links.find(link=>link.link_id===editingLinkId);
  setWorking("link");
  try {
   const {data,error}=await s.rpc("save_creator_social_link",{p_link_id:editingLinkId||null,p_label:label.trim(),p_url:url.trim(),p_platform:platform,p_position:existing?.link_position??links.length,p_is_published:existing?.is_published??false});
   const r=Array.isArray(data)?data[0] as {saved:boolean}|undefined:undefined;
   if(error||!r?.saved){setStatus("Link save failed. Enter a valid http(s) URL.");return;}
   setLabel("");setUrl("");setEditingLinkId("");setStatus(wasEditing?"Social link updated.":"Link saved privately. Publish it below.");
   setBusy(true);await load();
  } catch { setStatus("Connection failed while saving the social link. Refresh to confirm its current state."); }
  finally { setWorking(""); }
 }
 async function toggleLink(l:LinkRow){
  const s=getSupabaseBrowserClient();if(!s||working)return;setWorking(l.link_id);
  try {
   const {data,error}=await s.rpc("save_creator_social_link",{p_link_id:l.link_id,p_label:l.label,p_url:l.url,p_platform:l.platform,p_position:l.link_position,p_is_published:!l.is_published});
   const r=Array.isArray(data)?data[0] as {saved:boolean}|undefined:undefined;
   if(error||!r?.saved){setStatus("Could not update link.");return;}
   setLinks(old=>old.map(x=>x.link_id===l.link_id?{...x,is_published:!x.is_published}:x));setStatus(l.is_published?"Link unpublished.":"Link published.");
  } catch { setStatus("Connection failed while updating the social link. Refresh to confirm its status."); }
  finally { setWorking(""); }
 }
 return <section className="moderation-panel content-manager"><div className="moderation-heading"><div><span className="eyebrow">CONTENT / EVENTS & SOCIALS</span><h2>Bring people <em>together.</em></h2><p>Manage community events and external links. Draft content remains private.</p></div><button className="editor-reload" disabled={busy||!!working} onClick={()=>{setBusy(true);void load();}}>Refresh ↻</button></div>
 <div className="content-manager-grid"><div><h3>{editingEventId?"Edit event":"Create event"}</h3><form className="poll-create-form" onSubmit={createEvent}><label>Title<input required minLength={3} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)}/></label><label>Description<textarea rows={3} maxLength={1200} value={description} onChange={e=>setDescription(e.target.value)}/></label><label>Starts at<input type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)}/></label><label>Ends at<input type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)}/></label><div className="moderation-actions"><button className="button button-primary" disabled={!!working}>{editingEventId?"Update event ↗":"Save event draft ↗"}</button>{editingEventId&&<button type="button" disabled={!!working} onClick={()=>{setEditingEventId("");setTitle("");setDescription("");setStarts("");setEnds("");setStatus("Event edit cancelled.");}}>Cancel edit</button>}</div></form><h3>Events</h3>{busy?<p className="editor-status">{status}</p>:events.map(e=><article className="moderation-item" key={e.event_id}><span className="idea-status">{e.status.toUpperCase()}</span><h3>{e.title}</h3><p className="moderation-body">{e.description}</p><div className="moderation-actions"><button disabled={!!working} onClick={()=>{setEditingEventId(e.event_id);setTitle(e.title);setDescription(e.description??"");setStarts(toLocalDateTimeInput(e.starts_at));setEnds(toLocalDateTimeInput(e.ends_at));setStatus("Editing "+e.title+".");}}>Edit</button>{e.status!=="published"&&<button disabled={!!working} onClick={()=>void eventStatus(e.event_id,"published")}>Publish</button>}{e.status!=="draft"&&<button disabled={!!working} onClick={()=>void eventStatus(e.event_id,"draft")}>Unpublish</button>}{e.status!=="cancelled"&&<button disabled={!!working} onClick={()=>void eventStatus(e.event_id,"cancelled")}>Cancel</button>}</div></article>)}</div>
 <div><h3>{editingLinkId?"Edit social link":"Add social link"}</h3><form className="poll-create-form" onSubmit={createLink}><label>Label<input required maxLength={80} value={label} onChange={e=>setLabel(e.target.value)} placeholder="Watch on YouTube"/></label><label>URL<input required type="url" maxLength={2048} value={url} onChange={e=>setUrl(e.target.value)} placeholder="https://…"/></label><label>Platform<select value={platform} onChange={e=>setPlatform(e.target.value)}>{["youtube","kick","tiktok","instagram","facebook","twitch","discord","x","custom","other"].map(x=><option key={x} value={x}>{x.toUpperCase()}</option>)}</select></label><div className="moderation-actions"><button className="button button-primary" disabled={!!working}>{editingLinkId?"Update link ↗":"Save link ↗"}</button>{editingLinkId&&<button type="button" disabled={!!working} onClick={()=>{setEditingLinkId("");setLabel("");setUrl("");setPlatform("youtube");setStatus("Link edit cancelled.");}}>Cancel edit</button>}</div></form><h3>Social links</h3>{busy?<p className="editor-status">{status}</p>:links.map(l=><article className="moderation-item" key={l.link_id}><span className={"idea-status "+(l.is_published?"idea-status-approved":"idea-status-pending")}>{l.is_published?"PUBLISHED":"DRAFT"}</span><h3>{l.label}</h3><p className="moderation-body">{l.url}</p><div className="moderation-actions"><button disabled={!!working} onClick={()=>{setEditingLinkId(l.link_id);setLabel(l.label);setUrl(l.url);setPlatform(l.platform);setStatus("Editing "+l.label+". Save to apply the update.");}}>Edit</button><button disabled={!!working} onClick={()=>void toggleLink(l)}>{l.is_published?"Unpublish":"Publish link"}</button></div></article>)}</div></div><p className="editor-status" role="status" aria-live="polite">{status}</p></section>;
}
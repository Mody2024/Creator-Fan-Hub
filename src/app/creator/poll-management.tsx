"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
type Poll={poll_id:string;title:string;description:string;status:string;starts_at:string|null;ends_at:string|null;created_at:string};
type PollOption={id:string;label:string;position:number};
type PollResult={poll_id:string;option_id:string;option_label:string;vote_count:number;poll_status:string};
export default function PollManagement(){
 const [polls,setPolls]=useState<Poll[]>([]);const [options,setOptions]=useState<Record<string,PollOption[]>>({});const [results,setResults]=useState<Record<string,PollResult[]>>({});
 const [title,setTitle]=useState("");const [description,setDescription]=useState("");const [rawOptions,setRawOptions]=useState("Option A\nOption B");const [starts,setStarts]=useState("");const [ends,setEnds]=useState("");
 const [busy,setBusy]=useState(true);const [working,setWorking]=useState("");const [status,setStatus]=useState("Loading polls…");
 const load=useCallback(async()=>{
  const s=getSupabaseBrowserClient();if(!s){setStatus("Database connection is not configured.");setBusy(false);return;}
  setBusy(true);
  try {
   const {data,error}=await s.rpc("get_creator_polls",{p_limit:50});
   if(error){setStatus("Could not load polls. Verify creator access and database setup.");return;}
   const list=(data??[]).map((p: Poll & {id?:string})=>({poll_id:p.poll_id ?? p.id ?? "",title:p.title,description:p.description,status:p.status,starts_at:p.starts_at,ends_at:p.ends_at,created_at:p.created_at})) as Poll[];
   setPolls(list);
   if(list.length){
    const {data:opts,error:optionsError}=await s.rpc("get_creator_poll_options",{p_poll_ids:list.map(p=>p.poll_id)});
    if(optionsError){setStatus("Polls loaded, but options could not be loaded. Check creator access.");return;}
    const grouped:Record<string,PollOption[]>={};for(const o of opts??[]){(grouped[o.poll_id]??=[]).push({id:o.id,label:o.label,position:o.option_position});}setOptions(grouped);
   } else setOptions({});
   const {data:resultRows,error:resultsError}=await s.rpc("get_public_poll_results");
   if(resultsError){setResults({});setStatus("Polls loaded, but final results could not be loaded.");}
   else {
    const groupedResults:Record<string,PollResult[]>={};
    for(const row of (resultRows??[]) as PollResult[]){(groupedResults[row.poll_id]??=[]).push(row);}
    setResults(groupedResults);
    setStatus("Poll list and available final results refreshed.");
   }
  } catch {setStatus("Connection failed while loading polls. Refresh to try again.");}
  finally {setBusy(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const s=getSupabaseBrowserClient();if(!s||working)return;
  const cleanTitle=title.trim(),cleanDescription=description.trim();
  const parsed=rawOptions.split("\n").map(x=>x.trim()).filter(Boolean);
  if(cleanTitle.length<4||cleanTitle.length>160){setStatus("Poll question must be 4–160 characters.");return;}
  if(cleanDescription.length>1000){setStatus("Description must be 1,000 characters or fewer.");return;}
  if(parsed.length<2||parsed.length>8){setStatus("Enter between 2 and 8 non-empty options.");return;}
  if(parsed.some(x=>x.length>100)){setStatus("Each option must be 100 characters or fewer.");return;}
  if(new Set(parsed.map(x=>x.toLocaleLowerCase())).size!==parsed.length){setStatus("Poll option labels must be unique.");return;}
  const startDate=starts?new Date(starts):null,endDate=ends?new Date(ends):null;
  if(startDate&&Number.isNaN(startDate.getTime())||endDate&&Number.isNaN(endDate.getTime())){setStatus("Check the poll dates and try again.");return;}
  if(startDate&&endDate&&endDate<=startDate){setStatus("The closing time must be later than the opening time.");return;}
  setWorking("create");setStatus("Saving poll draft…");
  try {
   const {data,error}=await s.rpc("create_creator_poll",{p_title:cleanTitle,p_description:cleanDescription,p_options:parsed,p_starts_at:startDate?.toISOString()??null,p_ends_at:endDate?.toISOString()??null});
   const result=Array.isArray(data)?data[0] as {created:boolean;result_code:string}|undefined:undefined;
   if(error||!result?.created){setStatus("Could not create the poll. Check creator access, dates and options.");return;}
   setTitle("");setDescription("");setRawOptions("Option A\nOption B");setStarts("");setEnds("");setStatus("Poll saved as a draft. Open it when ready.");setBusy(true);await load();
  } catch {setStatus("Connection failed while saving the poll. Refresh the list before retrying.");}
  finally {setWorking("");}
 }
 async function changeStatus(id:string,next:"open"|"closed"|"archived"){
  const s=getSupabaseBrowserClient();if(!s||working)return;setWorking(id);
  try {
   const {data,error}=await s.rpc("set_creator_poll_status",{p_poll_id:id,p_new_status:next});
   const result=Array.isArray(data)?data[0] as {updated:boolean;result_code:string}|undefined:undefined;
   if(error||!result?.updated){const messages:Record<string,string>={another_poll_open:"Close the currently open poll before opening another.",not_started:"This poll's start time is in the future.",expired:"This poll's end time has passed."};setStatus(messages[result?.result_code??""]??"Could not change poll status.");return;}
   setPolls(old=>old.map(p=>p.poll_id===id?{...p,status:next}:p));setStatus("Poll marked "+next+". Public display updates from its database status.");
  } catch {setStatus("Connection failed while changing poll status. Refresh to confirm the current status.");}
  finally {setWorking("");}
 }
 return <section className="moderation-panel poll-admin"><div className="moderation-heading"><div><span className="eyebrow">PUBLISHING / POLLS</span><h2>Choose what <em>comes next.</em></h2><p>Create a poll as a draft, then open or close voting when you&apos;re ready. Only one poll can be open at a time.</p></div><button className="editor-reload" disabled={busy||!!working} onClick={()=>{setBusy(true);void load();}}>Refresh ↻</button></div>
 <form className="poll-create-form" onSubmit={create}><label>Poll question<input required minLength={4} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder="What should we make next?"/><span>{title.trim().length}/160</span></label><label>Description <span>OPTIONAL / MAX 1000</span><textarea maxLength={1000} rows={2} value={description} onChange={e=>setDescription(e.target.value)} placeholder="Give the community a little context."/><span>{description.length}/1000</span></label><label>Options <span>2–8 OPTIONS, ONE PER LINE</span><textarea required rows={5} value={rawOptions} onChange={e=>setRawOptions(e.target.value)} /><span>{rawOptions.split("\n").filter(x=>x.trim()).length}/8 options</span></label><div className="poll-date-grid"><label>Opens at <span>OPTIONAL</span><input type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)}/></label><label>Closes at <span>OPTIONAL</span><input type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)}/></label></div><button className="button button-primary" disabled={!!working||title.trim().length<4||title.trim().length>160}>Save poll draft <span>↗</span></button></form>
 <div className="poll-admin-list"><h3>Existing polls</h3>{busy?<p className="editor-status">{status}</p>:polls.length===0?<p className="moderation-empty">No polls created yet. Start with the form above.</p>:polls.map(p=><article className="moderation-item" key={p.poll_id}><div className="moderation-item-meta"><span className="eyebrow">{new Date(p.created_at).toLocaleDateString()}</span><span className={"idea-status idea-status-"+p.status}>{p.status.toUpperCase()}</span></div><h3>{p.title}</h3>{p.description&&<p className="moderation-body">{p.description}</p>}<ul className="poll-option-preview">{(options[p.poll_id]??[]).map(o=><li key={o.id}>{o.label}</li>)}</ul>{p.status==="closed"&&results[p.poll_id]&&<div className="poll-admin-results" aria-label="Final poll results"><strong>FINAL RESULTS · {results[p.poll_id].reduce((sum,row)=>sum+Number(row.vote_count||0),0)} votes</strong>{results[p.poll_id].map(row=><p key={row.option_id}><span>{row.option_label}</span><span>{Number(row.vote_count||0)} votes</span></p>)}</div>}<div className="moderation-actions">{p.status!=="open"&&p.status!=="archived"&&<button disabled={!!working} onClick={()=>void changeStatus(p.poll_id,"open")}>Open voting</button>}{p.status==="open"&&<button disabled={!!working} onClick={()=>void changeStatus(p.poll_id,"closed")}>Close voting</button>}{p.status!=="archived"&&p.status!=="open"&&<button disabled={!!working} onClick={()=>void changeStatus(p.poll_id,"archived")}>Archive</button>}</div></article>)}</div><p className="editor-status" role="status" aria-live="polite">{status}</p></section>;
}

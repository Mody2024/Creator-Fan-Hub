"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Review={id:string;at_seconds:number;decision:"approve"|"exclude";note:string};
export default function SponsorBreakpointReview({campaignId}:{campaignId:string}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [rows,setRows]=useState<Review[]>([]);
 const [seconds,setSeconds]=useState("");
 const [decision,setDecision]=useState<"approve"|"exclude">("approve");
 const [note,setNote]=useState("");
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("Creator review only. These markers do not trigger playback or insert advertisements.");
 const load=useCallback(async()=>{
  if(!supabase||!campaignId)return;
  const {data,error}=await supabase.from("raye2_creator_sponsor_breakpoints")
   .select("id,at_seconds,decision,note").eq("campaign_id",campaignId).order("at_seconds");
  if(error){setMessage("Breakpoint review is unavailable until the free breakpoint-review migration is applied.");return}
  setRows((data??[]) as Review[]);
 },[supabase,campaignId]);
 useEffect(()=>{void load()},[load]);
 async function save(){
  const at=Number(seconds);
  if(!supabase||busy)return;
  if(!Number.isSafeInteger(at)||at<0){setMessage("Enter a valid timestamp in seconds.");return}
  setBusy(true);
  try{
   const {data:user,error:userError}=await supabase.auth.getUser();
   if(userError||!user.user)throw new Error("Sign in again to save your review.");
   const {error}=await supabase.from("raye2_creator_sponsor_breakpoints").upsert({
    campaign_id:campaignId,creator_id:user.user.id,at_seconds:at,decision,note:note.trim()
   },{onConflict:"campaign_id,at_seconds"});
   if(error)throw error;
   setSeconds("");setNote("");setMessage("Creator review saved. No ad will be inserted by this action.");await load();
  }catch(error){setMessage(error instanceof Error?error.message:"Could not save breakpoint review.")}
  finally{setBusy(false)}
 }
 async function remove(id:string){
  if(!supabase||busy)return;
  setBusy(true);
  try{const {error}=await supabase.from("raye2_creator_sponsor_breakpoints").delete().eq("id",id);if(error)throw error;setMessage("Review marker removed.");await load()}
  catch(error){setMessage(error instanceof Error?error.message:"Could not remove review marker.")}
  finally{setBusy(false)}
 }
 return <div className="raye2-breakpoint-review">
  <strong>Review sponsor breakpoints</strong>
  <p className="nhen-muted">Enter timestamps from the video timeline. Approve natural breaks or exclude moments that must never be interrupted.</p>
  <div className="poll-create-form">
   <label>Timestamp (seconds)<input type="number" min="0" step="1" value={seconds} onChange={e=>setSeconds(e.target.value)} placeholder="e.g. 420"/></label>
   <label>Review decision<select value={decision} onChange={e=>setDecision(e.target.value as "approve"|"exclude")}><option value="approve">Approve as a possible break</option><option value="exclude">Never place a break here</option></select></label>
   <label>Note (optional)<input value={note} onChange={e=>setNote(e.target.value)} maxLength={240} placeholder="Scene transition / important moment"/></label>
   <button className="button button-secondary" type="button" disabled={busy||!seconds.trim()} onClick={()=>void save()}>{busy?"Saving…":"Save review marker"}</button>
  </div>
  <div className="nhen-playlist-list">{rows.map(row=><article className="nhen-playlist-row" key={row.id}>
   <span><strong>{Math.floor(row.at_seconds/60)}:{String(row.at_seconds%60).padStart(2,"0")}</strong><small>{row.decision==="approve"?"Approved candidate":"Creator exclusion"}{row.note?" · "+row.note:""}</small></span>
   <button type="button" disabled={busy} onClick={()=>void remove(row.id)}>Remove</button>
  </article>)}</div>
  <p className="editor-status" role="status" aria-live="polite">{message}</p>
 </div>
}

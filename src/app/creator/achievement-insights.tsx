"use client";

import { useCallback,useEffect,useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";

type AchievementInsight={achievement_code:string;title:string;description:string;icon:string;earned_count:number;member_count:number};

export default function AchievementInsights(){
 const [rows,setRows]=useState<AchievementInsight[]>([]);
 const [busy,setBusy]=useState(true);
 const [status,setStatus]=useState("Loading community achievement insights…");
 const load=useCallback(async()=>{
  const supabase=getSupabaseBrowserClient();
  if(!supabase){setStatus("Supabase is not configured.");setBusy(false);return}
  setBusy(true);
  try{
   const {data,error}=await supabase.rpc("raye2_creator_achievement_insights");
   if(error)throw error;
   setRows((data??[]) as AchievementInsight[]);
   setStatus("Aggregate achievement activity. Individual member identities are not exposed.");
  }catch(error){
   setRows([]);
   setStatus(error instanceof Error?error.message:"Achievement insights could not be loaded. Apply the creator achievement insights migration and retry.");
  }finally{setBusy(false)}
 },[]);
 useEffect(()=>{void load()},[load]);
 const total=rows.reduce((sum,row)=>sum+Number(row.earned_count||0),0);
 const members=rows.reduce((sum,row)=>sum+Number(row.member_count||0),0);
 return <section className="creator-editor" id="creator-achievements" aria-busy={busy}>
  <div className="editor-topline"><span className="eyebrow">RAYE2 / COMMUNITY PROGRESSION</span><button type="button" className="editor-reload" disabled={busy} onClick={()=>void load()}>Refresh insights ↻</button></div>
  <div className="module-heading"><div><span className="eyebrow">ACHIEVEMENTS</span><h2>See what your community is earning.</h2><p>Understand which participation milestones are resonating without exposing member identities.</p></div></div>
  <div className="dashboard-stats">
   <article><span>Achievement awards</span><strong>{busy?"—":total.toLocaleString()}</strong><small>All-time recorded awards</small></article>
   <article><span>Member awards</span><strong>{busy?"—":members.toLocaleString()}</strong><small>Distinct members across milestones</small></article>
   <article><span>Milestones</span><strong>{busy?"—":rows.length}</strong><small>Configured community achievements</small></article>
  </div>
  <div className="nhen-card">
   <div className="nhen-card-heading"><div><span className="eyebrow">MILESTONE PERFORMANCE</span><h3>Community achievements</h3></div></div>
   {rows.length? <div className="creator-achievement-list">{rows.map(row=><article className="creator-achievement-row" key={row.achievement_code}><span aria-hidden="true">{row.icon}</span><div><strong>{row.title}</strong><p>{row.description}</p></div><div><strong>{Number(row.earned_count).toLocaleString()}</strong><small>awards</small></div><div><strong>{Number(row.member_count).toLocaleString()}</strong><small>members</small></div></article>)}</div>:<p className="editor-status" role="status">{status}</p>}
   <p className="editor-status" role="status" aria-live="polite">{status}</p>
  </div>
 </section>;
}

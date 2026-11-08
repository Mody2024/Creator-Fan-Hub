"use client";

import {useCallback,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Summary={total_points:number;earned_awards:number;revoked_awards:number;available_rules:number};
type Reward={id:string;reward_code:string;points:number;status:"awarded"|"revoked";source_ref:string|null;note:string;created_at:string;revoked_at:string|null};
type Rule={code:string;title:string;description:string;points:number;enabled:boolean};

export default function CreatorRewardsCenter(){
 const [summary,setSummary]=useState<Summary|null>(null);
 const [history,setHistory]=useState<Reward[]>([]);
 const [rules,setRules]=useState<Rule[]>([]);
 const [busy,setBusy]=useState(true);
 const [status,setStatus]=useState("Loading creator rewards…");
 const load=useCallback(async()=>{
  const supabase=getSupabaseBrowserClient();
  if(!supabase){setStatus("Supabase is not configured.");setBusy(false);return}
  setBusy(true);
  try{
   const [summaryResult,historyResult,rulesResult]=await Promise.all([
    supabase.rpc("raye2_creator_reward_summary"),
    supabase.from("raye2_creator_reward_ledger").select("id,reward_code,points,status,source_ref,note,created_at,revoked_at").order("created_at",{ascending:false}).limit(50),
    supabase.from("raye2_creator_reward_rules").select("code,title,description,points,enabled").eq("enabled",true).order("points",{ascending:true})
   ]);
   if(summaryResult.error)throw summaryResult.error;
   if(historyResult.error)throw historyResult.error;
   if(rulesResult.error)throw rulesResult.error;
   const raw=summaryResult.data;
   setSummary((Array.isArray(raw)?raw[0]:raw) as Summary|null);
   setHistory((historyResult.data??[]) as Reward[]);
   setRules((rulesResult.data??[]) as Rule[]);
   setStatus("Reward points are recognition credits, not cash. Revoked awards are excluded from the available balance.");
  }catch(error){
   setStatus(error instanceof Error?error.message:"Creator rewards could not be loaded. Apply the creator rewards migration and retry.");
  }finally{setBusy(false)}
 },[]);
 useEffect(()=>{void load()},[load]);
 return <section className="creator-editor" id="creator-rewards" aria-busy={busy}>
  <div className="editor-topline"><span className="eyebrow">RAYE2 / CREATOR REWARDS</span><button type="button" className="editor-reload" disabled={busy} onClick={()=>void load()}>Refresh rewards ↻</button></div>
  <div className="module-heading"><div><span className="eyebrow">RECOGNITION & PROGRESSION</span><h2>Every contribution can count.</h2><p>Track verified creator reward awards and the milestones available in your workspace.</p></div></div>
  <div className="dashboard-stats">
   <article><span>Available points</span><strong>{busy?"—":Number(summary?.total_points??0).toLocaleString()}</strong><small>Recognition credits, not cash</small></article>
   <article><span>Earned awards</span><strong>{busy?"—":Number(summary?.earned_awards??0).toLocaleString()}</strong><small>Recorded reward grants</small></article>
   <article><span>Available milestones</span><strong>{busy?"—":Number(summary?.available_rules??0).toLocaleString()}</strong><small>Enabled reward rules</small></article>
  </div>
  <div className="nhen-card">
   <div className="nhen-card-heading"><div><span className="eyebrow">REWARD CATALOGUE</span><h3>Available recognition</h3></div></div>
   {rules.length?<div className="creator-achievement-list">{rules.map(rule=><article className="creator-achievement-row" key={rule.code}><span aria-hidden="true">✦</span><div><strong>{rule.title}</strong><p>{rule.description}</p></div><div><strong>{Number(rule.points).toLocaleString()}</strong><small>points</small></div></article>)}</div>:<p className="editor-status">No reward milestones have been configured yet.</p>}
  </div>
  <div className="nhen-card">
   <div className="nhen-card-heading"><div><span className="eyebrow">YOUR RECORD</span><h3>Reward history</h3></div></div>
   {history.length?<div className="creator-achievement-list">{history.map(item=><article className="creator-achievement-row" key={item.id}><span aria-hidden="true">{item.status==="awarded"?"✦":"↶"}</span><div><strong>{item.reward_code.replace(/[-_]/g," ")}</strong><p>{item.note||"Creator recognition award"} · {new Date(item.created_at).toLocaleDateString()}</p></div><div><strong>{item.status==="revoked"?"−": "+"}{Number(item.points).toLocaleString()}</strong><small>{item.status}</small></div></article>)}</div>:<p className="editor-status">No reward awards have been recorded yet.</p>}
  </div>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>;
}

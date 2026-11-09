"use client";

import {useCallback,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Summary={total_points:number;earned_awards:number;revoked_awards:number;available_rules:number};
type Progression={points:number;level:number;level_name:string;next_level_name:string;level_floor:number;next_level_points:number;points_to_next:number;progress_percent:number};
type Reward={id:string;reward_code:string;points:number;status:"awarded"|"revoked";source_ref:string|null;note:string;created_at:string;revoked_at:string|null};

type Rule={code:string;title:string;description:string;points:number;enabled:boolean};
type Achievement={code:string;title:string;description:string;icon:string;earned_at:string};
export function normalizeCreatorAchievements(earned:unknown,catalog:unknown):Achievement[]{
 if(!Array.isArray(earned)||!Array.isArray(catalog))return [];
 const byCode=new Map<string,Record<string,unknown>>();
 for(const item of catalog){
  if(!item||typeof item!=="object")continue;
  const row=item as Record<string,unknown>;
  if(typeof row.code==="string"&&typeof row.title==="string")byCode.set(row.code,row);
 }
 return earned.flatMap((item:unknown)=>{
  if(!item||typeof item!=="object")return [];
  const row=item as Record<string,unknown>;
  if(typeof row.achievement_code!=="string"||typeof row.earned_at!=="string")return [];
  const detail=byCode.get(row.achievement_code);
  if(!detail)return [];
  return [{code:row.achievement_code,title:String(detail.title),description:typeof detail.description==="string"?detail.description:"",icon:typeof detail.icon==="string"?detail.icon:"✦",earned_at:row.earned_at}];
 }).sort((a,b)=>Date.parse(b.earned_at)-Date.parse(a.earned_at));
}
export function normalizeCreatorProgression(value:unknown):Progression|null{
 const row=Array.isArray(value)?value[0]:value;
 if(!row||typeof row!=="object")return null;
 const item=row as Record<string,unknown>;
 const points=safeRewardCount(item.points),level=safeRewardCount(item.level);
 const floor=safeRewardCount(item.level_floor),next=safeRewardCount(item.next_level_points);
 const percent=Number(item.progress_percent);
 if(level<1||typeof item.level_name!=="string"||typeof item.next_level_name!=="string"||!Number.isFinite(percent))return null;
 return {points,level,level_name:item.level_name,next_level_name:item.next_level_name,level_floor:floor,next_level_points:next,points_to_next:Math.max(0,next-points),progress_percent:Math.max(0,Math.min(100,Math.trunc(percent)))};
}
export function safeRewardCount(value:unknown):number{
 const parsed=typeof value==="number"||typeof value==="string"?Number(value):Number.NaN;
 return Number.isFinite(parsed)?Math.max(0,Math.trunc(parsed)):0;
}
export function normalizeCreatorRewardSummary(value:unknown):Summary|null{
 const row=Array.isArray(value)?value[0]:value;
 if(!row||typeof row!=="object")return null;
 const item=row as Record<string,unknown>;
 return {
  total_points:safeRewardCount(item.total_points),
  earned_awards:safeRewardCount(item.earned_awards),
  revoked_awards:safeRewardCount(item.revoked_awards),
  available_rules:safeRewardCount(item.available_rules)
 };
}
export function normalizeCreatorRewardHistory(value:unknown):Reward[]{
 if(!Array.isArray(value))return [];
 return value.filter((item:unknown)=>{
  if(!item||typeof item!=="object")return false;
  const row=item as Record<string,unknown>;
  return typeof row.id==="string"&&typeof row.reward_code==="string"&&(row.status==="awarded"||row.status==="revoked");
 }).map((item:unknown)=>{
  const row=item as Reward;
  return {...row,points:safeRewardCount(row.points),created_at:typeof row.created_at==="string"?row.created_at:""};
 });
}
export function normalizeCreatorRewardRules(value:unknown):Rule[]{
 if(!Array.isArray(value))return [];
 return value.filter((item:unknown)=>{
  if(!item||typeof item!=="object")return false;
  const row=item as Record<string,unknown>;
  return typeof row.code==="string"&&typeof row.title==="string"&&row.enabled===true;
 }).map((item:unknown)=>{
  const row=item as Rule;
  return {...row,points:safeRewardCount(row.points)};
 });
}

export default function CreatorRewardsCenter(){
 const [summary,setSummary]=useState<Summary|null>(null);
 const [progression,setProgression]=useState<Progression|null>(null);
 const [history,setHistory]=useState<Reward[]>([]);
 const [rules,setRules]=useState<Rule[]>([]);
 const [achievements,setAchievements]=useState<Achievement[]>([]);
 const [busy,setBusy]=useState(true);
 const [status,setStatus]=useState("Loading creator rewards…");
 const load=useCallback(async()=>{
  const supabase=getSupabaseBrowserClient();
  if(!supabase){setStatus("Supabase is not configured.");setBusy(false);return}
  setBusy(true);
  try{
   const userResult=await supabase.auth.getUser();
   if(userResult.error||!userResult.data.user)throw new Error("Sign in again to view your reward history.");
   const creatorId=userResult.data.user.id;
   const [summaryResult,historyResult,rulesResult,earnedResult,catalogResult]=await Promise.all([
    supabase.rpc("raye2_creator_reward_summary"),
    supabase.from("raye2_creator_reward_ledger").select("id,reward_code,points,status,source_ref,note,created_at,revoked_at").eq("creator_id",creatorId).order("created_at",{ascending:false}).limit(50),
    supabase.from("raye2_creator_reward_rules").select("code,title,description,points,enabled").eq("enabled",true).order("points",{ascending:true}),
    supabase.from("member_achievements").select("achievement_code,earned_at").eq("user_id",creatorId).order("earned_at",{ascending:false}).limit(100),
    supabase.from("achievement_catalog").select("code,title,description,icon").order("position",{ascending:true})
   ]);
   if(summaryResult.error)throw summaryResult.error;
   const progressionResult=await supabase.rpc("raye2_creator_progression_summary");
   if(progressionResult.error)throw progressionResult.error;
   const normalizedProgression=normalizeCreatorProgression(progressionResult.data);
   if(!normalizedProgression)throw new Error("Creator progression returned an invalid summary. Refresh or contact an administrator.");
   setProgression(normalizedProgression);
   if(historyResult.error)throw historyResult.error;
   if(rulesResult.error)throw rulesResult.error;
   if(earnedResult.error)throw earnedResult.error;
   if(catalogResult.error)throw catalogResult.error;
   const normalizedSummary=normalizeCreatorRewardSummary(summaryResult.data);
   if(!normalizedSummary)throw new Error("Creator reward summary is missing or malformed. Refresh or contact an administrator.");
   setSummary(normalizedSummary);
   setHistory(normalizeCreatorRewardHistory(historyResult.data));
   setRules(normalizeCreatorRewardRules(rulesResult.data));
   setAchievements(normalizeCreatorAchievements(earnedResult.data,catalogResult.data));
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
  <div className="nhen-card" aria-label="Creator level progression">
   <div className="nhen-card-heading"><div><span className="eyebrow">CREATOR LEVEL</span><h3>{progression ? "Level " + progression.level + " · " + progression.level_name : "Your creator level"}</h3><p>{progression && progression.points_to_next ? progression.points_to_next.toLocaleString() + " points to " + progression.next_level_name : "Your progression is up to date."}</p></div></div>
   <div className="dashboard-stats"><article><span>Current level</span><strong>{progression?.level ?? "—"}</strong><small>{progression?.level_name ?? "Loading"}</small></article><article><span>Progress</span><strong>{progression ? progression.progress_percent + "%" : "—"}</strong><small>{progression ? progression.points.toLocaleString() + " / " + progression.next_level_points.toLocaleString() + " points" : "Recognition points"}</small></article></div>
   <div role="progressbar" aria-label="Progress to next creator level" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progression?.progress_percent ?? 0} style={{height:10,borderRadius:999,background:"var(--surface-muted, #e5e7eb)",overflow:"hidden"}}><div style={{height:"100%",width:(progression?.progress_percent ?? 0) + "%",background:"var(--accent, #16a36a)"}}/></div>
  </div>
  <div className="nhen-card">
   <div className="nhen-card-heading"><div><span className="eyebrow">VERIFIED ACHIEVEMENTS</span><h3>Your earned milestones</h3><p>Only achievements recorded by Raye2 are shown here.</p></div><strong>{achievements.length}</strong></div>
   {achievements.length?<div className="creator-achievement-list">{achievements.map(item=><article className="creator-achievement-row" key={item.code}><span aria-hidden="true">{item.icon}</span><div><strong>{item.title}</strong><p>{item.description} · {Number.isFinite(new Date(item.earned_at).getTime())?new Date(item.earned_at).toLocaleDateString():"Date unavailable"}</p></div><span className="module-state">Earned</span></article>)}</div>:<p className="editor-status">Your verified milestones will appear here when earned.</p>}
  </div>
  <div className="nhen-card">
   <div className="nhen-card-heading"><div><span className="eyebrow">REWARD CATALOGUE</span><h3>Available recognition</h3></div></div>
   {rules.length?<div className="creator-achievement-list">{rules.map(rule=><article className="creator-achievement-row" key={rule.code}><span aria-hidden="true">✦</span><div><strong>{rule.title}</strong><p>{rule.description}</p></div><div><strong>{Number(rule.points).toLocaleString()}</strong><small>points</small></div></article>)}</div>:<p className="editor-status">No reward milestones have been configured yet.</p>}
  </div>
  <div className="nhen-card">
   <div className="nhen-card-heading"><div><span className="eyebrow">YOUR RECORD</span><h3>Reward history</h3></div></div>
   {history.length?<div className="creator-achievement-list">{history.map(item=><article className="creator-achievement-row" key={item.id}><span aria-hidden="true">{item.status==="awarded"?"✦":"↶"}</span><div><strong>{item.reward_code.replace(/[-_]/g," ")}</strong><p>{item.note||"Creator recognition award"} · {Number.isFinite(new Date(item.created_at).getTime())?new Date(item.created_at).toLocaleDateString():"Date unavailable"}</p></div><div><strong>{item.status==="revoked"?"−": "+"}{Number(item.points).toLocaleString()}</strong><small>{item.status}</small></div></article>)}</div>:<p className="editor-status">No reward awards have been recorded yet.</p>}
  </div>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>;
}

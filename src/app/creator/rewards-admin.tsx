"use client";
import {useCallback,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
type Rule={code:string;title:string;description:string;points:number;enabled:boolean};
type Creator={creator_id:string;workspace_role:string};
type Ledger={id:string;creator_id:string;reward_code:string;points:number;status:string;note:string;created_at:string};
export default function CreatorRewardsAdmin(){
 const [rules,setRules]=useState<Rule[]>([]),[creators,setCreators]=useState<Creator[]>([]),[ledger,setLedger]=useState<Ledger[]>([]);
 const [code,setCode]=useState(""),[title,setTitle]=useState(""),[description,setDescription]=useState(""),[points,setPoints]=useState("100"),[enabled,setEnabled]=useState(true);
 const [creatorId,setCreatorId]=useState(""),[rewardCode,setRewardCode]=useState(""),[sourceRef,setSourceRef]=useState(""),[note,setNote]=useState("");
 const [busy,setBusy]=useState(false),[status,setStatus]=useState("Admin reward controls are loading…");
 const load=useCallback(async()=>{
  const supabase=getSupabaseBrowserClient();if(!supabase){setStatus("Supabase is not configured.");return}
  setBusy(true);
  try{
   const [r,c,l]=await Promise.all([
    supabase.from("raye2_creator_reward_rules").select("code,title,description,points,enabled").order("code"),
    supabase.rpc("raye2_admin_list_reward_creators"),
    supabase.from("raye2_creator_reward_ledger").select("id,creator_id,reward_code,points,status,note,created_at").order("created_at",{ascending:false}).limit(100)
   ]);
   if(r.error)throw r.error;if(c.error)throw c.error;if(l.error)throw l.error;
   const rr=(r.data??[]) as Rule[],cc=(c.data??[]) as Creator[];
   setRules(rr);setCreators(cc);setLedger((l.data??[]) as Ledger[]);
   if(!creatorId&&cc[0])setCreatorId(cc[0].creator_id);
   if(!rewardCode&&rr.find(x=>x.enabled))setRewardCode(rr.find(x=>x.enabled)!.code);
   setStatus("Admin controls ready. Every grant and revocation is recorded in the reward ledger.");
  }catch(e){setStatus(e instanceof Error?e.message:"Could not load reward administration.");}
  finally{setBusy(false)}
 },[creatorId,rewardCode]);
 useEffect(()=>{void load()},[load]);
 async function saveRule(){
  const supabase=getSupabaseBrowserClient();if(!supabase)return;
  setBusy(true);try{
   const {error}=await supabase.rpc("raye2_admin_upsert_creator_reward_rule",{p_code:code.trim().toLowerCase(),p_title:title.trim(),p_description:description.trim(),p_points:Number(points),p_enabled:enabled});
   if(error)throw error;setCode("");setTitle("");setDescription("");setPoints("100");setStatus("Reward rule saved.");await load();
  }catch(e){setStatus(e instanceof Error?e.message:"Could not save reward rule.");}finally{setBusy(false)}
 }
 async function grant(){
  const supabase=getSupabaseBrowserClient();if(!supabase||!creatorId||!rewardCode)return;
  setBusy(true);try{
   const {error}=await supabase.rpc("raye2_admin_grant_creator_reward",{p_creator_id:creatorId,p_reward_code:rewardCode,p_source_ref:sourceRef.trim()||null,p_note:note.trim()});
   if(error)throw error;setSourceRef("");setNote("");setStatus("Reward grant recorded. Duplicate source references do not create duplicate awards.");await load();
  }catch(e){setStatus(e instanceof Error?e.message:"Could not grant reward.");}finally{setBusy(false)}
 }
 async function revoke(id:string){
  const supabase=getSupabaseBrowserClient();if(!supabase)return;
  if(!window.confirm("Revoke this award? The ledger record will remain for audit."))return;
  setBusy(true);try{const {data,error}=await supabase.rpc("raye2_admin_revoke_creator_reward",{p_reward_id:id,p_note:"Revoked by workspace administrator"});if(error)throw error;if(!data)throw new Error("This award is already revoked or unavailable.");setStatus("Award revoked and retained in audit history.");await load();}
  catch(e){setStatus(e instanceof Error?e.message:"Could not revoke award.");}finally{setBusy(false)}
 }
 return <section className="creator-editor" id="creator-rewards-admin" aria-busy={busy}>
  <div className="editor-topline"><span className="eyebrow">RAYE2 / ADMIN REWARDS</span><button className="editor-reload" type="button" disabled={busy} onClick={()=>void load()}>Refresh ↻</button></div>
  <div className="module-heading"><div><span className="eyebrow">OWNER & ADMIN CONTROLS</span><h2>Configure creator recognition.</h2><p>Create reward rules, issue verified awards and preserve a revocation trail.</p></div></div>
  <div className="nhen-card"><h3>Create or update a reward rule</h3>
   <div className="creator-form-grid">
    <label>Rule code<input value={code} onChange={e=>setCode(e.target.value)} placeholder="community_milestone"/></label>
    <label>Reward title<input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Community milestone"/></label>
    <label>Points<input type="number" min="1" max="1000000" value={points} onChange={e=>setPoints(e.target.value)}/></label>
    <label>Description<input value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} placeholder="Why this award is earned"/></label>
   </div>
   <label className="creator-check"><input type="checkbox" checked={enabled} onChange={e=>setEnabled(e.target.checked)}/> Rule enabled for new grants</label>
   <button type="button" className="button button-secondary" disabled={busy||!code.trim()||!title.trim()||!Number.isInteger(Number(points))||Number(points)<1} onClick={()=>void saveRule()}>Save reward rule</button>
  </div>
  <div className="nhen-card"><h3>Grant a creator reward</h3>
   <div className="creator-form-grid">
    <label>Creator account<select value={creatorId} onChange={e=>setCreatorId(e.target.value)}><option value="">Select creator</option>{creators.map(c=><option key={c.creator_id} value={c.creator_id}>{c.workspace_role} · {c.creator_id}</option>)}</select></label>
    <label>Reward rule<select value={rewardCode} onChange={e=>setRewardCode(e.target.value)}><option value="">Select reward</option>{rules.filter(r=>r.enabled).map(r=><option key={r.code} value={r.code}>{r.title} · {r.points} points</option>)}</select></label>
    <label>Source reference<input value={sourceRef} onChange={e=>setSourceRef(e.target.value)} maxLength={160} placeholder="Unique event or review ID"/></label>
    <label>Admin note<input value={note} onChange={e=>setNote(e.target.value)} maxLength={500} placeholder="Reason for this award"/></label>
   </div>
   <button type="button" className="button button-secondary" disabled={busy||!creatorId||!rewardCode} onClick={()=>void grant()}>Issue reward</button>
  </div>
  <div className="nhen-card"><h3>Recent reward ledger</h3>
   {ledger.length?<div className="creator-achievement-list">{ledger.map(row=><article className="creator-achievement-row" key={row.id}><div><strong>{row.reward_code}</strong><p>{row.creator_id} · {row.note||"No note"} · {new Date(row.created_at).toLocaleDateString()}</p></div><div><strong>{row.points.toLocaleString()}</strong><small>{row.status}</small></div>{row.status==="awarded"&&<button type="button" className="button button-secondary" disabled={busy} onClick={()=>void revoke(row.id)}>Revoke</button>}</article>)}</div>:<p className="editor-status">No reward records yet.</p>}
  </div>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>;
}

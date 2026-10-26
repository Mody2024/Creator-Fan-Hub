"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
type Idea = { idea_id: string; display_name: string; idea_title: string; idea_body: string; idea_status: string; submitted_at: string };
export default function IdeaModerationQueue() {
  const [ideas,setIdeas] = useState<Idea[]>([]);
  const [busy,setBusy] = useState(true);
  const [working,setWorking] = useState("");
  const [status,setStatus] = useState("Loading moderation queue…");
  const load = useCallback(async () => {
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setStatus("Supabase is not configured.");setBusy(false);return;}
    const {data,error}=await supabase.rpc("get_creator_idea_queue",{p_limit:50});
    if(error){setStatus("Could not load ideas. Check creator access.");setBusy(false);return;}
    setIdeas(Array.isArray(data)?data as Idea[]:[]);
    setStatus("Queue refreshed. Pending ideas remain private until approved.");setBusy(false);
  },[]);
  useEffect(()=>{void load();},[load]);
  async function moderate(id:string,next:"approved"|"rejected"|"featured"|"archived"){
    const supabase=getSupabaseBrowserClient();if(!supabase||working)return;setWorking(id);
    const {data,error}=await supabase.rpc("moderate_public_idea",{p_idea_id:id,p_new_status:next});
    const result=Array.isArray(data)?data[0] as {updated:boolean}|undefined:undefined;
    if(error||!result?.updated){setStatus("Could not save that action. Refresh and try again.");setWorking("");return;}
    setIdeas(current=>current.map(i=>i.idea_id===id?{...i,idea_status:next}:i));
    setStatus("Idea marked "+next+". Only approved ideas appear publicly.");setWorking("");
  }
  return <section className="moderation-panel">
    <div className="moderation-heading"><div><span className="eyebrow">COMMUNITY / MODERATION</span><h2>Ideas <em>in review.</em></h2><p>Private queue; pending submissions are never shown to public visitors.</p></div><button className="editor-reload" disabled={busy||!!working} onClick={()=>{setBusy(true);void load();}}>Refresh ↻</button></div>
    {busy?<p className="editor-status" role="status">{status}</p>:ideas.length===0?<div className="moderation-empty"><h3>No submissions yet.</h3><p>New ideas will appear here when visitors submit them.</p></div>:<div className="moderation-list">{ideas.map(idea=><article className="moderation-item" key={idea.idea_id}>
      <div className="moderation-item-meta"><span className="eyebrow">{new Date(idea.submitted_at).toLocaleString()}</span><span className={"idea-status idea-status-"+idea.idea_status}>{idea.idea_status.toUpperCase()}</span></div>
      <h3>{idea.idea_title}</h3><p className="moderation-byline">By {idea.display_name||"Anonymous"}</p><p className="moderation-body">{idea.idea_body}</p>
      <div className="moderation-actions"><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"approved")}>Approve</button><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"featured")}>Feature</button><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"rejected")}>Reject</button><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"archived")}>Archive</button></div>
    </article>)}</div>}
    <p className="editor-status" role="status" aria-live="polite">{status}</p>
  </section>;
}

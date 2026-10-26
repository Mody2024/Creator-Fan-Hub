"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
type Idea = { idea_id: string; display_name: string; idea_title: string; idea_body: string; idea_status: string; submitted_at: string };
export default function IdeaModerationQueue() {
  const [ideas,setIdeas] = useState<Idea[]>([]);
  const [busy,setBusy] = useState(true);
  const [working,setWorking] = useState("");
  const [search,setSearch] = useState("");
  const [statusFilter,setStatusFilter] = useState<"all"|"pending"|"approved"|"featured"|"rejected"|"archived">("all");
  const [status,setStatus] = useState("Loading moderation queue…");
  const load = useCallback(async () => {
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setStatus("Supabase is not configured.");setBusy(false);return;}
    setBusy(true);
    try {
      const {data,error}=await supabase.rpc("get_creator_idea_queue",{p_limit:50});
      if(error){setStatus("Could not load ideas. Check creator access.");return;}
      setIdeas(Array.isArray(data)?data as Idea[]:[]);
      setStatus("Queue refreshed. Pending ideas remain private until approved.");
    } catch {
      setStatus("Connection failed while loading ideas. Check your connection and refresh.");
    } finally {
      setBusy(false);
    }
  },[]);
  useEffect(()=>{void load();},[load]);
  async function moderate(id:string,next:"approved"|"rejected"|"featured"|"archived"){
    const supabase=getSupabaseBrowserClient();if(!supabase||working)return;setWorking(id);
    try {
      const {data,error}=await supabase.rpc("moderate_public_idea",{p_idea_id:id,p_new_status:next});
      const result=Array.isArray(data)?data[0] as {updated:boolean}|undefined:undefined;
      if(error||!result?.updated){setStatus("Could not save that action. Refresh and try again.");return;}
      setIdeas(current=>current.map(i=>i.idea_id===id?{...i,idea_status:next}:i));
      setStatus("Idea marked "+next+". Only approved ideas appear publicly.");
    } catch {
      setStatus("Connection failed while saving. Refresh the queue to confirm the idea's current status.");
    } finally {
      setWorking("");
    }
  }
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleIdeas = ideas.filter(idea => (statusFilter === "all" || idea.idea_status === statusFilter || (statusFilter === "pending" && idea.idea_status === "pending")) && [idea.idea_title, idea.idea_body, idea.display_name || ""].some(value => value.toLocaleLowerCase().includes(normalizedSearch)));
  const pendingCount = ideas.filter(idea => idea.idea_status === "pending").length;
  const featuredCount = ideas.filter(idea => idea.idea_status === "featured").length;
  return <section className="moderation-panel">
    <div className="moderation-heading"><div><span className="eyebrow">COMMUNITY / MODERATION</span><h2>Ideas <em>in review.</em></h2><p>Private queue; pending submissions are never shown to public visitors.</p><div className="moderation-summary" aria-label="Idea totals"><span>{ideas.length} total</span><span>{pendingCount} pending</span><span>{featuredCount} featured</span></div></div><button className="editor-reload" disabled={busy||!!working} onClick={()=>{setBusy(true);void load();}}>Refresh ↻</button></div>
    {!busy && ideas.length > 0 && <div className="moderation-filters"><label>Search ideas<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder="Title, details or display name" /></label><label>Status<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">All statuses</option><option value="pending">Pending review</option><option value="approved">Approved</option><option value="featured">Featured</option><option value="rejected">Rejected</option><option value="archived">Archived</option></select></label><span>{visibleIdeas.length} shown</span></div>}
    {busy?<p className="editor-status" role="status" aria-live="polite">{status}</p>:ideas.length===0?<div className="moderation-empty" role="status"><h3>No submissions yet.</h3><p>New ideas will appear here when visitors submit them.</p></div>:visibleIdeas.length===0?<div className="moderation-empty"><h3>No matching ideas.</h3><p>Try another search or choose a different status.</p><button className="button button-secondary" type="button" onClick={()=>{setSearch("");setStatusFilter("all");}}>Clear filters</button></div>:<div className="moderation-list">{visibleIdeas.map(idea=><article className="moderation-item" key={idea.idea_id}>
      <div className="moderation-item-meta"><span className="eyebrow">{new Date(idea.submitted_at).toLocaleString()}</span><span className={"idea-status idea-status-"+idea.idea_status}>{idea.idea_status.toUpperCase()}</span></div>
      <h3>{idea.idea_title}</h3><p className="moderation-byline">By {idea.display_name||"Anonymous"}</p><p className="moderation-body">{idea.idea_body}</p>
      <div className="moderation-actions"><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"approved")}>Approve</button><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"featured")}>Feature</button><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"rejected")}>Reject</button><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"archived")}>Archive</button></div>
    </article>)}</div>}
    <p className="editor-status" role="status" aria-live="polite">{status}</p>
  </section>;
}

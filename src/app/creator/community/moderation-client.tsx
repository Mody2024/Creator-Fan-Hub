"use client";

import {useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

export type QueueItem={id:string;kind:"post"|"comment";body:string;status:string;createdAt:string;author:string;handle:string;postType?:string;postId?:string};
export type ReportItem={id:string;targetType:string;targetId:string;reason:string;details:string;status:string;createdAt:string};

export default function CommunityModerationClient({initialPosts,initialComments,initialReports}:{initialPosts:QueueItem[];initialComments:QueueItem[];initialReports:ReportItem[]}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [posts,setPosts]=useState(initialPosts),[comments,setComments]=useState(initialComments),[reports,setReports]=useState(initialReports);
 const [tab,setTab]=useState<"posts"|"comments"|"reports">("posts"),[busy,setBusy]=useState<string|null>(null),[notice,setNotice]=useState("");
 async function moderate(kind:"post"|"comment",id:string,status:"published"|"rejected"|"removed"){
  if(!supabase||busy)return;setBusy(id);setNotice("");
  const table=kind==="post"?"community_posts":"community_comments";
  const result=await supabase.from(table).update({status,...(kind==="post"?{updated_at:new Date().toISOString()}: {})}).eq("id",id);
  if(result.error)setNotice("Could not update this item. Refresh and retry.");
  else{if(kind==="post")setPosts(items=>items.filter(x=>x.id!==id));else setComments(items=>items.filter(x=>x.id!==id));setNotice(status==="published"?"Approved and published.":status==="rejected"?"Submission rejected.":"Content removed.");}
  setBusy(null);
 }
 async function updateReport(id:string,status:"reviewing"|"resolved"|"dismissed"){
  if(!supabase||busy)return;setBusy(id);setNotice("");
  const result=await supabase.from("content_reports").update({status}).eq("id",id);
  if(result.error)setNotice("Could not update this report.");
  else{setReports(items=>items.map(x=>x.id===id?{...x,status}:x));setNotice("Report status updated.");}
  setBusy(null);
 }
 const count=posts.length+comments.length+reports.filter(x=>x.status==="open").length;
 return <section className="nhen-mod-workspace">
  <div className="dashboard-stats"><article><span>POSTS TO REVIEW</span><strong>{posts.length}</strong><small>Member submissions awaiting approval</small></article><article><span>COMMENTS TO REVIEW</span><strong>{comments.length}</strong><small>Comments are private until approved</small></article><article><span>OPEN REPORTS</span><strong>{reports.filter(x=>x.status==="open").length}</strong><small>{count} total items need attention</small></article></div>
  <div className="nhen-mod-tabs" role="tablist" aria-label="Moderation queues">
   <button className={tab==="posts"?"active":""} onClick={()=>setTab("posts")}>Posts <b>{posts.length}</b></button>
   <button className={tab==="comments"?"active":""} onClick={()=>setTab("comments")}>Comments <b>{comments.length}</b></button>
   <button className={tab==="reports"?"active":""} onClick={()=>setTab("reports")}>Reports <b>{reports.filter(x=>x.status==="open").length}</b></button>
  </div>
  {notice&&<p role="status" className="nhen-mod-notice">{notice}</p>}
  {tab==="posts"&&<div className="nhen-mod-list">{posts.length?posts.map(item=><article className="nhen-mod-item" key={item.id}><div className="nhen-mod-meta"><strong>{item.author}</strong><span>@{item.handle}</span><span>{new Date(item.createdAt).toLocaleString()}</span><span className="nhen-pill">MEMBER POST</span></div><p>{item.body}</p><div className="nhen-mod-actions"><button disabled={busy===item.id} onClick={()=>void moderate("post",item.id,"published")}>Approve & publish</button><button disabled={busy===item.id} onClick={()=>void moderate("post",item.id,"rejected")}>Reject</button><button disabled={busy===item.id} onClick={()=>void moderate("post",item.id,"removed")}>Remove</button></div></article>):<div className="nhen-empty-state">No posts waiting for review.</div>}</div>}
  {tab==="comments"&&<div className="nhen-mod-list">{comments.length?comments.map(item=><article className="nhen-mod-item" key={item.id}><div className="nhen-mod-meta"><strong>{item.author}</strong><span>@{item.handle}</span><span>{new Date(item.createdAt).toLocaleString()}</span><span className="nhen-pill">COMMENT</span></div><p>{item.body}</p><div className="nhen-mod-actions"><button disabled={busy===item.id} onClick={()=>void moderate("comment",item.id,"published")}>Approve</button><button disabled={busy===item.id} onClick={()=>void moderate("comment",item.id,"rejected")}>Reject</button><button disabled={busy===item.id} onClick={()=>void moderate("comment",item.id,"removed")}>Remove</button></div></article>):<div className="nhen-empty-state">No comments waiting for review.</div>}</div>}
  {tab==="reports"&&<div className="nhen-mod-list">{reports.length?reports.map(item=><article className="nhen-mod-item" key={item.id}><div className="nhen-mod-meta"><strong>{item.targetType} report</strong><span>{item.reason}</span><span>{new Date(item.createdAt).toLocaleString()}</span><span className="nhen-pill">{item.status.toUpperCase()}</span></div><p>{item.details||"No additional details supplied."}</p><code>{item.targetId}</code><div className="nhen-mod-actions"><button disabled={busy===item.id} onClick={()=>void updateReport(item.id,"reviewing")}>Mark reviewing</button><button disabled={busy===item.id} onClick={()=>void updateReport(item.id,"resolved")}>Resolve</button><button disabled={busy===item.id} onClick={()=>void updateReport(item.id,"dismissed")}>Dismiss</button></div></article>):<div className="nhen-empty-state">No open reports. Nice and quiet.</div>}</div>}
 </section>;
}

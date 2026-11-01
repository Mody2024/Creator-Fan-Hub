import {redirect} from "next/navigation";
import Link from "next/link";
import AnalyticsExport from "./analytics-export";
import {createSupabaseServerClient} from "@/lib/supabase/server";
type Metric={media_id:string;title:string;view_count:number;reaction_count:number;comment_count:number;published_at:string|null};
export const dynamic="force-dynamic";
export default async function CreatorAnalyticsPage(){
 const supabase=await createSupabaseServerClient();if(!supabase)redirect("/creator/login");
 const {data:claims}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(typeof userId!=="string")redirect("/creator/login");
 const {data:admin}=await supabase.from("creator_admins").select("role").eq("user_id",userId).eq("active",true).maybeSingle();
 if(!admin||!["owner","admin","editor","analyst"].includes(admin.role))redirect("/creator?access=analytics-only");
 const {data,error}=await supabase.rpc("get_creator_video_analytics");const metrics=(data??[]) as Metric[];
 const rankedMetrics=[...metrics].sort((a,b)=>Number(b.view_count)-Number(a.view_count));
 const totals=metrics.reduce((a,m)=>({views:a.views+Number(m.view_count),reactions:a.reactions+Number(m.reaction_count),comments:a.comments+Number(m.comment_count)}),{views:0,reactions:0,comments:0});
 return <main className="dashboard-shell"><header className="dashboard-topbar"><Link className="wordmark nhen-wordmark" href="/creator"><span className="nhen-wordmark-copy"><strong>Nhen?</strong><small lang="ar" dir="rtl">نهين؟</small></span></Link><span className="admin-session"><i/> PERFORMANCE / READ ONLY</span><Link className="logout-button" href="/creator">Back to Studio ↗</Link></header><div className="dashboard-content"><div className="dashboard-welcome"><div><span className="eyebrow">NHEN? / ANALYTICS</span><h1>Understand the <em>response.</em></h1><p>Aggregate performance for official videos. Viewer identities are not exposed.</p></div><span className="draft-badge">● PRIVATE ANALYTICS</span></div>
 <div className="nhen-analytics-tools"><p>Export a portable CSV snapshot for your own reporting. Only aggregate video totals are included.</p><AnalyticsExport metrics={rankedMetrics.map(m=>({title:m.title,views:Number(m.view_count),reactions:Number(m.reaction_count),comments:Number(m.comment_count),publishedAt:m.published_at}))}/></div>
 <section className="dashboard-stats"><article><span>UNIQUE MEMBER VIEWS</span><strong>{totals.views.toLocaleString()}</strong><small>One count per signed-in member per video</small></article><article><span>REACTIONS</span><strong>{totals.reactions.toLocaleString()}</strong><small>All official video reactions</small></article><article><span>APPROVED COMMENTS</span><strong>{totals.comments.toLocaleString()}</strong><small>Published member comments</small></article></section>
 <section className="nhen-card nhen-card-pad nhen-analytics-table"><div className="nhen-card-heading"><h2>Video performance</h2><span className="nhen-pill">{metrics.length} videos</span></div>{error&&<p className="nhen-muted">Analytics are temporarily unavailable.</p>}{rankedMetrics.length?rankedMetrics.map(m=><article key={m.media_id}><div><strong>{m.title}</strong><small>{m.published_at?new Date(m.published_at).toLocaleDateString():"Draft"}</small></div><span><b>{m.view_count}</b> views</span><span><b>{m.reaction_count}</b> reactions</span><span><b>{m.comment_count}</b> comments</span></article>):<div className="nhen-empty-state">Publish your first video to start building performance insights.</div>}</section>
 </div></main>;
}

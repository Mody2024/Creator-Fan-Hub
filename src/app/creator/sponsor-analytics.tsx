"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Delivery={source_type:string;event_type:string;provider_key:string;event_count:number};
type Revenue={currency:string;status:string;provider_key:string;net_received:string|number;creator_share_received:string|number;creator_share_unconfirmed:string|number;records:number};
type Report={scope:string;campaigns:{total:number;active:number;paused:number;drafts:number};delivery:Delivery[];external_network_revenue:Revenue[];contract_sponsorship_reporting:string;platform_campaigns_excluded:boolean;viewer_identity_data_exposed:boolean};
const money=(value:string|number,currency:string)=>new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(Number(value)||0);

export default function SponsorAnalytics({mediaId}:{mediaId:string}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [report,setReport]=useState<Report|null>(null);
 const [status,setStatus]=useState("Sponsorship reporting is available after the analytics migration is applied.");
 const [busy,setBusy]=useState(false);
 const load=useCallback(async()=>{
  if(!supabase||!mediaId){setStatus("Analytics are unavailable.");return}
  setBusy(true);
  const {data,error}=await supabase.rpc("raye2_creator_sponsorship_analytics",{p_media_id:mediaId});
  if(error){setStatus("Sponsorship analytics are not available yet. Apply the creator analytics migration and retry.");setReport(null)}
  else {setReport(data as Report);setStatus("Aggregate reporting only. No viewer identities are exposed.")}
  setBusy(false);
 },[supabase,mediaId]);
 useEffect(()=>{void load()},[load]);
 return <section className="nhen-card nhen-card-pad raye2-sponsor-analytics" aria-label="Sponsorship analytics">
  <div className="nhen-card-heading"><div><span className="eyebrow">RAYE2 / SPONSOR INSIGHTS</span><h3>Sponsorship performance</h3></div><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void load()}>Refresh</button></div>
  {report&&<>
   <div className="dashboard-stats">
    <article><span>CAMPAIGNS</span><strong>{report.campaigns.total}</strong><small>{report.campaigns.active} active · {report.campaigns.paused} paused · {report.campaigns.drafts} drafts</small></article>
    <article><span>DELIVERY EVENTS</span><strong>{report.delivery.reduce((sum,item)=>sum+Number(item.event_count),0).toLocaleString()}</strong><small>Recorded events, not unique viewers</small></article>
   </div>
   <h4>Delivery activity</h4>
   {report.delivery.length?<div className="nhen-playlist-list">{report.delivery.map((item,index)=><article className="nhen-playlist-row" key={item.source_type+item.event_type+item.provider_key+index}><span><strong>{item.event_type.replaceAll("_"," ")}</strong><small>{item.source_type.replaceAll("_"," ")} · {item.provider_key}</small></span><b>{Number(item.event_count).toLocaleString()}</b></article>)}</div>:<p className="nhen-muted">No delivery events have been recorded.</p>}
   <h4>External-network revenue</h4>
   {report.external_network_revenue.length?report.external_network_revenue.map((item,index)=><article className="nhen-playlist-row" key={item.currency+item.status+item.provider_key+index}>
    <span><strong>{item.currency} · {item.status.replaceAll("_"," ")}</strong><small>{item.provider_key} · {item.records} ledger records · net {money(item.net_received,item.currency)}</small><small>Creator share received: {money(item.creator_share_received,item.currency)} · Unconfirmed: {money(item.creator_share_unconfirmed,item.currency)}</small></span>
   </article>):<p className="nhen-muted">No external-network revenue records. No earnings are assumed.</p>}
   <p className="nhen-muted">Creator-contracted sponsors show delivery activity only, not attributed payouts. Raye2 platform-wide campaigns are excluded. Estimated and provider-reported values are not money received.</p>
  </>}
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>
}

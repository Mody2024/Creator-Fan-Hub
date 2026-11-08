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
 const exportReport=useCallback(()=>{
  if(!report)return;
  const safeCell=(value:string|number)=>{let text=String(value??"");if(/^[\s]*[=+\-@]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
  const rows:string[][]=[
   ["Section","Metric","Category","Provider","Currency","Status","Value","Records"],
   ["Campaigns","Total","","","","",""+report.campaigns.total,""],
   ["Campaigns","Active","","","","",""+report.campaigns.active,""],
   ["Campaigns","Paused","","","","",""+report.campaigns.paused,""],
   ["Campaigns","Drafts","","","","",""+report.campaigns.drafts,""],
   ...report.delivery.map(item=>["Delivery events",item.event_type,item.source_type,item.provider_key,"","",""+Number(item.event_count),""]),
   ...report.external_network_revenue.flatMap(item=>[
    ["External revenue","Net received","",item.provider_key,item.currency,item.status,""+Number(item.net_received)," "+item.records],
    ["External revenue","Creator share received","",item.provider_key,item.currency,item.status,""+Number(item.creator_share_received)," "+item.records],
    ["External revenue","Creator share unconfirmed","",item.provider_key,item.currency,item.status,""+Number(item.creator_share_unconfirmed)," "+item.records]
   ])
  ];
  const csv="\uFEFF"+rows.map(row=>row.map(safeCell).join(",")).join("\r\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement("a");
  anchor.href=url;anchor.download="raye2-sponsorship-analytics.csv";
  document.body.appendChild(anchor);anchor.click();anchor.remove();
  URL.revokeObjectURL(url);
  setStatus("Aggregate sponsorship report exported. No viewer identities were included.");
 },[report]);
 useEffect(()=>{void load()},[load]);
 return <section className="nhen-card nhen-card-pad raye2-sponsor-analytics" aria-label="Sponsorship analytics">
  <div className="nhen-card-heading"><div><span className="eyebrow">RAYE2 / SPONSOR INSIGHTS</span><h3>Sponsorship performance</h3></div><div className="nhen-inline-actions"><button type="button" className="button button-secondary" disabled={busy} onClick={()=>void load()}>Refresh</button><button type="button" className="button button-secondary" disabled={!report} onClick={exportReport}>Export CSV</button></div></div>
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

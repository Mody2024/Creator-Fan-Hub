"use client";
import {useCallback,useEffect,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
type Revenue={source_type:string;currency:string;status:string;provider_key:string;records:number;gross_amount:number|string;net_received:number|string;verified_received:number|string;unconfirmed_net:number|string;platform_share_received:number|string;creator_share_received:number|string};
type Delivery={source_type:string;inventory:string;event_type:string;event_count:number};
type Counts={total:number;active:number;paused:number;draft:number};
type Report={scope:string;revenue_by_source_currency_status:Revenue[];delivery_by_source_event:Delivery[];campaign_counts:{creator_contract:Counts;platform:Counts};payment_execution_enabled:boolean;viewer_identity_data_exposed:boolean};
const money=(amount:number|string,currency:string)=>new Intl.NumberFormat(undefined,{style:"currency",currency,maximumFractionDigits:2}).format(Number(amount)||0);
const csvCell=(value:string|number)=>{let text=String(value??"");if(/^\\s*[=+@-]/.test(text))text="'"+text;return '"'+text.replace(/"/g,'""')+'"';};
export default function PlatformRevenueOverview(){
 const [report,setReport]=useState<Report|null>(null),[busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("Load aggregate sponsorship finance and delivery reporting.");
 const load=useCallback(async()=>{
  const supabase=getSupabaseBrowserClient();if(!supabase){setNotice("Supabase is not configured.");return}
  setBusy(true);
  try{const {data,error}=await supabase.rpc("raye2_admin_sponsor_financial_overview");if(error)throw error;setReport(data as Report);setNotice("Admin-only aggregate report. Received and unconfirmed amounts are separated; no payment is executed.");}
  catch(e){setReport(null);setNotice(e instanceof Error?e.message:"Could not load sponsor finance overview.");}
  finally{setBusy(false)}
 },[]);
 useEffect(()=>{void load()},[load]);
 const rows=report?.revenue_by_source_currency_status??[];
 const currencies=[...new Set(rows.map(r=>r.currency))];
 const exportCsv=()=>{
  if(!report)return;
  const header=["Section","Source","Currency","Status","Provider","Records","Gross","Net","Confirmed received","Unconfirmed net","Platform share received","Creator share received","Inventory","Event","Event count"];
  const revenueRows=rows.map(row=>["Revenue",row.source_type,row.currency,row.status,row.provider_key,row.records,row.gross_amount,row.net_received,row.verified_received,row.unconfirmed_net,row.platform_share_received,row.creator_share_received,"","", ""]);
  const deliveryRows=report.delivery_by_source_event.map(row=>["Delivery",row.source_type,"","","","","","","","","","",row.inventory,row.event_type,row.event_count]);
  const campaignRows=[
   ["Campaigns","creator_contract","","","","total="+report.campaign_counts.creator_contract.total,"","","","","","","","active="+report.campaign_counts.creator_contract.active,"paused="+report.campaign_counts.creator_contract.paused+"; draft="+report.campaign_counts.creator_contract.draft],
   ["Campaigns","platform","","","","total="+report.campaign_counts.platform.total,"","","","","","","","active="+report.campaign_counts.platform.active,"paused="+report.campaign_counts.platform.paused+"; draft="+report.campaign_counts.platform.draft]
  ];
  const csv="\\uFEFF"+[header,...revenueRows,...deliveryRows,...campaignRows].map(row=>row.map(csvCell).join(",")).join("\\r\\n");
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
  const url=URL.createObjectURL(blob);const anchor=document.createElement("a");
  anchor.href=url;anchor.download="raye2-platform-finance-and-delivery.csv";
  document.body.appendChild(anchor);anchor.click();anchor.remove();URL.revokeObjectURL(url);
  setNotice("Platform finance and delivery CSV exported. Currency groups remain separate; no payments were executed.");
 };
 return <section className="nhen-card nhen-card-pad" aria-busy={busy}>
  <div className="nhen-card-heading"><div><span className="eyebrow">RAYE2 / FINANCE CONTROL</span><h2>Platform sponsorship revenue</h2></div><div className="nhen-inline-actions"><button className="button button-secondary" type="button" disabled={busy} onClick={()=>void load()}>{busy?"Loading…":"Refresh"}</button><button className="button button-secondary" type="button" disabled={!report} onClick={exportCsv}>Export CSV</button></div></div>
  <p className="nhen-muted">Aggregate financial attribution across creator contracts, platform campaigns and external networks. This report never treats estimates as received money.</p>
  {report&&<>
   <div className="dashboard-stats">
    <article><span>Creator-contract campaigns</span><strong>{report.campaign_counts.creator_contract.total}</strong><small>{report.campaign_counts.creator_contract.active} active · {report.campaign_counts.creator_contract.draft} drafts</small></article>
    <article><span>Platform campaigns</span><strong>{report.campaign_counts.platform.total}</strong><small>{report.campaign_counts.platform.active} active · {report.campaign_counts.platform.draft} drafts</small></article>
    <article><span>Delivery events</span><strong>{report.delivery_by_source_event.reduce((sum,x)=>sum+Number(x.event_count),0).toLocaleString()}</strong><small>Recorded aggregate events</small></article>
   </div>
   <h3>Revenue by source and status</h3>
   {rows.length?rows.map((row,index)=><article className="nhen-playlist-row" key={row.source_type+row.currency+row.status+row.provider_key+index}>
    <span><strong>{row.source_type.replaceAll("_"," ")} · {row.currency} · {row.status.replaceAll("_"," ")}</strong><small>{row.provider_key} · {row.records} records · gross {money(row.gross_amount,row.currency)}</small><small>Net {money(row.net_received,row.currency)} · confirmed received {money(row.verified_received,row.currency)} · unconfirmed {money(row.unconfirmed_net,row.currency)}</small><small>Platform share received {money(row.platform_share_received,row.currency)} · creator share received {money(row.creator_share_received,row.currency)}</small></span>
   </article>):<p className="nhen-muted">No revenue ledger records yet. No earnings are assumed.</p>}
   <h3>Delivery activity</h3>
   {report.delivery_by_source_event.length?report.delivery_by_source_event.map((row,index)=><article className="nhen-playlist-row" key={row.source_type+row.inventory+row.event_type+index}><span><strong>{row.source_type.replaceAll("_"," ")} · {row.inventory} · {row.event_type.replaceAll("_"," ")}</strong></span><b>{Number(row.event_count).toLocaleString()}</b></article>):<p className="nhen-muted">No sponsor delivery events recorded.</p>}
   <p className="nhen-muted">Payment execution: disabled. Viewer identities exposed: no. Real payout integration requires a verified provider and reconciliation process.</p>
   {currencies.length>0&&<p className="nhen-muted">Amounts are grouped by currency and must not be added across currencies.</p>}
  </>}
  <p className="editor-status" role="status" aria-live="polite">{notice}</p>
 </section>;
}

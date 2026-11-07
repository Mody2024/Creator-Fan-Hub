"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";

type Asset={media_id:string;title:string;media_type:string;is_published:boolean};
type Campaign={id:string;sponsor_name:string;disclosure_text:string;placement:string;category_key:string;category_exclusive:boolean;priority:number;max_per_viewer:number;starts_at:string|null;ends_at:string|null;status:string;allowed_regions:string[]};

export default function PlatformSponsorManagement(){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [assets,setAssets]=useState<Asset[]>([]);
 const [campaigns,setCampaigns]=useState<Campaign[]>([]);
 const [name,setName]=useState("");
 const [assetId,setAssetId]=useState("");
 const [disclosure,setDisclosure]=useState("Sponsored");
 const [placement,setPlacement]=useState("intro");
 const [category,setCategory]=useState("general");
 const [exclusive,setExclusive]=useState(false);
 const [priority,setPriority]=useState("50");
 const [frequency,setFrequency]=useState("1");
 const [regions,setRegions]=useState("");
 const [videos,setVideos]=useState(true);
 const [live,setLive]=useState(false);
 const [starts,setStarts]=useState("");
 const [ends,setEnds]=useState("");
 const [busy,setBusy]=useState(false);
 const [notice,setNotice]=useState("Platform-wide campaigns are managed separately from creator-contracted sponsors. Configuration only; automatic delivery is not enabled.");

 const load=useCallback(async()=>{
  if(!supabase)return;
  const [media,campaign]=await Promise.all([
   supabase.rpc("get_creator_media",{p_limit:200}),
   supabase.from("raye2_platform_sponsor_campaigns").select("id,sponsor_name,disclosure_text,placement,category_key,category_exclusive,priority,max_per_viewer,starts_at,ends_at,status,allowed_regions").order("priority",{ascending:false}).order("created_at",{ascending:false})
  ]);
  if(!media.error)setAssets(((media.data??[]) as Asset[]).filter(x=>x.is_published&&(x.media_type==="image"||x.media_type==="video")));
  if(campaign.error)setNotice("Platform sponsor settings are unavailable until the free Raye2 sponsorship migration is applied.");
  else setCampaigns((campaign.data??[]) as Campaign[]);
 },[supabase]);

 useEffect(()=>{void load()},[load]);

 async function create(){
  if(!supabase||busy)return;
  if(name.trim().length<2||!assetId||!videos&&!live){setNotice("Add a sponsor name, choose a published creative and select at least one eligible inventory type.");return}
  if(!disclosure.trim()||disclosure.trim().length<3){setNotice("Add a clear sponsorship disclosure.");return}
  if(starts&&ends&&new Date(ends)<=new Date(starts)){setNotice("The end date must be after the start date.");return}
  setBusy(true);
  try{
   const {data:user,error:userError}=await supabase.auth.getUser();
   if(userError||!user.user)throw new Error("Sign in again as a Raye2 admin.");
   const {error}=await supabase.from("raye2_platform_sponsor_campaigns").insert({
    created_by:user.user.id,sponsor_asset_media_id:assetId,sponsor_name:name.trim(),disclosure_text:disclosure.trim(),
    placement,campaign_scope:{videos,live},category_key:category.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"-").slice(0,40)||"general",
    category_exclusive:exclusive,priority:Number(priority),max_per_viewer:Number(frequency),
    allowed_regions:regions.split(",").map(x=>x.trim().toUpperCase()).filter(Boolean),
    starts_at:starts?new Date(starts+"T00:00:00").toISOString():null,
    ends_at:ends?new Date(ends+"T23:59:59").toISOString():null,status:"draft"
   });
   if(error)throw error;
   setName("");setAssetId("");setRegions("");setExclusive(false);setNotice("Platform campaign saved as a draft. It is not being delivered to videos or streams yet.");
   await load();
  }catch(error){setNotice(error instanceof Error?error.message:"Could not save the platform campaign.")}
  finally{setBusy(false)}
 }

 async function setStatus(row:Campaign){
  if(!supabase||busy)return;
  const next=row.status==="active"?"paused":"active";
  setBusy(true);
  try{
   const {error}=await supabase.from("raye2_platform_sponsor_campaigns").update({status:next}).eq("id",row.id);
   if(error)throw error;
   setNotice(next==="active"?"Campaign configuration marked active; automated delivery remains disabled.":"Platform campaign paused.");
   await load();
  }catch(error){setNotice(error instanceof Error?error.message:"Could not update campaign.")}
  finally{setBusy(false)}
 }

 return <section className="nhen-card nhen-card-pad raye2-platform-sponsor-management">
  <span className="eyebrow">RAYE2 / PLATFORM SPONSOR CAMPAIGNS</span>
  <h2>Platform-wide sponsor director setup</h2>
  <p className="nhen-muted">These campaigns belong to Raye2, not individual creators. Choose your own published image/video creative, eligible inventory, disclosure, category restrictions, priority, regions and frequency cap.</p>
  <div className="poll-create-form">
   <label>Sponsor / brand name<input value={name} onChange={e=>setName(e.target.value)} maxLength={120}/></label>
   <label>Published creative<select value={assetId} onChange={e=>setAssetId(e.target.value)}><option value="">Choose a published image or video…</option>{assets.map(a=><option key={a.media_id} value={a.media_id}>{a.title}</option>)}</select></label>
   <label>Viewer disclosure<input value={disclosure} onChange={e=>setDisclosure(e.target.value)} maxLength={240}/></label>
   <label>Preferred placement<select value={placement} onChange={e=>setPlacement(e.target.value)}><option value="intro">Before content</option><option value="midroll">Natural break</option><option value="outro">After content</option><option value="overlay">Overlay where supported</option></select></label>
   <label>Category key<input value={category} onChange={e=>setCategory(e.target.value)} maxLength={40}/></label>
   <label>Priority (1–100)<input type="number" min="1" max="100" value={priority} onChange={e=>setPriority(e.target.value)}/></label>
   <label>Frequency cap per viewer<select value={frequency} onChange={e=>setFrequency(e.target.value)}>{[1,2,3,4,5].map(x=><option key={x} value={x}>{x}</option>)}</select></label>
   <label>Allowed regions (comma-separated country codes)<input value={regions} onChange={e=>setRegions(e.target.value)} placeholder="EG, SA, AE"/></label>
   <label>Campaign starts<input type="date" value={starts} onChange={e=>setStarts(e.target.value)}/></label>
   <label>Campaign ends<input type="date" value={ends} onChange={e=>setEnds(e.target.value)}/></label>
   <label className="nhen-video-check"><input type="checkbox" checked={videos} onChange={e=>setVideos(e.target.checked)}/> Eligible for video inventory</label>
   <label className="nhen-video-check"><input type="checkbox" checked={live} onChange={e=>setLive(e.target.checked)}/> Eligible for live inventory (provider support required)</label>
   <label className="nhen-video-check"><input type="checkbox" checked={exclusive} onChange={e=>setExclusive(e.target.checked)}/> Exclusive within this sponsor category</label>
   <button className="button button-primary" type="button" disabled={busy||!assets.length} onClick={()=>void create()}>{busy?"Saving…":"Save platform campaign draft"}</button>
  </div>
  <div className="nhen-playlist-list">{campaigns.map(row=><article className="nhen-playlist-row" key={row.id}>
   <span><strong>{row.sponsor_name}</strong><small>{row.category_key} · priority {row.priority} · {row.placement} · {row.status}{row.category_exclusive?" · exclusive":""}</small></span>
   <button type="button" disabled={busy} onClick={()=>void setStatus(row)}>{row.status==="active"?"Pause":"Activate configuration"}</button>
  </article>)}</div>
  <p className="editor-status" role="status" aria-live="polite">{notice}</p>
 </section>
}

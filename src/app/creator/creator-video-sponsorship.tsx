"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
import SponsorBreakpointReview from "./sponsor-breakpoint-review";

type SponsorAsset={media_id:string;title:string;media_type:string;is_published:boolean};
type SponsorCampaign={id:string;sponsor_name:string;disclosure_text:string;placement:string;starts_at:string|null;ends_at:string|null;max_per_viewer:number;status:string;sponsor_asset_media_id:string};

export default function CreatorVideoSponsorship({mediaId,assets}:{mediaId:string;assets:SponsorAsset[]}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);
 const [rows,setRows]=useState<SponsorCampaign[]>([]);
 const [sponsorName,setSponsorName]=useState("");
 const [creativeId,setCreativeId]=useState("");
 const [disclosure,setDisclosure]=useState("Sponsored");
 const [placement,setPlacement]=useState("intro");
 const [starts,setStarts]=useState("");
 const [ends,setEnds]=useState("");
 const [frequency,setFrequency]=useState("1");
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("Creator-contracted sponsorship setup. Campaigns are saved as configuration; automatic ad delivery is not enabled yet.");
 const eligibleAssets=assets.filter(asset=>(asset.media_type==="video"||asset.media_type==="image")&&asset.is_published&&asset.media_id!==mediaId);

 const load=useCallback(async()=>{
  if(!supabase||!mediaId){setRows([]);return}
  const {data,error}=await supabase.from("raye2_creator_sponsor_campaigns")
   .select("id,sponsor_name,disclosure_text,placement,starts_at,ends_at,max_per_viewer,status,sponsor_asset_media_id")
   .eq("media_id",mediaId).order("created_at",{ascending:false});
  if(error){setStatus("Sponsorship settings are not available yet. Apply the Raye2 creator sponsorship migration before using this section.");return}
  setRows((data??[]) as SponsorCampaign[]);
 },[supabase,mediaId]);

 useEffect(()=>{void load()},[load]);

 async function createCampaign(){
  if(!supabase||!mediaId||busy)return;
  if(sponsorName.trim().length<2){setStatus("Enter the sponsor or brand name.");return}
  if(!creativeId){setStatus("Choose a published sponsor image or video from your media library.");return}
  if(disclosure.trim().length<3){setStatus("Add a clear sponsorship disclosure.");return}
  if(!confirmed){setStatus("Confirm that you have permission to use the sponsor name and creative.");return}
  if(starts&&ends&&new Date(ends)<=new Date(starts)){setStatus("The end date must be after the start date.");return}
  setBusy(true);
  try{
   const {data:userData,error:userError}=await supabase.auth.getUser();
   if(userError||!userData.user)throw new Error("Sign in again to save sponsorship settings.");
   const {error}=await supabase.from("raye2_creator_sponsor_campaigns").insert({
    creator_id:userData.user.id,media_id:mediaId,sponsor_asset_media_id:creativeId,
    sponsor_name:sponsorName.trim(),disclosure_text:disclosure.trim(),placement,
    starts_at:starts?new Date(starts+"T00:00:00").toISOString():null,
    ends_at:ends?new Date(ends+"T23:59:59").toISOString():null,
    max_per_viewer:Number(frequency),status:"draft",creator_confirmed_rights:true
   });
   if(error)throw error;
   setSponsorName("");setCreativeId("");setDisclosure("Sponsored");setStarts("");setEnds("");setFrequency("1");setConfirmed(false);
   setStatus("Sponsor campaign saved as a draft. It is not being inserted into playback yet.");
   await load();
  }catch(error){setStatus(error instanceof Error?error.message:"Could not save sponsorship settings.")}
  finally{setBusy(false)}
 }

 async function changeStatus(row:SponsorCampaign){
  if(!supabase||busy)return;
  const next=row.status==="active"?"paused":"active";
  setBusy(true);
  try{
   const {error}=await supabase.from("raye2_creator_sponsor_campaigns").update({status:next}).eq("id",row.id);
   if(error)throw error;
   setStatus(next==="paused"?"Campaign paused.":"Campaign configuration marked active; playback delivery is still disabled until the ad director is implemented.");
   await load();
  }catch(error){setStatus(error instanceof Error?error.message:"Could not update campaign.")}
  finally{setBusy(false)}
 }

 return <section className="nhen-card nhen-card-pad raye2-sponsor-setup" aria-label="Creator sponsorship setup">
  <span className="eyebrow">CREATOR DEALS / SPONSOR SETUP</span>
  <h3>Attach your own sponsor to this video</h3>
  <p className="nhen-muted">Add the sponsor you contracted with, choose its approved video creative and set placement preferences. Your sponsor settings stay separate from Raye2 platform campaigns.</p>
  <div className="poll-create-form">
   <label>Sponsor / brand name<input value={sponsorName} onChange={event=>setSponsorName(event.target.value)} maxLength={120} placeholder="Brand name"/></label>
   <label>Published sponsor video<select value={creativeId} onChange={event=>setCreativeId(event.target.value)}><option value="">Choose a published sponsor creative…</option>{eligibleAssets.map(asset=><option key={asset.media_id} value={asset.media_id}>{asset.title}</option>)}</select></label>
   <label>Disclosure shown to viewers<input value={disclosure} onChange={event=>setDisclosure(event.target.value)} maxLength={240} placeholder="Sponsored by …"/></label>
   <label>Preferred placement<select value={placement} onChange={event=>setPlacement(event.target.value)}><option value="intro">Before the video</option><option value="midroll">Natural mid-video break</option><option value="outro">After the video</option><option value="overlay">Overlay (where supported)</option></select></label>
   <label>Campaign starts<input type="date" value={starts} onChange={event=>setStarts(event.target.value)}/></label>
   <label>Campaign ends<input type="date" value={ends} onChange={event=>setEnds(event.target.value)}/></label>
   <label>Maximum planned exposures per viewer<select value={frequency} onChange={event=>setFrequency(event.target.value)}>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
   <label className="nhen-video-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> I have permission to use this sponsor's name, logo and video creative.</label>
   <button className="button button-secondary" type="button" disabled={busy||!mediaId||!eligibleAssets.length} onClick={()=>void createCampaign()}>{busy?"Saving…":"Save sponsor campaign draft"}</button>
  </div>
  <div className="nhen-playlist-list">
   {rows.map(row=><article className="nhen-playlist-row" key={row.id}>
    <span><strong>{row.sponsor_name}</strong><small>{row.placement} · {row.status} · max {row.max_per_viewer} planned exposures</small></span>
    <button type="button" disabled={busy} onClick={()=>void changeStatus(row)}>{row.status==="active"?"Pause":"Activate configuration"}</button>
   <SponsorBreakpointReview campaignId={row.id}/></article>)}
   {!rows.length&&<p className="nhen-muted">No sponsor campaigns are attached to this video yet.</p>}
  </div>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>
}

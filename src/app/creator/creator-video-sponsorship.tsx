"use client";

import {useCallback,useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
import SponsorBreakpointReview from "./sponsor-breakpoint-review";
import SponsorCreativeVariants from "./sponsor-creative-variants";
import SponsorBreakpointPreview from "./sponsor-breakpoint-preview";
import SponsorAnalytics from "./sponsor-analytics";

type SponsorAsset={media_id:string;title:string;media_type:string;is_published:boolean};
type SponsorCampaign={id:string;sponsor_name:string;disclosure_text:string;placement:string;starts_at:string|null;ends_at:string|null;max_per_viewer:number;status:string;sponsor_asset_media_id:string;category_key:string;category_exclusive:boolean};

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
 const [category,setCategory]=useState("general");
 const [exclusive,setExclusive]=useState(false);
 const [editingCampaignId,setEditingCampaignId]=useState<string|null>(null);
 const [confirmed,setConfirmed]=useState(false);
 const [busy,setBusy]=useState(false);
 const [status,setStatus]=useState("Creator-contracted sponsorship setup. Playback delivery is still disabled; automatic ad delivery is not enabled yet.");
 const eligibleAssets=assets.filter(asset=>(asset.media_type==="video"||asset.media_type==="image")&&asset.is_published&&asset.media_id!==mediaId);

 const load=useCallback(async()=>{
  if(!supabase||!mediaId){setRows([]);return}
  const {data,error}=await supabase.from("raye2_creator_sponsor_campaigns")
   .select("id,sponsor_name,disclosure_text,placement,starts_at,ends_at,max_per_viewer,status,sponsor_asset_media_id,category_key,category_exclusive")
   .eq("media_id",mediaId).order("created_at",{ascending:false});
  if(error){setStatus("Sponsorship settings are not available yet. Apply the Raye2 creator sponsorship migration before using this section.");return}
  setRows((data??[]) as SponsorCampaign[]);
 },[supabase,mediaId]);

 useEffect(()=>{void load()},[load]);

 function clearForm(){
  setEditingCampaignId(null);setSponsorName("");setCreativeId("");setDisclosure("Sponsored");setStarts("");setEnds("");setFrequency("1");setCategory("general");setExclusive(false);setConfirmed(false);
 }

 function editDraft(row:SponsorCampaign){
  if(row.status!=="draft")return;
  setEditingCampaignId(row.id);setSponsorName(row.sponsor_name);setCreativeId(row.sponsor_asset_media_id);
  setDisclosure(row.disclosure_text);setPlacement(row.placement);setStarts(row.starts_at?.slice(0,10)??"");
  setEnds(row.ends_at?.slice(0,10)??"");setFrequency(String(row.max_per_viewer));setCategory(row.category_key);
  setExclusive(row.category_exclusive);setConfirmed(true);
  setStatus("Editing an unused draft. Saving changes will not enable playback.");
 }

 async function deleteDraft(row:SponsorCampaign){
  if(!supabase||busy)return;
  if(row.status!=="draft"){setStatus("Only unused draft campaigns can be deleted. Pause active campaigns first; delivery history is preserved.");return}
  if(!window.confirm("Delete this unused sponsor draft? This cannot be undone."))return;
  setBusy(true);
  try{
   const {data:userData,error:userError}=await supabase.auth.getUser();
   if(userError||!userData.user)throw new Error("Sign in again to delete this draft.");
   const {data,error}=await supabase.from("raye2_creator_sponsor_campaigns").delete()
    .eq("id",row.id).eq("creator_id",userData.user.id).eq("status","draft").select("id").maybeSingle();
   if(error)throw error;
   if(!data)throw new Error("This draft is no longer available to delete.");
   if(editingCampaignId===row.id)clearForm();
   setStatus("Unused draft deleted. Campaigns with delivery history are preserved.");
   await load();
  }catch(error){setStatus(error instanceof Error?error.message:"Could not delete sponsor draft.")}
  finally{setBusy(false)}
 }

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
   const payload={
    sponsor_asset_media_id:creativeId,sponsor_name:sponsorName.trim(),disclosure_text:disclosure.trim(),placement,
    starts_at:starts?new Date(starts+"T00:00:00").toISOString():null,
    ends_at:ends?new Date(ends+"T23:59:59").toISOString():null,
    max_per_viewer:Number(frequency),category_key:category.trim().toLowerCase().replace(/[^a-z0-9_-]/g,"-").slice(0,40)||"general",category_exclusive:exclusive,creator_confirmed_rights:true
   };
   if(editingCampaignId){
    const {data,error}=await supabase.from("raye2_creator_sponsor_campaigns").update(payload)
     .eq("id",editingCampaignId).eq("creator_id",userData.user.id).eq("media_id",mediaId).eq("status","draft").select("id").maybeSingle();
    if(error)throw error;
    if(!data)throw new Error("This draft is no longer available to edit.");
   }else{
    const {error}=await supabase.from("raye2_creator_sponsor_campaigns").insert({...payload,creator_id:userData.user.id,media_id:mediaId,status:"draft"});
    if(error)throw error;
   }
   clearForm();
   setStatus(editingCampaignId?"Sponsor draft updated. Playback remains disabled.":"Sponsor campaign saved as a draft. It is not being inserted into playback yet.");
   await load();
  }catch(error){setStatus(error instanceof Error?error.message:"Could not save sponsorship settings.")}
  finally{setBusy(false)}
 }

 async function changeStatus(row:SponsorCampaign){
  if(!supabase||busy)return;
  if(row.status!=="active"){
   setStatus("Activation is locked until Raye2 has a verified ad-delivery and impression-measurement pipeline. This campaign remains a draft and will not be shown to viewers.");
   return;
  }
  setBusy(true);
  try{
   const {error}=await supabase.from("raye2_creator_sponsor_campaigns").update({status:"paused"}).eq("id",row.id);
   if(error)throw error;
   setStatus("Campaign paused. It will not be eligible for delivery.");
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
   <label>Published sponsor image or video<select value={creativeId} onChange={event=>setCreativeId(event.target.value)}><option value="">Choose a published sponsor image/video…</option>{eligibleAssets.map(asset=><option key={asset.media_id} value={asset.media_id}>{asset.title}</option>)}</select></label>
   <label>Disclosure shown to viewers<input value={disclosure} onChange={event=>setDisclosure(event.target.value)} maxLength={240} placeholder="Sponsored by …"/></label>
   <label>Preferred placement<select value={placement} onChange={event=>setPlacement(event.target.value)}><option value="intro">Before the video</option><option value="midroll">Natural mid-video break</option><option value="outro">After the video</option><option value="overlay">Overlay (where supported)</option></select></label>
   <label>Campaign starts<input type="date" value={starts} onChange={event=>setStarts(event.target.value)}/></label>
   <label>Campaign ends<input type="date" value={ends} onChange={event=>setEnds(event.target.value)}/></label>
   <label>Contract category key<input value={category} onChange={event=>setCategory(event.target.value)} maxLength={40} placeholder="e.g. games"/></label>
   <label className="nhen-video-check"><input type="checkbox" checked={exclusive} onChange={event=>setExclusive(event.target.checked)}/> This sponsor has category exclusivity for this video</label>
   <label>Maximum planned exposures per viewer<select value={frequency} onChange={event=>setFrequency(event.target.value)}>{[1,2,3,4,5].map(value=><option key={value} value={value}>{value}</option>)}</select></label>
   <label className="nhen-video-check"><input type="checkbox" checked={confirmed} onChange={event=>setConfirmed(event.target.checked)}/> I have permission to use this sponsor&apos;s name, logo and video creative.</label>
   <div className="nhen-inline-actions"><button className="button button-secondary" type="button" disabled={busy||!mediaId||!eligibleAssets.length} onClick={()=>void createCampaign()}>{busy?"Saving…":editingCampaignId?"Save draft changes":"Save sponsor campaign draft"}</button>{editingCampaignId&&<button className="button button-secondary" type="button" disabled={busy} onClick={clearForm}>Cancel editing</button>}</div>
  </div>
  <div className="nhen-playlist-list">
   {rows.map(row=><article className="nhen-playlist-row" key={row.id}>
    <span><strong>{row.sponsor_name}</strong><small>{row.placement} · {row.status} · {row.category_key}{row.category_exclusive?" · exclusive":""} · max {row.max_per_viewer} planned exposures</small></span>
    <div className="nhen-inline-actions">{row.status==="active"?<button type="button" disabled={busy} onClick={()=>void changeStatus(row)}>Pause</button>:<><button type="button" disabled={busy||row.status!=="draft"} onClick={()=>editDraft(row)}>Edit draft</button><button type="button" disabled={busy||row.status!=="draft"} onClick={()=>void deleteDraft(row)}>Delete unused draft</button></>}</div>
   <SponsorCreativeVariants campaignId={row.id} campaignType="creator" assets={assets}/><SponsorBreakpointReview campaignId={row.id}/><SponsorBreakpointPreview campaignId={row.id}/></article>)}
   {!rows.length&&<p className="nhen-muted">No sponsor campaigns are attached to this video yet.</p>}
  </div>
  <SponsorAnalytics mediaId={mediaId}/>
  <p className="editor-status" role="status" aria-live="polite">{status}</p>
 </section>
}

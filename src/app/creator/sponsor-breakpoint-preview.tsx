"use client";

import {useState} from "react";

type Preview={
 previewOnly:true;deliveryEnabled:false;durationSeconds:number;
 campaign:{sponsorName:string;placement:string;status:string;categoryKey:string;categoryExclusive:boolean;maxPerViewer:number};
 proposedBreakpoints:{atSeconds:number;resumeContextFromSeconds:number;source:string;score:number}[];
 creativeVariants:{id:string;media_id:string;variant_key:string;active:boolean}[];
 limitations:string[];
};
export default function SponsorBreakpointPreview({campaignId}:{campaignId:string}){
 const [preview,setPreview]=useState<Preview|null>(null);
 const [busy,setBusy]=useState(false);
 const [message,setMessage]=useState("Generate a private preview from your saved creator review markers.");
 async function generate(){
  if(busy)return;
  setBusy(true);setMessage("Preparing your private preview…");setPreview(null);
  try{
   const response=await fetch("/api/creator/sponsorship/preview",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({campaignId}),cache:"no-store"});
   const result=await response.json();
   if(!response.ok)throw new Error(typeof result.error==="string"?result.error:"Could not generate preview.");
   setPreview(result as Preview);setMessage("Preview generated. No advertisement was loaded or played.");
  }catch(error){setMessage(error instanceof Error?error.message:"Preview unavailable.")}
  finally{setBusy(false)}
 }
 return <section className="raye2-sponsor-preview" aria-label="Sponsorship placement preview">
  <div className="poll-create-form">
   <button className="button button-secondary" type="button" disabled={busy} onClick={()=>void generate()}>{busy?"Preparing…":"Preview reviewed breakpoints"}</button>
  </div>
  {preview&&<div className="nhen-playlist-list">
   <p><strong>Private review preview</strong> · {Math.floor(preview.durationSeconds/60)}:{String(preview.durationSeconds%60).padStart(2,"0")} total video length</p>
   {preview.proposedBreakpoints.length?preview.proposedBreakpoints.map(point=><article className="nhen-playlist-row" key={point.atSeconds}>
    <span><strong>{Math.floor(point.atSeconds/60)}:{String(point.atSeconds%60).padStart(2,"0")}</strong><small>Creator-approved candidate · score {point.score.toFixed(2)} · optional context starts at {Math.floor(point.resumeContextFromSeconds/60)}:{String(point.resumeContextFromSeconds%60).padStart(2,"0")}</small></span>
   </article>):<p className="nhen-muted">No suitable reviewed breakpoints yet. Add approved timestamps above, leaving dialogue and important moments uninterrupted.</p>}
   <p className="nhen-muted">Available creative versions: {preview.creativeVariants.length}. They are listed for review and are not selected for playback.</p>
   <ul>{preview.limitations.map(item=><li key={item}>{item}</li>)}</ul>
  </div>}
  <p className="editor-status" role="status" aria-live="polite">{message}</p>
 </section>
}

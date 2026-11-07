/**
 * Live sponsorship safety gate. This is a policy decision only, not a provider adapter.
 * No live insertion is authorized unless the provider explicitly exposes it and a
 * separately deployed, verified adapter is declared ready.
 */
const SAFE_BREAKS=new Set(["streamer_declared_break","intermission","round_break","loading_transition"]);
const bool=(value)=>value===true;

/**
 * @param {{provider?:string,providerCapabilities?:{liveMidroll?:boolean,dvrReplay?:boolean},adapterReady?:boolean,streamState?:string,breakType?:string,streamerDeclared?:boolean,creatorCampaignEligible?:boolean,viewerFrequencyAllowed?:boolean,disclosureReady?:boolean,contextReplaySeconds?:number}} input
 */
export function evaluateLiveSponsorInsertion(input={}) {
 const reasons=[];
 if(!input.provider)reasons.push("provider_missing");
 if(!bool(input.providerCapabilities?.liveMidroll))reasons.push("provider_midroll_unsupported");
 if(!bool(input.adapterReady))reasons.push("verified_adapter_unavailable");
 if(input.streamState!=="live")reasons.push("stream_not_live");
 if(!SAFE_BREAKS.has(input.breakType))reasons.push("unsafe_break_type");
 if(input.breakType==="streamer_declared_break"&&!bool(input.streamerDeclared))reasons.push("break_not_streamer_declared");
 if(!bool(input.creatorCampaignEligible))reasons.push("creator_campaign_not_eligible");
 if(!bool(input.viewerFrequencyAllowed))reasons.push("frequency_cap_reached");
 if(!bool(input.disclosureReady))reasons.push("disclosure_missing");
 const permitted=reasons.length===0;
 const replay=Number(input.contextReplaySeconds??0);
 const contextReplaySeconds=permitted&&bool(input.providerCapabilities?.dvrReplay)&&Number.isFinite(replay)
  ?Math.max(0,Math.min(5,replay)):0;
 return {
  permitted,
  action:"no_insertion",
  insertionRequestAllowed:permitted,
  contextReplaySeconds,
  reasons
 };
}

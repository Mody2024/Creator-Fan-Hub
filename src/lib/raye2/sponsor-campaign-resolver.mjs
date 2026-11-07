/**
 * Resolves eligible Raye2 sponsor configurations without delivering ads.
 * Creator-contracted campaigns are evaluated first for the video they belong to.
 * Platform campaigns cannot override an eligible creator category exclusivity.
 * External ad-network inventory is intentionally outside this resolver.
 */
const activeAt=(campaign,now)=>{
 if(campaign.status!=="active")return false;
 const start=campaign.startsAt?Date.parse(campaign.startsAt):-Infinity;
 const end=campaign.endsAt?Date.parse(campaign.endsAt):Infinity;
 return Number.isFinite(now)&&start<=now&&now<=end;
};
const allowedRegion=(campaign,region)=>{
 const regions=Array.isArray(campaign.allowedRegions)?campaign.allowedRegions:[];
 return regions.length===0 || (typeof region==="string"&&regions.includes(region.toUpperCase()));
};
const withinFrequency=(campaign,seen)=>{
 const count=Number(seen?.[campaign.id]??0);
 return Number.isFinite(count)&&count<Math.max(1,Math.min(5,Number(campaign.maxPerViewer)||1));
};

/**
 * @param {{now?:number,region?:string,inventory?:"video"|"live",creatorCampaigns?:any[],platformCampaigns?:any[],viewerFrequency?:Record<string,number>}} input
 */
export function resolveRaye2SponsorEligibility(input={}) {
 const now=Number(input.now??Date.now());
 const inventory=input.inventory==="live"?"live":"video";
 const region=input.region?.toUpperCase()??"";
 const seen=input.viewerFrequency??{};
 const creator=(input.creatorCampaigns??[]).filter(c=>
  activeAt(c,now)&&c.inventory===inventory&&allowedRegion(c,region)&&withinFrequency(c,seen)
 ).sort((a,b)=>(a.priority??100)-(b.priority??100));
 const platform=(input.platformCampaigns??[]).filter(c=>
  activeAt(c,now)&&c.inventory===inventory&&allowedRegion(c,region)&&withinFrequency(c,seen)
 ).filter(c=>!creator.some(own=>
  own.categoryExclusive&&own.categoryKey===c.categoryKey
 )).sort((a,b)=>(b.priority??50)-(a.priority??50));
 return {
  creatorCampaigns:creator,
  platformCampaigns:platform,
  blockedPlatformCampaignIds:(input.platformCampaigns??[])
   .filter(c=>creator.some(own=>own.categoryExclusive&&own.categoryKey===c.categoryKey))
   .map(c=>c.id),
  deliveryEnabled:false
 };
}

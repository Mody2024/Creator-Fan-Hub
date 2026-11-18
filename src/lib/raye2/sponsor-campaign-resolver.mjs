/**
 * Resolves eligible Raye2 sponsor configurations without delivering ads.
 * Creator-contracted campaigns are evaluated first; their category exclusivity
 * blocks matching eligible platform campaigns. External ad-network inventory is separate.
 */
const field=(campaign,camel,snake)=>campaign?.[camel]??campaign?.[snake];
const supportsInventory=(campaign,inventory)=>{
 if(campaign.inventory)return campaign.inventory===inventory;
 const scope=field(campaign,"campaignScope","campaign_scope");
 if(scope)return inventory==="video"?scope.videos===true:scope.live===true;
 return inventory==="video";
};
const activeAt=(campaign,now)=>{
 if(campaign.status!=="active")return false;
 const starts=field(campaign,"startsAt","starts_at");
 const ends=field(campaign,"endsAt","ends_at");
 const start=starts?Date.parse(starts):-Infinity;
 const end=ends?Date.parse(ends):Infinity;
 return Number.isFinite(now)&&start<=now&&now<=end;
};
const allowedRegion=(campaign,region)=>{
 const raw=field(campaign,"allowedRegions","allowed_regions");
 const regions=Array.isArray(raw)?raw:[];
 return regions.length===0||(typeof region==="string"&&regions.includes(region.toUpperCase()));
};
const withinFrequency=(campaign,seen)=>{
 const count=Number(seen?.[campaign.id]??0);
 const cap=field(campaign,"maxPerViewer","max_per_viewer");
 return Number.isFinite(count)&&count<Math.max(1,Math.min(5,Number(cap)||1));
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
  activeAt(c,now)&&supportsInventory(c,inventory)&&allowedRegion(c,region)&&withinFrequency(c,seen)
 ).sort((a,b)=>(a.priority??100)-(b.priority??100));
 const eligiblePlatform=(input.platformCampaigns??[]).filter(c=>
  activeAt(c,now)&&supportsInventory(c,inventory)&&allowedRegion(c,region)&&withinFrequency(c,seen)
 );
 const conflicts=c=>creator.some(own=>
  (own.categoryExclusive??own.category_exclusive)&&
  (own.categoryKey??own.category_key)===(c.categoryKey??c.category_key)
 );
 const blocked=eligiblePlatform.filter(conflicts);
 const platform=eligiblePlatform.filter(c=>!conflicts(c))
  .sort((a,b)=>(b.priority??50)-(a.priority??50));
 return {
  creatorCampaigns:creator,
  platformCampaigns:platform,
  blockedPlatformCampaignIds:blocked.map(c=>c.id),
  deliveryEnabled:false
 };
}

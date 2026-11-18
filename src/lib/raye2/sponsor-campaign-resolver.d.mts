export type Raye2SponsorInventory = "video" | "live" | "minis" | "community";
export type Raye2SponsorCampaign = {
 id:string;status:string;startsAt?:string|null;endsAt?:string|null;
 inventory?:Raye2SponsorInventory;
 campaignScope?:Partial<Record<"videos"|"live"|"minis"|"community",boolean>>;
 campaign_scope?:Partial<Record<"videos"|"live"|"minis"|"community",boolean>>;
 allowedRegions?:string[];allowed_regions?:string[];
 maxPerViewer?:number;max_per_viewer?:number;priority?:number;categoryKey?:string;
 category_key?:string;categoryExclusive?:boolean;category_exclusive?:boolean;
};
export function resolveRaye2SponsorEligibility(input?:{
 now?:number;region?:string;inventory?:Raye2SponsorInventory;
 creatorCampaigns?:Raye2SponsorCampaign[];platformCampaigns?:Raye2SponsorCampaign[];
 viewerFrequency?:Record<string,number>;
}):{
 creatorCampaigns:Raye2SponsorCampaign[];platformCampaigns:Raye2SponsorCampaign[];
 blockedPlatformCampaignIds:string[];deliveryEnabled:false;
};

export type Raye2SponsorInventory = "video" | "live";
export type Raye2SponsorCampaign = {
 id:string;status:string;startsAt?:string|null;endsAt?:string|null;
 inventory:Raye2SponsorInventory;allowedRegions?:string[];
 maxPerViewer?:number;priority?:number;categoryKey?:string;
 categoryExclusive?:boolean;
};
export function resolveRaye2SponsorEligibility(input?:{
 now?:number;region?:string;inventory?:Raye2SponsorInventory;
 creatorCampaigns?:Raye2SponsorCampaign[];platformCampaigns?:Raye2SponsorCampaign[];
 viewerFrequency?:Record<string,number>;
}):{
 creatorCampaigns:Raye2SponsorCampaign[];platformCampaigns:Raye2SponsorCampaign[];
 blockedPlatformCampaignIds:string[];deliveryEnabled:false;
};

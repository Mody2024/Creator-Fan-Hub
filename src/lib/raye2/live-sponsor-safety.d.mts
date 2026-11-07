export type LiveSponsorBreakType = "streamer_declared_break"|"intermission"|"round_break"|"loading_transition"|"gameplay"|"conversation"|"key_event";
export type LiveSponsorSafetyInput = {
 provider?:string;
 providerCapabilities?:{liveMidroll?:boolean;dvrReplay?:boolean};
 adapterReady?:boolean;streamState?:string;breakType?:LiveSponsorBreakType;
 streamerDeclared?:boolean;creatorCampaignEligible?:boolean;
 viewerFrequencyAllowed?:boolean;disclosureReady?:boolean;contextReplaySeconds?:number;
};
export function evaluateLiveSponsorInsertion(input?:LiveSponsorSafetyInput):{
 permitted:boolean;action:"no_insertion";insertionRequestAllowed:boolean;
 contextReplaySeconds:number;reasons:string[];
};

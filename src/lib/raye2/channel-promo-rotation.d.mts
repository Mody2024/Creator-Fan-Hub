export type Raye2PromoPlacement = "video" | "live" | "minis" | "community";
export type Raye2ChannelPromoInput = {
 id:string;title:string;url:string;description?:string;thumbnailUrl?:string|null;
 cta?:string;placements?:Raye2PromoPlacement[];active?:boolean;
};
export type Raye2ChannelPromo = {
 id:string;title:string;url:string;description:string;thumbnailUrl:string|null;
 label:"Featured channel";cta:string;placements:Raye2PromoPlacement[];active:boolean;
};
export function normalizeRaye2ChannelPromo(input?:Raye2ChannelPromoInput|null):Raye2ChannelPromo|null;
export function selectRaye2ChannelPromo(input?:{
 promos?:Raye2ChannelPromoInput[];placement?:Raye2PromoPlacement;
 recentPromoIds?:string[];random?:()=>number;
}):Raye2ChannelPromo|null;

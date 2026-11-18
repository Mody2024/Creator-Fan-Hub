import { createSupabaseServerClient } from "@/lib/supabase/server";
type SocialRow={id:string;label:string;url:string;platform:string;position:number};
function platformLabel(platform:string){const labels:Record<string,string>={youtube:"YouTube",kick:"Kick",tiktok:"TikTok",instagram:"Instagram",facebook:"Facebook",twitch:"Twitch",discord:"Discord",x:"X",custom:"Visit"};return labels[platform.toLowerCase()]??"Visit";}
export default async function PublicSocialLinks(){
 const supabase=await createSupabaseServerClient();if(!supabase)return null;
 const {data,error}=await supabase.from("social_links").select("id,label,url,platform,position").eq("is_published",true).order("position",{ascending:true}).limit(30);
 if(error||!data?.length)return null;
 const items=data as SocialRow[];
 return <section className="public-socials" id="socials"><div><span className="eyebrow">FIND THE COMMUNITY</span><h2>Meet us <em>elsewhere.</em></h2></div><div className="public-social-list">{items.map(item=><a key={item.id} href={item.url} target="_blank" rel="noopener noreferrer nofollow"><span className={"social-platform social-"+item.platform.toLowerCase()}>{platformLabel(item.platform)}</span><strong>{item.label}</strong><span aria-hidden="true">↗</span></a>)}</div></section>;
}
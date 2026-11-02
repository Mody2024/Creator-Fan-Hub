import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import Link from "next/link";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import NotificationsClient,{type Notice} from "./notifications-client";
export const dynamic="force-dynamic";
export default async function NotificationsPage(){
 const cookieStore=await cookies();const locale=cookieStore.get("nhen_locale")?.value==="ar"?"ar":"en";const isArabic=locale==="ar";
 const supabase=await createSupabaseServerClient();if(!supabase)redirect("/community#join");
 const {data:claims}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(typeof userId!=="string")redirect("/community#join");
 const {data}=await supabase.from("member_notifications").select("id,actor_id,notification_type,target_type,target_id,message,read_at,created_at").eq("recipient_id",userId).order("created_at",{ascending:false}).limit(100);
 const actorIds=[...new Set((data??[]).map(x=>x.actor_id).filter(Boolean))] as string[];
 const {data:profiles}=actorIds.length?await supabase.from("member_profiles").select("user_id,handle,display_name").in("user_id",actorIds):{data:[]};
 const map=new Map((profiles??[]).map(x=>[x.user_id,x]));
 const notices:Notice[]=(data??[]).map(x=>({id:x.id,type:x.notification_type,targetType:x.target_type,targetId:x.target_id,message:x.message,readAt:x.read_at,createdAt:x.created_at,actor:map.get(x.actor_id)?.display_name??"NHEN member",handle:map.get(x.actor_id)?.handle??null}));
 return <main className="nhen-profile-page" dir={isArabic?"rtl":"ltr"} lang={locale}><header className="nhen-watch-top"><Link className="nhen-brand" href="/">NHEN<span className="nhen-brand-mark">.</span></Link><nav><Link href="/community">{isArabic?"المجتمع":"Community"}</Link><Link href="/saved">{isArabic?"المحفوظات":"Saved"}</Link></nav></header><div className="nhen-notifications-wrap"><span className="nhen-section-label">{isArabic?"NHEN / صندوق الإشعارات":"NHEN IDENTITY / INBOX"}</span><h1>{isArabic?<>إشعاراتك <em>في نهين؟</em></>:<>Your <em>notifications.</em></>}</h1><p className="nhen-muted">{isArabic?"المتابعات والتفاعلات والنقاشات المعتمدة في مجتمعك.":"Follows, reactions and approved discussions from your NHEN community."}</p><NotificationsClient initialNotices={notices} locale={locale}/></div></main>
}

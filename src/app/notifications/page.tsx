import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import "./raye2-notifications.css";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import NotificationsClient,{type Notice} from "./notifications-client";
export const dynamic="force-dynamic";
export default async function NotificationsPage(){
 const cookieStore=await cookies();const locale=cookieStore.get("raye2_locale")?.value==="ar"?"ar":"en";const isArabic=locale==="ar";
 const supabase=await createSupabaseServerClient();if(!supabase)redirect("/community#join");
 const {data:claims}=await supabase.auth.getClaims();const userId=claims?.claims?.sub;if(typeof userId!=="string")redirect("/community#join");
 const {data}=await supabase.rpc("raye2_get_notifications",{p_limit:40,p_before:null,p_only_unread:false,p_filter:"all"});
 const rows=(data??[]) as Array<{id:string;notification_type:string;target_type:string;target_id:string;message:string;read_at:string|null;created_at:string;actor_handle:string|null;actor_display_name:string|null}>;
 const notices:Notice[]=rows.map(x=>({id:x.id,type:x.notification_type,targetType:x.target_type,targetId:x.target_id,message:x.message,readAt:x.read_at,createdAt:x.created_at,actor:x.actor_display_name??(isArabic?"عضو في Raye2":"Raye2 member"),handle:x.actor_handle??null}));
 return <main className="raye2-notifications-page" dir={isArabic?"rtl":"ltr"} lang={locale}><div className="raye2-notifications-wrap"><span className="raye2-section-label">{isArabic?"RAYE2 / صندوق الإشعارات":"RAYE2 / NOTIFICATION INBOX"}</span><h1>{isArabic?<>إشعاراتك <em>في رايق؟</em></>:<>Your <em>notifications.</em></>}</h1><p className="raye2-muted">{isArabic?"المتابعات والتفاعلات والنقاشات المعتمدة في مجتمعك.":"Follows, reactions and approved discussions from your Raye2 community."}</p><NotificationsClient initialNotices={notices} locale={locale}/></div></main>
}

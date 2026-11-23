import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import PublicEvents from "./public-events";

export const dynamic="force-dynamic";
type EventRow={id:string;title:string;description:string;starts_at:string|null;ends_at:string|null;status:string;event_type:string;going_count:number;host_count:number;my_rsvp:boolean;my_rsvp_status:string|null;space_group_slug:string|null};

export default async function EventsPage(){
 const cookieStore=await cookies();const locale=cookieStore.get("raye2_locale")?.value==="ar"?"ar":"en";const isArabic=locale==="ar";
 const supabase=await createSupabaseServerClient();
 let events:EventRow[]=[];
 if(supabase){const {data}=await supabase.rpc("raye2_get_public_events",{p_limit:40});events=(Array.isArray(data)?data:[]).map((row:EventRow)=>({id:row.id,title:row.title,description:row.description,starts_at:row.starts_at,ends_at:row.ends_at,status:row.status,event_type:row.event_type,going_count:Number(row.going_count??0),host_count:Number(row.host_count??0),my_rsvp:!!row.my_rsvp,my_rsvp_status:row.my_rsvp_status??null,space_group_slug:row.space_group_slug??null}))}
 return <main className="raye2-app-shell" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <PublicEvents initialEvents={events} locale={locale}/>
  {!events.length&&<div className="raye2-card raye2-empty-state" style={{margin:"24px auto",maxWidth:760}}>{isArabic?"لا توجد فعاليات منشورة بعد. ستظهر هنا عندما ينشر صانع المحتوى فعالية.":"No published events yet. They will appear here when the creator publishes one."}</div>}
 </main>;
}

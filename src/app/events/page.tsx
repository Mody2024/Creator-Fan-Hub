import Link from "next/link";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import PublicEvents from "./public-events";

export const dynamic="force-dynamic";
type EventRow={id:string;title:string;description:string;starts_at:string|null;ends_at:string|null;status:string;event_type:string;going_count:number;host_count:number;my_rsvp:boolean;my_rsvp_status:string|null};

export default async function EventsPage(){
 const cookieStore=await cookies();const locale=cookieStore.get("nhen_locale")?.value==="ar"?"ar":"en";const isArabic=locale==="ar";
 const supabase=await createSupabaseServerClient();
 let events:EventRow[]=[];
 if(supabase){const {data}=await supabase.rpc("raye2_get_public_events",{p_limit:40});events=(Array.isArray(data)?data:[]).map((row:EventRow)=>({id:row.id,title:row.title,description:row.description,starts_at:row.starts_at,ends_at:row.ends_at,status:row.status,event_type:row.event_type,going_count:Number(row.going_count??0),host_count:Number(row.host_count??0),my_rsvp:!!row.my_rsvp,my_rsvp_status:row.my_rsvp_status??null}))}
 return <main className="nhen-app-shell" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className="nhen-watch-top"><Link className="nhen-brand" href="/raye2/home" aria-label="Raye2 home">Raye2</Link><nav><Link href="/">{isArabic?"الرئيسية":"Home"}</Link><Link href="/community">{isArabic?"المجتمع":"Community"}</Link><Link href="/watch">{isArabic?"شاهد":"Watch"}</Link></nav></header>
  <PublicEvents initialEvents={events} locale={locale}/>
  {!events.length&&<div className="nhen-card nhen-empty-state" style={{margin:"24px auto",maxWidth:760}}>{isArabic?"لا توجد فعاليات منشورة بعد. ستظهر هنا عندما ينشر صانع المحتوى فعالية.":"No published events yet. They will appear here when the creator publishes one."}</div>}
 </main>;
}

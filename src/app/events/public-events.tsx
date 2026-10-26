import { createSupabaseServerClient } from "@/lib/supabase/server";
type EventRow={id:string;title:string;description:string;starts_at:string|null;ends_at:string|null;status:string};
export default async function PublicEvents(){
 const supabase=await createSupabaseServerClient();if(!supabase)return null;
 const {data,error}=await supabase.from("events").select("id,title,description,starts_at,ends_at,status").in("status",["published","completed"]).order("starts_at",{ascending:true,nullsFirst:false}).limit(12);
 if(error||!data?.length)return null;
 const items=data as EventRow[];
 return <section className="public-events" id="events"><div className="public-feed-heading"><span className="eyebrow">COMMUNITY / CALENDAR</span><h2>Save the <em>date.</em></h2><p>Community moments, published by the creator.</p></div><div className="public-events-grid">{items.map(event=><article className="public-event" key={event.id}><span className="eyebrow">{event.starts_at?<time dateTime={event.starts_at}>{new Date(event.starts_at).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}</time>:"DATE TO BE ANNOUNCED"}</span><h3>{event.title}</h3><p>{event.description}</p>{event.status==="completed"&&<span className="event-completed">COMPLETED</span>}</article>)}</div></section>;
}
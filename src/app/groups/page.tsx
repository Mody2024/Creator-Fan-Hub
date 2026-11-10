import Link from "next/link";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import "./groups.css";

export const dynamic="force-dynamic";

type Group={id:string;slug:string;name:string;description:string;topics:string[];member_count:number|string;message_count:number|string;last_activity_at:string;owner_handle:string|null;owner_display_name:string|null};

export default async function GroupsPage({searchParams}:{searchParams:Promise<{q?:string}>}){
 const [{q=""},cookieStore]=await Promise.all([searchParams,cookies()]);
 const isArabic=cookieStore.get("nhen_locale")?.value==="ar";
 const locale=isArabic?"ar":"en";
 const search=q.trim();
 const t=isArabic?{label:"RAYE2 / المساحات",headline:"انضم إلى",accent:"المساحات العامة.",intro:"اكتشف مجموعات Raye2 العامة، اطّلع على أعضائها ونشاطها، وانضم إلى ما يناسبك.",searchLabel:"ابحث في المساحات",searchPlaceholder:"ابحث بالاسم أو الوصف…",search:"بحث",members:"عضو",messages:"رسالة",owner:"المالك",activity:"آخر نشاط",empty:"لا توجد مساحات عامة مطابقة.",none:"لم تُنشأ أي مساحات عامة بعد.",open:"افتح المساحة",home:"الرئيسية",watch:"مشاهدة",community:"المجتمع",series:"السلاسل",creators:"الصُنّاع",discover:"استكشف",joined:"عضو بالفعل",join:"انضم",publicLabel:"عامة"}:{label:"RAYE2 / SPACES",headline:"Join the",accent:"public spaces.",intro:"Discover Raye2 public groups, see who's in them and how active they are, and join what fits.",searchLabel:"Search spaces",searchPlaceholder:"Search by name or description…",search:"Search",members:"members",messages:"messages",owner:"Owner",activity:"Last active",empty:"No public spaces match your search.",none:"No public spaces have been created yet.",open:"Open space",home:"Home",watch:"Watch",community:"Community",series:"Series",creators:"Creators",discover:"Discover",joined:"Joined",join:"Join",publicLabel:"Public"};
 const supabase=await createSupabaseServerClient();
 let groups:Group[]=[];
 let myMemberships=new Set<string>();
 if(supabase){
  const {data}=await supabase.rpc("raye2_list_public_groups",{p_limit:48,p_search:search||null});
  groups=(data??[]) as Group[];
  const {data:claims}=await supabase.auth.getClaims();
  const userId=claims?.claims?.sub;
  if(typeof userId==="string"){
   const {data:memberships}=await supabase.from("raye2_group_members").select("group_id").eq("user_id",userId).eq("status","active");
   myMemberships=new Set((memberships??[]).map((row:{group_id:string})=>row.group_id));
  }
 }
 return <main className="raye2-groups-page" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className="raye2-groups-top"><Link className="raye2-groups-brand" href="/raye2/home" aria-label={isArabic?"الصفحة الرئيسية":"Raye2 home"}>Raye2</Link><nav><Link href="/raye2/home">{t.home}</Link><Link href="/watch">{t.watch}</Link><Link href="/community">{t.community}</Link><Link href="/series">{t.series}</Link><Link href="/creators">{t.creators}</Link></nav></header>
  <div className="raye2-groups-wrap">
   <section className="raye2-groups-hero"><span className="raye2-groups-label">{t.label}</span><h1>{t.headline} <em>{t.accent}</em></h1><p className="raye2-groups-muted">{t.intro}</p>
    <form className="raye2-groups-search" action="/groups" method="get" role="search"><label className="raye2-groups-label" htmlFor="groups-search">{t.searchLabel}</label><div><input id="groups-search" name="q" type="search" defaultValue={search} placeholder={t.searchPlaceholder} maxLength={80}/><button type="submit">{t.search}</button></div></form>
   </section>
   {groups.length?<div className="raye2-groups-grid">{groups.map(group=><article className="raye2-groups-card" key={group.id}>
    <Link href={"/groups/"+group.slug}>
     <div className="raye2-groups-card-head"><span className="raye2-groups-badge" aria-hidden="true">#</span><div><h2>{group.name}</h2><span className="raye2-groups-label">{t.publicLabel.toUpperCase()}</span></div>{myMemberships.has(group.id)&&<span className="raye2-groups-joined">{t.joined}</span>}</div>
     <p className="raye2-groups-desc">{group.description||t.intro}</p>
     {group.topics.length>0&&<ul className="raye2-groups-topics">{group.topics.slice(0,4).map(topic=><li key={topic}>{topic}</li>)}</ul>}
     <dl className="raye2-groups-stats"><div><dt>{t.members}</dt><dd>{Number(group.member_count)}</dd></div><div><dt>{t.messages}</dt><dd>{Number(group.message_count)}</dd></div></dl>
     <p className="raye2-groups-meta">{t.owner}: {group.owner_display_name??group.owner_handle??"—"} · {t.activity}: {new Date(group.last_activity_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</p>
     <span className="raye2-groups-open">{t.open} ↗</span>
    </Link>
   </article>)}</div>:<div className="raye2-groups-empty">{search?t.empty:t.none}</div>}
   <aside className="raye2-groups-side"><h2>{t.discover}</h2><Link href="/watch">{t.watch} ↗</Link><Link href="/series">{t.series} ↗</Link><Link href="/community">{t.community} ↗</Link><Link href="/creators">{t.creators} ↗</Link></aside>
  </div>
 </main>;
}

import Link from "next/link";
import Image from "next/image";
import {notFound} from "next/navigation";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import "../groups.css";

export const dynamic="force-dynamic";

type Group={id:string;slug:string;name:string;description:string;visibility:string;status:string;topics:string[];rules:string;image_url:string|null;member_count:number|string;message_count:number|string;created_at:string;last_activity_at:string;owner_handle:string|null;owner_display_name:string|null;my_role:string|null;my_status:string|null};
type Member={user_id:string;role:string;status:string;joined_at:string;handle:string|null;display_name:string|null;avatar_url:string|null};

export default async function GroupDetailPage({params}:{params:Promise<{slug:string}>}){
 const [{slug},cookieStore]=await Promise.all([params,cookies()]);
 const isArabic=cookieStore.get("nhen_locale")?.value==="ar";
 const locale=isArabic?"ar":"en";
 const t=isArabic?{label:"RAYE2 / مساحة",members:"عضو",messages:"رسالة",owner:"المالك",created:"أُنشئت",activity:"آخر نشاط",rules:"القواعد",roster:"الأعضاء",noRoster:"لا يوجد أعضاء لعرضهم.",privateNotice:"هذه المساحة خاصة وتظهر لأعضائها فقط.",joinNotice:"للانضمام، افتح المساحات في Raye2.",back:"كل المساحات",home:"الرئيسية",publicLabel:"عامة",privateLabel:"خاصة",memberLabel:"عضو",roleOwner:"المالك",roleAdmin:"مشرف",roleModerator:"منسق",roleMember:"عضو",empty:"لا يوجد وصف بعد."}:{label:"RAYE2 / SPACE",members:"members",messages:"messages",owner:"Owner",created:"Created",activity:"Last active",rules:"Rules",roster:"Members",noRoster:"No members to show.",privateNotice:"This space is private and only visible to its members.",joinNotice:"To join, open Spaces in Raye2.",back:"All spaces",home:"Home",publicLabel:"Public",privateLabel:"Private",memberLabel:"member",roleOwner:"Owner",roleAdmin:"Admin",roleModerator:"Moderator",roleMember:"Member",empty:"No description yet."};
 const supabase=await createSupabaseServerClient();
 let group:Group|null=null;
 let members:Member[]=[];
 let canViewRoster=false;
 if(supabase){
  const {data}=await supabase.rpc("raye2_get_group",{p_slug:slug});
  group=((data??[]) as Group[])[0]??null;
  if(group){
   const isMember=group.my_status==="active";
   const isManager=group.my_role==="owner"||group.my_role==="admin"||group.my_role==="moderator";
   canViewRoster=isMember||isManager;
   if(canViewRoster){
    const {data:roster}=await supabase.rpc("raye2_get_group_members",{p_group_id:group.id,p_limit:100});
    members=(roster??[]) as Member[];
   }
  }
 }
 if(!group)notFound();
 const roleLabel=(role:string)=>role==="owner"?t.roleOwner:role==="admin"?t.roleAdmin:role==="moderator"?t.roleModerator:t.roleMember;
 return <main className="raye2-groups-page raye2-group-detail" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <header className="raye2-groups-top"><Link className="raye2-groups-brand" href="/raye2/home" aria-label={isArabic?"الصفحة الرئيسية":"Raye2 home"}>Raye2</Link><nav><Link href="/groups">{t.back}</Link><Link href="/raye2/home">{t.home}</Link></nav></header>
  <div className="raye2-groups-wrap">
   <section className="raye2-groups-hero">
    <div className="raye2-group-detail-head">{group.image_url?<Image className="raye2-group-detail-avatar" src={group.image_url} alt="" width={72} height={72} unoptimized/>:<span className="raye2-group-detail-avatar" aria-hidden="true">#</span>}<div><span className="raye2-groups-label">{t.label}</span><h1>{group.name}</h1><p className="raye2-groups-muted">{group.visibility==="public"?t.publicLabel:t.privateLabel} · {t.owner}: {group.owner_display_name??group.owner_handle??"—"}</p></div></div>
    <p className="raye2-groups-desc">{group.description||t.empty}</p>
    {group.topics.length>0&&<ul className="raye2-groups-topics">{group.topics.map(topic=><li key={topic}>{topic}</li>)}</ul>}
    <dl className="raye2-groups-stats"><div><dt>{t.members}</dt><dd>{Number(group.member_count)}</dd></div><div><dt>{t.messages}</dt><dd>{Number(group.message_count)}</dd></div><div><dt>{t.created}</dt><dd>{new Date(group.created_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</dd></div><div><dt>{t.activity}</dt><dd>{new Date(group.last_activity_at).toLocaleDateString(isArabic?"ar-EG":"en-US")}</dd></div></dl>
    {group.visibility==="private"&&<p className="raye2-groups-private">{t.privateNotice}</p>}
    {group.visibility==="public"&&!canViewRoster&&<p className="raye2-groups-private">{t.joinNotice}</p>}
   </section>
   <section className="raye2-group-detail-panels">
    {group.rules&&<article className="raye2-groups-card raye2-group-panel"><h2>{t.rules}</h2><p className="raye2-groups-desc">{group.rules}</p></article>}
    {canViewRoster&&<article className="raye2-groups-card raye2-group-panel"><h2>{t.roster} · {members.length}</h2>{members.length?<ul className="raye2-group-roster">{members.map(member=><li key={member.user_id}>{member.handle?<Link href={"/u/"+member.handle}><span className="raye2-group-roster-avatar" aria-hidden="true">{(member.display_name??member.handle??"?").slice(0,1).toUpperCase()}</span><span><strong>{member.display_name??member.handle}</strong><small>@{member.handle} · {roleLabel(member.role)}</small></span></Link>:<span><strong>{member.display_name??t.memberLabel}</strong></span>}</li>)}</ul>:<p className="raye2-groups-muted">{t.noRoster}</p>}</article>}
   </section>
  </div>
 </main>;
}

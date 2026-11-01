"use client";
import {useEffect,useMemo,useState} from "react";
import {getSupabaseBrowserClient} from "@/lib/supabase/browser";
export type TeamMember={userId:string;email:string;role:string;active:boolean;createdAt:string};
const roles=["creator","admin","editor","moderator","analyst"];
export default function CreatorTeamClient({initialTeam}:{initialTeam:TeamMember[]}){
 const supabase=useMemo(()=>getSupabaseBrowserClient(),[]);const [team,setTeam]=useState(initialTeam),[email,setEmail]=useState(""),[role,setRole]=useState("editor"),[inviteUrl,setInviteUrl]=useState(""),[busy,setBusy]=useState(false),[notice,setNotice]=useState("");
 const [locale,setLocale]=useState<"en"|"ar">("en");const isArabic=locale==="ar";
 const t=isArabic?{
  invite:"دعوة متعاون",heading:"أضف مبدعين جدد إلى NHEN.",intro:"ادعُ أحد المبدعين عبر البريد الإلكتروني. ينشئ حسابه بنفسه ويتحقق من بريده، ثم يحصل على صلاحيات النشر بعد قبول الدعوة لمرة واحدة.",email:"البريد الإلكتروني",role:"الدور",create:"إنشاء دعوة ↗",working:"جارٍ التنفيذ…",inviteLink:"رابط دعوة لمرة واحدة",copy:"نسخ رابط الدعوة",copySuccess:"تم نسخ رابط الدعوة.",copyFail:"ميزة الحافظة غير متاحة. حدد رابط الدعوة وانسخه يدويًا.",inviteSuccess:"تم إنشاء الدعوة. انسخ الرابط وأرسله بشكل خاص إلى عنوان البريد المطابق.",inviteError:"تعذر إنشاء الدعوة.",roleUpdated:"تم تحديث دور الفريق.",roleError:"تعذر تحديث هذا الدور. حدّث قائمة الفريق للتحقق من الصلاحيات الحالية.",deactivated:"تم إيقاف صلاحية المبدع.",reactivated:"تمت استعادة صلاحية المبدع.",accessError:"تعذر تغيير صلاحية الحساب. حدّث القائمة للتحقق من الحالة الحالية.",roster:"قائمة الصلاحيات",team:"فريق الاستوديو",accounts:"حسابات",added:"تاريخ الإضافة",active:"نشط",inactive:"غير نشط",deactivate:"إيقاف",reactivate:"إعادة تفعيل",guide:"دليل الأدوار",owner:"المالك — تحكم كامل ودعوات الفريق وإدارة الأدوار.",admin:"المسؤول — إدارة واسعة للاستوديو والمراجعة.",creator:"المبدع — رفع ونشر الفيديوهات الرسمية وإدارة الأوصاف وقوائم التشغيل.",editor:"المحرر — إدارة محتوى الموقع ومسودات النشر.",moderator:"المشرف — مراجعة المجتمع والبلاغات.",analyst:"المحلل — الاطلاع على الأداء والتقارير فقط.",ownerRole:"المالك",adminRole:"مسؤول",creatorRole:"مبدع",editorRole:"محرر",moderatorRole:"مشرف",analystRole:"محلل"
 }:{
  invite:"INVITE A COLLABORATOR",heading:"Bring new creators into NHEN.",intro:"Invite a creator by email. They create their own account, verify their email and receive creator publishing access after accepting the one-use invitation.",email:"Email address",role:"Role",create:"Create invitation ↗",working:"Working…",inviteLink:"One-time invitation link",copy:"Copy invite link",copySuccess:"Invitation link copied.",copyFail:"Clipboard access is unavailable. Select and copy the invitation link manually.",inviteSuccess:"Invitation created. Copy the one-time link and send it privately to the matching email address.",inviteError:"Could not create invitation.",roleUpdated:"Team role updated.",roleError:"Could not update this role. Refresh the roster to confirm the current permissions.",deactivated:"Creator access deactivated.",reactivated:"Creator access restored.",accessError:"Could not change account access. Refresh the roster to confirm the current status.",roster:"ACCESS ROSTER",team:"Studio team",accounts:"accounts",added:"Added",active:"ACTIVE",inactive:"INACTIVE",deactivate:"Deactivate",reactivate:"Reactivate",guide:"ROLE GUIDE",owner:"Owner — full control, team invitations and role management.",admin:"Admin — broad creator operations and moderation.",creator:"Creator — upload and publish official long-form videos, manage descriptions and playlists.",editor:"Editor — manage site content and publishing drafts.",moderator:"Moderator — community review and reports.",analyst:"Analyst — read-only performance and reports.",ownerRole:"Owner",adminRole:"Admin",creatorRole:"Creator",editorRole:"Editor",moderatorRole:"Moderator",analystRole:"Analyst"
 };
 useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);
 const roleLabel=(value:string)=>({owner:t.ownerRole,admin:t.adminRole,creator:t.creatorRole,editor:t.editorRole,moderator:t.moderatorRole,analyst:t.analystRole}[value]??value);
 async function invite(){
  if(!supabase||busy||!email.trim())return;setBusy(true);setNotice("");setInviteUrl("");
  try{
   const token=Array.from(crypto.getRandomValues(new Uint8Array(48))).map(x=>x.toString(16).padStart(2,"0")).join("");
   const {error}=await supabase.rpc("create_creator_invite",{p_email:email.trim().toLowerCase(),p_role:role,p_token:token});
   if(error)throw error;
   setInviteUrl(window.location.origin+"/creator/accept-invite?token="+token);
   setEmail("");setNotice(t.inviteSuccess);
  }catch(e){setNotice(e instanceof Error?e.message:t.inviteError)}finally{setBusy(false)}
 }
 async function changeRole(member:TeamMember,next:string){
  if(!supabase||busy||member.role==="owner"||!roles.includes(next))return;
  setBusy(true);setNotice("");
  try {
   const {error}=await supabase.rpc("set_creator_admin_role",{p_user_id:member.userId,p_role:next});
   if(error)throw error;
   setTeam(xs=>xs.map(x=>x.userId===member.userId?{...x,role:next}:x));
   setNotice(t.roleUpdated);
  } catch {
   setNotice(t.roleError);
  } finally {setBusy(false);}
 }
 async function toggleActive(member:TeamMember){
  if(!supabase||busy||member.role==="owner")return;
  setBusy(true);setNotice("");
  try {
   const {error}=await supabase.rpc("set_creator_admin_active",{p_user_id:member.userId,p_active:!member.active});
   if(error)throw error;
   setTeam(xs=>xs.map(x=>x.userId===member.userId?{...x,active:!x.active}:x));
   setNotice(member.active?t.deactivated:t.reactivated);
  } catch {
   setNotice(t.accessError);
  } finally {setBusy(false);}
 }
 async function copyInvite(){
  if(!inviteUrl)return;
  try {await navigator.clipboard.writeText(inviteUrl);setNotice(t.copySuccess);}
  catch {setNotice(t.copyFail);}
 }
 return <section className="nhen-team-workspace" dir={isArabic?"rtl":"ltr"} lang={locale}>
  <div className="nhen-card nhen-card-pad"><span className="nhen-section-label">{t.invite}</span><h2>{t.heading}</h2><p className="nhen-muted">{t.intro}</p>
   <div className="nhen-team-invite-form"><label>{t.email}<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="collaborator@example.com"/></label><label>{t.role}<select value={role} onChange={e=>setRole(e.target.value)}>{roles.map(r=><option key={r} value={r}>{roleLabel(r)}</option>)}</select></label><button className="button button-primary" disabled={busy||!/^\S+@\S+\.\S+$/.test(email.trim())} onClick={()=>void invite()}>{busy?t.working:t.create}</button></div>
   {inviteUrl&&<div className="nhen-invite-link"><strong>{t.inviteLink}</strong><input readOnly value={inviteUrl}/><button className="button button-secondary" onClick={()=>void copyInvite()}>{t.copy}</button></div>}
   {notice&&<p className="nhen-mod-notice" role="status">{notice}</p>}
  </div>
  <div className="nhen-card nhen-card-pad"><div className="nhen-card-heading"><div><span className="nhen-section-label">{t.roster}</span><h2>{t.team}</h2></div><span className="nhen-pill">{team.length} {t.accounts}</span></div>
   <div className="nhen-team-list">{team.map(member=><article className="nhen-team-row" key={member.userId}><div><strong>{member.email}</strong><small>{roleLabel(member.role)} · {t.added} {new Date(member.createdAt).toLocaleDateString(locale==="ar"?"ar-EG":"en-US")}</small></div><select aria-label={"Role for "+member.email} value={member.role} disabled={busy||member.role==="owner"||!member.active} onChange={e=>void changeRole(member,e.target.value)}>{roles.map(r=><option key={r} value={r}>{r==="creator"?"Creator":r}</option>)}</select><span className={"nhen-team-status "+(member.active?"active":"inactive")}>{member.active?t.active:t.inactive}</span><button disabled={busy||member.role==="owner"} onClick={()=>void toggleActive(member)}>{member.active?t.deactivate:t.reactivate}</button></article>)}</div>
  </div>
  <div className="nhen-card nhen-card-pad"><span className="nhen-section-label">{t.guide}</span><div className="nhen-role-guide"><p>{t.owner}</p><p>{t.admin}</p><p>{t.creator}</p><p>{t.editor}</p><p>{t.moderator}</p><p>{t.analyst}</p></div></div>
 </section>
}

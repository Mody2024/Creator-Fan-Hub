"use client";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
type Idea = { idea_id: string; display_name: string; idea_title: string; idea_body: string; idea_status: string; submitted_at: string };
export default function IdeaModerationQueue() {
  const [ideas,setIdeas] = useState<Idea[]>([]);
  const [busy,setBusy] = useState(true);
  const [working,setWorking] = useState("");
  const [search,setSearch] = useState("");
  const [statusFilter,setStatusFilter] = useState<"all"|"pending"|"approved"|"featured"|"rejected"|"archived">("all");
  const [status,setStatus] = useState("Loading moderation queue…");
  const [locale,setLocale]=useState<"en"|"ar">("en");const isArabic=locale==="ar";
  const t=isArabic?{
    loading:"جارٍ تحميل قائمة مراجعة الأفكار…",notConfigured:"Supabase غير مُعد.",loadError:"تعذر تحميل الأفكار. تحقق من صلاحية حساب المبدع.",refreshed:"تم تحديث القائمة. تظل الأفكار المعلقة خاصة حتى الموافقة عليها.",connection:"فشل الاتصال أثناء تحميل الأفكار. تحقق من الاتصال ثم حدّث القائمة.",saveError:"تعذر حفظ الإجراء. حدّث القائمة وحاول مرة أخرى.",marked:"تم تغيير حالة الفكرة إلى",public:"الأفكار الموافق عليها فقط تظهر للعامة.",connectionSave:"فشل الاتصال أثناء الحفظ. حدّث القائمة للتحقق من الحالة الحالية.",community:"المجتمع / المراجعة",title:"أفكار ",emphasis:"قيد المراجعة.",intro:"قائمة خاصة؛ لا تظهر المشاركات المعلقة للزوار.",totals:"إجمالي الأفكار",pending:"معلقة",featured:"مميزة",refresh:"تحديث ↻",search:"البحث في الأفكار",searchPlaceholder:"العنوان أو التفاصيل أو الاسم الظاهر",status:"الحالة",all:"كل الحالات",pendingFilter:"بانتظار المراجعة",approved:"تمت الموافقة",featuredFilter:"مميزة",rejected:"مرفوضة",archived:"مؤرشفة",shown:"معروض",empty:"لا توجد مشاركات بعد.",emptyNote:"ستظهر الأفكار الجديدة هنا عندما يرسلها الزوار.",noMatch:"لا توجد أفكار مطابقة.",try:"جرّب بحثًا آخر أو اختر حالة مختلفة.",clear:"مسح عوامل التصفية",by:"بواسطة",anonymous:"مجهول",approve:"موافقة",feature:"تمييز",reject:"رفض",archive:"أرشفة"
  }:{
    loading:"Loading moderation queue…",notConfigured:"Supabase is not configured.",loadError:"Could not load ideas. Check creator access.",refreshed:"Queue refreshed. Pending ideas remain private until approved.",connection:"Connection failed while loading ideas. Check your connection and refresh.",saveError:"Could not save that action. Refresh and try again.",marked:"Idea marked",public:"Only approved ideas appear publicly.",connectionSave:"Connection failed while saving. Refresh the queue to confirm the idea's current status.",community:"COMMUNITY / MODERATION",title:"Ideas ",emphasis:"in review.",intro:"Private queue; pending submissions are never shown to public visitors.",totals:"Idea totals",pending:"pending",featured:"featured",refresh:"Refresh ↻",search:"Search ideas",searchPlaceholder:"Title, details or display name",status:"Status",all:"All statuses",pendingFilter:"Pending review",approved:"Approved",featuredFilter:"Featured",rejected:"Rejected",archived:"Archived",shown:"shown",empty:"No submissions yet.",emptyNote:"New ideas will appear here when visitors submit them.",noMatch:"No matching ideas.",try:"Try another search or choose a different status.",clear:"Clear filters",by:"By",anonymous:"Anonymous",approve:"Approve",feature:"Feature",reject:"Reject",archive:"Archive"
  };
  useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);
  const load = useCallback(async () => {
    const supabase=getSupabaseBrowserClient();
    if(!supabase){setStatus(t.notConfigured);setBusy(false);return;}
    setBusy(true);
    try {
      const {data,error}=await supabase.rpc("get_creator_idea_queue",{p_limit:50});
      if(error){setStatus(t.loadError);return;}
      setIdeas(Array.isArray(data)?data as Idea[]:[]);
      setStatus(t.refreshed);
    } catch {
      setStatus(t.connection);
    } finally {
      setBusy(false);
    }
  },[]);
  useEffect(()=>{void load();},[load]);
  async function moderate(id:string,next:"approved"|"rejected"|"featured"|"archived"){
    const supabase=getSupabaseBrowserClient();if(!supabase||working)return;setWorking(id);
    try {
      const {data,error}=await supabase.rpc("moderate_public_idea",{p_idea_id:id,p_new_status:next});
      const result=Array.isArray(data)?data[0] as {updated:boolean}|undefined:undefined;
      if(error||!result?.updated){setStatus(t.saveError);return;}
      setIdeas(current=>current.map(i=>i.idea_id===id?{...i,idea_status:next}:i));
      setStatus(t.marked+" "+(isArabic?({approved:"تمت الموافقة",featured:"مميزة",rejected:"مرفوضة",archived:"مؤرشفة"} as Record<string,string>)[next]:next)+". "+t.public);
    } catch {
      setStatus(t.connectionSave);
    } finally {
      setWorking("");
    }
  }
  const normalizedSearch = search.trim().toLocaleLowerCase();
  const visibleIdeas = ideas.filter(idea => (statusFilter === "all" || idea.idea_status === statusFilter || (statusFilter === "pending" && idea.idea_status === "pending")) && [idea.idea_title, idea.idea_body, idea.display_name || ""].some(value => value.toLocaleLowerCase().includes(normalizedSearch)));
  const pendingCount = ideas.filter(idea => idea.idea_status === "pending").length;
  const featuredCount = ideas.filter(idea => idea.idea_status === "featured").length;
  return <section id="creator-ideas" className="moderation-panel" dir={isArabic?"rtl":"ltr"} lang={locale}>
    <div className="moderation-heading"><div><span className="eyebrow">{t.community}</span><h2>{t.title}<em>{t.emphasis}</em></h2><p>{t.intro}</p><div className="moderation-summary" aria-label={t.totals}><span>{ideas.length} total</span><span>{pendingCount} pending</span><span>{featuredCount} featured</span></div></div><button className="editor-reload" disabled={busy||!!working} onClick={()=>{setBusy(true);void load();}}>{t.refresh}</button></div>
    {!busy && ideas.length > 0 && <div className="moderation-filters"><label>{t.search}<input type="search" value={search} onChange={event=>setSearch(event.target.value)} placeholder={t.searchPlaceholder} /></label><label>{t.status}<select value={statusFilter} onChange={event=>setStatusFilter(event.target.value as typeof statusFilter)}><option value="all">{t.all}</option><option value="pending">{t.pendingFilter}</option><option value="approved">{t.approved}</option><option value="featured">{t.featuredFilter}</option><option value="rejected">{t.rejected}</option><option value="archived">{t.archived}</option></select></label><span>{visibleIdeas.length} {t.shown}</span></div>}
    {busy?<p className="editor-status" role="status" aria-live="polite">{status}</p>:ideas.length===0?<div className="moderation-empty" role="status"><h3>{t.empty}</h3><p>{t.emptyNote}</p></div>:visibleIdeas.length===0?<div className="moderation-empty" role="status"><h3>{t.noMatch}</h3><p>{t.try}</p><button className="button button-secondary" type="button" onClick={()=>{setSearch("");setStatusFilter("all");}}>{t.clear}</button></div>:<div className="moderation-list">{visibleIdeas.map(idea=><article className="moderation-item" key={idea.idea_id}>
      <div className="moderation-item-meta"><span className="eyebrow">{new Date(idea.submitted_at).toLocaleString()}</span><span className={"idea-status idea-status-"+idea.idea_status}>{idea.idea_status.toUpperCase()}</span></div>
      <h3>{idea.idea_title}</h3><p className="moderation-byline">{t.by} {idea.display_name||t.anonymous}</p><p className="moderation-body">{idea.idea_body}</p>
      <div className="moderation-actions"><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"approved")}>{t.approve}</button><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"featured")}>{t.feature}</button><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"rejected")}>{t.reject}</button><button disabled={!!working} onClick={()=>void moderate(idea.idea_id,"archived")}>{t.archive}</button></div>
    </article>)}</div>}
    <p className="editor-status" role="status" aria-live="polite">{status}</p>
  </section>;
}

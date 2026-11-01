"use client";
import { FormEvent, useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
type Poll={poll_id:string;title:string;description:string;status:string;starts_at:string|null;ends_at:string|null;created_at:string};
type PollOption={id:string;label:string;position:number};
type PollResult={poll_id:string;option_id:string;option_label:string;vote_count:number;poll_status:string};
type PollVoter={display_name:string;option_label:string;voted_at:string};
export default function PollManagement(){
 const [polls,setPolls]=useState<Poll[]>([]);const [options,setOptions]=useState<Record<string,PollOption[]>>({});const [results,setResults]=useState<Record<string,PollResult[]>>({});const [voters,setVoters]=useState<Record<string,PollVoter[]>>({});const [expandedVoters,setExpandedVoters]=useState<Record<string,boolean>>({});
 const [title,setTitle]=useState("");const [description,setDescription]=useState("");const [rawOptions,setRawOptions]=useState("Option A\nOption B");const [starts,setStarts]=useState("");const [ends,setEnds]=useState("");
 const [busy,setBusy]=useState(true);const [working,setWorking]=useState("");const [status,setStatus]=useState("Loading polls…");
 const [locale,setLocale]=useState<"en"|"ar">("en");const isArabic=locale==="ar";
 const t=isArabic?{
  eyebrow:"النشر / التصويت",title:"اختر ما ",emphasis:"سيأتي لاحقًا.",intro:"أنشئ استطلاعًا كمسودة، ثم افتح التصويت أو أغلقه عندما تكون مستعدًا. يمكن فتح استطلاع واحد فقط في كل مرة.",refresh:"تحديث ↻",question:"سؤال التصويت",questionPlaceholder:"ماذا نصنع بعد ذلك؟",description:"الوصف",optional:"اختياري / 1000 حرف كحد أقصى",context:"امنح المجتمع بعض السياق.",options:"الاختيارات",optionsHint:"من 2 إلى 8 اختيارات، اختيار واحد في كل سطر",opens:"يفتح في",closes:"يغلق في",save:"حفظ مسودة التصويت",saving:"جارٍ الحفظ…",existing:"التصويتات الحالية",empty:"لم يتم إنشاء تصويتات بعد. ابدأ من النموذج أعلاه.",open:"فتح التصويت",close:"إغلاق التصويت",archive:"أرشفة",hide:"إخفاء أسماء المصوتين",view:"عرض أسماء المصوتين",private:"أسماء المصوتين · خاص",noVotes:"لا توجد أصوات مسجلة بعد.",results:"النتائج النهائية",votes:"صوت",loading:"جارٍ تحميل التصويتات…",loadError:"تعذر تحميل التصويتات. تحقق من صلاحيات المبدع وإعدادات قاعدة البيانات.",connection:"حدث خطأ في الاتصال. حاول التحديث.",onlyOne:"يمكن فتح تصويت واحد فقط في كل مرة.",created:"تم حفظ مسودة التصويت.",updated:"تم تحديث حالة التصويت.",error:"تعذر تحديث التصويت."
 }:{
  eyebrow:"PUBLISHING / POLLS",title:"Choose what ",emphasis:"comes next.",intro:"Create a poll as a draft, then open or close voting when you're ready. Only one poll can be open at a time.",refresh:"Refresh ↻",question:"Poll question",questionPlaceholder:"What should we make next?",description:"Description",optional:"OPTIONAL / MAX 1000",context:"Give the community a little context.",options:"Options",optionsHint:"2–8 OPTIONS, ONE PER LINE",opens:"Opens at",closes:"Closes at",save:"Save poll draft",saving:"Saving…",existing:"Existing polls",empty:"No polls created yet. Start with the form above.",open:"Open voting",close:"Close voting",archive:"Archive",hide:"Hide voter names",view:"View voter names",private:"VOTER NICKNAMES · PRIVATE",noVotes:"No votes recorded yet.",results:"FINAL RESULTS",votes:"votes",loading:"Loading polls…",loadError:"Could not load polls. Verify creator access and database setup.",connection:"A connection error occurred. Try refreshing.",onlyOne:"Only one poll can be open at a time.",created:"Poll draft saved.",updated:"Poll status updated.",error:"Could not update poll."
 };
 useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);
 const load=useCallback(async()=>{
  const s=getSupabaseBrowserClient();if(!s){setStatus("Database connection is not configured.");setBusy(false);return;}
  setBusy(true);
  try {
   const {data,error}=await s.rpc("get_creator_polls",{p_limit:50});
   if(error){setStatus(t.loadError);return;}
   const list=(data??[]).map((p: Poll & {id?:string})=>({poll_id:p.poll_id ?? p.id ?? "",title:p.title,description:p.description,status:p.status,starts_at:p.starts_at,ends_at:p.ends_at,created_at:p.created_at})) as Poll[];
   setPolls(list);
   if(list.length){
    const {data:opts,error:optionsError}=await s.rpc("get_creator_poll_options",{p_poll_ids:list.map(p=>p.poll_id)});
    if(optionsError){setStatus("Polls loaded, but options could not be loaded. Check creator access.");return;}
    const grouped:Record<string,PollOption[]>={};for(const o of opts??[]){(grouped[o.poll_id]??=[]).push({id:o.id,label:o.label,position:o.option_position});}setOptions(grouped);
   } else setOptions({});
   const {data:resultRows,error:resultsError}=await s.rpc("get_public_poll_results");
   if(resultsError){setResults({});setStatus("Polls loaded, but final results could not be loaded.");}
   else {
    const groupedResults:Record<string,PollResult[]>={};
    for(const row of (resultRows??[]) as PollResult[]){(groupedResults[row.poll_id]??=[]).push(row);}
    setResults(groupedResults);
    setStatus("Poll list and available final results refreshed.");
   }
  } catch {setStatus("Connection failed while loading polls. Refresh to try again.");}
  finally {setBusy(false);}
 },[]);
 useEffect(()=>{void load();},[load]);
 async function create(event:FormEvent<HTMLFormElement>){
  event.preventDefault();const s=getSupabaseBrowserClient();if(!s||working)return;
  const cleanTitle=title.trim(),cleanDescription=description.trim();
  const parsed=rawOptions.split("\n").map(x=>x.trim()).filter(Boolean);
  if(cleanTitle.length<4||cleanTitle.length>160){setStatus("Poll question must be 4–160 characters.");return;}
  if(cleanDescription.length>1000){setStatus("Description must be 1,000 characters or fewer.");return;}
  if(parsed.length<2||parsed.length>8){setStatus("Enter between 2 and 8 non-empty options.");return;}
  if(parsed.some(x=>x.length>100)){setStatus("Each option must be 100 characters or fewer.");return;}
  if(new Set(parsed.map(x=>x.toLocaleLowerCase())).size!==parsed.length){setStatus("Poll option labels must be unique.");return;}
  const startDate=starts?new Date(starts):null,endDate=ends?new Date(ends):null;
  if(startDate&&Number.isNaN(startDate.getTime())||endDate&&Number.isNaN(endDate.getTime())){setStatus("Check the poll dates and try again.");return;}
  if(startDate&&endDate&&endDate<=startDate){setStatus("The closing time must be later than the opening time.");return;}
  setWorking("create");setStatus("Saving poll draft…");
  try {
   const {data,error}=await s.rpc("create_creator_poll",{p_title:cleanTitle,p_description:cleanDescription,p_options:parsed,p_starts_at:startDate?.toISOString()??null,p_ends_at:endDate?.toISOString()??null});
   const result=Array.isArray(data)?data[0] as {created:boolean;result_code:string}|undefined:undefined;
   if(error||!result?.created){setStatus("Could not create the poll. Check creator access, dates and options.");return;}
   setTitle("");setDescription("");setRawOptions("Option A\nOption B");setStarts("");setEnds("");setStatus("Poll saved as a draft. Open it when ready.");setBusy(true);await load();
  } catch {setStatus("Connection failed while saving the poll. Refresh the list before retrying.");}
  finally {setWorking("");}
 }
 async function toggleVoters(id:string){
  if(expandedVoters[id]){setExpandedVoters(old=>({...old,[id]:false}));return;}
  const s=getSupabaseBrowserClient();if(!s||working)return;setWorking("voters:"+id);
  try {
   const {data,error}=await s.rpc("get_creator_poll_voters",{p_poll_id:id,p_limit:200});
   if(error){setStatus("Could not load voter nicknames. Confirm creator access.");return;}
   setVoters(old=>({...old,[id]:(data??[]) as PollVoter[]}));setExpandedVoters(old=>({...old,[id]:true}));
   setStatus("Voter nickname list loaded. These names are visible only in the Creator Panel.");
  } catch {setStatus("Connection failed while loading voter nicknames. Refresh and try again.");}
  finally {setWorking("");}
 }
 async function changeStatus(id:string,next:"open"|"closed"|"archived"){
  const s=getSupabaseBrowserClient();if(!s||working)return;setWorking(id);
  try {
   const {data,error}=await s.rpc("set_creator_poll_status",{p_poll_id:id,p_new_status:next});
   const result=Array.isArray(data)?data[0] as {updated:boolean;result_code:string}|undefined:undefined;
   if(error||!result?.updated){const messages:Record<string,string>={another_poll_open:"Close the currently open poll before opening another.",not_started:"This poll's start time is in the future.",expired:"This poll's end time has passed."};setStatus(messages[result?.result_code??""]??"Could not change poll status.");return;}
   setPolls(old=>old.map(p=>p.poll_id===id?{...p,status:next}:p));setStatus("Poll marked "+next+". Public display updates from its database status.");
  } catch {setStatus("Connection failed while changing poll status. Refresh to confirm the current status.");}
  finally {setWorking("");}
 }
 return <section id="creator-polls" className="moderation-panel poll-admin" dir={isArabic?"rtl":"ltr"} lang={locale}><div className="moderation-heading"><div><span className="eyebrow">{t.eyebrow}</span><h2>{t.title}<em>{t.emphasis}</em></h2><p>{t.intro}</p></div><button className="editor-reload" disabled={busy||!!working} onClick={()=>{setBusy(true);void load();}}>{t.refresh}</button></div>
 <form className="poll-create-form" onSubmit={create}><label>{t.question}<input required minLength={4} maxLength={160} value={title} onChange={e=>setTitle(e.target.value)} placeholder={t.questionPlaceholder}/><span>{title.trim().length}/160</span></label><label>{t.description} <span>{t.optional}</span><textarea maxLength={1000} rows={2} value={description} onChange={e=>setDescription(e.target.value)} placeholder={t.context}/><span>{description.length}/1000</span></label><label>{t.options} <span>{t.optionsHint}</span><textarea required rows={5} value={rawOptions} onChange={e=>setRawOptions(e.target.value)} /><span>{rawOptions.split("\n").filter(x=>x.trim()).length}/8 options</span></label><div className="poll-date-grid"><label>{t.opens} <span>{t.optional}</span><input type="datetime-local" value={starts} onChange={e=>setStarts(e.target.value)}/></label><label>{t.closes} <span>{t.optional}</span><input type="datetime-local" value={ends} onChange={e=>setEnds(e.target.value)}/></label></div><button className="button button-primary" disabled={!!working||title.trim().length<4||title.trim().length>160}>{t.save} <span>↗</span></button></form>
 <div className="poll-admin-list"><h3>{t.existing}</h3>{busy?<p className="editor-status" role="status" aria-live="polite">{status}</p>:polls.length===0?<p className="moderation-empty" role="status">{t.empty}</p>:polls.map(p=><article className="moderation-item" key={p.poll_id}><div className="moderation-item-meta"><span className="eyebrow">{new Date(p.created_at).toLocaleDateString()}</span><span className={"idea-status idea-status-"+p.status}>{p.status.toUpperCase()}</span></div><h3>{p.title}</h3>{p.description&&<p className="moderation-body">{p.description}</p>}<ul className="poll-option-preview">{(options[p.poll_id]??[]).map(o=><li key={o.id}>{o.label}</li>)}</ul>{p.status==="closed"&&results[p.poll_id]&&<div className="poll-admin-results" aria-label="Final poll results"><strong>{t.results} · {results[p.poll_id].reduce((sum,row)=>sum+Number(row.vote_count||0),0)} {t.votes}</strong>{results[p.poll_id].map(row=><p key={row.option_id}><span>{row.option_label}</span><span>{Number(row.vote_count||0)} {t.votes}</span></p>)}</div>}<div className="moderation-actions">{p.status!=="open"&&p.status!=="archived"&&<button disabled={!!working} onClick={()=>void changeStatus(p.poll_id,"open")}>{t.open}</button>}{p.status==="open"&&<button disabled={!!working} onClick={()=>void changeStatus(p.poll_id,"closed")}>{t.close}</button>}{p.status!=="archived"&&p.status!=="open"&&<button disabled={!!working} onClick={()=>void changeStatus(p.poll_id,"archived")}>{t.archive}</button>}<button type="button" disabled={!!working} onClick={()=>void toggleVoters(p.poll_id)}>{expandedVoters[p.poll_id]?t.hide:t.view}</button></div>{expandedVoters[p.poll_id]&&<div className="poll-admin-results" aria-label="Private voter nickname list"><strong>{t.private}</strong>{(voters[p.poll_id]??[]).length===0?<p>{t.noVotes}</p>:(voters[p.poll_id]??[]).map((v,i)=><p key={p.poll_id+"-"+i}><span>{v.display_name}</span><span>{v.option_label}</span></p>)}</div>}</article>)}</div><p className="editor-status" role="status" aria-live="polite">{status}</p></section>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/lib/supabase/browser";
import LogoStudio from "./logo-studio";

type MediaOption = { media_id: string; title: string; media_type: string; is_published: boolean };

type SiteDraft = {
  schemaVersion: 1;
  identity: { siteName: string; tagline: string; logoMediaId?: string | null; mascotMediaId?: string | null; narrationMediaId?: string | null; narrationText?: string; narrationAutoPlay?: boolean };
  appearance: { theme: "obsidian" | "paper" | "violet" | "custom"; accent?: string; colorMode?: string; motion?: string };
  hero: { title: string; body: string; mediaId?: string | null; overlay?: number; muted?: boolean; loop?: boolean };
  maintenance: { enabled: boolean; message: string };
  layout: { sectionOrder: string[]; visibleSections: string[] };
  socialLinkIds: string[];
  featureFlags: Record<string, boolean>;
  [key: string]: unknown;
};

const fallback: SiteDraft = {
  schemaVersion: 1,
  identity: { siteName: "Nhen?", tagline: "The community shaping what comes next. · مجتمع يصنع القادم." },
  appearance: { theme: "obsidian", accent: "#C8FF4D", colorMode: "dark", motion: "full" },
  hero: { title: "Your next favorite video starts here.", body: "Vote on ideas, share what you want to see, and help shape the next upload.", mediaId: null, overlay: 0.35, muted: true, loop: true },
  maintenance: { enabled: false, message: "We'll be back soon." },
  layout: { sectionOrder: ["hero", "ideas", "poll", "events", "community", "socials", "videos"], visibleSections: ["hero", "ideas", "poll", "events", "community", "socials", "videos"] },
  socialLinkIds: [],
  featureFlags: { polls: true, ideas: true, events: true, guidedTour: true, mascot: true, voice: false, miniGames: false, store: false }
};

export default function CreatorSettings() {
  const router = useRouter();
  const [draft, setDraft] = useState<SiteDraft>(fallback);
  const [revision, setRevision] = useState(1);
  const [savedSnapshot, setSavedSnapshot] = useState(JSON.stringify(fallback));
  const hasUnsavedChanges = JSON.stringify(draft) !== savedSnapshot;
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState("Loading your private draft…");
  const [mediaOptions, setMediaOptions] = useState<MediaOption[]>([]);
  const [locale,setLocale]=useState<"en"|"ar">("en");
  const isArabic=locale==="ar";
  const t=isArabic?{
    reload:"إعادة تحميل المسودة ↻",discard:"هل تريد تجاهل التغييرات غير المحفوظة وإعادة تحميل المسودة؟",loading:"جارٍ تحميل مسودتك الخاصة…",preview:"معاينة المسودة المباشرة",private:"خاصة حتى النشر",identity:"الهوية",headline:"اجعلها ",emphasis:"مساحتك.",identityDesc:"تُحفظ هذه القيم في Supabase. لا يتغير الموقع العام إلا بعد النشر.",brand:"هوية العلامة التجارية",fixed:"اسم العلامة التجارية ثابت للحفاظ على اتساق الهوية.",tagline:"الشعار التعريفي",heroTitle:"العنوان الرئيسي",heroBody:"وصف الواجهة",theme:"المظهر البصري",accent:"اللون المميز",colorMode:"نمط الألوان",dark:"داكن",light:"فاتح",system:"حسب الجهاز",motion:"مستوى الحركة",full:"حركة كاملة",reduced:"حركة أقل",minimal:"حركة بسيطة",logo:"ملف الشعار",defaultLogo:"استخدم شعار Nhen? الثنائي",heroMedia:"وسائط الواجهة المنشورة",defaultHero:"استخدم التصميم الافتراضي",mascot:"صورة الشخصية المنشورة",noMascot:"بدون شخصية مخصصة",narration:"التعليق الصوتي / المقطع",noNarration:"بدون تعليق صوتي",transcript:"نص التعليق الصوتي / التفريغ",autoplay:"محاولة تشغيل التعليق الصوتي تلقائيًا",overlay:"قوة طبقة التعتيم",mute:"كتم فيديو الواجهة افتراضيًا",loop:"تكرار فيديو الواجهة",experience:"التجربة",choose:"اختر ما ",appears:"يظهر.",experienceDesc:"تحتفظ الوحدات المعطلة بإعداداتها؛ هذا المفتاح يتحكم في ظهورها العام فقط.",polls:"تصويتات المجتمع",ideas:"مشاركات الأفكار",events:"الفعاليات",tour:"الجولة التعريفية",voice:"الصوت والتعليق",games:"ألعاب صغيرة",store:"المتجر (مستقبلاً)",layout:"التخطيط",stage:"رتّب ",stage2:"المشهد.",layoutDesc:"اختر أقسام الموقع العامة. إخفاء قسم لا يحذف محتواه المحفوظ.",hero:"الواجهة الرئيسية",ideaBoard:"لوحة الأفكار",voting:"التصويت",community:"المجتمع",socials:"روابط التواصل",videos:"الفيديوهات المنشورة",availability:"الإتاحة",doors:"التحكم في ",doors2:"الوصول.",maintenance:"وضع الصيانة",maintenanceDesc:"اعرض صفحة توقف مؤقت للزوار بعد النشر.",maintenanceMessage:"رسالة الصيانة",save:"حفظ المسودة",publish:"حفظ ونشر ↗",saved:"تم حفظ جميع التغييرات",unsaved:"تغييرات غير محفوظة",reloadConfirm:"تجاهل التغييرات غير المحفوظة وإعادة تحميل المسودة؟"
  }:{
    reload:"Reload draft ↻",discard:"Discard your unsaved changes and reload the saved draft?",loading:"Loading your private draft…",preview:"LIVE DRAFT PREVIEW",private:"Private until you publish",identity:"IDENTITY",headline:"Make it ",emphasis:"yours.",identityDesc:"These values are stored in Supabase. The public website changes only after publishing.",brand:"Brand identity",fixed:"The public brand name is fixed to keep the identity consistent.",tagline:"Tagline",heroTitle:"Hero headline",heroBody:"Hero description",theme:"Visual theme",accent:"Accent color",colorMode:"Color mode",dark:"Dark",light:"Light",system:"Follow device",motion:"Motion level",full:"Full motion",reduced:"Reduced motion",minimal:"Minimal motion",logo:"Website logo asset",defaultLogo:"Use bilingual Nhen? wordmark",heroMedia:"Published hero media",defaultHero:"Use default hero artwork",mascot:"Published mascot image",noMascot:"No custom mascot",narration:"Intro narration / voice clip",noNarration:"No narration clip",transcript:"On-screen narration text / transcript",autoplay:"Attempt voice-over autoplay on page load",overlay:"Hero overlay strength",mute:"Mute hero video by default",loop:"Loop hero video",experience:"EXPERIENCE",choose:"Choose what ",appears:"appears.",experienceDesc:"Disabled modules keep their saved configuration; this switch controls public availability only.",polls:"Community polls",ideas:"Idea submissions",events:"Events",tour:"Guided tour",voice:"Voice and narration",games:"Mini-games",store:"Store (future)",layout:"LAYOUT",stage:"Set the ",stage2:"stage.",layoutDesc:"Choose which public sections appear. Hiding a section never deletes its saved content.",hero:"Hero",ideaBoard:"Idea board",voting:"Voting",community:"Community banner",socials:"Social links",videos:"Published videos",availability:"AVAILABILITY",doors:"Control the ",doors2:"doors.",maintenance:"Maintenance mode",maintenanceDesc:"Show a temporary offline page to public visitors after publishing.",maintenanceMessage:"Maintenance message",save:"Save draft",publish:"Save & publish ↗",saved:"ALL CHANGES SAVED",unsaved:"UNSAVED CHANGES",reloadConfirm:"Discard your unsaved changes and reload the saved draft?"
  };
  useEffect(()=>{const match=document.cookie.match(/(?:^|; )nhen_locale=(en|ar)(?:;|$)/);if(match)setLocale(match[1] as "en"|"ar");},[]);

  const load = useCallback(async () => {
    setBusy(true);
    try {
      const supabase = getSupabaseBrowserClient();
      if (!supabase) {
        setStatus("Supabase is not configured for this preview.");
        return;
      }
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) {
        router.replace("/creator/login");
        return;
      }
      const { data: admin, error: adminError } = await supabase
        .from("creator_admins").select("user_id").eq("user_id", userData.user.id).eq("active", true).maybeSingle();
      if (adminError) throw adminError;
      if (!admin) {
        setStatus("This account has not been granted creator access. Ask the owner to provision your account.");
        return;
      }
      const { data, error } = await supabase.rpc("get_site_config_draft");
      if (error) throw error;
      if (!data?.[0]?.draft || !Number.isSafeInteger(Number(data[0].draft_revision)) || Number(data[0].draft_revision) < 1) {
        setStatus("The saved draft response was incomplete. Refresh after checking the database setup.");
        return;
      }
      const loaded = data[0];
      const { data: mediaData, error: mediaError } = await supabase.rpc("get_creator_media", { p_limit: 100 });
      setMediaOptions((mediaData ?? []) as MediaOption[]);
      const normalizedDraft: SiteDraft = {
        ...fallback, ...loaded.draft,
        identity: { ...fallback.identity, ...loaded.draft.identity, siteName: "Nhen?" },
        appearance: { ...fallback.appearance, ...loaded.draft.appearance },
        hero: { ...fallback.hero, ...loaded.draft.hero },
        maintenance: { ...fallback.maintenance, ...loaded.draft.maintenance },
        layout: { ...fallback.layout, ...loaded.draft.layout },
        featureFlags: { ...fallback.featureFlags, ...loaded.draft.featureFlags },
        socialLinkIds: Array.isArray(loaded.draft.socialLinkIds) ? loaded.draft.socialLinkIds : []
      };
      setDraft(normalizedDraft);
      setSavedSnapshot(JSON.stringify(normalizedDraft));
      setRevision(Number(loaded.draft_revision));
      setStatus(mediaError
        ? "Draft loaded, but media options could not be loaded. Confirm media permissions, then reload."
        : "Draft loaded. Changes remain private until you publish.");
    } catch {
      setStatus("Connection failed while loading the creator settings. Check your connection and reload.");
    } finally {
      setBusy(false);
    }
  }, [router]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    return () => window.removeEventListener("beforeunload", warnBeforeLeaving);
  }, [hasUnsavedChanges]);

  function update<K extends keyof SiteDraft>(section: K, key: string, value: unknown) {
    setDraft(current => ({ ...current, [section]: { ...(current[section] as Record<string, unknown>), [key]: value } }));
  }

  function moveVisibleSection(key: string, direction: -1 | 1) {
    setDraft(current => {
      const order = [...(current.layout.sectionOrder ?? fallback.layout.sectionOrder)];
      const visibleSet = new Set(current.layout.visibleSections ?? fallback.layout.visibleSections);
      const visibleOrder = order.filter(item => visibleSet.has(item));
      const index = visibleOrder.indexOf(key);
      const nextIndex = index + direction;
      if (index < 0 || nextIndex < 0 || nextIndex >= visibleOrder.length) return current;
      [visibleOrder[index], visibleOrder[nextIndex]] = [visibleOrder[nextIndex], visibleOrder[index]];
      let visibleIndex = 0;
      const sectionOrder = order.map(item => visibleSet.has(item) ? visibleOrder[visibleIndex++] : item);
      return { ...current, layout: { ...current.layout, sectionOrder } };
    });
  }

  async function save(publish: boolean) {
    if (publish) {
      const selectedMedia = [
        { id: draft.identity.logoMediaId, label: "logo", allowed: ["image"] },
        { id: draft.identity.mascotMediaId, label: "mascot", allowed: ["image", "sprite"] },
        { id: draft.identity.narrationMediaId, label: "narration", allowed: ["audio"] },
        { id: draft.hero.mediaId, label: "hero background", allowed: ["image", "video"] }
      ].filter((asset): asset is { id: string; label: string; allowed: string[] } => typeof asset.id === "string" && asset.id.length > 0);
      const invalidAsset = selectedMedia.find(asset => {
        const stored = mediaOptions.find(item => item.media_id === asset.id);
        return !stored || !stored.is_published || !asset.allowed.includes(stored.media_type);
      });
      if (invalidAsset) {
        setStatus("Your draft is safe, but the selected " + invalidAsset.label + " is missing, private or the wrong file type. Choose a compatible published asset in Media Library, reload this draft, then publish the website.");
        return;
      }
    }
    const supabase = getSupabaseBrowserClient();
    if (!supabase || saving) return;
    setSaving(true);
    setStatus(publish ? "Publishing the verified draft…" : "Saving draft…");
    try {
      const { data: userData, error: userError } = await supabase.auth.getUser();
      if (userError) throw userError;
      if (!userData.user) {
        router.replace("/creator/login");
        return;
      }
      const { data: admin, error: adminError } = await supabase
        .from("creator_admins").select("user_id").eq("user_id", userData.user.id).eq("active", true).maybeSingle();
      if (adminError) throw adminError;
      if (!admin) {
        setStatus("Creator access is required for this action.");
        return;
      }
      const saved = await supabase.rpc("save_site_config_draft", { p_config: draft, p_expected_revision: revision });
      if (saved.error || !saved.data?.[0]) {
        setStatus(saved.error?.message?.includes("revision conflict") ? "Another edit changed this draft. Reload it before trying again." : "Draft save failed. Check the configuration and try again.");
        return;
      }
      const nextRevision = Number(saved.data[0].new_revision);
      setRevision(nextRevision);
      setSavedSnapshot(JSON.stringify(draft));
      if (publish) {
        const result = await supabase.rpc("publish_site_config", { p_expected_revision: nextRevision });
        if (result.error || !result.data?.[0]) {
          setStatus("Draft saved, but publishing failed. Your published site has not been changed.");
          return;
        }
        setStatus("Published successfully. The public website now reads this version.");
      } else {
        setStatus("Draft saved privately. Publish when you're ready.");
      }
      router.refresh();
    } catch (error) {
      setStatus(error instanceof Error ? "Connection failed while saving: " + error.message : "Connection failed while saving. Your last confirmed draft state is unchanged.");
    } finally {
      setSaving(false);
    }
  }

  return <section id="creator-settings" className="creator-editor" dir={isArabic?"rtl":"ltr"} lang={locale} aria-busy={busy || saving}>
    <div className="editor-topline"><span className="eyebrow">LIVE CONFIGURATION / DRAFT {revision} · {hasUnsavedChanges ? t.unsaved : t.saved}</span><button className="editor-reload" onClick={() => { if (hasUnsavedChanges && !window.confirm("Discard your unsaved changes and reload the saved draft?")) return; setBusy(true); void load(); }} disabled={busy || saving}>{t.reload}</button></div>
    {busy ? <p className="editor-status" role="status" aria-live="polite">{status}</p> : <>
      <div className="draft-preview-wrap"><div className="draft-preview-label"><span>{t.preview}</span><small>{t.private}</small></div><div className={"draft-preview theme-" + draft.appearance.theme} style={{"--preview-accent": draft.appearance.accent || "#C8FF4D"} as React.CSSProperties & {"--preview-accent": string}}><div className="draft-preview-top"><span>{draft.identity.siteName || "Your website name"}</span><span>PREVIEW / 01</span></div><div className="draft-preview-main"><span className="draft-preview-eyebrow">{draft.identity.tagline || "Your tagline"}</span><h3>{draft.hero.title || "Your headline goes here"}</h3><p>{draft.hero.body || "Your description will appear here."}</p><span className="draft-preview-cta">{draft.featureFlags.polls ? "CAST YOUR VOTE ↗" : draft.featureFlags.ideas ? "SUBMIT AN IDEA ↗" : "EXPLORE ↗"}</span></div><div className="draft-preview-sections">{(draft.layout.sectionOrder ?? []).filter(key=>(draft.layout.visibleSections ?? []).includes(key)).map((key,index)=><span key={key}>{String(index+1).padStart(2,"0")} / {({hero:"Hero",ideas:"Ideas",poll:"Voting",events:"Events",community:"Community",socials:"Social links",videos:"Published videos"} as Record<string,string>)[key] ?? key}</span>)}</div>{draft.maintenance.enabled && <div className="draft-preview-maintenance">MAINTENANCE MODE · {draft.maintenance.message}</div>}</div></div><div className="editor-section-title"><span>01 / {t.identity}</span><h2>{t.headline}<em>{t.emphasis}</em></h2><p>{t.identityDesc}</p></div>
      <div className="editor-grid">
        <label>{t.brand}<input value="Nhen? / نهين؟" readOnly aria-label="Fixed Nhen bilingual brand identity" /><small>{t.fixed}</small></label>
        <label>{t.tagline}<input maxLength={240} value={draft.identity.tagline} onChange={e=>update("identity","tagline",e.target.value)} /></label>
        <label>{t.heroTitle}<input maxLength={180} value={draft.hero.title} onChange={e=>update("hero","title",e.target.value)} /></label>
        <label>{t.heroBody}<textarea maxLength={1000} rows={3} value={draft.hero.body} onChange={e=>update("hero","body",e.target.value)} /></label>
        <label>{t.theme}<select value={draft.appearance.theme} onChange={e=>update("appearance","theme",e.target.value)}><option value="obsidian">Obsidian</option><option value="paper">Paper</option><option value="violet">Violet</option><option value="custom">Custom</option></select></label>
        <label>{t.accent}<input type="color" value={draft.appearance.accent || "#C8FF4D"} onChange={e=>update("appearance","accent",e.target.value)} /></label>
        <label>{t.colorMode}<select value={draft.appearance.colorMode || "dark"} onChange={e=>update("appearance","colorMode",e.target.value)}><option value="dark">{t.dark}</option><option value="light">{t.light}</option><option value="system">{t.system}</option></select><small>Controls the overall site surface independently of the selected theme.</small></label>
        <label>{t.motion}<select value={draft.appearance.motion || "full"} onChange={e=>update("appearance","motion",e.target.value)}><option value="full">{t.full}</option><option value="reduced">{t.reduced}</option><option value="off">{t.minimal}</option></select><small>Respects visitors who prefer less movement and can disable decorative transitions.</small></label>
      </div>
      <div className="editor-grid">
        <label>{t.logo}<select value={draft.identity.logoMediaId ?? ""} onChange={e=>update("identity","logoMediaId",e.target.value || null)}><option value="">{t.defaultLogo}</option>{mediaOptions.filter(item=>item.media_type==="image").map(item=><option key={item.media_id} value={item.media_id}>{item.title} · {item.is_published ? "Published" : "Private draft"}</option>)}</select><small>Choose a published image for the public site. Private drafts can be selected now and published in Media Library before the site itself.</small></label>
        <label>{t.heroMedia}<select value={draft.hero.mediaId ?? ""} onChange={e=>update("hero","mediaId",e.target.value || null)}><option value="">{t.defaultHero}</option>{mediaOptions.filter(item=>item.is_published && (item.media_type==="image" || item.media_type==="video")).map(item=><option key={item.media_id} value={item.media_id}>{item.title} · {item.media_type}</option>)}</select></label>
      </div>
      <LogoStudio onCreated={item=>{setMediaOptions(current=>[item,...current.filter(existing=>existing.media_id!==item.media_id)]);update("identity","logoMediaId",item.media_id);}} />
      <p className="media-upload-note">Only published assets can be selected for the public site. Upload and publish files in the Media Library first.</p>
      <div className="editor-grid">
        <label>{t.mascot}<select value={draft.identity.mascotMediaId ?? ""} onChange={e=>update("identity","mascotMediaId",e.target.value || null)}><option value="">{t.noMascot}</option>{mediaOptions.filter(item=>item.is_published && item.media_type==="image").map(item=><option key={item.media_id} value={item.media_id}>{item.title}</option>)}</select></label>
        <label>{t.narration}<select value={draft.identity.narrationMediaId ?? ""} onChange={e=>update("identity","narrationMediaId",e.target.value || null)}><option value="">{t.noNarration}</option>{mediaOptions.filter(item=>item.is_published && item.media_type==="audio").map(item=><option key={item.media_id} value={item.media_id}>{item.title}</option>)}</select></label>
      </div>
      <label>{t.transcript}<textarea rows={4} maxLength={1600} value={draft.identity.narrationText ?? ""} onChange={e=>update("identity","narrationText",e.target.value)} placeholder="Write the words visitors should see alongside the voice-over…" /></label>
      <label className="editor-check"><input type="checkbox" checked={draft.identity.narrationAutoPlay !== false} onChange={e=>update("identity","narrationAutoPlay",e.target.checked)} /> {t.autoplay} <small>Browsers may block audible autoplay; a visible play button remains available.</small></label>
      <div className="editor-grid">
        <label>{t.overlay}<input type="range" min="0" max="0.85" step="0.05" value={typeof draft.hero.overlay === "number" ? draft.hero.overlay : 0.35} onChange={e=>update("hero","overlay",Number(e.target.value))} /><small>{Math.round(Number(draft.hero.overlay ?? 0.35)*100)}% dark overlay</small></label>
        <label className="editor-check"><input type="checkbox" checked={draft.hero.muted !== false} onChange={e=>update("hero","muted",e.target.checked)} /> {t.mute}</label>
        <label className="editor-check"><input type="checkbox" checked={draft.hero.loop !== false} onChange={e=>update("hero","loop",e.target.checked)} /> {t.loop}</label>
      </div>
      <p className="media-upload-note">Mascots use published images for now. Narration attempts autoplay where browser permissions allow it. If audible autoplay is blocked, visitors get a clear play control. Keep the transcript concise and readable.</p>
      <div className="editor-divider" />
      <div className="editor-section-title"><span>02 / {t.experience}</span><h2>{t.choose}<em>{t.appears}</em></h2><p>{t.experienceDesc}</p></div>
      <div className="feature-toggle-grid">
        {([["polls",t.polls],["ideas",t.ideas],["events",t.events],["guidedTour",t.tour],["mascot","Mascot"],["voice",t.voice],["miniGames",t.games],["store",t.store]] as const).map(([key,label])=><label className="feature-toggle" key={key}><span><strong>{label}</strong><small>{key === "store" ? "Keep disabled until the store is ready." : "Enable or disable this experience."}</small></span><input type="checkbox" checked={draft.featureFlags[key]} onChange={e=>setDraft(current=>({...current,featureFlags:{...current.featureFlags,[key]:e.target.checked}}))} /></label>)}
      </div>
      <div className="editor-divider" />
      <div className="editor-section-title"><span>03 / {t.layout}</span><h2>{t.stage}<em>{t.stage2}</em></h2><p>{t.layoutDesc}</p></div>
      <div className="feature-toggle-grid">
        {([["hero",t.hero],["ideas",t.ideaBoard],["poll",t.voting],["events","Events"],["community",t.community],["socials",t.socials],["videos",t.videos]] as const).map(([key,label])=><label className="feature-toggle" key={key}><span><strong>{label}</strong><small>Show or hide this public section.</small></span><input type="checkbox" checked={(draft.layout.visibleSections ?? []).includes(key)} onChange={e=>setDraft(current=>({...current,layout:{...current.layout,visibleSections:e.target.checked?Array.from(new Set([...current.layout.visibleSections,key])):current.layout.visibleSections.filter(item=>item!==key)}}))} /></label>)}
      </div>
      <div className="section-order-panel">
        <div className="section-order-heading"><strong>{isArabic?"ترتيب أقسام الموقع":"Public section order"}</strong><span>Move visible sections up or down. Publish to apply.</span></div>
        {(draft.layout.sectionOrder ?? fallback.layout.sectionOrder).filter(key=>(draft.layout.visibleSections ?? []).includes(key)).map((key,index,items)=><div className="section-order-row" key={key}><span className="section-order-index">{String(index+1).padStart(2,"0")}</span><strong>{({hero:"Hero",ideas:"Idea board",poll:"Voting",events:"Events",community:"Community banner",socials:"Social links"} as Record<string,string>)[key] ?? key}</strong><div className="section-order-actions"><button type="button" aria-label={key+" up"} disabled={index===0} onClick={()=>moveVisibleSection(key,-1)}>↑</button><button type="button" aria-label={key+" down"} disabled={index===items.length-1} onClick={()=>moveVisibleSection(key,1)}>↓</button></div></div>)}
      </div>
      <div className="editor-divider" />
      <div className="editor-section-title"><span>04 / {t.availability}</span><h2>{t.doors}<em>{t.doors2}</em></h2><p>{isArabic?"يمكن إيقاف وضع الصيانة لاحقًا، ويُحفظ ضمن المسودة.":"Maintenance mode is reversible and stored in the draft."}</p></div>
      <label className="maintenance-toggle"><input type="checkbox" checked={draft.maintenance.enabled} onChange={e=>update("maintenance","enabled",e.target.checked)} /><span><strong>{t.maintenance}</strong><small>{t.maintenanceDesc}</small></span></label>
      <label className="editor-full-label">{t.maintenanceMessage}<textarea rows={2} maxLength={240} value={draft.maintenance.message} onChange={e=>update("maintenance","message",e.target.value)} /></label>
      <div className="editor-actions"><button className="button button-secondary" onClick={() => void save(false)} disabled={saving || busy}>{t.save}</button><button className="button button-primary" onClick={() => void save(true)} disabled={saving || busy}>{t.publish}</button></div>
      <p className="editor-status" role="status" aria-live="polite">{status}</p>
    </>}
  </section>;
}

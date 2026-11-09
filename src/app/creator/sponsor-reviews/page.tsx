import {redirect} from "next/navigation";
import {cookies} from "next/headers";
import {createSupabaseServerClient} from "@/lib/supabase/server";
import SponsorReviewAdmin from "./sponsor-review-admin";

export const dynamic="force-dynamic";
export default async function SponsorReviewPage(){
 const [supabase,cookieStore]=await Promise.all([createSupabaseServerClient(),cookies()]);
 const locale=cookieStore.get("nhen_locale")?.value==="ar"?"ar":"en";
 if(!supabase)redirect("/creator/login?setup=required");
 const {data:claims,error:claimsError}=await supabase.auth.getClaims();
 const userId=claims?.claims?.sub;
 if(claimsError||typeof userId!=="string")redirect("/creator/login");
 const {data:admin,error}=await supabase.from("creator_admins").select("role").eq("user_id",userId).eq("active",true).maybeSingle();
 if(error||!admin||!["owner","admin"].includes(admin.role))redirect("/creator/login?access=restricted");
 return <main className="dashboard-shell raye2-creator-shell" dir={locale==="ar"?"rtl":"ltr"} lang={locale}>
  <div className="dashboard-content"><a className="logout-button" href="/creator">← Creator workspace</a><SponsorReviewAdmin locale={locale}/></div>
 </main>;
}

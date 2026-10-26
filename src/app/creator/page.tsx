import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CreatorEditor from "./editor";

export const dynamic = "force-dynamic";

export default async function CreatorDashboardPage() {
  const supabase = await createSupabaseServerClient();
  if (!supabase) redirect("/creator/login?setup=required");
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || typeof claims?.claims?.sub !== "string") redirect("/creator/login");

  const { data, error } = await supabase.rpc("get_site_config_draft");
  if (error) redirect(error.code === "42501" ? "/creator/login?access=not-enabled" : "/creator/login?setup=required");
  const draft = Array.isArray(data) ? data[0] : data;
  if (!draft?.draft || !Number.isSafeInteger(draft.draft_revision)) redirect("/creator/login?setup=required");

  return <main className="dashboard-shell">
    <header className="dashboard-topbar"><a className="wordmark" href="/">THE INNER CIRCLE<span>®</span></a><span className="admin-session"><i /> AUTHENTICATED WORKSPACE</span><form action="/creator/logout" method="post"><button className="logout-button" type="submit">Sign out ↗</button></form></header>
    <div className="dashboard-content">
      <div className="dashboard-welcome"><div><span className="eyebrow">CREATOR CONTROL ROOM / OVERVIEW</span><h1>Make it <em>yours.</em></h1><p>Edit the public experience, save private drafts, and publish changes when you are ready.</p></div><span className="draft-badge">● DEVELOPMENT / DRAFT</span></div>
      <CreatorEditor initialConfig={draft.draft} initialRevision={draft.draft_revision}/>
      <p className="dashboard-disclaimer">Creator access is verified server-side against the database allowlist. Public visitors can read only published settings; draft saving and publishing require an active creator account.</p>
    </div>
  </main>;
}

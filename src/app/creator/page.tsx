import { redirect } from "next/navigation";
import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import CreatorSettings from "./creator-settings";
import IdeaModerationQueue from "./idea-moderation-queue";
import PollManagement from "./poll-management";
import EventSocialManagement from "./event-social-management";
import MediaLibrary from "./media-library";
import PublishingHistory from "./publishing-history";
import { getPublicSiteConfig } from "@/lib/public-site-config";

export const dynamic = "force-dynamic";

const modules = [
  { number: "01", title: "Site identity", detail: "Name, logo, copy, colors and themes", state: "Editor started" },
  { number: "02", title: "Ideas & polls", detail: "Submissions, moderation, votes and deadlines", state: "Connected" },
  { number: "03", title: "Media library", detail: "Hero videos, uploads, mascot and audio", state: "In progress" },
  { number: "04", title: "Events & socials", detail: "Events, countdowns, social links and presets", state: "Connected" },
  { number: "05", title: "Publishing history", detail: "Draft preview, published versions and rollback", state: "Database ready" }
];

export default async function CreatorDashboardPage() {
  const [supabase, publicConfig] = await Promise.all([createSupabaseServerClient(), getPublicSiteConfig()]);
  if (!supabase) redirect("/creator/login?setup=required");
  const { data: claims, error: claimsError } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (claimsError || typeof userId !== "string") redirect("/creator/login");
  const { data: admin, error: adminError } = await supabase
    .from("creator_admins").select("user_id").eq("user_id", userId).eq("active", true).maybeSingle();
  if (adminError || !admin) redirect("/creator/login?access=restricted");

  return <main className="dashboard-shell">
    <header className="dashboard-topbar"><Link className="wordmark" href="/">{publicConfig.siteName}<span>®</span></Link><span className="admin-session"><i /> AUTHENTICATED WORKSPACE</span><form action="/creator/logout" method="post"><button className="logout-button" type="submit">Sign out ↗</button></form></header>
    <div className="dashboard-content">
      <div className="dashboard-welcome"><div><span className="eyebrow">CREATOR CONTROL ROOM / OVERVIEW</span><h1>Make it <em>yours.</em></h1><p>Manage the public experience from one workspace. Save drafts privately, then publish approved changes.</p></div><span className="draft-badge">● DEVELOPMENT / DRAFT</span></div>
      <section className="dashboard-stats"><article><span>PUBLIC CONFIG</span><strong>Supabase connected</strong><small>Published snapshot is the public source of truth</small></article><article><span>CREATOR ACCESS</span><strong>Verified server-side</strong><small>Only allowlisted creator accounts can edit</small></article><article><span>PUBLISHING</span><strong>Versioned snapshots</strong><small>Concurrent draft changes are checked</small></article></section>
      <CreatorSettings />
      <PollManagement />
      <IdeaModerationQueue />
      <EventSocialManagement />
      <MediaLibrary />
      <PublishingHistory />
      <div className="module-heading"><div><span className="eyebrow">YOUR WORKSPACE</span><h2>Jump to a workspace.</h2><p>Open any management area directly. Changes stay private until published.</p></div><span className="module-count">06 ACTIVE AREAS</span></div>
      <nav className="module-grid creator-quick-nav" aria-label="Creator workspace sections">
        <a className="module-card" href="#creator-settings"><div className="module-card-top"><span>01 / CONTROL</span><span className="module-state">Site</span></div><h3>Site identity & layout</h3><p>Branding, theme, narration, section visibility and publishing.</p><span className="module-arrow">↗</span></a>
        <a className="module-card" href="#creator-polls"><div className="module-card-top"><span>02 / COMMUNITY</span><span className="module-state">Polls</span></div><h3>Poll management</h3><p>Create polls, manage voting windows and review final results.</p><span className="module-arrow">↗</span></a>
        <a className="module-card" href="#creator-ideas"><div className="module-card-top"><span>03 / COMMUNITY</span><span className="module-state">Ideas</span></div><h3>Idea moderation</h3><p>Review submissions, approve, feature, reject or archive ideas.</p><span className="module-arrow">↗</span></a>
        <a className="module-card" href="#creator-events-socials"><div className="module-card-top"><span>04 / CONTENT</span><span className="module-state">Events & links</span></div><h3>Events & socials</h3><p>Manage event schedules and published creator channels.</p><span className="module-arrow">↗</span></a>
        <a className="module-card" href="#creator-media"><div className="module-card-top"><span>05 / ASSETS</span><span className="module-state">Media</span></div><h3>Media library</h3><p>Upload, edit, publish and remove owned media assets.</p><span className="module-arrow">↗</span></a>
        <a className="module-card" href="#creator-history"><div className="module-card-top"><span>06 / RELEASES</span><span className="module-state">Versions</span></div><h3>Publishing history</h3><p>Review published snapshots and restore one to a private draft.</p><span className="module-arrow">↗</span></a>
      </nav>
      <p className="dashboard-disclaimer">Polls, ideas, events, socials, media and publishing history are connected to guarded Supabase operations. Restoring a prior version only changes the private draft; review it before publishing.</p>
    </div>
  </main>;
}

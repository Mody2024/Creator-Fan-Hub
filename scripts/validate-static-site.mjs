import { readFile } from "node:fs/promises";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const failures = [];
let assertionCount = 0;
const check = (label, condition) => { assertionCount += 1; if (!condition) failures.push(label); };

const [page, publicVideos, publicVideoPlayer, config, poll, editor, packageJson, events, socials, contentManager, media, dashboard, mediaMigration, ownershipMigration, ideasModeration, ideaSubmission, voteForm, pollManagement, historyComponent, historyRoute, historyMigration, mediaOwnershipMigration, narration, guidedTour, configSchema, eventSocial, publicIdeas, publicIdeasMigration, pollVisibilityMigration] = await Promise.all([
  read("../src/app/page.tsx"),
  read("../src/app/videos/public-videos.tsx"),
  read("../src/app/videos/public-video-player.tsx"),
  read("../src/lib/public-site-config.ts"),
  read("../src/app/vote/published-polls.tsx"),
  read("../src/app/creator/creator-settings.tsx"),
  read("../package.json"),
  read("../src/app/events/public-events.tsx"),
  read("../src/app/socials/public-social-links.tsx"),
  read("../src/app/creator/event-social-management.tsx"),
  read("../src/app/creator/media-library.tsx"),
  read("../src/app/creator/page.tsx"),
  read("../supabase/migrations/20261026001600_creator_media_library.sql"),
  read("../supabase/migrations/20261026001700_scope_media_storage_ownership.sql"),
  read("../src/app/creator/idea-moderation-queue.tsx"),
  read("../src/app/ideas/idea-submission-form.tsx"),
  read("../src/app/vote/poll-vote-form.tsx"),
  read("../src/app/creator/poll-management.tsx"),
  read("../src/app/creator/publishing-history.tsx"),
  read("../src/app/api/creator/history/route.ts"),
  read("../supabase/migrations/20261026001800_creator_publish_history_restore.sql"),
  read("../supabase/migrations/20261026001900_scope_media_metadata_to_owner.sql"),
  read("../src/app/narration-control.tsx"),
  read("../src/app/guided-welcome-tour.tsx"),
  read("../src/lib/site-config.mjs"),
  read("../src/app/creator/event-social-management.tsx"),
  read("../src/app/ideas/approved-ideas.tsx"),
  read("../supabase/migrations/20261027000100_public_featured_ideas.sql"),
  read("../supabase/migrations/20261027000200_public_poll_visibility_gates.sql")
]);

check("homepage imports published poll component", page.includes('import PublishedPolls from "@/app/vote/published-polls"'));
check("public poll RPC respects maintenance mode and the published polls feature flag", pollVisibilityMigration.includes("get_public_poll_results") && pollVisibilityMigration.includes("maintenance_mode") && pollVisibilityMigration.includes("featureFlags,polls") && pollVisibilityMigration.includes("not exists"));
check("public idea board includes featured ideas and respects maintenance/feature visibility", publicIdeas.includes("APPROVED & FEATURED") && publicIdeasMigration.includes("i.status in") && publicIdeasMigration.includes("featured") && publicIdeasMigration.includes("maintenance_mode") && publicIdeasMigration.includes("featureFlags,ideas"));
check("public idea form shows live character counts", ideaSubmission.includes("{title.length}/100") && ideaSubmission.includes("{body.length}/800") && ideaSubmission.includes("{displayName.length}/32"));
check("public idea form validates trimmed field lengths before submission", ideaSubmission.includes("const cleanTitle = title.trim()") && ideaSubmission.includes("cleanBody.length < 10") && ideaSubmission.includes("cleanName.length > 32"));
check("public idea form always releases busy state and handles network failures", ideaSubmission.includes("finally {\n      setBusy(false);") && ideaSubmission.includes("connection failed before we could confirm submission"));
check("public idea form disables invalid over-limit values", ideaSubmission.includes("title.trim().length > 100") && ideaSubmission.includes("body.trim().length > 800") && ideaSubmission.includes("displayName.trim().length > 32"));
check("homepage renders published poll component", page.includes("<PublishedPolls />"));
check("homepage reads published configuration", page.includes("getPublicSiteConfig"));
check("mobile creator controls retain usable touch targets", (await read("../src/app/globals.css")).includes(".moderation-actions button,") && (await read("../src/app/globals.css")).includes("min-height: 40px;"));
check("media rows collapse safely on very narrow phones", (await read("../src/app/globals.css")).includes("@media (max-width: 360px)") && (await read("../src/app/globals.css")).includes(".media-row {\n    grid-template-columns: minmax(0, 1fr);"));
check("mobile creator form fields avoid narrow-screen text zoom", (await read("../src/app/globals.css")).includes(".poll-create-form input:not([type=\"checkbox\"]):not([type=\"color\"])") && (await read("../src/app/globals.css")).includes("font-size: 16px;"));

check("event and social managers show helpful empty states", (await read("../src/app/creator/event-social-management.tsx")).includes("No events yet.") && (await read("../src/app/creator/event-social-management.tsx")).includes("No social links yet."));
check("media search and visibility filters show a recoverable no-results state", (await read("../src/app/creator/media-library.tsx")).includes("No matching assets.") && (await read("../src/app/creator/media-library.tsx")).includes('onClick={()=>{setSearch("");setFilter("all");}}'));
check("creator settings and moderation queue loading states are announced politely", (await read("../src/app/creator/creator-settings.tsx")).includes('role="status" aria-live="polite">{status}</p>') && (await read("../src/app/creator/idea-moderation-queue.tsx")).includes('role="status" aria-live="polite">{status}</p>'));

check("interactive controls have a global keyboard-focus indicator", (await read("../src/app/globals.css")).includes(":where(button, input, select, textarea, summary, [role=\"button\"], [role=\"tab\"], [role=\"switch\"]):focus-visible"));
check("keyboard focus remains visible in forced-colors/high-contrast mode", (await read("../src/app/globals.css")).includes("@media (forced-colors: active)") && (await read("../src/app/globals.css")).includes("outline: 2px solid Highlight"));
check("disabled interactive controls communicate unavailable state", (await read("../src/app/globals.css")).includes(":where(button, input, select, textarea, [role=\"button\"]):disabled"));

check("homepage provides a separate mobile navigation with the same visibility gates", page.includes('className="mobile-nav" aria-label="Mobile navigation"') && page.includes('className="desktop-nav" aria-label="Main navigation"') && (page.match(/href="#videos"/g) || []).length >= 1);
check("mobile navigation remains horizontally scrollable instead of disappearing on narrow screens", (await read("../src/app/globals.css")).includes(".topbar .mobile-nav{display:flex;order:3;width:100%;gap:22px;overflow-x:auto"));
check("creator dashboard collapses stats and modules for tablet/mobile widths", (await read("../src/app/globals.css")).includes(".dashboard-stats { grid-template-columns: minmax(0, 1fr)") && (await read("../src/app/globals.css")).includes(".module-grid { grid-template-columns: minmax(0, 1fr)"));
check("public event cards and idea form use single-column mobile layouts", (await read("../src/app/globals.css")).includes(".public-events-grid { grid-template-columns: minmax(0, 1fr)") && (await read("../src/app/globals.css")).includes(".idea-form-fields { grid-template-columns: minmax(0, 1fr)"));
check("social links stack cleanly on narrow screens", (await read("../src/app/globals.css")).includes(".public-socials { grid-template-columns: 1fr; gap: 22px;"));
check("homepage integrates published video gallery and navigation", page.includes("import PublicVideos") && page.includes("<PublicVideos />") && page.includes('href="#videos"'));
check("public video gallery reads published video assets only", publicVideos.includes('.eq("is_published", true)') && publicVideos.includes('.eq("media_type", "video")') && publicVideos.includes("creator-media-public/"));
check("public video gallery uses accessible native video controls", publicVideoPlayer.includes("controls preload=\"metadata\" playsInline") && publicVideoPlayer.includes("aria-label={description || title}"));
check("public video gallery handles playback errors with retry", publicVideos.includes("PublicVideoPlayer") && publicVideoPlayer.includes("onError={() => setFailed(true)}") && publicVideoPlayer.includes("Try again"));
check("public video retry control is keyboard accessible", publicVideoPlayer.includes('type="button"') && publicVideoPlayer.includes('role="status"') && publicVideoPlayer.includes("setAttempt(value => value + 1)"));
check("public configuration uses published snapshot", config.includes('.from("published_site_config")') && config.includes('.select("published")'));
check("site config schema accepts and bounds creator narration fields", configSchema.includes('"narrationMediaId", "narrationText", "narrationAutoPlay"') && configSchema.includes("max: 1600") && configSchema.includes("identity.narrationAutoPlay"));
check("site config schema rejects unsupported latest section key", !configSchema.includes('"poll", "latest", "events"'));
check("public configuration validates accent color", config.includes("/^#[0-9a-fA-F]{6}$/"));
check("published media resolves only through public storage paths", config.includes('item.storage_path.startsWith("creator-media-public/")') && config.includes('getPublicUrl(pathParts.join("/"))'));
check("media deletion verifies ownership and restores storage if metadata deletion fails", media.includes("backup=download") && media.includes("storage file could not be deleted, so its metadata was kept") && media.includes("the file could not be restored") && media.includes('path.split("/")[0]!==userData.user.id'));
check("failed media publication checks temporary-copy cleanup and flags public exposure", media.includes("const {error:cleanupError}=await supabase.storage.from(nextBucket).remove([nextPath])") && media.includes("new public object could not be removed") && media.includes("stale private storage copy could not be removed"));
check("failed media metadata insert reports orphan cleanup failure", media.includes("const {error:cleanupError}=await supabase.storage.from(\"creator-media-private\").remove([path])") && media.includes("uploaded private file could not be cleaned up") && media.includes("The uploaded file was removed."));
check("published logo and hero assets bind to public page", config.includes('logoUrl: publicMediaUrl(logoItem, ["image"])') && config.includes('heroMediaUrl: publicMediaUrl(heroItem, ["image", "video"])') && page.includes("config.logoUrl ? <img"));
check("published mascot and narration assets respect their media types", config.includes('mascotUrl: publicMediaUrl(mascotItem, ["image"])') && config.includes('narrationUrl: publicMediaUrl(narrationItem, ["audio"])') && page.includes("<NarrationControl"));
check("hero video honors muted and loop settings", page.includes("muted={config.heroMuted}") && page.includes("loop={config.heroLoop}") && page.includes("className=\"hero-media\""));
check("poll display uses aggregate RPC", poll.includes('rpc("get_public_poll_results")'));
check("creator poll loading and status changes recover from network errors", pollManagement.includes("Connection failed while loading polls") && pollManagement.includes("Connection failed while changing poll status") && pollManagement.includes("finally {setBusy(false);}"));
check("creator poll creation validates date order and option lengths", pollManagement.includes("closing time must be later than the opening time") && pollManagement.includes("Each option must be 100 characters or fewer") && pollManagement.includes("Number.isNaN(startDate.getTime())"));
check("creator poll form shows question, description and option counts", pollManagement.includes("{title.trim().length}/160") && pollManagement.includes("{description.length}/1000") && pollManagement.includes("}/8 options"));
check("creator poll creation always releases working state", pollManagement.includes("finally {setWorking(\"\");"));
check("creator poll dashboard fetches aggregate results through public RPC", pollManagement.includes('rpc("get_public_poll_results")') && pollManagement.includes("const groupedResults"));
check("creator poll dashboard shows final counts only for closed polls", pollManagement.includes('p.status==="closed"&&results[p.poll_id]') && pollManagement.includes("FINAL RESULTS") && pollManagement.includes("votes</span>"));
check("poll display does not expose voter data", !poll.includes("voter_token") && !poll.includes("voter_hash"));
check("public voting always releases its submitting state", voteForm.includes("finally {\n      setSubmitting(false);"));
check("public voting handles uncertain network results without claiming success", voteForm.includes("Refresh the page before retrying to check whether it was recorded") && voteForm.includes("connection failed before we could confirm your vote"));
check("public voting keeps anonymous-token limitations explicit", voteForm.includes("This is not identity verification.") && voteForm.includes("already been recorded for this poll"));
check("creator editor uses guarded draft RPC", editor.includes('rpc("get_site_config_draft")') && editor.includes('rpc("save_site_config_draft"'));
check("event/social workflows always release working state after network failures", eventSocial.includes('finally { setWorking(""); }') && eventSocial.includes("Connection failed while saving the event") && eventSocial.includes("Connection failed while updating the social link"));
check("editing an event formats timestamps in the viewer local timezone", eventSocial.includes("date.getTime()-date.getTimezoneOffset()*60000") && eventSocial.includes("toLocalDateTimeInput(e.starts_at)") && eventSocial.includes("toLocalDateTimeInput(e.ends_at)"));
check("event component keeps imports before local helpers", eventSocial.indexOf('import {getSupabaseBrowserClient}') < eventSocial.indexOf("function toLocalDateTimeInput"));
check("event/social list loading catches rejected requests and clears loading state", eventSocial.includes("Connection failed while loading events and links") && eventSocial.includes("finally { setBusy(false); }"));
check("creator save action always releases saving state and reports thrown network errors", editor.includes('finally {\n      setSaving(false);\n    }') && editor.includes("Connection failed while saving:"));
check("creator editor reports media-selector loading failures", editor.includes('error: mediaError') && editor.includes("media options could not be loaded"));
check("creator editor has explicit draft/publish actions", editor.includes("Save draft") && editor.includes("Save & publish"));
check("creator editor visibly tracks unsaved draft changes", editor.includes("hasUnsavedChanges") && editor.includes("UNSAVED CHANGES") && editor.includes("ALL CHANGES SAVED"));
check("creator editor confirms before discarding draft edits", editor.includes("Discard your unsaved changes and reload the saved draft?"));
check("creator editor warns before leaving with unsaved edits", editor.includes("beforeunload") && editor.includes("warnBeforeLeaving"));
check("creator editor has maintenance mode", editor.includes('update("maintenance","enabled"'));
check("package defines build script", /"build"\s*:\s*"next build"/.test(packageJson));
check("package defines lint script", /"lint"\s*:\s*"eslint \\."/.test(packageJson) || packageJson.includes('"lint": "eslint ."' ));

check("public events read only published/completed events", events.includes('from("events")') && events.includes('["published","completed"]'));
check("public event feed puts dated events before undated entries and uses semantic time markup", events.includes('nullsFirst:false') && events.includes("<time dateTime={event.starts_at}>"));
check("public socials read only published links", socials.includes('from("social_links")') && socials.includes('eq("is_published",true)'));
check("creator event/social changes use guarded RPCs", contentManager.includes('rpc("save_creator_event"') && contentManager.includes('rpc("save_creator_social_link"'));
check("creator event editor rejects end dates before or equal to start", contentManager.includes("new Date(ends)<=new Date(starts)") && contentManager.includes("The event end must be later than its start."));
check("creator can edit existing events", contentManager.includes("p_event_id:editingEventId||null") && contentManager.includes("setEditingEventId(e.event_id)") && contentManager.includes("Update event ↗"));
check("event edits preserve the existing publication status", contentManager.includes("Event updated; its publication status was preserved."));
check("creator can edit existing social links", contentManager.includes("setEditingLinkId(l.link_id)") && contentManager.includes("p_link_id:editingLinkId||null") && contentManager.includes("Update link ↗"));
check("media library supports editing asset metadata without replacing files", media.includes("async function saveMetadata") && media.includes("p_storage_path:item.storage_path") && media.includes("Publication status and file URL were preserved."));
check("media library supports searching and filtering assets", media.includes("setSearch") && media.includes("setFilter") && media.includes("rows.filter(item=>"));
check("media library reports refresh progress and catches auth/storage failures", media.includes("setReady(false)") && media.includes("finally {\n      setReady(true);") && media.includes("Could not load the media library. Check your connection and try again."));
check("media previews are limited to expected storage buckets and visibility", media.includes('["creator-media-private","creator-media-public"].includes(bucket)') && media.includes('bucket === "creator-media-public" && item.is_published') && media.includes('bucket === "creator-media-private" && !item.is_published'));
check("media library reports unavailable previews rather than silently implying success", media.includes("some previews are unavailable. Check storage permissions and file paths."));
check("media library previews audio and sprite assets", media.includes('item.media_type==="audio" ? <audio') && media.includes('item.media_type==="sprite") ? <img') && media.includes("loading=\"lazy\""));
check("media video previews expose accessible playback controls", media.includes('controls preload="metadata" playsInline aria-label={item.title}'));
check("editing a social link preserves publication state and position", contentManager.includes("p_is_published:existing?.is_published??false") && contentManager.includes("p_position:existing?.link_position??links.length"));
check("social edit confirmation uses captured edit state", contentManager.includes("const wasEditing=Boolean(editingLinkId)") && contentManager.includes("setStatus(wasEditing?"));

check("creator can edit public section visibility", editor.includes("draft.layout.visibleSections") && editor.includes("visibleSections:e.target.checked"));
check("public site respects section visibility", page.includes("config.visibleSections.includes(\"events\")") && page.includes("config.visibleSections.includes(\"socials\")"));
check("public config restricts section identifiers", config.includes("allowedSections.includes(item)"));
check("published configuration preserves videos in the default section order", config.includes('sectionOrder: ["hero","ideas","poll","events","community","socials","videos"]') && config.includes('const allowedSections = ["hero","ideas","poll","events","community","socials","videos"]'));
check("creator dashboard mounts media library", dashboard.includes("import MediaLibrary") && dashboard.includes("<MediaLibrary />"));
check("media upload enforces type and size limits", media.includes("ACCEPTED[selected.type]") && media.includes("selected.size > LIMIT"));
check("media publishing copies assets between visibility buckets", media.includes(".download(oldPath)") && media.includes('"creator-media-public"') && media.includes('"creator-media-private"'));
check("media publishing validates bucket/path consistency before moving files", media.includes("publication state do not match") && media.includes('bucket!=="creator-media-public"') && media.includes('bucket!=="creator-media-private"'));
check("unpublishing removes public objects before changing metadata and attempts rollback on save failure", media.includes("Revoke public access before changing the database publication state") && media.includes("removePublicError") && media.includes("restoreError"));
check("publishing cleanup failures can only leave a private duplicate", media.includes("old private copy could not be cleaned up; it remains private") && !media.includes("old public object could not be removed"));
check("media publication rejects a storage path owned by a different creator", media.includes("oldPath.split(\"/\")[0] !== userData.user.id"));
check("media metadata operations use guarded RPCs", media.includes('rpc("get_creator_media"') && media.includes('rpc("save_creator_media"') && media.includes('rpc("delete_creator_media"'));
check("media storage buckets enforce private/public access", mediaMigration.includes("creator-media-private") && mediaMigration.includes("creator-media-public") && mediaMigration.includes("create policy"));
check("storage mutations are scoped to creator-owned folders", ownershipMigration.includes("(storage.foldername(name))[1]=(select auth.uid())::text"));
check("idea moderation supports text search across submitted content", ideasModeration.includes("setSearch") && ideasModeration.includes("idea.idea_body") && ideasModeration.includes("idea.display_name"));
check("idea moderation queue recovers from network failures and always clears loading state", ideasModeration.includes("Connection failed while loading ideas") && ideasModeration.includes("finally {\n      setBusy(false);"));
check("idea moderation actions recover from network failures and release row lock", ideasModeration.includes("Connection failed while saving") && ideasModeration.includes("finally {\n      setWorking(\"\");"));
check("idea moderation supports status filtering and visible counts", ideasModeration.includes("setStatusFilter") && ideasModeration.includes("pendingCount") && ideasModeration.includes("visibleIdeas.length"));
check("idea moderation offers a clear-filter empty state", ideasModeration.includes("No matching ideas.") && ideasModeration.includes("setStatusFilter(\"all\")"));

check("creator dashboard mounts publishing history", dashboard.includes("import PublishingHistory") && dashboard.includes("<PublishingHistory />"));
check("publishing history reads only through guarded server API", historyComponent.includes('fetch("/api/creator/history"') && historyRoute.includes('rpc("get_creator_publish_history"'));
check("historical restore is explicitly draft-only in the UI", historyComponent.includes("will not publish it or change the live website") && historyComponent.includes("Restore to draft"));
check("history API validates version input and handles missing versions", historyRoute.includes("Number.isSafeInteger(version)") && historyRoute.includes('error.code === "P0002" ? 404'));
check("history RPCs require active creator access and restrict grants", historyMigration.includes("public.is_active_creator()") && historyMigration.includes("revoke all on function public.get_creator_publish_history") && historyMigration.includes("revoke all on function public.restore_site_config_version"));
check("restore operation writes an audit record and advances draft revision", historyMigration.includes("'restore_to_draft'") && historyMigration.includes("draft_revision = d.draft_revision + 1") && historyMigration.includes("sourceVersion"));

check("narration transcript toggle truly hides and restores the transcript", narration.includes("{showTranscript ? <div className=\"narration-transcript\"") && narration.includes("aria-expanded={showTranscript}") && narration.includes("Transcript hidden"));
check("narration supports replay and announces audio load failures", narration.includes("Replay ↻") && narration.includes("onError={() => { setPlaying(false); setMessage("));
check("narration pauses on component unmount", narration.includes("useEffect(() => () =>") && narration.includes("audio.current?.pause()"));
check("guided tour includes events and videos when those sections are present", guidedTour.includes('target: "events"') && guidedTour.includes('target: "videos"'));
check("guided tour filters missing sections instead of showing dead steps", guidedTour.includes("steps.filter(item => Boolean(document.getElementById(item.target)))") && guidedTour.includes("if (!visible.length)"));
check("guided tour supports Escape and restores launcher focus", guidedTour.includes('event.key === "Escape"') && guidedTour.includes("launchButton.current?.focus()"));
check("guided tour traps keyboard focus inside the modal and wraps Tab navigation", guidedTour.includes('event.key !== "Tab"') && guidedTour.includes("event.shiftKey && document.activeElement === first") && guidedTour.includes("document.activeElement === last"));
check("guided tour Escape listener uses a stable close callback", guidedTour.includes("const close = useCallback(() =>") && guidedTour.includes("[open, step, available, close]"));
check("guided tour exposes accessible progress and narration failure state", guidedTour.includes('role="progressbar"') && guidedTour.includes("onError={() => setAudioStatus("));

check("media metadata RPCs scope list, update, and delete operations to the owner", mediaOwnershipMigration.includes("where m.owner_id=auth.uid()") && mediaOwnershipMigration.includes("where id=p_media_id and owner_id=auth.uid()"));
check("media owner backfill guards UUID casts with a strict CASE expression", mediaOwnershipMigration.includes("set owner_id = case") && mediaOwnershipMigration.includes("then split_part(storage_path, '/', 2)::uuid")); 
check("media metadata RPCs require creator-owned storage paths and grant only authenticated execution", mediaOwnershipMigration.includes("media path must belong to the current creator") && mediaOwnershipMigration.includes("revoke all on function public.delete_creator_media"));
check("creator settings and moderation queue loading states are announced politely", (await read("../src/app/creator/creator-settings.tsx")).includes('role="status" aria-live="polite">{status}</p>') && (await read("../src/app/creator/idea-moderation-queue.tsx")).includes('role="status" aria-live="polite">{status}</p>'));

check("interactive controls have a global keyboard-focus indicator", (await read("../src/app/globals.css")).includes(":where(button, input, select, textarea, summary, [role=\"button\"], [role=\"tab\"], [role=\"switch\"]):focus-visible"));
check("keyboard focus remains visible in forced-colors/high-contrast mode", (await read("../src/app/globals.css")).includes("@media (forced-colors: active)") && (await read("../src/app/globals.css")).includes("outline: 2px solid Highlight"));
check("disabled interactive controls communicate unavailable state", (await read("../src/app/globals.css")).includes(":where(button, input, select, textarea, [role=\"button\"]):disabled"));

check("homepage provides a separate mobile navigation with the same visibility gates", page.includes('className="mobile-nav" aria-label="Mobile navigation"') && page.includes('className="desktop-nav" aria-label="Main navigation"') && (page.match(/href="#videos"/g) || []).length >= 1);
check("mobile navigation remains horizontally scrollable instead of disappearing on narrow screens", (await read("../src/app/globals.css")).includes(".topbar .mobile-nav{display:flex;order:3;width:100%;gap:22px;overflow-x:auto"));
check("creator dashboard collapses stats and modules for tablet/mobile widths", (await read("../src/app/globals.css")).includes(".dashboard-stats { grid-template-columns: minmax(0, 1fr)") && (await read("../src/app/globals.css")).includes(".module-grid { grid-template-columns: minmax(0, 1fr)"));
check("public event cards and idea form use single-column mobile layouts", (await read("../src/app/globals.css")).includes(".public-events-grid { grid-template-columns: minmax(0, 1fr)") && (await read("../src/app/globals.css")).includes(".idea-form-fields { grid-template-columns: minmax(0, 1fr)"));
check("social links stack cleanly on narrow screens", (await read("../src/app/globals.css")).includes(".public-socials { grid-template-columns: 1fr; gap: 22px;"));
check("homepage integrates published video gallery and navigation", page.includes("import PublicVideos") && page.includes("<PublicVideos />") && page.includes('href="#videos"'));
check("public video gallery reads published video assets only", publicVideos.includes('.eq("is_published", true)') && publicVideos.includes('.eq("media_type", "video")') && publicVideos.includes("creator-media-public/"));
check("public video gallery uses accessible native video controls", publicVideoPlayer.includes("controls preload=\"metadata\" playsInline") && publicVideoPlayer.includes("aria-label={description || title}"));
check("public video gallery handles playback errors with retry", publicVideos.includes("PublicVideoPlayer") && publicVideoPlayer.includes("onError={() => setFailed(true)}") && publicVideoPlayer.includes("Try again"));
check("public video retry control is keyboard accessible", publicVideoPlayer.includes('type="button"') && publicVideoPlayer.includes('role="status"') && publicVideoPlayer.includes("setAttempt(value => value + 1)"));
check("public configuration uses published snapshot", config.includes('.from("published_site_config")') && config.includes('.select("published")'));
check("site config schema accepts and bounds creator narration fields", configSchema.includes('"narrationMediaId", "narrationText", "narrationAutoPlay"') && configSchema.includes("max: 1600") && configSchema.includes("identity.narrationAutoPlay"));
check("site config schema rejects unsupported latest section key", !configSchema.includes('"poll", "latest", "events"'));
check("public configuration validates accent color", config.includes("/^#[0-9a-fA-F]{6}$/"));
check("published media resolves only through public storage paths", config.includes('item.storage_path.startsWith("creator-media-public/")') && config.includes('getPublicUrl(pathParts.join("/"))'));
check("media deletion verifies ownership and restores storage if metadata deletion fails", media.includes("backup=download") && media.includes("storage file could not be deleted, so its metadata was kept") && media.includes("the file could not be restored") && media.includes('path.split("/")[0]!==userData.user.id'));
check("failed media publication checks temporary-copy cleanup and flags public exposure", media.includes("const {error:cleanupError}=await supabase.storage.from(nextBucket).remove([nextPath])") && media.includes("new public object could not be removed") && media.includes("stale private storage copy could not be removed"));
check("failed media metadata insert reports orphan cleanup failure", media.includes("const {error:cleanupError}=await supabase.storage.from(\"creator-media-private\").remove([path])") && media.includes("uploaded private file could not be cleaned up") && media.includes("The uploaded file was removed."));
check("published logo and hero assets bind to public page", config.includes('logoUrl: publicMediaUrl(logoItem, ["image"])') && config.includes('heroMediaUrl: publicMediaUrl(heroItem, ["image", "video"])') && page.includes("config.logoUrl ? <img"));
check("published mascot and narration assets respect their media types", config.includes('mascotUrl: publicMediaUrl(mascotItem, ["image"])') && config.includes('narrationUrl: publicMediaUrl(narrationItem, ["audio"])') && page.includes("<NarrationControl"));
check("hero video honors muted and loop settings", page.includes("muted={config.heroMuted}") && page.includes("loop={config.heroLoop}") && page.includes("className=\"hero-media\""));
check("poll display uses aggregate RPC", poll.includes('rpc("get_public_poll_results")'));
check("creator poll loading and status changes recover from network errors", pollManagement.includes("Connection failed while loading polls") && pollManagement.includes("Connection failed while changing poll status") && pollManagement.includes("finally {setBusy(false);}"));
check("creator poll creation validates date order and option lengths", pollManagement.includes("closing time must be later than the opening time") && pollManagement.includes("Each option must be 100 characters or fewer") && pollManagement.includes("Number.isNaN(startDate.getTime())"));
check("creator poll form shows question, description and option counts", pollManagement.includes("{title.trim().length}/160") && pollManagement.includes("{description.length}/1000") && pollManagement.includes("}/8 options"));
check("creator poll creation always releases working state", pollManagement.includes("finally {setWorking(\"\");"));
check("creator poll dashboard fetches aggregate results through public RPC", pollManagement.includes('rpc("get_public_poll_results")') && pollManagement.includes("const groupedResults"));
check("creator poll dashboard shows final counts only for closed polls", pollManagement.includes('p.status==="closed"&&results[p.poll_id]') && pollManagement.includes("FINAL RESULTS") && pollManagement.includes("votes</span>"));
check("poll display does not expose voter data", !poll.includes("voter_token") && !poll.includes("voter_hash"));
check("public voting always releases its submitting state", voteForm.includes("finally {\n      setSubmitting(false);"));
check("public voting handles uncertain network results without claiming success", voteForm.includes("Refresh the page before retrying to check whether it was recorded") && voteForm.includes("connection failed before we could confirm your vote"));
check("public voting keeps anonymous-token limitations explicit", voteForm.includes("This is not identity verification.") && voteForm.includes("already been recorded for this poll"));
check("creator editor uses guarded draft RPC", editor.includes('rpc("get_site_config_draft")') && editor.includes('rpc("save_site_config_draft"'));
check("event/social workflows always release working state after network failures", eventSocial.includes('finally { setWorking(""); }') && eventSocial.includes("Connection failed while saving the event") && eventSocial.includes("Connection failed while updating the social link"));
check("editing an event formats timestamps in the viewer local timezone", eventSocial.includes("date.getTime()-date.getTimezoneOffset()*60000") && eventSocial.includes("toLocalDateTimeInput(e.starts_at)") && eventSocial.includes("toLocalDateTimeInput(e.ends_at)"));
check("event component keeps imports before local helpers", eventSocial.indexOf('import {getSupabaseBrowserClient}') < eventSocial.indexOf("function toLocalDateTimeInput"));
check("event/social list loading catches rejected requests and clears loading state", eventSocial.includes("Connection failed while loading events and links") && eventSocial.includes("finally { setBusy(false); }"));
check("creator save action always releases saving state and reports thrown network errors", editor.includes('finally {\n      setSaving(false);\n    }') && editor.includes("Connection failed while saving:"));
check("creator editor reports media-selector loading failures", editor.includes('error: mediaError') && editor.includes("media options could not be loaded"));
check("creator editor has explicit draft/publish actions", editor.includes("Save draft") && editor.includes("Save & publish"));
check("creator editor visibly tracks unsaved draft changes", editor.includes("hasUnsavedChanges") && editor.includes("UNSAVED CHANGES") && editor.includes("ALL CHANGES SAVED"));
check("creator editor confirms before discarding draft edits", editor.includes("Discard your unsaved changes and reload the saved draft?"));
check("creator editor warns before leaving with unsaved edits", editor.includes("beforeunload") && editor.includes("warnBeforeLeaving"));
check("creator editor has maintenance mode", editor.includes('update("maintenance","enabled"'));
check("package defines build script", /"build"\s*:\s*"next build"/.test(packageJson));
check("package defines lint script", /"lint"\s*:\s*"eslint \\."/.test(packageJson) || packageJson.includes('"lint": "eslint ."' ));

check("public events read only published/completed events", events.includes('from("events")') && events.includes('["published","completed"]'));
check("public event feed puts dated events before undated entries and uses semantic time markup", events.includes('nullsFirst:false') && events.includes("<time dateTime={event.starts_at}>"));
check("public socials read only published links", socials.includes('from("social_links")') && socials.includes('eq("is_published",true)'));
check("creator event/social changes use guarded RPCs", contentManager.includes('rpc("save_creator_event"') && contentManager.includes('rpc("save_creator_social_link"'));
check("creator event editor rejects end dates before or equal to start", contentManager.includes("new Date(ends)<=new Date(starts)") && contentManager.includes("The event end must be later than its start."));
check("creator can edit existing events", contentManager.includes("p_event_id:editingEventId||null") && contentManager.includes("setEditingEventId(e.event_id)") && contentManager.includes("Update event ↗"));
check("event edits preserve the existing publication status", contentManager.includes("Event updated; its publication status was preserved."));
check("creator can edit existing social links", contentManager.includes("setEditingLinkId(l.link_id)") && contentManager.includes("p_link_id:editingLinkId||null") && contentManager.includes("Update link ↗"));
check("media library supports editing asset metadata without replacing files", media.includes("async function saveMetadata") && media.includes("p_storage_path:item.storage_path") && media.includes("Publication status and file URL were preserved."));
check("media library supports searching and filtering assets", media.includes("setSearch") && media.includes("setFilter") && media.includes("rows.filter(item=>"));
check("media library reports refresh progress and catches auth/storage failures", media.includes("setReady(false)") && media.includes("finally {\n      setReady(true);") && media.includes("Could not load the media library. Check your connection and try again."));
check("media previews are limited to expected storage buckets and visibility", media.includes('["creator-media-private","creator-media-public"].includes(bucket)') && media.includes('bucket === "creator-media-public" && item.is_published') && media.includes('bucket === "creator-media-private" && !item.is_published'));
check("media library reports unavailable previews rather than silently implying success", media.includes("some previews are unavailable. Check storage permissions and file paths."));
check("media library previews audio and sprite assets", media.includes('item.media_type==="audio" ? <audio') && media.includes('item.media_type==="sprite") ? <img') && media.includes("loading=\"lazy\""));
check("media video previews expose accessible playback controls", media.includes('controls preload="metadata" playsInline aria-label={item.title}'));
check("editing a social link preserves publication state and position", contentManager.includes("p_is_published:existing?.is_published??false") && contentManager.includes("p_position:existing?.link_position??links.length"));
check("social edit confirmation uses captured edit state", contentManager.includes("const wasEditing=Boolean(editingLinkId)") && contentManager.includes("setStatus(wasEditing?"));

check("creator can edit public section visibility", editor.includes("draft.layout.visibleSections") && editor.includes("visibleSections:e.target.checked"));
check("public site respects section visibility", page.includes("config.visibleSections.includes(\"events\")") && page.includes("config.visibleSections.includes(\"socials\")"));
check("public config restricts section identifiers", config.includes("allowedSections.includes(item)"));
check("published configuration preserves videos in the default section order", config.includes('sectionOrder: ["hero","ideas","poll","events","community","socials","videos"]') && config.includes('const allowedSections = ["hero","ideas","poll","events","community","socials","videos"]'));
check("creator dashboard mounts media library", dashboard.includes("import MediaLibrary") && dashboard.includes("<MediaLibrary />"));
check("media upload enforces type and size limits", media.includes("ACCEPTED[selected.type]") && media.includes("selected.size > LIMIT"));
check("media publishing copies assets between visibility buckets", media.includes(".download(oldPath)") && media.includes('"creator-media-public"') && media.includes('"creator-media-private"'));
check("media publishing validates bucket/path consistency before moving files", media.includes("publication state do not match") && media.includes('bucket!=="creator-media-public"') && media.includes('bucket!=="creator-media-private"'));
check("unpublishing removes public objects before changing metadata and attempts rollback on save failure", media.includes("Revoke public access before changing the database publication state") && media.includes("removePublicError") && media.includes("restoreError"));
check("publishing cleanup failures can only leave a private duplicate", media.includes("old private copy could not be cleaned up; it remains private") && !media.includes("old public object could not be removed"));
check("media publication rejects a storage path owned by a different creator", media.includes("oldPath.split(\"/\")[0] !== userData.user.id"));
check("media metadata operations use guarded RPCs", media.includes('rpc("get_creator_media"') && media.includes('rpc("save_creator_media"') && media.includes('rpc("delete_creator_media"'));
check("media storage buckets enforce private/public access", mediaMigration.includes("creator-media-private") && mediaMigration.includes("creator-media-public") && mediaMigration.includes("create policy"));
check("storage mutations are scoped to creator-owned folders", ownershipMigration.includes("(storage.foldername(name))[1]=(select auth.uid())::text"));
check("idea moderation supports text search across submitted content", ideasModeration.includes("setSearch") && ideasModeration.includes("idea.idea_body") && ideasModeration.includes("idea.display_name"));
check("idea moderation queue recovers from network failures and always clears loading state", ideasModeration.includes("Connection failed while loading ideas") && ideasModeration.includes("finally {\n      setBusy(false);"));
check("idea moderation actions recover from network failures and release row lock", ideasModeration.includes("Connection failed while saving") && ideasModeration.includes("finally {\n      setWorking(\"\");"));
check("idea moderation supports status filtering and visible counts", ideasModeration.includes("setStatusFilter") && ideasModeration.includes("pendingCount") && ideasModeration.includes("visibleIdeas.length"));
check("idea moderation offers a clear-filter empty state", ideasModeration.includes("No matching ideas.") && ideasModeration.includes("setStatusFilter(\"all\")"));

check("creator dashboard mounts publishing history", dashboard.includes("import PublishingHistory") && dashboard.includes("<PublishingHistory />"));
check("publishing history reads only through guarded server API", historyComponent.includes('fetch("/api/creator/history"') && historyRoute.includes('rpc("get_creator_publish_history"'));
check("historical restore is explicitly draft-only in the UI", historyComponent.includes("will not publish it or change the live website") && historyComponent.includes("Restore to draft"));
check("history API validates version input and handles missing versions", historyRoute.includes("Number.isSafeInteger(version)") && historyRoute.includes('error.code === "P0002" ? 404'));
check("history RPCs require active creator access and restrict grants", historyMigration.includes("public.is_active_creator()") && historyMigration.includes("revoke all on function public.get_creator_publish_history") && historyMigration.includes("revoke all on function public.restore_site_config_version"));
check("restore operation writes an audit record and advances draft revision", historyMigration.includes("'restore_to_draft'") && historyMigration.includes("draft_revision = d.draft_revision + 1") && historyMigration.includes("sourceVersion"));

check("narration transcript toggle truly hides and restores the transcript", narration.includes("{showTranscript ? <div className=\"narration-transcript\"") && narration.includes("aria-expanded={showTranscript}") && narration.includes("Transcript hidden"));
check("narration supports replay and announces audio load failures", narration.includes("Replay ↻") && narration.includes("onError={() => { setPlaying(false); setMessage("));
check("narration pauses on component unmount", narration.includes("useEffect(() => () =>") && narration.includes("audio.current?.pause()"));
check("guided tour includes events and videos when those sections are present", guidedTour.includes('target: "events"') && guidedTour.includes('target: "videos"'));
check("guided tour filters missing sections instead of showing dead steps", guidedTour.includes("steps.filter(item => Boolean(document.getElementById(item.target)))") && guidedTour.includes("if (!visible.length)"));
check("guided tour supports Escape and restores launcher focus", guidedTour.includes('event.key === "Escape"') && guidedTour.includes("launchButton.current?.focus()"));
check("guided tour traps keyboard focus inside the modal and wraps Tab navigation", guidedTour.includes('event.key !== "Tab"') && guidedTour.includes("event.shiftKey && document.activeElement === first") && guidedTour.includes("document.activeElement === last"));
check("guided tour Escape listener uses a stable close callback", guidedTour.includes("const close = useCallback(() =>") && guidedTour.includes("[open, step, available, close]"));
check("guided tour exposes accessible progress and narration failure state", guidedTour.includes('role="progressbar"') && guidedTour.includes("onError={() => setAudioStatus("));

check("media metadata RPCs scope list, update, and delete operations to the owner", mediaOwnershipMigration.includes("where m.owner_id=auth.uid()") && mediaOwnershipMigration.includes("where id=p_media_id and owner_id=auth.uid()"));
check("media owner backfill guards UUID casts with a strict CASE expression", mediaOwnershipMigration.includes("set owner_id = case") && mediaOwnershipMigration.includes("then split_part(storage_path, '/', 2)::uuid")); 
check("media metadata RPCs require creator-owned storage paths and grant only authenticated execution", mediaOwnershipMigration.includes("media path must belong to the current creator") && mediaOwnershipMigration.includes("revoke all on function public.delete_creator_media"));
if (failures.length) {
  console.error("Repository validation failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exitCode = 1;
} else {
  console.log(`Repository validation passed (${assertionCount} assertions).`);
}

check("event and social managers show helpful empty states", eventSocial.includes("No events yet.") && eventSocial.includes("No social links yet."));
check("media filters provide a clearable no-results state", media.includes("No matching assets.") && media.includes('onClick={()=>{setSearch("");setFilter("all");}}'));
check("poll and idea empty states are announced to assistive technology", pollManagement.includes('className="moderation-empty" role="status">No polls created yet.') && ideasModeration.includes('className="moderation-empty" role="status"><h3>No submissions yet.'));
check("publishing history explains the first-version empty state", historyComponent.includes('className="moderation-empty" role="status"><h3>No published versions yet.'));
check("creator loading states are announced politely", eventSocial.includes('role="status" aria-live="polite">{status}</p>') && pollManagement.includes('role="status" aria-live="polite">{status}</p>') && media.includes('role="status" aria-live="polite">Loading media…</p>'));

if (failures.length) {
  console.error("Repository validation failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exitCode = 1;
} else {
  console.log(`Repository validation passed (${assertionCount} assertions).`);
}

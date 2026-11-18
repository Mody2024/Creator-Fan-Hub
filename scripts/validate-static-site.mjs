import { readFile, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const read = (path) => readFile(new URL(path, import.meta.url), "utf8");
const failures = [];
let assertionCount = 0;
const check = (label, condition) => { assertionCount += 1; if (!condition) failures.push(label); };

const [page, publicVideos, publicVideoPlayer, config, poll, editor, packageJson, events, socials, contentManager, media, dashboard, mediaMigration, ownershipMigration, ideasModeration, ideaSubmission, voteForm, pollManagement, historyComponent, historyRoute, historyMigration, mediaOwnershipMigration, narration, guidedTour, configSchema, eventSocial, publicIdeas, publicIdeasMigration, pollVisibilityMigration, publicGateHardeningMigration, draftRoute, publishRoute, boundedJsonHelper, boundedJsonTests, ideaSubmissionGateMigration, publicGateTests, creatorApiTests, mediaOwnershipTests, ideaSubmissionContractTests, publishingHistoryTests, mediaRecoveryTests, resumableUpload, mediaHealthMigration, resumableReservationMigration, communityShorts, assetMetadataMigration, storageReservationGateMigration, eventsRsvpMigration] = await Promise.all([
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
  read("../supabase/migrations/20261026181000_creator_media_library.sql"),
  read("../supabase/migrations/20261026181022_scope_media_storage_ownership.sql"),
  read("../src/app/creator/idea-moderation-queue.tsx"),
  read("../src/app/ideas/idea-submission-form.tsx"),
  read("../src/app/vote/poll-vote-form.tsx"),
  read("../src/app/creator/poll-management.tsx"),
  read("../src/app/creator/publishing-history.tsx"),
  read("../src/app/api/creator/history/route.ts"),
  read("../supabase/migrations/20261031203520_creator_publish_history_restore.sql"),
  read("../supabase/migrations/20261031203530_scope_media_metadata_to_owner.sql"),
  read("../src/app/narration-control.tsx"),
  read("../src/app/guided-welcome-tour.tsx"),
  read("../src/lib/site-config.mjs"),
  read("../src/app/creator/event-social-management.tsx"),
  read("../src/app/ideas/approved-ideas.tsx"),
  read("../supabase/migrations/20261031203506_public_featured_ideas.sql"),
  read("../supabase/migrations/20261031203508_public_poll_visibility_gates.sql"),
  read("../supabase/migrations/20261031203509_fail_closed_public_feature_gates.sql"),
  read("../src/app/api/creator/draft/route.ts"),
  read("../src/app/api/creator/publish/route.ts"),
  read("../src/lib/read-bounded-json.ts"),
  read("../tests/read-bounded-json.test.mjs"),
  read("../supabase/migrations/20261031203510_fail_closed_public_idea_submissions.sql"),
  read("../tests/public-feature-gates.test.mjs"),
  read("../tests/creator-api-contracts.test.mjs"),
  read("../tests/media-ownership-contracts.test.mjs"),
  read("../tests/public-idea-submission-contracts.test.mjs"),
  read("../tests/publishing-history-resilience.test.mjs"),
  read("../tests/media-recovery-contracts.test.mjs"),
  read("../src/lib/supabase/resumable-upload.ts"),
  read("../supabase/migrations/20261101173909_nhen_media_health_and_orphan_audit.sql"),
  read("../supabase/migrations/20261101172923_nhen_resume_upload_reservations.sql"),
  read("../src/app/shorts/community-shorts-client.tsx"),
  read("../supabase/migrations/20261101174330_nhen_creator_media_asset_metadata_sync.sql"),
  read("../supabase/migrations/20261101174604_nhen_enforce_storage_reservation_on_object_insert.sql"),
  read("../supabase/migrations/20261110170000_raye2_event_rsvps.sql")
]);

check("homepage imports published poll component", page.includes('import PublishedPolls from "@/app/vote/published-polls"'));
check("public poll RPC respects maintenance mode and the published polls feature flag", pollVisibilityMigration.includes("get_public_poll_results") && pollVisibilityMigration.includes("maintenance_mode") && pollVisibilityMigration.includes("featureFlags,polls") && pollVisibilityMigration.includes("not exists"));
check("bounded JSON body tests cover UTF-8, malformed JSON, exact limits, understated headers and invalid configured limits", boundedJsonTests.includes("parses valid UTF-8 JSON") && boundedJsonTests.includes("rejects malformed JSON") && boundedJsonTests.includes("rejects malformed UTF-8") && boundedJsonTests.includes("rejects oversized Content-Length") && boundedJsonTests.includes("rejects oversized streamed content") && boundedJsonTests.includes("body exactly at the byte limit") && boundedJsonTests.includes("Content-Length understates the body") && boundedJsonTests.includes("invalid configured byte limits"));
check("bounded JSON parser stops reading streams at the byte limit and rejects malformed UTF-8/JSON", boundedJsonHelper.includes("request.body.getReader()") && boundedJsonHelper.includes("totalBytes > maxBytes") && boundedJsonHelper.includes("reader.cancel()") && boundedJsonHelper.includes('TextDecoder("utf-8", { fatal: true })') && boundedJsonHelper.includes("JSON.parse(raw)"));
check("public idea submission tests protect optional anonymous names, server validation, and fail-closed feature gates", ideaSubmissionContractTests.includes("display name is genuinely optional in both the public form and database RPC") && ideaSubmissionContractTests.includes("validates title, body, and browser token server-side") && ideaSubmissionContractTests.includes("disabled when public config is missing or gated"));
check("creator and community media uploads use the shared TUS resumable uploader", media.includes("uploadToSupabaseStorage") && (await read("../src/app/shorts/community-shorts-client.tsx")).includes("uploadToSupabaseStorage"));
check("TUS uploader uses bounded chunks, retry backoff, refreshed authenticated storage headers, and upload progress", resumableUpload.includes("chunkSize: 6 * 1024 * 1024") && resumableUpload.includes("retryDelays: [0, 3000, 5000, 10000, 20000]") && resumableUpload.includes("request.setHeader(\"authorization\"") && resumableUpload.includes("Bearer ${session.access_token}") && resumableUpload.includes("onProgress:"));
check("TUS upload sessions keep stable owner-scoped object paths and resume matching previous transfers", resumableUpload.includes("findPreviousUploads()") && resumableUpload.includes("resumeFromPreviousUpload") && resumableUpload.includes("getResumableUploadSession") && resumableUpload.includes('startsWith(userId + "/")'));
check("resumable uploads renew matching storage reservations and retain sessions after interruption", media.includes("reuse_nhen_media_upload_reservation") && media.includes("Upload interrupted. Your resumable session is retained") && (await read("../src/app/shorts/community-shorts-client.tsx")).includes("reuse_nhen_media_upload_reservation"));
check("Storage object inserts for Raye2 buckets require an active matching owner, bucket, and exact-byte reservation", storageReservationGateMigration.includes("before insert on storage.objects") && storageReservationGateMigration.includes("r.user_id=v_user") && storageReservationGateMigration.includes("r.bucket_id=new.bucket_id") && storageReservationGateMigration.includes("r.expected_bytes=v_bytes") && storageReservationGateMigration.includes("r.expires_at>now()") && storageReservationGateMigration.includes("revoke all on function public.enforce_nhen_storage_upload_reservation()") && storageReservationGateMigration.includes("grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated"));
check("Storage reservation trigger fails closed when authenticated context or size metadata is missing", storageReservationGateMigration.includes("authenticated NHEN upload reservation required") && storageReservationGateMigration.includes("NHEN upload size metadata is required"));
check("creator uploads automatically persist numeric byte size, MIME type, and provider asset identity", assetMetadataMigration.includes("new.size_bytes:=") && assetMetadataMigration.includes("new.mime_type:=") && assetMetadataMigration.includes("new.asset_key:=") && assetMetadataMigration.includes("before insert or update"));
check("community uploads save byte size, MIME type, and provider playback metadata", communityShorts.includes("size_bytes:file.size") && communityShorts.includes("mime_type:file.type") && communityShorts.includes('provider:"supabase"') && communityShorts.includes('playback_kind:"file"'));
check("storage health audit is creator-only, reports only old unlinked candidates, and never deletes media objects", mediaHealthMigration.includes("public.is_nhen_video_publisher()") && mediaHealthMigration.includes("now()-interval '24 hours'") && mediaHealthMigration.includes("orphan_candidate_bytes") && !/delete\\s+from\\s+storage\\.objects/i.test(mediaHealthMigration));
check("storage health audit checks both creator media metadata and community short records", mediaHealthMigration.includes("public.media_items") && mediaHealthMigration.includes("public.community_short_videos"));
check("resumable reservation renewal is bound to authenticated owner, bucket, size, and active expiry", resumableReservationMigration.includes("user_id=v_user") && resumableReservationMigration.includes("bucket_id=p_bucket") && resumableReservationMigration.includes("expected_bytes=p_bytes") && resumableReservationMigration.includes("expires_at>now()"));
check("community video deletion restores the stored file if the metadata deletion fails", communityShorts.includes("download(item.storage_path)") && communityShorts.includes("storageRemoved&&backup") && communityShorts.includes("upsert:false"));
check("media recovery tests cover failed upload cleanup, publication rollback, and deletion restoration", mediaRecoveryTests.includes("failed media metadata save checks private upload cleanup") && mediaRecoveryTests.includes("publishing a private asset reports when the old private copy cannot be removed") && mediaRecoveryTests.includes("unpublishing removes the public object before metadata changes") && mediaRecoveryTests.includes("media deletion keeps a backup and attempts restoration"));
check("media ownership contract suite covers storage policies, owner-scoped RPCs, guarded backfill, and authenticated grants", mediaOwnershipTests.includes("storage policies bind mutations to the active creator folder") && mediaOwnershipTests.includes("media metadata backfill guards UUID casts") && mediaOwnershipTests.includes("media listing is owner-scoped and bounded") && mediaOwnershipTests.includes("media save and delete RPCs reject cross-owner paths"));
check("publishing history validates server data, clears stale snapshots on failure, and confirms restore revision", publishingHistoryTests.includes("validates each server-provided version row before rendering") && publishingHistoryTests.includes("clears stale snapshots after a failed or malformed reload") && publishingHistoryTests.includes("valid new draft revision"));
check("creator publish-history API validates timestamped rows and enforces the response bound", creatorApiTests.includes("history GET validates and bounds every published version returned by the database"));
check("creator mutation APIs validate positive revisions/versions and parseable success timestamps", creatorApiTests.includes("creator draft, publish, and restore success responses require valid timestamps and positive versions"));
check("creator API contracts validate stored draft payload and revision before returning it", creatorApiTests.includes("draft GET validates stored configuration and revision before returning data"));
check("creator API contract tests cover authentication ordering, payload bounds, revision conflicts, and safe errors", creatorApiTests.includes("creator draft API authenticates before reading request bodies") && creatorApiTests.includes("publish API authenticates before reading request bodies") && creatorApiTests.includes("history restore API authenticates before reading request bodies") && creatorApiTests.includes("rather than exposing raw database errors"));
check("creator draft API caps JSON payloads at 128 KiB", draftRoute.includes("readBoundedJson(request, 128 * 1024)") && draftRoute.includes("parsed.status"));
check("creator publish and history restore APIs cap JSON payloads at 8 KiB", publishRoute.includes("readBoundedJson(request, 8 * 1024)") && historyRoute.includes("readBoundedJson(request, 8 * 1024)"));
check("public community gate tests cover reads, voting, open-tally privacy, token hashing, option binding, and submissions", publicGateTests.includes("public idea reads fail closed") && publicGateTests.includes("public poll reads fail closed") && publicGateTests.includes("public voting requires enabled feature") && publicGateTests.includes("public idea submission requires enabled feature") && publicGateTests.includes("hashes anonymous tokens and binds options to the selected poll") && publicGateTests.includes("rejects malformed anonymous tokens before any vote insert") && publicGateTests.includes("database uniqueness makes duplicate-vote prevention safe under concurrent requests") && publicGateTests.includes("poll option foreign key prevents votes from pairing an option with another poll") && publicGateTests.includes("public poll result RPC exposes no voter token or token hash fields"));
check("public idea submission fails closed when primary config is missing or ideas are disabled", ideaSubmissionGateMigration.includes("function public.submit_public_idea(") && ideaSubmissionGateMigration.includes("if not exists (") && ideaSubmissionGateMigration.includes("ideas_unavailable") && ideaSubmissionGateMigration.includes("featureFlags,ideas") && ideaSubmissionGateMigration.includes("maintenance_mode"));
check("public idea, poll-read and vote RPCs fail closed when primary published config is missing", publicGateHardeningMigration.includes("function public.get_public_approved_ideas()") && publicGateHardeningMigration.includes("function public.get_public_poll_results()") && publicGateHardeningMigration.includes("function public.cast_public_poll_vote(") && (publicGateHardeningMigration.match(/from public\.published_site_config c/g) || []).length >= 3 && (publicGateHardeningMigration.match(/and exists \(/g) || []).length >= 2 && publicGateHardeningMigration.includes("if not exists ("));
check("public idea board includes featured ideas and respects maintenance/feature visibility", publicIdeas.includes("APPROVED & FEATURED") && publicIdeasMigration.includes("i.status in") && publicIdeasMigration.includes("featured") && publicIdeasMigration.includes("maintenance_mode") && publicIdeasMigration.includes("featureFlags,ideas"));
check("public idea form shows live character counts", ideaSubmission.includes("{title.length}/100") && ideaSubmission.includes("{body.length}/800") && ideaSubmission.includes("{displayName.length}/32"));
check("public idea form validates trimmed field lengths before submission", ideaSubmission.includes("const cleanTitle = title.trim()") && ideaSubmission.includes("cleanBody.length < 10") && ideaSubmission.includes("cleanName.length > 32"));
check("public idea form always releases busy state and handles network failures", ideaSubmission.includes("finally {\n      setBusy(false);") && ideaSubmission.includes("connection failed before we could confirm submission"));
check("public idea form disables invalid over-limit values", ideaSubmission.includes("title.trim().length > 100") && ideaSubmission.includes("body.trim().length > 800") && ideaSubmission.includes("displayName.trim().length > 32"));
check("homepage renders published poll component", page.includes("<PublishedPolls locale={isArabic?\"ar\":\"en\"} />"));
check("homepage reads published configuration", page.includes("getPublicSiteConfig"));
check("mobile creator controls retain usable touch targets", (await read("../src/app/globals.css")).includes(".moderation-actions button,") && (await read("../src/app/globals.css")).includes("min-height: 40px;"));
check("media rows collapse safely on very narrow phones", (await read("../src/app/globals.css")).includes("@media (max-width: 360px)") && (await read("../src/app/globals.css")).includes(".media-row {\n    grid-template-columns: minmax(0, 1fr);"));
check("mobile creator form fields avoid narrow-screen text zoom", (await read("../src/app/globals.css")).includes(".poll-create-form input:not([type=\"checkbox\"]):not([type=\"color\"])") && (await read("../src/app/globals.css")).includes("font-size: 16px;"));

check("event and social managers show helpful empty states", (await read("../src/app/creator/event-social-management.tsx")).includes("No events yet.") && (await read("../src/app/creator/event-social-management.tsx")).includes("No social links yet."));
check("media search and visibility filters show a recoverable no-results state", (await read("../src/app/creator/media-library.tsx")).includes("No matching assets.") && (await read("../src/app/creator/media-library.tsx")).includes('onClick={()=>{setSearch("");setFilter("all");setProcessingFilter("all");}}'));
check("creator settings and moderation queue loading states are announced politely", (await read("../src/app/creator/creator-settings.tsx")).includes('role="status" aria-live="polite">{status}</p>') && (await read("../src/app/creator/idea-moderation-queue.tsx")).includes('role="status" aria-live="polite">{status}</p>'));

check("interactive controls have a global keyboard-focus indicator", (await read("../src/app/globals.css")).includes(":where(button, input, select, textarea, summary, [role=\"button\"], [role=\"tab\"], [role=\"switch\"]):focus-visible"));
check("keyboard focus remains visible in forced-colors/high-contrast mode", (await read("../src/app/globals.css")).includes("@media (forced-colors: active)") && (await read("../src/app/globals.css")).includes("outline: 2px solid Highlight"));
check("disabled interactive controls communicate unavailable state", (await read("../src/app/globals.css")).includes(":where(button, input, select, textarea, [role=\"button\"]):disabled"));

check("homepage renders one shared navigation with the video section gated by config", page.includes('className="mobile-nav" aria-label="Mobile navigation"') && page.includes('className="desktop-nav" aria-label="Main navigation"') && page.includes('config.visibleSections.includes("videos")') && page.includes("platformNavItems(primaryKeys"));
check("mobile navigation remains horizontally scrollable instead of disappearing on narrow screens", (await read("../src/app/globals.css")).includes(".topbar .mobile-nav{display:flex;order:3;width:100%;gap:22px;overflow-x:auto"));
check("creator dashboard collapses stats and modules for tablet/mobile widths", (await read("../src/app/globals.css")).includes(".dashboard-stats { grid-template-columns: minmax(0, 1fr)") && (await read("../src/app/globals.css")).includes(".module-grid { grid-template-columns: minmax(0, 1fr)"));
check("public event cards and idea form use single-column mobile layouts", (await read("../src/app/globals.css")).includes(".public-events-grid { grid-template-columns: minmax(0, 1fr)") && (await read("../src/app/globals.css")).includes(".idea-form-fields { grid-template-columns: minmax(0, 1fr)"));
check("social links stack cleanly on narrow screens", (await read("../src/app/globals.css")).includes(".public-socials { grid-template-columns: 1fr; gap: 22px;"));
check("homepage integrates published video gallery and navigation", page.includes("import PublicVideos") && page.includes("<PublicVideos />") && page.includes("platformNavItems(primaryKeys"));
check("public video gallery reads published video assets only", publicVideos.includes('.eq("media_items.is_published", true)') && publicVideos.includes('.in("media_items.media_type", ["video", "youtube"])') && publicVideos.includes("creator-media-public/") && publicVideos.includes("youtubeEmbedUrl"));
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
check("published logo and hero assets bind to public page", config.includes('logoUrl: publicMediaUrl(logoItem, ["image"])') && config.includes('heroMediaUrl: publicMediaUrl(heroItem, ["image", "video"])') && page.includes("config.logoUrl ? <img") && page.includes("portal-wordmark") && page.includes("Raye2") && page.includes("رايق"));
check("published mascot and narration assets respect their media types", config.includes('mascotUrl: publicMediaUrl(mascotItem, ["image"])') && config.includes('narrationUrl: publicMediaUrl(narrationItem, ["audio"])') && page.includes("<NarrationControl"));
check("hero video honors muted and loop settings", page.includes("muted={config.heroMuted}") && page.includes("loop={config.heroLoop}") && page.includes("className=\"hero-media\""));
check("poll display uses aggregate RPC", poll.includes('rpc("get_public_poll_results")'));
check("creator poll loading and status changes recover from network errors", pollManagement.includes("Connection failed while loading polls") && pollManagement.includes("Connection failed while changing poll status") && pollManagement.includes("finally {setBusy(false);}"));
check("creator poll creation validates date order and option lengths", pollManagement.includes("closing time must be later than the opening time") && pollManagement.includes("Each option must be 100 characters or fewer") && pollManagement.includes("Number.isNaN(startDate.getTime())"));
check("creator poll form shows question, description and option counts", pollManagement.includes("{title.trim().length}/160") && pollManagement.includes("{description.length}/1000") && pollManagement.includes("}/8 options"));
check("creator poll creation always releases working state", pollManagement.includes("finally {setWorking(\"\");"));
check("creator poll dashboard fetches aggregate results through public RPC", pollManagement.includes('rpc("get_public_poll_results")') && pollManagement.includes("const groupedResults"));
check("creator poll dashboard shows final counts only for closed polls", pollManagement.includes('p.status==="closed"&&results[p.poll_id]') && pollManagement.includes("t.results") && pollManagement.includes("t.votes"));
check("poll display does not expose voter data", !poll.includes("voter_token") && !poll.includes("voter_hash"));
check("public voting always releases its submitting state", voteForm.includes("finally {\n      setSubmitting(false);"));
check("public voting handles uncertain network results without claiming success", voteForm.includes("Refresh the page before retrying to check whether it was recorded") && voteForm.includes("connection failed before we could confirm your vote"));
check("public voting keeps anonymous-token limitations explicit", voteForm.includes("not identity verification.") && voteForm.includes("already been recorded for this poll"));
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

check("public events read only published/completed events", eventsRsvpMigration.includes("status in ('published', 'completed')") && page.includes('rpc("raye2_get_public_events"'));
check("public event feed puts dated events before undated entries and uses semantic time markup", eventsRsvpMigration.includes("order by (e.starts_at is null), e.starts_at asc") && events.includes("<time dateTime={event.starts_at}>"));
check("public event RSVPs are authenticated-only and ownership-scoped", eventsRsvpMigration.includes("grant execute on function public.raye2_set_event_rsvp(uuid,text) to authenticated") && eventsRsvpMigration.includes("user_id = (select auth.uid())") && eventsRsvpMigration.includes("alter table public.event_rsvps enable row level security"));

const raye2EventPrefsClient = await read("../src/app/raye2/raye2-client.tsx");
const eventRemindersMigration = await read("../supabase/migrations/20261110430000_raye2_event_reminders_hosts_types.sql");
check("events gain typed kinds, host/co-host roles and a single-host constraint", eventRemindersMigration.includes("add column if not exists event_type text not null default 'community'") && eventRemindersMigration.includes("check (event_type in ('community','office_hours','qa','collab','watch_party','other'))") && eventRemindersMigration.includes("create table if not exists public.event_hosts") && eventRemindersMigration.includes("create unique index if not exists event_hosts_single_host") && eventRemindersMigration.includes("check (role in ('host','cohost'))"));
check("event hosts are managed through guarded creator RPCs and listed for published events", eventRemindersMigration.includes("create or replace function public.raye2_set_event_host(p_event_id uuid, p_user_id uuid, p_role text default 'cohost')") && eventRemindersMigration.includes("not public.is_active_creator()") && eventRemindersMigration.includes("event already has a host") && eventRemindersMigration.includes("create or replace function public.raye2_get_event_hosts(p_event_id uuid)") && eventRemindersMigration.includes("grant execute on function public.raye2_get_event_hosts(uuid) to anon, authenticated") && eventRemindersMigration.includes("e.status in ('published','completed')"));
check("save_creator_event accepts an event type and reminder lead time", eventRemindersMigration.includes("drop function if exists public.save_creator_event(uuid,text,text,timestamptz,timestamptz)") && eventRemindersMigration.includes("p_event_type text default 'community'") && eventRemindersMigration.includes("p_reminder_minutes_before integer default null") && eventRemindersMigration.includes("p_reminder_minutes_before not between 5 and 10080") && eventRemindersMigration.includes("grant execute on function public.save_creator_event(uuid,text,text,timestamptz,timestamptz,text,integer) to authenticated"));
check("the public calendar exposes event type, host count and exact RSVP status", eventRemindersMigration.includes("drop function if exists public.raye2_get_public_events(integer)") && eventRemindersMigration.includes("event_type text,") && eventRemindersMigration.includes("host_count integer,") && eventRemindersMigration.includes("my_rsvp_status text") && eventRemindersMigration.includes("grant execute on function public.raye2_get_public_events(integer) to anon, authenticated"));
check("event reminders are dispatched once to going members, honouring opt-out and quiet hours", eventRemindersMigration.includes("create or replace function public.raye2_dispatch_event_reminders()") && eventRemindersMigration.includes("e.reminder_sent_at is null") && eventRemindersMigration.includes("r.status = 'going'") && eventRemindersMigration.includes("coalesce(pref.event_reminders, true)") && eventRemindersMigration.includes("'event_reminder'") && eventRemindersMigration.includes("grant execute on function public.raye2_dispatch_event_reminders() to authenticated") && !eventRemindersMigration.includes("raye2_dispatch_event_reminders() to anon"));
check("the notification preferences RPC and client expose an event-reminder opt-out", eventRemindersMigration.includes("add column if not exists event_reminders boolean not null default true") && eventRemindersMigration.includes("grant execute on function public.raye2_set_notification_preferences(boolean,boolean,boolean,time,time,text,boolean) to authenticated") && raye2EventPrefsClient.includes("p_event_reminders: next.event_reminders") && raye2EventPrefsClient.includes("event_reminders: boolean"));
check("the events UI manages hosts and shows the event type and host line", eventSocial.includes('rpc("raye2_set_event_host"') && eventSocial.includes('rpc("raye2_remove_event_host"') && eventSocial.includes('rpc("raye2_get_event_hosts"') && eventSocial.includes("typeOfficeHours") && events.includes('rpc("raye2_get_event_hosts"') && events.includes("event-hosted"));
check("public socials read only published links", socials.includes('from("social_links")') && socials.includes('eq("is_published",true)'));
check("creator event/social changes use guarded RPCs", contentManager.includes('rpc("save_creator_event"') && contentManager.includes('rpc("save_creator_social_link"'));
check("creator event editor rejects end dates before or equal to start", contentManager.includes("new Date(ends)<=new Date(starts)") && contentManager.includes("The event end must be later than its start."));
check("creator can edit existing events", contentManager.includes("p_event_id:editingEventId||null") && contentManager.includes("setEditingEventId(e.event_id)") && contentManager.includes("Update event ↗"));
check("event edits preserve the existing publication status", contentManager.includes("Event updated; its publication status was preserved."));
check("creator can edit existing social links", contentManager.includes("setEditingLinkId(l.link_id)") && contentManager.includes("p_link_id:editingLinkId||null") && contentManager.includes("Update link ↗"));
check("media library supports editing asset metadata without replacing files", media.includes("async function saveMetadata") && media.includes("p_storage_path:item.storage_path") && media.includes("Publication status and file URL were preserved."));
check("media library supports searching, visibility and processing filters", media.includes("setSearch") && media.includes("setFilter") && media.includes("processingFilter") && media.includes("visibleRows = useMemo"));
check("media library reports refresh progress and catches auth/storage failures", media.includes("setReady(false)") && media.includes("finally {\n      setReady(true);") && media.includes("Could not load the media library. Check your connection and try again."));
check("media previews are limited to expected storage buckets and visibility", media.includes('["creator-media-private","creator-media-public"].includes(bucket)') && media.includes('bucket === "creator-media-public" && item.is_published') && media.includes('bucket === "creator-media-private" && !item.is_published'));
check("media library reports unavailable previews rather than silently implying success", media.includes("some previews are unavailable. Check storage permissions and file paths."));
check("media library previews audio and sprite assets", media.includes('item.media_type==="audio" ? <audio') && media.includes('item.media_type==="sprite"||item.media_type==="youtube") ? <img') && media.includes("loading=\"lazy\""));
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


check("event and social managers show helpful empty states", eventSocial.includes("No events yet.") && eventSocial.includes("No social links yet."));
check("media filters provide a clearable no-results state", media.includes("No matching assets.") && media.includes('onClick={()=>{setSearch("");setFilter("all");setProcessingFilter("all");}'));
check("poll and idea empty states are announced to assistive technology", pollManagement.includes('className="moderation-empty" role="status">{t.empty}</p>') && ideasModeration.includes('className="moderation-empty" role="status"><h3>{t.empty}</h3>'));
check("publishing history explains the first-version empty state", historyComponent.includes('className="moderation-empty" role="status"><h3>No published versions yet.'));
check("creator loading states are announced politely", eventSocial.includes('role="status" aria-live="polite">{status}</p>') && pollManagement.includes('role="status" aria-live="polite">{status}</p>') && media.includes('role="status" aria-live="polite">{t.loading}</p>'));

const communityClient = await read("../src/app/community/community-client.tsx");
const communityStyles = await read("../src/app/raye2-design-system.css");
const shortsPage = await read("../src/app/shorts/page.tsx");
const notificationsPage = await read("../src/app/notifications/page.tsx");
const notificationsRealtimeClient = await read("../src/app/notifications/notifications-client.tsx");
const notificationsClient = await read("../src/app/notifications/notifications-client.tsx");
const savedPage = await read("../src/app/saved/page.tsx");
const savedClient = await read("../src/app/saved/saved-client.tsx");
const savedPageUnified = await read("../src/app/saved/page.tsx");
const memberProfilePage = await read("../src/app/u/[handle]/page.tsx");
const memberProfileClient = await read("../src/app/u/[handle]/profile-client.tsx");
const searchPage = await read("../src/app/search/page.tsx");
const communityPage = await read("../src/app/community/page.tsx");
const communitySuggestionsClient = await read("../src/app/community/community-client.tsx");
const notificationDeliveryMigration = await read("../supabase/migrations/20261102211553_nhen_instant_comment_notifications.sql");
check("community feed offers working all, official, and member filters", communityClient.includes('postFilter==="all"') && communityClient.includes('postFilter==="official"') && communityClient.includes('postFilter==="members"') && communityClient.includes("visiblePosts.map(post"));
check("community post sharing uses native share where available and clipboard fallback", communityClient.includes("navigator.share") && communityClient.includes("navigator.clipboard?.writeText") && communityClient.includes('"/community#post-" + post.id'));
check("community post links have stable anchor targets and localized dates", communityClient.includes('id={"post-"+post.id}') && communityClient.includes('toLocaleDateString(isArabic?"ar-EG":"en-US")'));
check("community feed filters have accessible state and responsive styling", communityClient.includes('aria-pressed={postFilter==="all"}') && communityStyles.includes(".raye2-feed-filter") && communityStyles.includes("@media(max-width:640px){.raye2-feed-filter"));
check("community feed filter controls follow the selected Arabic or English locale", communityClient.includes('isArabic?"تصفية المنشورات":"Filter posts"') && communityClient.includes('officialPosts:"رسمي"') && communityClient.includes('memberPosts:"Members"'));
check("Raye2 Shorts page resolves the saved locale server-side and localizes its navigation, headings, and empty state", shortsPage.includes('cookies()') && shortsPage.includes('cookieStore.get("raye2_locale")') && shortsPage.includes('dir={isArabic?"rtl":"ltr"}') && shortsPage.includes('labels.empty'));
check("official Shorts pass the selected locale into the shared player and community Shorts localize upload placeholders and dates", shortsPage.includes('locale={locale}') && communityShorts.includes('file?file.name+" · "+duration+" sec":t.none') && communityShorts.includes('toLocaleDateString(isArabic?"ar-EG":"en-US")'));
check("notifications page and interactions honor Arabic RTL and localize status, timestamps, and empty state", notificationsPage.includes('dir={isArabic?"rtl":"ltr"}') && notificationsPage.includes('locale={locale}') && notificationsClient.includes('toLocaleString(isArabic?"ar-EG":"en-US")') && notificationsClient.includes("تحديد الكل كمقروء"));
check("notification delivery covers instantly published community comments as well as approved comments", notificationDeliveryMigration.includes("after insert or update of status on public.community_comments") && notificationDeliveryMigration.includes("tg_op='INSERT'"));
check("notification cards localize activity text, link to the exact community post, and restore optimistic read state on failure", notificationsClient.includes('"/community#post-"+n.targetId') && notificationsClient.includes("started following you") && notificationsClient.includes("بدأ بمتابعتك") && notificationsClient.includes("setItems(xs=>xs.map(x=>x.id===id?{...x,readAt:previous.readAt}:x))"));
check("saved library page and interactions honor Arabic RTL and localize dates, removal, and empty state", savedPage.includes('dir={isArabic?"rtl":"ltr"}') && savedPage.includes('locale={locale}') && savedClient.includes('toLocaleDateString(isArabic?"ar-EG":"en-US")') && savedClient.includes("إزالة من المحفوظات"));
check("saved library combines private community and video bookmarks with type filters and correct removal targets", savedPageUnified.includes('from("video_bookmarks")') && savedPageUnified.includes('from("community_bookmarks")') && savedClient.includes('filter==="videos"') && savedClient.includes('from("video_bookmarks").delete()') && savedClient.includes('from("community_bookmarks").delete()') && savedClient.includes('"/watch/"+item.slug'));
check("member profiles receive saved locale and localize profile editing, follow/block actions, sections, and dates", memberProfilePage.includes('cookieStore.get("raye2_locale")') && memberProfilePage.includes('locale={locale}') && memberProfileClient.includes('dir={isArabic?"rtl":"ltr"}') && memberProfileClient.includes('toLocaleDateString(isArabic?"ar-EG":"en-US")') && memberProfileClient.includes("تعديل الملف الشخصي") && memberProfileClient.includes("إلغاء الحظر"));
check("Raye2 discovery search uses the saved locale, RTL direction, and translated result sections and empty states", searchPage.includes('cookieStore.get("raye2_locale")') && searchPage.includes('dir={isArabic?"rtl":"ltr"}') && searchPage.includes("اكتشف") && searchPage.includes("لا توجد فيديوهات مطابقة.") && searchPage.includes("لا يوجد أعضاء مطابقون."));

check("community header receives the recipient-scoped unread notification count and exposes an accessible badge", communityPage.includes('from("member_notifications").select("id", { count: "exact", head: true })') && communityPage.includes('eq("recipient_id", userId)') && communityClient.includes('unreadNotificationCount>99?"99+"') && communityClient.includes('aria-label={unreadNotificationCount>0?`${t.notifications}, ${unreadNotificationCount} unread`:t.notifications}'));
check("following feed provides distinct signed-out and empty-following guidance with member discovery", communityClient.includes("signInToFollow") && communityClient.includes("followingEmpty") && communityClient.includes('href="/search"'));

check("community suggests public members while excluding self, followed accounts, and accounts blocked by the viewer", communityPage.includes('from("member_profiles").select("user_id,handle,display_name")') && communityPage.includes('eq("visibility", "public")') && communityPage.includes("excluded.has(x.user_id)") && communityPage.includes('from("member_blocks").select("blocked_id")'));
check("member suggestions provide localized follow actions and profile discovery links", communitySuggestionsClient.includes("followSuggested") && communitySuggestionsClient.includes("People you may like") && communitySuggestionsClient.includes("قد يعجبك") && communitySuggestionsClient.includes('href={"/u/"+person.handle}'));

check("notifications subscribe to recipient-filtered realtime inserts and clean up their channel", notificationsRealtimeClient.includes('table:"member_notifications"') && notificationsRealtimeClient.includes('filter:"recipient_id=eq."+user.id') && notificationsRealtimeClient.includes("removeChannel(channel)") && notificationsRealtimeClient.includes("realtimeStatus"));
check("community feed refreshes from live post changes and removes its subscription on unmount", communityClient.includes('table: "community_posts"') && communityClient.includes("router.refresh()") && communityClient.includes("removeChannel(channel)"));

const draftsMigration = await read("../supabase/migrations/20261110180000_raye2_community_drafts_scheduling_collections.sql");
const savedLibraryClient = await read("../src/app/saved/saved-client.tsx");
check("community drafts and scheduling add a constrained scheduled status plus a lazy due-post promoter", draftsMigration.includes("check (status in ('pending','scheduled','published','rejected','removed'))") && draftsMigration.includes("community_posts_publish_at_check") && draftsMigration.includes("create or replace function public.raye2_publish_due_community_posts()") && draftsMigration.includes("status = 'scheduled' and publish_at is not null and publish_at <= now()"));
check("community staging RPCs are guarded SECURITY DEFINER functions scoped to the caller's own posts", draftsMigration.includes("create or replace function public.raye2_save_community_draft(") && draftsMigration.includes("create or replace function public.raye2_schedule_community_post(") && draftsMigration.includes("create or replace function public.raye2_publish_community_post(") && draftsMigration.includes("author_id = v_me") && draftsMigration.includes("scheduled time must be in the future"));
check("community draft and schedule controls are wired in the client and the page promotes due posts", communityClient.includes('supabase.rpc("raye2_schedule_community_post"') && communityClient.includes('supabase.rpc("raye2_publish_community_post"') && communityClient.includes('status: "scheduled"') && communityPage.includes('supabase.rpc("raye2_publish_due_community_posts")'));
check("saved-library collections are owner-scoped tables with RLS, guarded RPCs, and item checks against the caller's own bookmarks", draftsMigration.includes("alter table public.raye2_collections enable row level security") && draftsMigration.includes('create policy "Members manage their own collections"') && draftsMigration.includes("community_bookmarks where post_id = p_item_id and user_id = v_me") && draftsMigration.includes("video_bookmarks where media_id = p_item_id and user_id = v_me"));
check("community and saved-library clients group items into collections via the guarded collection RPCs", communityClient.includes('supabase.rpc("raye2_add_to_collection"') && communityClient.includes('supabase.rpc("raye2_create_collection"') && savedLibraryClient.includes('supabase.rpc("raye2_get_my_collections"') && savedLibraryClient.includes('p_kind:item.kind'));

const pollLifecycleMigration = await read("../supabase/migrations/20261110190000_raye2_poll_scheduling_lifecycle.sql");
const pollPublishedPolls = await read("../src/app/vote/published-polls.tsx");
check("creator polls gain guarded edit, schedule and delete RPCs restricted to before opening", pollLifecycleMigration.includes("create or replace function public.raye2_update_creator_poll(") && pollLifecycleMigration.includes("create or replace function public.raye2_schedule_creator_poll(") && pollLifecycleMigration.includes("create or replace function public.raye2_delete_creator_poll(") && pollLifecycleMigration.includes("v_status not in ('draft','scheduled')") && pollLifecycleMigration.includes("public.can_edit_creator_content()"));
check("a lazy due-poll promoter opens scheduled polls while preserving the one-open-poll invariant", pollLifecycleMigration.includes("create or replace function public.raye2_open_due_polls()") && pollLifecycleMigration.includes("if exists (select 1 from public.polls where status = 'open') then") && pollLifecycleMigration.includes("grant execute on function public.raye2_open_due_polls() to anon, authenticated"));
check("the creator poll panel wires scheduling, deletion and lazy auto-open, and the public vote page promotes due polls", pollManagement.includes('rpc("raye2_schedule_creator_poll"') && pollManagement.includes('rpc("raye2_delete_creator_poll"') && pollManagement.includes('rpc("raye2_open_due_polls")') && pollPublishedPolls.includes('await supabase.rpc("raye2_open_due_polls")'));

const trendingMigration = await read("../supabase/migrations/20261110200000_raye2_discovery_trending.sql");
check("discovery exposes public trending RPCs as pinned SECURITY DEFINER functions granted to anon and authenticated", trendingMigration.includes("create or replace function public.raye2_get_trending_posts(") && trendingMigration.includes("create or replace function public.raye2_get_trending_videos(") && trendingMigration.includes("create or replace function public.raye2_get_trending_tags(") && trendingMigration.includes("grant execute on function public.raye2_get_trending_videos(integer,integer) to anon, authenticated") && trendingMigration.includes("set search_path = ''"));
check("trending only surfaces published content and weights engagement with an age decay", trendingMigration.includes("p.status = 'published'") && trendingMigration.includes("mi.is_published = true and mi.media_type in ('video','youtube')") && trendingMigration.includes("3 * coalesce(r.reaction_count, 0) + 2 * coalesce(c.comment_count, 0)") && trendingMigration.includes("power(extract(epoch from (now() - p.created_at))"));
check("the discover page renders trending videos, conversations and tags when no search term is present", searchPage.includes('rpc("raye2_get_trending_videos"') && searchPage.includes('rpc("raye2_get_trending_posts"') && searchPage.includes('rpc("raye2_get_trending_tags"') && searchPage.includes("{!term&&") && searchPage.includes("noTrending"));

const topicsMigration = await read("../supabase/migrations/20261110210000_raye2_video_topics_related.sql");
const topicPage = await read("../src/app/topics/[tag]/page.tsx");
const topicsDirectoryMigration = await read("../supabase/migrations/20261110310000_raye2_topics_directory.sql");
const topicsIndexPage = await read("../src/app/topics/page.tsx");
check("topic directory grows the list RPC in place with views and recency for published videos", topicsDirectoryMigration.includes("drop function if exists public.raye2_list_topics(integer, integer)") && topicsDirectoryMigration.includes("returns table (tag text, video_count bigint, total_views bigint, recent_video_count bigint)") && topicsDirectoryMigration.includes("coalesce(sum(vwc.views), 0)") && topicsDirectoryMigration.includes("count(*) filter (where vc.published_at > now() - interval '90 days')") && topicsDirectoryMigration.includes("grant execute on function public.raye2_list_topics(integer,integer) to anon, authenticated") && topicsDirectoryMigration.includes("set search_path = ''"));
check("the topics index page lists topics with stats and a popularity filter", topicsIndexPage.includes('rpc("raye2_list_topics",{p_limit:120,p_min_count:minCount})') && topicsIndexPage.includes('href="/topics?min=2"') && topicsIndexPage.includes('href={"/topics/"+encodeURIComponent(topic.tag)}') && topicsIndexPage.includes("recent_video_count"));
const watchDetailPage = await read("../src/app/watch/[slug]/page.tsx");
const watchDetailClient = await read("../src/app/watch/[slug]/watch-detail-client.tsx");
check("topics and related videos are public pinned SECURITY DEFINER read RPCs granted to anon and authenticated", topicsMigration.includes("create or replace function public.raye2_get_related_videos(") && topicsMigration.includes("create or replace function public.raye2_list_topics(") && topicsMigration.includes("create or replace function public.raye2_get_topic_videos(") && topicsMigration.includes("grant execute on function public.raye2_list_topics(integer,integer) to anon, authenticated") && topicsMigration.includes("set search_path = ''"));
check("related videos rank by shared tags and category while topics only aggregate published videos", topicsMigration.includes("order by c.shared_tags desc, c.published_at desc") && topicsMigration.includes("c.shared_tags > 0 or c.category = (select category from source)") && topicsMigration.includes("length(btrim(tag)) between 1 and 40"));
check("the topic page localizes, links from the watch detail tags, and the watch page loads a related-videos rail", topicPage.includes('cookieStore.get("raye2_locale")') && topicPage.includes('dir={isArabic?"rtl":"ltr"}') && topicPage.includes("raye2_get_topic_videos") && watchDetailPage.includes('rpc("raye2_get_related_videos"') && watchDetailClient.includes('href={"/topics/"+encodeURIComponent(tag)}') && watchDetailClient.includes("raye2-detail-related"));

const watchContextMigration = await read("../supabase/migrations/20261110320000_raye2_watch_context.sql");
check("watch context is a pinned public read RPC that withholds blocked creators and resolves series", watchContextMigration.includes("create or replace function public.raye2_get_watch_context(") && watchContextMigration.includes("not public.is_member_blocked(t.owner_id)") && watchContextMigration.includes("pl.is_published = true") && watchContextMigration.includes("episode_count") && watchContextMigration.includes("grant execute on function public.raye2_get_watch_context(text) to anon, authenticated") && watchContextMigration.includes("set search_path = ''"));
check("the watch page renders creator attribution with follow and series context", watchDetailPage.includes('rpc("raye2_get_watch_context",{p_slug:slug})') && watchDetailPage.includes("context={context}") && watchDetailClient.includes("raye2_toggle_follow") && watchDetailClient.includes("raye2-detail-creator") && watchDetailClient.includes("raye2-detail-series") && watchDetailClient.includes('href={"/series/"+props.context.series_slug}'));
const globalCss = await read("../src/app/globals.css");
check("watch detail creator and series surfaces are styled", globalCss.includes(".raye2-detail-creator{") && globalCss.includes(".raye2-detail-series{"));

const anonWorkspaceFix = await read("../supabase/migrations/20261110330000_raye2_restore_anon_workspace_helper.sql");
check("the anon workspace-helper regression is repaired by re-granting execute to anon only", anonWorkspaceFix.includes("grant execute on function public.can_view_creator_workspace() to anon") && !anonWorkspaceFix.includes("to authenticated"));
check("the watch page disambiguates the media_items embed for the published catalog read", watchDetailPage.includes("media_items!video_catalog_media_id_fkey!inner(") && !watchDetailPage.includes("media_items!inner("));

const continueWatchingMigration = await read("../supabase/migrations/20261110220000_raye2_continue_watching.sql");
const continueWatchingClient = await read("../src/app/watch/continue-watching.tsx");
const watchLibraryPage = await read("../src/app/watch/page.tsx");
const raye2HomePage = await read("../src/app/raye2/home/page.tsx");
check("every public video_catalog embed is disambiguated to the media_id foreign key", [page, publicVideos, watchLibraryPage, raye2HomePage, savedPage, shortsPage, communityClient].every(source => !source.includes("media_items!inner(")) && watchDetailPage.includes("media_items!video_catalog_media_id_fkey!inner("));

const profileOverviewMigration = await read("../supabase/migrations/20261110340000_raye2_profile_overview.sql");
const profilePage = await read("../src/app/u/[handle]/page.tsx");
const profileClient = await read("../src/app/u/[handle]/profile-client.tsx");
const profileCss = await read("../src/app/u/[handle]/profile.module.css");
check("the profile overview RPC is a pinned definer read granted to anon and authenticated", profileOverviewMigration.includes("create or replace function public.raye2_get_profile_overview(") && profileOverviewMigration.includes("security definer") && profileOverviewMigration.includes("set search_path = ''") && profileOverviewMigration.includes("grant execute on function public.raye2_get_profile_overview(text) to anon, authenticated"));
check("the profile overview matches profile visibility and counts only published content", profileOverviewMigration.includes("mp.visibility = 'public' and not public.is_member_blocked(mp.user_id)") && profileOverviewMigration.includes("mi.is_published = true") && profileOverviewMigration.includes("where status = 'published' group by author_id"));
check("the profile page uses the overview RPC and shows real, labelled stats and a creator badge", profilePage.includes('rpc("raye2_get_profile_overview",{p_handle:handle})') && profilePage.includes("video_catalog!video_catalog_media_id_fkey!inner(") && profileClient.includes("overview.published_videos") && profileClient.includes("overview.total_views") && profileClient.includes("styles.creatorBadge") && !profileClient.includes("posts.length+videos.length+communityShorts.length") && profileCss.includes(".creatorBadge{"));

const anonBlockFix = await read("../supabase/migrations/20261110350000_raye2_restore_anon_block_helper.sql");
check("the anon community outage is repaired for both helper layers", anonBlockFix.includes("grant execute on function public.is_member_blocked(uuid) to anon") && anonBlockFix.includes("grant usage on schema private to anon") && anonBlockFix.includes("grant execute on function private.can_moderate_community() to anon") && anonBlockFix.includes("create or replace function public.raye2_viewer_blocked(") && anonBlockFix.includes("or public.raye2_viewer_blocked(user_id)"));

const commentThreadsMigration = await read("../supabase/migrations/20261110360000_raye2_video_comment_threads.sql");
const globalsCss = await read("../src/app/globals.css");
check("video comment threading is one level deep with a guard trigger", commentThreadsMigration.includes("add column if not exists parent_comment_id uuid") && commentThreadsMigration.includes("replies are limited to one level") && commentThreadsMigration.includes("create trigger raye2_video_comment_parent_guard"));
check("per-comment reactions are member-only with a guarded toggle RPC", commentThreadsMigration.includes("create table if not exists public.video_comment_reactions") && commentThreadsMigration.includes("create or replace function public.raye2_toggle_comment_reaction(p_comment_id uuid, p_reaction text)") && commentThreadsMigration.includes("grant execute on function public.raye2_toggle_comment_reaction(uuid,text) to authenticated") && !commentThreadsMigration.includes("raye2_toggle_comment_reaction(uuid,text) to anon"));
check("thread and reply reads are pinned definer RPCs granted to anon", commentThreadsMigration.includes("create or replace function public.raye2_get_video_comment_thread(p_media_id uuid, p_limit integer default 50)") && commentThreadsMigration.includes("create or replace function public.raye2_get_video_comment_replies(p_parent_id uuid, p_limit integer default 50)") && commentThreadsMigration.includes("grant execute on function public.raye2_get_video_comment_thread(uuid,integer) to anon, authenticated") && commentThreadsMigration.includes("grant execute on function public.raye2_get_video_comment_replies(uuid,integer) to anon, authenticated") && commentThreadsMigration.includes("my_reaction"));
check("the watch client renders threads, replies and comment reactions", watchDetailClient.includes("raye2_get_video_comment_thread") && watchDetailClient.includes("raye2_get_video_comment_replies") && watchDetailClient.includes("raye2_toggle_comment_reaction") && watchDetailClient.includes("async function sendReply(") && watchDetailClient.includes("className=\"raye2-detail-replies\"") && globalsCss.includes(".raye2-detail-comment-actions button.active{") && globalsCss.includes(".raye2-detail-replies{"));

const shortThreadsMigration = await read("../supabase/migrations/20261110370000_raye2_community_short_comment_threads.sql");
const shortsClient = await read("../src/app/shorts/community-shorts-client.tsx");
check("community short comment threading is one level deep with a guard trigger", shortThreadsMigration.includes("add column if not exists parent_comment_id uuid") && shortThreadsMigration.includes("replies are limited to one level") && shortThreadsMigration.includes("create trigger raye2_community_short_comment_parent_guard"));
check("per-comment reactions on shorts are member-only with a guarded toggle RPC", shortThreadsMigration.includes("create table if not exists public.community_short_comment_reactions") && shortThreadsMigration.includes("create or replace function public.raye2_toggle_short_comment_reaction(p_comment_id uuid, p_reaction text)") && shortThreadsMigration.includes("grant execute on function public.raye2_toggle_short_comment_reaction(uuid,text) to authenticated") && !shortThreadsMigration.includes("raye2_toggle_short_comment_reaction(uuid,text) to anon"));
check("short thread and reply reads are pinned definer RPCs granted to anon", shortThreadsMigration.includes("create or replace function public.raye2_get_short_comment_thread(p_short_id uuid, p_limit integer default 40)") && shortThreadsMigration.includes("create or replace function public.raye2_get_short_comment_replies(p_parent_id uuid, p_limit integer default 40)") && shortThreadsMigration.includes("grant execute on function public.raye2_get_short_comment_thread(uuid,integer) to anon, authenticated") && shortThreadsMigration.includes("grant execute on function public.raye2_get_short_comment_replies(uuid,integer) to anon, authenticated") && shortThreadsMigration.includes("my_reaction"));
check("the shorts client renders threads, replies and comment reactions", shortsClient.includes("raye2_get_short_comment_thread") && shortsClient.includes("raye2_get_short_comment_replies") && shortsClient.includes("raye2_toggle_short_comment_reaction") && shortsClient.includes("async function sendReply(") && shortsClient.includes("className=\"raye2-short-replies\"") && globalsCss.includes(".raye2-short-comment-actions button.is-active{") && globalsCss.includes(".raye2-short-replies{"));

const postThreadsMigration = await read("../supabase/migrations/20261110380000_raye2_community_post_comment_threads.sql");
check("community post comment threading is one level deep with a guard trigger", postThreadsMigration.includes("add column if not exists parent_comment_id uuid") && postThreadsMigration.includes("replies are limited to one level") && postThreadsMigration.includes("create trigger raye2_community_comment_parent_guard"));
check("per-comment reactions on posts are member-only with a guarded toggle RPC", postThreadsMigration.includes("create table if not exists public.community_comment_reactions") && postThreadsMigration.includes("create or replace function public.raye2_toggle_post_comment_reaction(p_comment_id uuid, p_reaction text)") && postThreadsMigration.includes("grant execute on function public.raye2_toggle_post_comment_reaction(uuid,text) to authenticated") && !postThreadsMigration.includes("raye2_toggle_post_comment_reaction(uuid,text) to anon"));
check("the post comment thread read keeps its shape and adds counts while filtering blocked authors", postThreadsMigration.includes("drop function if exists public.raye2_get_post_comments(uuid,integer)") && postThreadsMigration.includes("and cc.parent_comment_id is null") && postThreadsMigration.includes("not public.is_member_blocked(cc.author_id)") && postThreadsMigration.includes("grant execute on function public.raye2_get_post_comments(uuid,integer) to anon, authenticated"));
check("the post comment reply read is a pinned definer RPC granted to anon", postThreadsMigration.includes("create or replace function public.raye2_get_post_comment_replies(p_parent_id uuid, p_limit integer default 50)") && postThreadsMigration.includes("grant execute on function public.raye2_get_post_comment_replies(uuid,integer) to anon, authenticated"));
check("the community client renders threads, replies and comment reactions", communityClient.includes("raye2_get_post_comment_replies") && communityClient.includes("raye2_toggle_post_comment_reaction") && communityClient.includes("async function submitReply(") && communityClient.includes("className=\"raye2-comment-replies\"") && globalsCss.includes(".raye2-comment-actions .raye2-action.is-active{") && globalsCss.includes(".raye2-comment-replies{"));

const notificationCenterMigration = await read("../supabase/migrations/20261110390000_raye2_notification_center_types.sql");
const homeFeedPost = await read("../src/app/raye2/home/home-feed-post.tsx");
const homeModuleCss = await read("../src/app/raye2/home/home.module.css");
check("the notification summary counts every reaction and comment notification type", notificationCenterMigration.includes("'video_comment_reaction','community_short_comment_reaction','community_comment_reaction'") && notificationCenterMigration.includes("'video_comment_reply','community_short_comment_reply','community_comment_reply'"));
check("the notifications read is filter-aware and replaces the three-argument version", notificationCenterMigration.includes("drop function if exists public.raye2_get_notifications(integer,timestamptz,boolean)") && notificationCenterMigration.includes("p_filter text default 'all'") && notificationCenterMigration.includes("p_filter = 'comment' and n.notification_type like '%comment%' and n.notification_type not like '%reaction%'") && notificationCenterMigration.includes("grant execute on function public.raye2_get_notifications(integer,timestamptz,boolean,text) to authenticated"));
check("the notifications client localizes the threaded types and pages within the active filter", notificationsClient.includes("replied to your Shorts comment") && notificationsClient.includes("p_filter:filter") && notificationsClient.includes("n.type.includes(\"comment\")&&!n.type.includes(\"reaction\")") && notificationsPage.includes("p_filter:\"all\""));
check("the home feed post renders threaded comments with replies and reactions", homeFeedPost.includes("raye2_get_post_comment_replies") && homeFeedPost.includes("raye2_toggle_post_comment_reaction") && homeFeedPost.includes("async function sendReply(") && homeFeedPost.includes("styles.commentReplies") && homeModuleCss.includes(".commentReplies{") && homeModuleCss.includes(".commentActions button.active{"));

const communityPollsMigration = await read("../supabase/migrations/20261110400000_raye2_community_polls.sql");
check("community polls add a post-scoped poll, options and one-vote-per-member table with no direct client access", communityPollsMigration.includes("create table if not exists public.community_post_polls") && communityPollsMigration.includes("create table if not exists public.community_post_poll_options") && communityPollsMigration.includes("create table if not exists public.community_post_poll_votes") && communityPollsMigration.includes("primary key (poll_id, user_id)") && communityPollsMigration.includes("revoke all on public.community_post_poll_votes from anon, authenticated"));
check("poll creation and voting are guarded definer RPCs and the tally read is anon-visible", communityPollsMigration.includes("create or replace function public.raye2_create_community_poll(") && communityPollsMigration.includes("create or replace function public.raye2_vote_community_poll(") && communityPollsMigration.includes("create or replace function public.raye2_get_community_poll(p_poll_id uuid)") && communityPollsMigration.includes("grant execute on function public.raye2_create_community_poll(text,jsonb,timestamptz) to authenticated") && !communityPollsMigration.includes("raye2_create_community_poll(text,jsonb,timestamptz) to anon") && communityPollsMigration.includes("grant execute on function public.raye2_get_community_poll(uuid) to anon, authenticated"));
check("the community feed read exposes poll data and the client renders and votes on polls", communityPollsMigration.includes("poll_id uuid") && communityPollsMigration.includes("my_poll_vote text") && communityPollsMigration.includes("drop function if exists public.raye2_get_community_feed(integer,text,boolean)") && communityPage.includes("poll: row.poll_id ? {") && communityClient.includes('supabase.rpc("raye2_create_community_poll"') && communityClient.includes('supabase.rpc("raye2_vote_community_poll"') && communityClient.includes("raye2-poll-option"));
check("community poll votes notify the author through the inbox", communityPollsMigration.includes("'community_poll_vote'") && communityPollsMigration.includes("create trigger community_poll_vote_notification") && notificationsClient.includes("voted in your poll"));
const communityTopicsMigration = await read("../supabase/migrations/20261110440000_raye2_community_topic_channels.sql");
check("community topic channels are a curated, publicly readable set with published counts", communityTopicsMigration.includes("create table if not exists public.community_topics") && communityTopicsMigration.includes("grant select on public.community_topics to anon, authenticated") && communityTopicsMigration.includes("create policy \"Anyone reads active community topics\"") && communityTopicsMigration.includes("create or replace function public.raye2_list_community_topics()") && communityTopicsMigration.includes("p.status = 'published'"));
check("a post carries one topic and only its author can set it through a guarded RPC", communityTopicsMigration.includes("add column if not exists topic_slug text") && communityTopicsMigration.includes("references public.community_topics(slug) on delete set null") && communityTopicsMigration.includes("create or replace function public.raye2_set_post_topic(p_post_id uuid, p_topic_slug text)") && communityTopicsMigration.includes("only the author can set the topic") && communityTopicsMigration.includes("grant execute on function public.raye2_set_post_topic(uuid,text) to authenticated") && !communityTopicsMigration.includes("raye2_set_post_topic(uuid,text) to anon"));
check("the community feed read filters by topic and exposes the post topic", communityTopicsMigration.includes("drop function if exists public.raye2_get_community_feed(integer,text,boolean)") && communityTopicsMigration.includes("p_topic text default null") && communityTopicsMigration.includes("p_topic is null or p.topic_slug = p_topic") && communityTopicsMigration.includes("topic_slug text,") && communityTopicsMigration.includes("grant execute on function public.raye2_get_community_feed(integer,text,boolean,text) to anon, authenticated"));
check("the community surfaces wire topic channels end to end", communityPage.includes('rpc("raye2_list_community_topics")') && communityPage.includes("topicSlug: row.topic_slug") && communityClient.includes("topics?: CommunityTopic[]") && communityClient.includes('rpc("raye2_set_post_topic"') && communityClient.includes("topicFilter") && communityClient.includes("raye2-topic-compose") && communityClient.includes("#{post.topicName}"));
const groupTopicsClient = await read("../src/app/raye2/raye2-client.tsx");
const groupTopicsMigration = await read("../supabase/migrations/20261110450000_raye2_group_topic_threads.sql");
check("group topics are a manager-created, member-readable table scoped to a group", groupTopicsMigration.includes("create table if not exists public.raye2_group_topics") && groupTopicsMigration.includes("unique (group_id, slug)") && groupTopicsMigration.includes("create policy \"Raye2 group members read topics\"") && groupTopicsMigration.includes("public.raye2_is_group_member(group_id) or public.raye2_is_group_manager(group_id)") && groupTopicsMigration.includes("revoke all on public.raye2_group_topics from anon, authenticated"));
check("group topic creation and deletion are manager-only RPCs with unique slugs", groupTopicsMigration.includes("create or replace function public.raye2_create_group_topic(p_group_id uuid, p_name text)") && groupTopicsMigration.includes("if not public.raye2_is_group_manager(p_group_id) then") && groupTopicsMigration.includes("while exists (select 1 from public.raye2_group_topics gt where gt.group_id = p_group_id and gt.slug = v_slug)") && groupTopicsMigration.includes("create or replace function public.raye2_delete_group_topic(p_topic_id uuid)") && groupTopicsMigration.includes("grant execute on function public.raye2_create_group_topic(uuid,text) to authenticated") && !groupTopicsMigration.includes("raye2_create_group_topic(uuid,text) to anon"));
check("messages scope to a topic only within the same conversation and listing is membership-guarded", groupTopicsMigration.includes("add column if not exists topic_id uuid") && groupTopicsMigration.includes("create or replace function public.raye2_guard_message_topic()") && groupTopicsMigration.includes("topic does not belong to this conversation") && groupTopicsMigration.includes("create trigger raye2_messages_guard_topic before insert or update") && groupTopicsMigration.includes("create or replace function public.raye2_list_group_topics(p_group_id uuid)") && groupTopicsMigration.includes("grant execute on function public.raye2_list_group_topics(uuid) to authenticated"));
check("the group chat client wires topic channels end to end", groupTopicsClient.includes('rpc("raye2_list_group_topics"') && groupTopicsClient.includes('rpc("raye2_create_group_topic"') && groupTopicsClient.includes('rpc("raye2_delete_group_topic"') && groupTopicsClient.includes("topic_id: activeTopicId") && groupTopicsClient.includes("visibleMessages") && groupTopicsClient.includes("styles.topicBar") && groupTopicsClient.includes("styles.topicChip"));
const communityModerationMigration = await read("../supabase/migrations/20261110460000_raye2_community_moderation_toolkit.sql");
const communityModerationClient = await read("../src/app/community/community-client.tsx");
check("community content can be reported through a validated RPC", communityModerationMigration.includes("create or replace function public.raye2_report_community_content(") && communityModerationMigration.includes("if v_reason not in ('spam','harassment','hate','impersonation','copyright','other') then") && communityModerationMigration.includes("grant execute on function public.raye2_report_community_content(text,text,text,text) to authenticated") && !communityModerationMigration.includes("raye2_report_community_content(text,text,text,text) to anon"));
check("moderators remove, reject and restore posts and comments with audit and report resolution", communityModerationMigration.includes("create or replace function public.raye2_moderate_community_post(") && communityModerationMigration.includes("create or replace function public.raye2_moderate_community_comment(") && communityModerationMigration.includes("if not private.can_moderate_community() then") && communityModerationMigration.includes("insert into public.raye2_admin_audit_log") && communityModerationMigration.includes("set status = 'resolved', resolved_at = now(), resolved_by = (select auth.uid())"));
check("the moderation queue and removed content list are moderator-only", communityModerationMigration.includes("create or replace function public.raye2_get_community_moderation_queue(") && communityModerationMigration.includes("create or replace function public.raye2_get_moderated_community_posts(") && communityModerationMigration.includes("create or replace function public.raye2_resolve_content_report(") && (communityModerationMigration.match(/raise exception 'moderator access required'/g) || []).length >= 5);
check("the community client wires reporting and the moderation workspace", communityModerationClient.includes('rpc("raye2_report_community_content"') && communityModerationClient.includes('rpc("raye2_get_community_moderation_queue"') && communityModerationClient.includes('rpc("raye2_moderate_community_post"') && communityModerationClient.includes('rpc("raye2_resolve_content_report"') && communityModerationClient.includes("raye2-moderation-list") && communityModerationClient.includes("raye2-report-modal"));
const adminDashboardsMigration = await read("../supabase/migrations/20261110470000_raye2_admin_dashboards_roles.sql");
const adminDashboardsClient = await read("../src/app/creator/raye2/admin-client.tsx");
const adminDashboardsPage = await read("../src/app/creator/raye2/page.tsx");
check("the platform health RPC is admin-only and classifies storage against rules-engine thresholds", adminDashboardsMigration.includes("create or replace function public.raye2_get_platform_health()") && adminDashboardsMigration.includes("if not public.raye2_is_platform_admin() then") && adminDashboardsMigration.includes("storage.warning.bytes") && adminDashboardsMigration.includes("storage.critical.bytes") && adminDashboardsMigration.includes("when v_total >= v_critical then 'critical'"));
check("the platform admin roster is admin-only and joins member profiles", adminDashboardsMigration.includes("create or replace function public.raye2_list_platform_admins()") && adminDashboardsMigration.includes("left join public.member_profiles mp on mp.user_id = a.user_id") && adminDashboardsMigration.includes("grant execute on function public.raye2_list_platform_admins() to authenticated"));
check("the admin dashboard renders health and role-management sections", adminDashboardsClient.includes('tab === "health"') && adminDashboardsClient.includes('tab === "roles"') && adminDashboardsClient.includes('rpc("set_creator_admin_role"') && adminDashboardsClient.includes('rpc("set_creator_admin_active"') && adminDashboardsClient.includes("initialHealth.map") && adminDashboardsClient.includes("admins.map"));
check("the admin page loads health and admin roster server-side", adminDashboardsPage.includes('rpc("raye2_get_platform_health")') && adminDashboardsPage.includes('rpc("raye2_list_platform_admins")') && adminDashboardsPage.includes("initialHealth={(health.data ?? []) as HealthRow[]}"));
const ruleEnforcementMigration = await read("../supabase/migrations/20261110480000_raye2_rule_enforcement_quotas.sql");
const ruleEnforcementClient = await read("../src/app/raye2/raye2-client.tsx");
check("the rules engine exposes a guarded integer reader and activates the seeded caps", ruleEnforcementMigration.includes("create or replace function public.raye2_rule_int(p_key text, p_default integer)") && ruleEnforcementMigration.includes("grant execute on function public.raye2_rule_int(text,integer) to authenticated") && !ruleEnforcementMigration.includes("raye2_rule_int(text,integer) to anon") && ruleEnforcementMigration.includes("set status = 'active'"));
check("group creation and membership are capped by active rules", ruleEnforcementMigration.includes("groups.created.normal_user.monthly") && ruleEnforcementMigration.includes("monthly group creation limit reached") && ruleEnforcementMigration.includes("create trigger raye2_group_members_limit before insert on public.raye2_group_members") && ruleEnforcementMigration.includes("group member limit reached"));
check("group messages respect the character cap while direct messages keep the column limit", ruleEnforcementMigration.includes("create trigger raye2_messages_length before insert on public.raye2_messages") && ruleEnforcementMigration.includes("message exceeds the group character limit") && ruleEnforcementMigration.includes("if v_type = 'group' then") && ruleEnforcementMigration.includes("chat.message.max_characters"));
check("new direct conversations are capped per day", ruleEnforcementMigration.includes("chat.dm.new_conversations.daily") && ruleEnforcementMigration.includes("daily new conversation limit reached") && ruleEnforcementMigration.includes("create or replace function public.raye2_create_direct_conversation(p_other_user uuid)"));
check("active rules are readable by members only", ruleEnforcementMigration.includes("create or replace function public.raye2_list_active_rules()") && ruleEnforcementMigration.includes("where r.status = 'active'") && ruleEnforcementMigration.includes("grant execute on function public.raye2_list_active_rules() to authenticated") && !ruleEnforcementMigration.includes("raye2_list_active_rules() to anon"));
check("the group management modal surfaces active platform limits", ruleEnforcementClient.includes('rpc("raye2_list_active_rules"') && ruleEnforcementClient.includes("activeRules.map") && ruleEnforcementClient.includes("limitsLabel"));
const safetyReviewMigration = await read("../supabase/migrations/20261110490000_raye2_safety_review_audit_filter.sql");
const safetyReviewCommunity = await read("../src/app/community/community-client.tsx");
const safetyReviewAdmin = await read("../src/app/creator/raye2/admin-client.tsx");
check("safety reports can be reviewed and resolved by moderators with an audit trail", safetyReviewMigration.includes("create or replace function public.raye2_get_safety_report_queue(") && safetyReviewMigration.includes("create or replace function public.raye2_resolve_safety_report(") && safetyReviewMigration.includes("private.can_moderate_community() or public.raye2_is_platform_admin()") && safetyReviewMigration.includes("'safety_report_' || p_status"));
check("the audit log is filterable and platform-admin only", safetyReviewMigration.includes("create or replace function public.raye2_get_admin_audit_log(") && safetyReviewMigration.includes("if not public.raye2_is_platform_admin() then") && safetyReviewMigration.includes("(p_action is null or a.action = p_action)") && safetyReviewMigration.includes("(p_actor is null or a.actor_id = p_actor)") && !safetyReviewMigration.includes("raye2_get_admin_audit_log(integer,text,uuid) to anon"));
check("the moderation workspace surfaces the safety report queue", safetyReviewCommunity.includes('rpc("raye2_get_safety_report_queue"') && safetyReviewCommunity.includes('rpc("raye2_resolve_safety_report"') && safetyReviewCommunity.includes("safetyQueue.map"));
check("the admin audit view supports action and actor filters", safetyReviewAdmin.includes('rpc("raye2_get_admin_audit_log"') && safetyReviewAdmin.includes("auditAction") && safetyReviewAdmin.includes("auditActor") && safetyReviewAdmin.includes("loadAudit"));
const cleanupExecutionMigration = await read("../supabase/migrations/20261110500000_raye2_cleanup_execution.sql");
const cleanupExecutionAdmin = await read("../src/app/creator/raye2/admin-client.tsx");
check("cleanup jobs have a queue/run/cancel lifecycle with audit entries", cleanupExecutionMigration.includes("create or replace function public.raye2_queue_cleanup_job(") && cleanupExecutionMigration.includes("create or replace function public.raye2_run_cleanup_job(") && cleanupExecutionMigration.includes("create or replace function public.raye2_cancel_cleanup_job(") && cleanupExecutionMigration.includes("'cleanup_job_queued'") && cleanupExecutionMigration.includes("'cleanup_job_completed'"));
check("cleanup execution deletes only for delete policies and reports item and byte totals", cleanupExecutionMigration.includes("create or replace function public.raye2_cleanup_candidates(") && cleanupExecutionMigration.includes("if v_policy.expiry_action <> 'delete' then") && cleanupExecutionMigration.includes("archived_unsupported") && cleanupExecutionMigration.includes("'deleted_items', v_total, 'deleted_bytes', v_total_bytes"));
check("a retention sweep preview reports candidates and oldest entries", cleanupExecutionMigration.includes("create or replace function public.raye2_preview_retention_sweep()") && cleanupExecutionMigration.includes("where p.enabled and p.retention_days is not null") && cleanupExecutionMigration.includes("candidates bigint, oldest timestamptz"));
check("the admin cleanup tab queues, runs, cancels and previews sweeps", cleanupExecutionAdmin.includes('"raye2_queue_cleanup_job"') && cleanupExecutionAdmin.includes('"raye2_run_cleanup_job"') && cleanupExecutionAdmin.includes('"raye2_cancel_cleanup_job"') && cleanupExecutionAdmin.includes('rpc("raye2_preview_retention_sweep"') && cleanupExecutionAdmin.includes("loadSweep"));
const moderationActionsMigration = await read("../supabase/migrations/20261110510000_raye2_moderation_actions_appeals.sql");
const moderationActionsCommunity = await read("../src/app/community/community-client.tsx");
check("moderators can apply warning/timeout/restriction/suspension/ban with an audit trail", moderationActionsMigration.includes("create or replace function public.raye2_apply_member_restriction(") && moderationActionsMigration.includes("'warning','timeout','rate_reduction','feature_restriction','suspension','ban'") && moderationActionsMigration.includes("'moderation_'||p_action") && moderationActionsMigration.includes("cannot restrict a platform administrator"));
check("restrictions are enforced on posts, comments and messages", moderationActionsMigration.includes("create trigger raye2_posts_restriction_guard before insert on public.community_posts") && moderationActionsMigration.includes("create trigger raye2_comments_restriction_guard before insert on public.community_comments") && moderationActionsMigration.includes("create trigger raye2_messages_restriction_guard before insert on public.raye2_messages") && moderationActionsMigration.includes("raye2_has_active_restriction"));
check("members can appeal and moderators can grant or deny", moderationActionsMigration.includes("create or replace function public.raye2_submit_moderation_appeal(") && moderationActionsMigration.includes("create or replace function public.raye2_review_moderation_appeal(") && moderationActionsMigration.includes("'appeal_'||p_decision") && moderationActionsMigration.includes("you can only appeal your own restriction"));
check("the moderation workspace surfaces restrictions and appeals", moderationActionsCommunity.includes('rpc("raye2_apply_member_restriction"') && moderationActionsCommunity.includes('rpc("raye2_review_moderation_appeal"') && moderationActionsCommunity.includes("restrictions.map") && moderationActionsCommunity.includes("appeals.map"));
const quotaUsageMigration = await read("../supabase/migrations/20261110520000_raye2_quota_usage_rejections.sql");
const quotaUsageAdmin = await read("../src/app/creator/raye2/admin-client.tsx");
check("quota usage is reported against measurable active rules only", quotaUsageMigration.includes("create or replace function public.raye2_get_quota_usage()") && quotaUsageMigration.includes("create or replace function public.raye2_quota_used(") && quotaUsageMigration.includes("else null") && quotaUsageMigration.includes("public.raye2_quota_used(r.rule_key, auth.uid()) is not null"));
check("rejected attempts are logged only when the caller is genuinely over the cap", quotaUsageMigration.includes("create or replace function public.raye2_record_quota_rejection(") && quotaUsageMigration.includes("if v_used is null or v_limit <= 0 or v_used < v_limit then") && quotaUsageMigration.includes("create table if not exists public.raye2_quota_rejections"));
check("platform admins can read rejected-attempt totals by rule", quotaUsageMigration.includes("create or replace function public.raye2_get_quota_overview(") && quotaUsageMigration.includes("count(distinct q.user_id)") && quotaUsageMigration.includes("raye2_is_platform_admin()"));
check("the admin dashboard shows quota usage and rejections", quotaUsageAdmin.includes('rpc("raye2_get_quota_overview"') && quotaUsageAdmin.includes("loadQuotas") && quotaUsageAdmin.includes("quotas.map"));
const backgroundJobsMigration = await read("../supabase/migrations/20261110530000_raye2_background_jobs.sql");
const backgroundJobsAdmin = await read("../src/app/creator/raye2/admin-client.tsx");
check("background jobs are durable, idempotent and lease-claimed by the trusted worker only", backgroundJobsMigration.includes("create table if not exists public.raye2_background_jobs") && backgroundJobsMigration.includes("raye2_background_jobs_idempotency_idx") && backgroundJobsMigration.includes("create or replace function public.raye2_claim_background_job()") && backgroundJobsMigration.includes("for update skip locked") && backgroundJobsMigration.includes("auth.role() is distinct from 'service_role'"));
check("background jobs retry with backoff and then fail at the attempt ceiling", backgroundJobsMigration.includes("create or replace function public.raye2_complete_background_job(") && backgroundJobsMigration.includes("if v_job.attempts >= v_job.max_attempts then") && backgroundJobsMigration.includes("power(2, v_job.attempts)") && backgroundJobsMigration.includes("'queued'"));
check("background jobs are observable and admin-controllable", backgroundJobsMigration.includes("create or replace function public.raye2_get_background_job_stats()") && backgroundJobsMigration.includes("stuck_running") && backgroundJobsMigration.includes("create or replace function public.raye2_retry_background_job(") && backgroundJobsMigration.includes("create or replace function public.raye2_cancel_background_job("));
check("the admin dashboard surfaces background jobs", backgroundJobsAdmin.includes('rpc("raye2_list_background_jobs"') && backgroundJobsAdmin.includes('rpc("raye2_get_background_job_stats"') && backgroundJobsAdmin.includes("bgJobs.map"));
const contentTakedownMigration = await read("../supabase/migrations/20261110540000_raye2_content_takedown.sql");
const contentTakedownCommunity = await read("../src/app/community/community-client.tsx");
check("a takedown makes content inaccessible immediately and records the prior state", contentTakedownMigration.includes("create table if not exists public.raye2_content_takedowns") && contentTakedownMigration.includes("create or replace function public.raye2_apply_content_takedown(") && contentTakedownMigration.includes("set status = 'removed'") && contentTakedownMigration.includes("set is_published = false") && contentTakedownMigration.includes("previous_state"));
check("copyright takedowns require a claimant and duplicate takedowns are refused", contentTakedownMigration.includes("a claimant is required for a copyright takedown") && contentTakedownMigration.includes("already taken down") && contentTakedownMigration.includes("raye2_content_takedowns_active_idx"));
check("takedowns can be reinstated and are audited", contentTakedownMigration.includes("create or replace function public.raye2_reinstate_content_takedown(") && contentTakedownMigration.includes("'content_takedown'") && contentTakedownMigration.includes("'content_reinstated'"));
check("the moderation workspace surfaces takedowns", contentTakedownCommunity.includes('rpc("raye2_get_takedown_queue"') && contentTakedownCommunity.includes('rpc("raye2_reinstate_content_takedown"') && contentTakedownCommunity.includes("takedowns.map"));
const rateLimitsMigration = await read("../supabase/migrations/20261110550000_raye2_rate_limits.sql");
const commentRecursionFix = await read("../supabase/migrations/20261110560000_raye2_fix_comment_policy_recursion.sql");
check("high-frequency actions are rate limited server-side", rateLimitsMigration.includes("create table if not exists public.raye2_rate_limit_counters") && rateLimitsMigration.includes("create or replace function public.raye2_rate_limit(") && rateLimitsMigration.includes("create or replace function public.raye2_enforce_rate_limit()") && rateLimitsMigration.includes("create trigger raye2_posts_rate_limit") && rateLimitsMigration.includes("create trigger raye2_messages_rate_limit"));
check("rate limits are configurable and admin-observable", rateLimitsMigration.includes("'rate.community.post.hourly'") && rateLimitsMigration.includes("create or replace function public.raye2_get_rate_limit_usage()") && rateLimitsMigration.includes("create or replace function public.raye2_get_rate_limit_stats(") && rateLimitsMigration.includes("raye2_is_platform_admin()"));
check("comment-thread read policies avoid self-referential recursion", commentRecursionFix.includes("create or replace function public.raye2_comment_parent_visible(") && commentRecursionFix.includes("create or replace function public.raye2_short_comment_parent_visible(") && commentRecursionFix.includes("create or replace function public.raye2_video_comment_parent_visible(") && commentRecursionFix.includes('drop policy if exists "Published comments visible" on public.community_comments') && !commentRecursionFix.includes("select 1 from public.community_comments parent"));
const telemetryMigration = await read("../supabase/migrations/20261110570000_raye2_telemetry.sql");
const telemetryReporter = await read("../src/app/telemetry-reporter.tsx");
const telemetryAdmin = await read("../src/app/creator/raye2/admin-client.tsx");
check("telemetry records client errors, API latency and system events", telemetryMigration.includes("create table if not exists public.raye2_telemetry_events") && telemetryMigration.includes("create or replace function public.raye2_record_telemetry(") && telemetryMigration.includes("'client_error','api_latency','realtime_quality','media_playback','background_job'"));
check("telemetry reports latency percentiles and is admin-gated", telemetryMigration.includes("percentile_cont(0.95)") && telemetryMigration.includes("create or replace function public.raye2_get_telemetry_summary(") && telemetryMigration.includes("raye2_is_platform_admin()") && telemetryMigration.includes("create or replace function public.raye2_prune_telemetry("));
check("the client reports uncaught errors", telemetryReporter.includes('raye2_record_telemetry') && telemetryReporter.includes('"unhandledrejection"') && telemetryReporter.includes('addEventListener("error"'));
check("the admin dashboard surfaces telemetry", telemetryAdmin.includes('rpc("raye2_list_telemetry_events"') && telemetryAdmin.includes('rpc("raye2_get_telemetry_summary"') && telemetryAdmin.includes("telemetry.map"));
const capacityMigration = await read("../supabase/migrations/20261110580000_raye2_capacity_accounting.sql");
const capacityAdmin = await read("../src/app/creator/raye2/admin-client.tsx");
check("capacity limits are configurable and usage is measured from real sources", capacityMigration.includes("create table if not exists public.raye2_capacity_limits") && capacityMigration.includes("create or replace function public.raye2_capacity_used(") && capacityMigration.includes("when 'storage_bytes' then") && capacityMigration.includes("else null"));
check("backpressure refuses work before a metric is exhausted", capacityMigration.includes("create or replace function public.raye2_assert_capacity(") && capacityMigration.includes("create or replace function public.raye2_enforce_job_capacity()") && capacityMigration.includes("create trigger raye2_background_jobs_capacity") && capacityMigration.includes("errcode='53100'"));
check("the admin capacity report is gated and tunable", capacityMigration.includes("create or replace function public.raye2_get_capacity_report()") && capacityMigration.includes("create or replace function public.raye2_set_capacity_limit(") && capacityMigration.includes("raye2_is_platform_admin()"));
check("the admin dashboard surfaces capacity", capacityAdmin.includes('rpc("raye2_get_capacity_report"') && capacityAdmin.includes("loadCapacity") && capacityAdmin.includes("capacity.map"));
const rolePermsMigration = await read("../supabase/migrations/20261110590000_raye2_creator_role_permissions.sql");
const creatorCaps = await read("../src/app/creator/creator-capabilities.tsx");
check("creator and streamer roles are distinct and non-additive", rolePermsMigration.includes("when 'creator' then 'creator'") && rolePermsMigration.includes("when 'streamer' then 'streamer'") && rolePermsMigration.includes("'combined','long_videos_per_month',3") && rolePermsMigration.includes("'combined','streams_per_month',3") && rolePermsMigration.includes("'combined','minis_per_month',20"));
check("every publishing permission and quota is enforced server-side", rolePermsMigration.includes("create or replace function public.raye2_assert_creator_action(") && rolePermsMigration.includes("does not permit") && rolePermsMigration.includes("quota reached") && rolePermsMigration.includes("cooldown active") && rolePermsMigration.includes("raye2_tier_allows"));
check("creator capabilities and the admin matrix are gated", rolePermsMigration.includes("create or replace function public.raye2_get_creator_capabilities(") && rolePermsMigration.includes("create or replace function public.raye2_get_creator_permission_matrix()") && rolePermsMigration.includes("create or replace function public.raye2_set_role_quota(") && rolePermsMigration.includes("raye2_is_platform_admin()"));
check("the Creator Studio shows permitted actions and why others are unavailable", creatorCaps.includes('rpc("raye2_get_creator_capabilities"') && creatorCaps.includes("cap.reason") && creatorCaps.includes("cap.allowed"));
const liveMigration = await read("../supabase/migrations/20261110600000_raye2_live_streaming.sql");
const liveStudio = await read("../src/app/creator/creator-live-studio.tsx");
check("live streaming is role-gated and quota-enforced server-side", liveMigration.includes("create or replace function public.raye2_start_live_stream(") && liveMigration.includes("only Streamer and Creator+Streamer roles can start live streams") && liveMigration.includes("weekly stream quota reached") && liveMigration.includes("monthly stream quota reached") && liveMigration.includes("concurrent stream limit reached"));
check("live duration and concurrency stay configurable within provider limits", liveMigration.includes("'live.max_duration_seconds'") && liveMigration.includes("'live.max_concurrent_streams'") && liveMigration.includes("'live.replay_retention_hours'"));
check("replay retention is logical with physical deletion queued separately", liveMigration.includes("create or replace function public.raye2_end_live_stream(") && liveMigration.includes("create or replace function public.raye2_expire_live_replays()") && liveMigration.includes("'live.replay_cleanup'") && liveMigration.includes("raye2_background_jobs"));
check("live streams are moderated and observable", liveMigration.includes("create or replace function public.raye2_moderate_live_stream(") && liveMigration.includes("create or replace function public.raye2_get_live_admin_overview()") && liveMigration.includes("create or replace function public.raye2_update_live_stream_health(") && liveMigration.includes("raye2_admin_audit_log"));
check("the live studio starts, reports health and ends streams", liveStudio.includes('rpc("raye2_start_live_stream"') && liveStudio.includes('rpc("raye2_end_live_stream"') && liveStudio.includes('rpc("raye2_update_live_stream_health"'));
const exclusivityMigration = await read("../supabase/migrations/20261110610000_raye2_video_exclusivity.sql");
const exclusivityPanel = await read("../src/app/creator/creator-video-exclusivity.tsx");
check("video exclusivity and expiry are enforced on the catalog read path", exclusivityMigration.includes("create or replace function public.raye2_video_accessible(") && exclusivityMigration.includes("create or replace function public.raye2_can_view_video(") && exclusivityMigration.includes("create policy \"Accessible videos are visible\" on public.video_catalog") && exclusivityMigration.includes("exclusive_until"));
check("exclusivity and expiry caps are tunable and enforced", exclusivityMigration.includes("'video.exclusive_max_days'") && exclusivityMigration.includes("'video.expiry_max_days'") && exclusivityMigration.includes("exclusive window exceeds") && exclusivityMigration.includes("availability window exceeds"));
check("only the owner sets exclusivity, and it is audited", exclusivityMigration.includes("create or replace function public.raye2_set_video_exclusivity(") && exclusivityMigration.includes("only the owner can set exclusivity") && exclusivityMigration.includes("video_exclusivity_set"));
check("the Creator Studio sets video exclusivity and expiry", exclusivityPanel.includes('rpc("raye2_set_video_exclusivity"') && exclusivityPanel.includes('rpc("raye2_get_my_video_exclusivity"'));
const liveDiscovery = await read("../supabase/migrations/20261110620000_raye2_live_discovery.sql");
const livePage = await read("../src/app/live/page.tsx");
const liveDetailPage = await read("../src/app/live/[id]/page.tsx");
const homePage = await read("../src/app/raye2/home/page.tsx");
check("live discovery lists only public live streams and in-window replays", liveDiscovery.includes("create or replace function public.raye2_get_live_now(") && liveDiscovery.includes("s.visibility = 'public'") && liveDiscovery.includes("s.replay_until > now()") && liveDiscovery.includes("grant execute on function public.raye2_get_live_now(integer) to anon, authenticated"));
check("live watch detail is visibility-aware for anonymous viewers", liveDiscovery.includes("grant execute on function public.raye2_get_live_stream(uuid) to anon") && liveDetailPage.includes('rpc("raye2_get_live_stream"'));
check("the live route and home surface discovery", livePage.includes('rpc("raye2_get_live_now"') && homePage.includes('rpc("raye2_get_live_now"') && homePage.includes('href="/live"'));
const accountMigration = await read("../supabase/migrations/20261110630000_raye2_account_lifecycle.sql");
const accountSettings = await read("../src/app/account/account-settings.tsx");
const voiceControls = await read("../src/app/raye2/raye2-voice-controls.tsx");
const watchControls = await read("../src/app/raye2/raye2-watch-together-controls.tsx");
check("accounts support deactivation, deletion and data export server-side", accountMigration.includes("create or replace function public.raye2_deactivate_account(") && accountMigration.includes("create or replace function public.raye2_request_account_deletion(") && accountMigration.includes("create or replace function public.raye2_reactivate_account()") && accountMigration.includes("create or replace function public.raye2_request_data_export()"));
check("account deletion is logical first with a durable purge job", accountMigration.includes("'account.deletion_grace_days'") && accountMigration.includes("'account.purge'") && accountMigration.includes("account_purge:") && accountMigration.includes("raye2_background_jobs"));
check("account lifecycle and preferences are owner-scoped", accountMigration.includes("Members read their own lifecycle") && accountMigration.includes("Members read their own preferences") && accountMigration.includes("create or replace function public.raye2_set_my_preferences("));
check("the account page exposes lifecycle, preferences and export", accountSettings.includes('rpc("raye2_request_account_deletion"') && accountSettings.includes('rpc("raye2_request_data_export"') && accountSettings.includes('rpc("raye2_set_my_preferences"'));
const recMigration = await read("../supabase/migrations/20261110640000_raye2_recommendations.sql");
check("recommendations are explainable and privacy-safe", recMigration.includes("create or replace function public.raye2_get_recommended_videos(") && recMigration.includes("based_on_watch_history") && recMigration.includes("matched_category") && recMigration.includes("vv.viewer_id = (select auth.uid())"));
check("recommendations respect exclusivity and expiry", recMigration.includes("vc.exclusive_until is null or vc.exclusive_until <= now()") && recMigration.includes("vc.available_until is null or vc.available_until > now()"));
check("recommendation topics are owner-scoped", recMigration.includes("create or replace function public.raye2_get_my_recommendation_topics(") && recMigration.includes("grant execute on function public.raye2_get_my_recommendation_topics(integer) to authenticated"));
check("the home page surfaces recommendations with a reason", homePage.includes('rpc("raye2_get_recommended_videos"') && homePage.includes("based_on_watch_history"));
const feedPageMigration = await read("../supabase/migrations/20261110650000_raye2_feed_pagination.sql");
const feedMore = await read("../src/app/raye2/home/home-feed-more.tsx");
check("the community feed paginates by keyset cursor without duplicates", feedPageMigration.includes("create or replace function public.raye2_get_community_feed_page(") && feedPageMigration.includes("(p.created_at, p.id) < (p_before,") && feedPageMigration.includes("order by p.created_at desc, p.id desc"));
check("the home feed exposes load-more with loading, error and end states", feedMore.includes('rpc("raye2_get_community_feed_page"') && feedMore.includes("home-feed-more-error") && feedMore.includes("home-feed-more-end"));
const restrMigration = await read("../supabase/migrations/20261110660000_raye2_restriction_enforcement.sql");
const accountSettingsFile = await read("../src/app/account/account-settings.tsx");
check("voice and watch restrictions are enforced server-side", restrMigration.includes("create or replace function public.raye2_join_voice_session_guarded(") && restrMigration.includes("create or replace function public.raye2_join_watch_session_guarded(") && restrMigration.includes("raye2_has_active_restriction(auth.uid(), 'voice')") && restrMigration.includes("raye2_has_active_restriction(auth.uid(), 'watch')"));
check("video comments enforce the comment restriction", restrMigration.includes("raye2_video_comments_restriction_guard") && restrMigration.includes("raye2_enforce_video_comment_restriction"));
check("members can see their own restrictions and appeal", restrMigration.includes("create or replace function public.raye2_get_my_restrictions()") && accountSettingsFile.includes('rpc("raye2_get_my_restrictions")') && accountSettingsFile.includes('rpc("raye2_submit_moderation_appeal"'));
check("the client joins guarded voice and watch sessions", voiceControls.includes("raye2_join_voice_session_guarded") && watchControls.includes("raye2_join_watch_session_guarded"));
const grantsMigration = await read("../supabase/migrations/20261110670000_raye2_temporary_grants_overrides.sql");
const teamClient = await read("../src/app/creator/team/team-client.tsx");
check("temporary role grants honour expiry without a write", grantsMigration.includes("add column if not exists expires_at timestamptz") && grantsMigration.includes("a.expires_at is null or a.expires_at > now()") && grantsMigration.includes("create or replace function public.set_creator_admin_expiry("));
check("account-specific capability overrides are admin-managed and audited", grantsMigration.includes("create table if not exists public.raye2_capability_overrides") && grantsMigration.includes("create or replace function public.raye2_effective_capability(") && grantsMigration.includes("raye2_set_capability_override") && grantsMigration.includes("capability_override_set"));
check("members can see their own capability overrides", grantsMigration.includes("create or replace function public.raye2_get_my_capability_overrides()") && accountSettingsFile.includes('rpc("raye2_get_my_capability_overrides")'));
check("the team UI sets and shows temporary grant expiry", teamClient.includes("set_creator_admin_expiry") && teamClient.includes("expiresAt"));
const watchLibPageMigration = await read("../supabase/migrations/20261110680000_raye2_watch_library_pagination.sql");
const watchLibMore = await read("../src/app/watch/watch-library-more.tsx");
const watchLibMedia = await read("../src/app/watch/watch-library-media.ts");
check("the watch library paginates by keyset cursor", watchLibPageMigration.includes("create or replace function public.raye2_get_watch_library_page(") && watchLibPageMigration.includes("(vc.published_at, vc.media_id) < (p_before,") && watchLibPageMigration.includes("order by vc.published_at desc, vc.media_id desc"));
check("the watch library page respects exclusivity and expiry", watchLibPageMigration.includes("public.raye2_can_view_video(vc.media_id)"));
check("the watch library exposes load-more with states", watchLibMore.includes('rpc("raye2_get_watch_library_page"') && watchLibMore.includes("Load more videos") && watchLibMore.includes("reached the end"));
check("watch card media validation is shared and safe", watchLibMedia.includes("creator-media-public/") && watchLibMedia.includes("youtube-nocookie.com") && watchLibMedia.includes("processing_status"));
const discoveryEnforceMigration = await read("../supabase/migrations/20261110690000_raye2_discovery_exclusivity_enforcement.sql");
check("discovery RPCs apply the video exclusivity and expiry check", ["raye2_get_related_videos","raye2_get_topic_videos","raye2_list_topics","raye2_get_trending_videos","raye2_get_trending_tags","raye2_search","raye2_get_watch_context","raye2_get_continue_watching"].every(name => discoveryEnforceMigration.includes("create or replace function public." + name + "(")));
check("every recreated discovery RPC gates on raye2_can_view_video", (discoveryEnforceMigration.match(/public\.raye2_can_view_video\(vc\.media_id\)/g) ?? []).length >= 8);
const ownerSepMigration = await read("../supabase/migrations/20261110700000_raye2_owner_super_admin_separation.sql");
const adminClientFile = await read("../src/app/creator/raye2/admin-client.tsx");
check("owner and super-admin powers are separated", ownerSepMigration.includes("create or replace function public.raye2_is_super_admin()") && ownerSepMigration.includes("create or replace function public.raye2_admin_capabilities()"));
check("destructive cleanup and privilege overrides are owner-only", ownerSepMigration.includes("create or replace function public.raye2_run_cleanup_job(") && ownerSepMigration.includes("create or replace function public.raye2_set_capability_override(") && (ownerSepMigration.match(/raye2_is_super_admin\(\) then raise exception 'owner access required'/g) ?? []).length >= 3);
check("the admin UI shows the capability matrix and gates destructive run", adminClientFile.includes('rpc("raye2_admin_capabilities")') === false && adminClientFile.includes("initialCaps") && adminClientFile.includes("canRunCleanup") && adminClientFile.includes("runOwnerOnly"));
const accessExtMigration = await read("../supabase/migrations/20261110710000_raye2_creator_profile_watch_access.sql");
check("creator, profile and watch-together reads apply the video access check", ["raye2_list_creators","raye2_get_profile_overview","raye2_validate_watch_source"].every(name => accessExtMigration.includes("create or replace function public." + name + "(")) && (accessExtMigration.match(/public\.raye2_can_view_video\(/g) ?? []).length >= 4);
const seriesCommentsMigration = await read("../supabase/migrations/20261110720000_raye2_series_comments_collection_access.sql");
check("series, comment-thread and collection reads apply the video access check", ["raye2_list_series","raye2_get_series","raye2_get_video_comment_thread","raye2_get_video_comment_replies","raye2_get_collection"].every(name => seriesCommentsMigration.includes("create or replace function public." + name + "(")) && (seriesCommentsMigration.match(/public\.raye2_can_view_video\(/g) ?? []).length >= 5);
const finalGateMigration = await read("../supabase/migrations/20261110730000_raye2_video_reads_final_gate.sql");
check("reaction counts, view recording and comment-parent visibility apply the video access check", ["get_video_reaction_counts","record_video_view","raye2_video_comment_parent_visible"].every(name => finalGateMigration.includes("create or replace function public." + name + "(")) && (finalGateMigration.match(/public\.raye2_can_view_video\(/g) ?? []).length >= 3);

const groupBansMigration = await read("../supabase/migrations/20261110410000_raye2_group_bans.sql");
const raye2Client = await read("../src/app/raye2/raye2-client.tsx");
check("group bans add an authenticated ban and unban RPC with a manager-only banned list", groupBansMigration.includes("create or replace function public.raye2_ban_group_member(p_group_id uuid, p_user_id uuid)") && groupBansMigration.includes("create or replace function public.raye2_unban_group_member(p_group_id uuid, p_user_id uuid)") && groupBansMigration.includes("create or replace function public.raye2_get_group_bans(p_group_id uuid, p_limit integer default 100)") && groupBansMigration.includes("grant execute on function public.raye2_ban_group_member(uuid,uuid) to authenticated") && !groupBansMigration.includes("raye2_ban_group_member(uuid,uuid) to anon") && groupBansMigration.includes("where public.raye2_is_group_manager(p_group_id)"));
check("group bans set the banned status and record audit history while refusing owner and self targets", groupBansMigration.includes("set status = 'banned', restricted_at = now()") && groupBansMigration.includes("v_target_role = 'owner'") && groupBansMigration.includes("p_user_id = auth.uid()") && groupBansMigration.includes("'group_member_banned'") && groupBansMigration.includes("'group_member_unbanned'") && groupBansMigration.includes("set search_path = ''"));
check("the group manager surface can ban and unban members and lists banned members", raye2Client.includes('supabase.rpc("raye2_ban_group_member"') && raye2Client.includes('supabase.rpc("raye2_unban_group_member"') && raye2Client.includes('supabase.rpc("raye2_get_group_bans"') && raye2Client.includes("bannedMembers.map") && raye2Client.includes("{t.banMember}"));

const announcementsMigration = await read("../supabase/migrations/20261110420000_raye2_community_announcements.sql");
const announcementComposer = await read("../src/app/creator/community/announcement-composer.tsx");
const creatorCommunityPage = await read("../src/app/creator/community/page.tsx");
check("official announcements can only be published by active creators through a guarded RPC", announcementsMigration.includes("create or replace function public.raye2_create_community_announcement(") && announcementsMigration.includes("not public.is_active_creator()") && announcementsMigration.includes("values (auth.uid(), 'official', btrim(p_body), 'published', coalesce(p_pin, false), p_linked_video_id)") && announcementsMigration.includes("grant execute on function public.raye2_create_community_announcement(text,uuid,boolean) to authenticated") && !announcementsMigration.includes("raye2_create_community_announcement(text,uuid,boolean) to anon"));
check("announcements notify the author's followers and are localized in the inbox", announcementsMigration.includes("create trigger community_announcement_notification") && announcementsMigration.includes("when (new.post_type = 'official' and new.status = 'published')") && announcementsMigration.includes("'community_announcement'") && notificationsClient.includes("posted an announcement"));
check("the creator community workspace mounts the announcement composer", creatorCommunityPage.includes("import AnnouncementComposer from \"./announcement-composer\"") && creatorCommunityPage.includes("<AnnouncementComposer/>") && announcementComposer.includes('supabase.rpc("raye2_create_community_announcement"') && announcementComposer.includes("p_pin:pin"));
check("watch progress is a member-private table with RLS and guarded authenticated RPCs", continueWatchingMigration.includes("create table if not exists public.watch_progress") && continueWatchingMigration.includes("alter table public.watch_progress enable row level security") && continueWatchingMigration.includes("user_id = (select auth.uid())") && continueWatchingMigration.includes("grant execute on function public.raye2_record_watch_progress(uuid,integer,integer) to authenticated") && continueWatchingMigration.includes("grant execute on function public.raye2_get_continue_watching(integer) to authenticated"));
check("continue-watching returns only the caller's unfinished published videos with pinned search_path", continueWatchingMigration.includes("create or replace function public.raye2_get_continue_watching(") && continueWatchingMigration.includes("wp.user_id = auth.uid()") && continueWatchingMigration.includes("wp.position_seconds < least(wp.duration_seconds - 30, floor(wp.duration_seconds * 0.95))") && continueWatchingMigration.includes("set search_path = ''"));
check("the player reports progress and the watch library mounts a resumable continue-watching rail", publicVideoPlayer.includes("onProgress?: (position: number, duration: number) => void") && publicVideoPlayer.includes("onTimeUpdate={reportProgress}") && watchLibraryPage.includes("import ContinueWatching from \"./continue-watching\"") && watchLibraryPage.includes("<ContinueWatching/>") && continueWatchingClient.includes('rpc("raye2_get_continue_watching"') && continueWatchingClient.includes('dir={isArabic?"rtl":"ltr"}'));

const searchMigration = await read("../supabase/migrations/20261110230000_raye2_unified_search.sql");
const searchSurface = await read("../src/app/search/page.tsx");
check("discovery exposes one pinned public unified-search RPC across videos, people, posts and tags", searchMigration.includes("create or replace function public.raye2_search(") && searchMigration.includes("'video'::text as kind") && searchMigration.includes("'person'::text as kind") && searchMigration.includes("'post'::text as kind") && searchMigration.includes("'tag'::text as kind") && searchMigration.includes("grant execute on function public.raye2_search(text,integer) to anon, authenticated") && searchMigration.includes("set search_path = ''"));
check("unified search only surfaces published content and public members", searchMigration.includes("mi.is_published = true") && searchMigration.includes("mp.visibility = 'public'") && searchMigration.includes("cp.status = 'published'") && searchMigration.includes("length(btrim(tag)) between 1 and 40"));
check("the discover page searches through the unified RPC and links tag results to topic pages", searchSurface.includes('rpc("raye2_search",{p_query:term,p_limit:40,p_kind:kindParam||null,p_category:selectedCat||null,p_recency:selectedRecency||null})') && searchSurface.includes('href={href("tags")}') && searchSurface.includes('href={"/topics/"+encodeURIComponent(tag.tag)}'));

const searchGroupsMigration = await read("../supabase/migrations/20261110300000_raye2_search_groups.sql");
check("search depth adds public groups and block-aware filtering in place", searchGroupsMigration.includes("create or replace function public.raye2_search(") && searchGroupsMigration.includes("'group'::text as kind") && searchGroupsMigration.includes("g.visibility = 'public'") && searchGroupsMigration.includes("not exists (select 1 from blocked bl where bl.uid = mp.user_id)") && searchGroupsMigration.includes("not exists (select 1 from blocked bl where bl.uid = cp.author_id)") && searchGroupsMigration.includes("grant execute on function public.raye2_search(text,integer) to anon, authenticated") && searchGroupsMigration.includes("set search_path = ''"));
check("the discover page renders a spaces section linking to group pages", searchSurface.includes('groups=rows.filter(row=>row.kind==="group")') && searchSurface.includes('showGroups=selectedType==="all"||selectedType==="groups"') && searchSurface.includes('href={href("groups")}') && searchSurface.includes('href={"/groups/"+group.slug}'));

const creatorDirectoryMigration = await read("../supabase/migrations/20261110240000_raye2_creator_directory.sql");
const creatorsSurface = await read("../src/app/creators/page.tsx");
const homeSurface = await read("../src/app/raye2/home/page.tsx");
check("discovery exposes a pinned public creator-directory RPC counting only published public creators", creatorDirectoryMigration.includes("create or replace function public.raye2_list_creators(") && creatorDirectoryMigration.includes("mi.is_published = true") && creatorDirectoryMigration.includes("mp.visibility = 'public'") && creatorDirectoryMigration.includes("grant execute on function public.raye2_list_creators(integer,text) to anon, authenticated") && creatorDirectoryMigration.includes("set search_path = ''"));
check("the creator directory supports published, followers and views sorting with a bounded limit", creatorDirectoryMigration.includes("least(greatest(coalesce(p_limit, 24), 1), 60)") && creatorDirectoryMigration.includes("when p_sort = 'followers' then 'followers'") && creatorDirectoryMigration.includes("when p_sort = 'views' then 'views'"));
check("the creators page localizes, sorts and links each creator to their profile", creatorsSurface.includes('rpc("raye2_list_creators",{p_limit:48,p_sort:selected})') && creatorsSurface.includes('dir={isArabic?"rtl":"ltr"}') && creatorsSurface.includes('href={"/u/"+creator.handle}') && homeSurface.includes('href="/creators"') && searchSurface.includes('href="/creators"'));

const seriesMigration = await read("../supabase/migrations/20261110250000_raye2_series_discovery.sql");
const seriesIndex = await read("../src/app/series/page.tsx");
const seriesDetail = await read("../src/app/series/[slug]/page.tsx");
check("series discovery exposes pinned public read RPCs for the index and the detail", seriesMigration.includes("create or replace function public.raye2_list_series(") && seriesMigration.includes("create or replace function public.raye2_get_series(") && seriesMigration.includes("grant execute on function public.raye2_list_series(integer) to anon, authenticated") && seriesMigration.includes("grant execute on function public.raye2_get_series(text,integer) to anon, authenticated") && seriesMigration.includes("set search_path = ''"));
check("series only exposes published playlists and published videos, including external embeds", seriesMigration.includes("pl.is_published = true") && seriesMigration.includes("mi.media_type in ('video', 'youtube')") && seriesMigration.includes("coalesce(a.video_count, 0) > 0"));
check("both series surfaces are bilingual and RTL-aware", seriesIndex.includes('rpc("raye2_list_series",{p_limit:60})') && seriesIndex.includes('dir={isArabic?"rtl":"ltr"}') && seriesDetail.includes('rpc("raye2_get_series",{p_slug:slug,p_limit:200})') && seriesDetail.includes('dir={isArabic?"rtl":"ltr"}'));

const communityFeedMigration = await read("../supabase/migrations/20261110260000_raye2_community_feed.sql");
check("community feed exposes pinned public read RPCs with counts and comment attribution", communityFeedMigration.includes("create or replace function public.raye2_get_community_feed(") && communityFeedMigration.includes("create or replace function public.raye2_get_post_comments(") && communityFeedMigration.includes("grant execute on function public.raye2_get_community_feed(integer,text,boolean) to anon, authenticated") && communityFeedMigration.includes("grant execute on function public.raye2_get_post_comments(uuid,integer) to anon, authenticated") && communityFeedMigration.includes("set search_path = ''"));
check("community feed only exposes published posts and comments and supports hot sorting", communityFeedMigration.includes("p.status = 'published'") && communityFeedMigration.includes("cc.status = 'published'") && communityFeedMigration.includes("when p_sort = 'hot' then 'hot' else 'latest' end") && communityFeedMigration.includes("not exists (select 1 from blocked b where b.uid = p.author_id)"));
check("community surfaces use the feed RPC and surface comment counts and authors", communityPage.includes('rpc("raye2_get_community_feed", { p_limit: 40, p_sort: selectedSort, p_following_only: followingOnly })') && communityClient.includes('rpc("raye2_get_post_comments", { p_post_id: postId, p_limit: 50 })') && communityClient.includes("commentCounts[post.id]") && communityClient.includes("comment.author_handle"));

const notificationMigration = await read("../supabase/migrations/20261110270000_raye2_notification_inbox.sql");
const notificationPage = await read("../src/app/notifications/page.tsx");
const notificationClient = await read("../src/app/notifications/notifications-client.tsx");
check("notification inbox exposes pinned authenticated read RPCs (no anon grant)", notificationMigration.includes("create or replace function public.raye2_get_notifications(") && notificationMigration.includes("create or replace function public.raye2_get_notification_summary()") && notificationMigration.includes("grant execute on function public.raye2_get_notifications(integer,timestamptz,boolean) to authenticated") && notificationMigration.includes("grant execute on function public.raye2_get_notification_summary() to authenticated") && !notificationMigration.includes("to anon") && notificationMigration.includes("set search_path = ''"));
check("notification inbox is caller-scoped, cursor-paged and block-aware", notificationMigration.includes("n.recipient_id = me.uid") && notificationMigration.includes("p_before is null or n.created_at < p_before") && notificationMigration.includes("not exists (select 1 from blocked bl where bl.uid = n.actor_id)") && notificationMigration.includes("count(*) filter (where read_at is null)"));
check("notification surfaces use the inbox RPC with filters and cursor paging", notificationPage.includes('rpc("raye2_get_notifications",{p_limit:40,p_before:null,p_only_unread:false,p_filter:"all"})') && notificationClient.includes('rpc("raye2_get_notification_summary")') && notificationClient.includes('rpc("raye2_get_notifications",{p_limit:40,p_before:oldest,p_only_unread:false,p_filter:filter})') && notificationClient.includes("raye2-notification-filters"));
const mentionMigration = await read("../supabase/migrations/20261110740000_raye2_mention_notifications.sql");
check("@mention notifications are produced on every community and video surface", mentionMigration.includes("'mention'") && ["raye2_notify_mentions_post","raye2_notify_mentions_comment","raye2_notify_mentions_short_comment","raye2_notify_mentions_video_comment","raye2_mention_recipients"].every(name => mentionMigration.includes("function public." + name + "(")) && mentionMigration.includes("create trigger raye2_video_comment_mention_notification"));
check("mentions are deduplicated, block-aware and surfaced in the inbox", mentionMigration.includes("n.notification_type = 'mention'") && mentionMigration.includes("b.blocker_id = new.author_id") && mentionMigration.includes("count(*) filter (where notification_type = 'mention') as mention_count") && notificationClient.includes('n.type==="mention"'));
const liveInviteMigration = await read("../supabase/migrations/20261110750000_raye2_live_invite_notifications.sql");
check("live starts and group join requests produce notifications", ["raye2_notify_live_start","raye2_notify_group_join_request","raye2_notify_group_join_decision"].every(name => liveInviteMigration.includes("function public." + name + "(")) && liveInviteMigration.includes("'live_start'") && liveInviteMigration.includes("'group_join_request'") && liveInviteMigration.includes("'group_join_decision'") && liveInviteMigration.includes("check (target_type in ('profile','post','video','event','group','stream'))"));
check("live-start broadcast is public-only, capped and best-effort", liveInviteMigration.includes("v_visibility <> 'public'") && liveInviteMigration.includes("limit v_cap") && liveInviteMigration.includes("exception when others then"));
const engPrefsMigration = await read("../supabase/migrations/20261110760000_raye2_engagement_notification_preferences.sql");
check("engagement notifications have per-category mute and quiet hours", ["raye2_notification_category","raye2_in_quiet_hours","raye2_set_engagement_notification_preferences","raye2_get_my_engagement_notification_preferences","raye2_engagement_should_deliver"].every(name => engPrefsMigration.includes("function public." + name + "(")) && engPrefsMigration.includes("muted_categories <@ array['follow','reactions','comments','mentions','announcements','events','live','groups']"));
check("the inbox and summary exclude muted categories", engPrefsMigration.includes("not (public.raye2_notification_category(n.notification_type) = any(m.cats))") && (engPrefsMigration.match(/not \(public\.raye2_notification_category\(n\.notification_type\) = any\(m\.cats\)\)/g) ?? []).length >= 2);
const restrictionFixMigration = await read("../supabase/migrations/20261110770000_raye2_message_restriction_trigger_fix.sql");
check("the restriction trigger resolves the per-table actor column", restrictionFixMigration.includes("new.sender_id") && restrictionFixMigration.includes("new.author_id") && restrictionFixMigration.includes("when 'raye2_messages' then 'message'") && restrictionFixMigration.includes("create trigger raye2_short_comments_restriction_guard"));
const minisMigration = await read("../supabase/migrations/20261110780000_raye2_minis.sql");
const minisClient = await read("../src/app/minis/minis-client.tsx");
check("Mini's are published with role-aware quotas, a duration cap and a lifetime", minisMigration.includes("create table if not exists public.raye2_minis") && minisMigration.includes("function public.raye2_publish_mini(") && minisMigration.includes("minis.ordinary.daily_limit") && minisMigration.includes("minis.max_duration_seconds") && minisMigration.includes("minis.lifetime_days") && minisMigration.includes("function public.raye2_expire_minis("));
check("creator usage counts streams and Mini's from real tables", minisMigration.includes("from public.raye2_live_streams s") && minisMigration.includes("from public.raye2_minis mn") && minisMigration.includes("when 'streams_per_month' then") && minisMigration.includes("when 'minis_per_month' then"));
check("the Mini feed is public, block-aware and hides expired clips", minisMigration.includes("function public.raye2_list_minis(") && minisMigration.includes("mn.status='published' and mn.visibility='public' and mn.expires_at > now()") && minisMigration.includes("not public.is_member_blocked(mn.author_id)") && minisClient.includes("raye2_publish_mini") && minisClient.includes("raye2_list_minis"));
const momentsMigration = await read("../supabase/migrations/20261110790000_raye2_moments.sql");
const momentsPage = await read("../src/app/moments/page.tsx");
check("Moments require a creator role, a linked video and a bounded clip window", momentsMigration.includes("function public.raye2_publish_moment(") && momentsMigration.includes("raye2_assert_creator_action('publish_moment')") && momentsMigration.includes("moments.max_clip_seconds") && momentsMigration.includes("moments.lifetime_days") && momentsMigration.includes("add column if not exists is_moment boolean not null default false"));
check("Moments count toward creator usage and expire from the feed", momentsMigration.includes("when 'moments_per_month' then") && momentsMigration.includes("function public.raye2_expire_moments(") && momentsMigration.includes("function public.raye2_list_moments(") && momentsPage.includes("raye2_list_moments"));
const maintenanceMigration = await read("../supabase/migrations/20261110800000_raye2_maintenance_runner.sql");
check("a maintenance runner expires Mini's and Moments best-effort", maintenanceMigration.includes("function public.raye2_run_maintenance(") && maintenanceMigration.includes("public.raye2_expire_minis()") && maintenanceMigration.includes("public.raye2_expire_moments()") && maintenanceMigration.includes("exception when others then") && maintenanceMigration.includes("grant execute on function public.raye2_run_maintenance() to anon, authenticated") && (await read("../src/app/community/page.tsx")).includes("raye2_run_maintenance"));
const adDirectorMigration = await read("../supabase/migrations/20261110810000_raye2_ad_director.sql");
const adDirectorUi = await read("../src/app/creator/ad-director.tsx");
const adWatchClient = await read("../src/app/watch/[slug]/watch-detail-client.tsx");
check("the Smart Advertising Director proposes breakpoints, enforces caps and never overrides a creator contract", adDirectorMigration.includes("function public.raye2_pick_ad_sponsor(") && adDirectorMigration.includes("function public.raye2_ad_director_plan(") && adDirectorMigration.includes("function public.raye2_public_ad_schedule(") && adDirectorMigration.includes("function public.raye2_propose_breakpoints(") && adDirectorMigration.includes("ads.max_placements_per_video") && adDirectorMigration.includes("ads.min_break_gap_seconds") && adDirectorMigration.includes("ads.context_replay_seconds") && adDirectorMigration.includes("order by q.prio"));
check("ad delivery has frequency caps, duplicate protection and per-source authorization", adDirectorMigration.includes("function public.raye2_record_ad_delivery(") && adDirectorMigration.includes("ads.max_per_viewer_per_day") && adDirectorMigration.includes("per-viewer frequency cap reached") && adDirectorMigration.includes("not your sponsor campaign") && adDirectorMigration.includes("platform admin required") && adDirectorMigration.includes("on conflict (provider_key, provider_event_id) do nothing"));
check("creator campaigns can be activated by the trusted delivery gate", adDirectorMigration.includes("if auth.uid() is null then") && adDirectorMigration.includes("Trusted server/service-role delivery gate"));
check("the creator panel and the viewer schedule are wired up", adDirectorUi.includes("raye2_propose_breakpoints") && adDirectorUi.includes("raye2_ad_director_plan") && adDirectorUi.includes("raye2_set_media_breakpoint_excluded") && adWatchClient.includes("raye2_public_ad_schedule") && adWatchClient.includes("raye2-detail-sponsored"));
const integrityMigration = await read("../supabase/migrations/20261110820000_raye2_ad_campaign_integrity.sql");
const integrityPanel = await read("../src/app/creator/raye2/campaign-integrity.tsx");
const monetizationPanel = await read("../src/app/creator/monetization-report.tsx");
check("sponsor campaigns carry budgets and impression caps enforced at delivery", integrityMigration.includes("budget_amount") && integrityMigration.includes("daily_impression_cap") && integrityMigration.includes("lifetime_impression_cap") && integrityMigration.includes("daily impression cap reached") && integrityMigration.includes("lifetime impression cap reached"));
check("invalid-traffic checks and reconciliation/dispute states exist", integrityMigration.includes("raye2_flag_invalid_traffic") && integrityMigration.includes("raye2_detect_invalid_traffic") && integrityMigration.includes("create table if not exists public.raye2_sponsor_reconciliation") && integrityMigration.includes("state in ('open','in_review','disputed','resolved','closed')") && integrityMigration.includes("raye2_set_reconciliation_state"));
check("creator earnings reporting is non-fabricated and identity-free", integrityMigration.includes("raye2_creator_monetization_report") && integrityMigration.includes("payout_status','not_configured'") && integrityMigration.includes("viewer_identity_data_exposed',false"));
check("the integrity and earnings panels are wired up", integrityPanel.includes("raye2_campaign_integrity_overview") && integrityPanel.includes("raye2_detect_invalid_traffic") && monetizationPanel.includes("raye2_creator_monetization_report"));
const liveAdMigration = await read("../supabase/migrations/20261110830000_raye2_live_ad_placement.sql");
const adLiveStudio = await read("../src/app/creator/creator-live-studio.tsx");
check("live sponsor placement fails safe and uses streamer-declared breaks", liveAdMigration.includes("function public.raye2_live_ad_readiness(") && liveAdMigration.includes("function public.raye2_live_ad_schedule(") && liveAdMigration.includes("create table if not exists public.raye2_live_break_marks") && liveAdMigration.includes("if v_status <> 'live' or not v_insert or v_health in ('offline','reconnecting') then return; end if;"));
check("live provider capability is admin-only and drives the context replay bridge", liveAdMigration.includes("function public.raye2_set_live_provider_capability(") && liveAdMigration.includes("provider does not support compliant live insertion") && liveAdMigration.includes("case when v_dvr then least(15, greatest(0, public.raye2_rule_int('ads.context_replay_seconds', 5))) else 0 end"));
check("the live studio surfaces readiness and break marking", adLiveStudio.includes("raye2_live_ad_readiness") && adLiveStudio.includes("raye2_mark_live_break"));
const clipsMigration = await read("../supabase/migrations/20261110840000_raye2_community_clips.sql");
const clipsPage = await read("../src/app/clips/page.tsx");
const clipsClient = await read("../src/app/clips/clips-client.tsx");
const watchDetail = await read("../src/app/watch/[slug]/watch-detail-client.tsx");
check("community clips enforce source permission, length and attribution", clipsMigration.includes("create table if not exists public.raye2_community_clips") && clipsMigration.includes("allow_clipping") && clipsMigration.includes("clipping is disabled for this source") && clipsMigration.includes("clip duration must be between 1 and % seconds") && clipsMigration.includes("attribution_text"));
check("community clips support removal, expiry, reporting and maintenance", clipsMigration.includes("function public.raye2_remove_community_clip(") && clipsMigration.includes("function public.raye2_expire_community_clips(") && clipsMigration.includes("'community_clip'") && clipsMigration.includes("clips_expired"));
check("the community clips flow is wired into the UI", clipsPage.includes("raye2_run_maintenance") && clipsClient.includes("raye2_publish_community_clip") && clipsClient.includes("raye2_list_community_clips") && watchDetail.includes("raye2_set_source_clipping"));
const achMigration = await read("../supabase/migrations/20261110850000_raye2_achievements_depth.sql");
const achProfile = await read("../src/app/u/[handle]/profile-client.tsx");
check("achievements publish explicit criteria and only award when measured", achMigration.includes("add column if not exists metric text") && achMigration.includes("add column if not exists threshold integer") && achMigration.includes("if v_value < v_threshold then return; end if;") && achMigration.includes("raye2_achievement_metric"));
check("achievements enforce anti-abuse and expose transparent progress", achMigration.includes("function public.raye2_member_in_good_standing(") && achMigration.includes("not public.raye2_member_in_good_standing(p_user_id) then") && achMigration.includes("function public.raye2_member_achievement_progress("));
check("the profile surfaces transparent achievement progress", achProfile.includes("raye2_member_achievement_progress") && achProfile.includes("role=\"progressbar\""));
const evMigration = await read("../supabase/migrations/20261110860000_raye2_event_spaces_qa.sql");
const evClient = await read("../src/app/events/public-events.tsx");
const evPage = await read("../src/app/events/page.tsx");
check("events support Q&A with host-only answers and author removal", evMigration.includes("create table if not exists public.event_qa") && evMigration.includes("function public.raye2_answer_event_question(") && evMigration.includes("host or creator access required") && evMigration.includes("function public.raye2_remove_event_question("));
check("events attach a community space through the existing group conversation", evMigration.includes("add column if not exists conversation_id uuid references public.raye2_conversations") && evMigration.includes("function public.raye2_attach_event_space(") && evMigration.includes("you must belong to the room you attach"));
check("the events UI surfaces Q&A and the attached space", evClient.includes("raye2_ask_event_question") && evClient.includes("raye2_list_event_questions") && evClient.includes("openSpace") && evPage.includes("space_group_slug"));
const modMigration = await read("../supabase/migrations/20261110870000_raye2_admin_moderation_queue.sql");
const adminClient = await read("../src/app/creator/raye2/admin-client.tsx");
check("the admin console unifies the moderation queue with audited resolution", modMigration.includes("function public.raye2_get_moderation_queue(") && modMigration.includes("function public.raye2_admin_resolve_report(") && modMigration.includes("raye2_resolve_content_report") && modMigration.includes("raye2_resolve_safety_report"));
check("the moderation queue is scoped to moderators and platform admins", modMigration.includes("moderator or platform admin access required") && modMigration.includes("private.can_moderate_community()"));
check("the admin console renders the moderation queue", adminClient.includes("raye2_get_moderation_queue") && adminClient.includes("raye2_admin_resolve_report") && adminClient.includes("moderation"));
const memMigration = await read("../supabase/migrations/20261110880000_raye2_shared_memory_expiry.sql");
const raye2MemoryClient = await read("../src/app/raye2/raye2-client.tsx");
const singleThemeGlobals = await read("../src/app/globals.css");
const singleThemeDesign = await read("../src/app/raye2-design-system.css");
check("the product uses a single black/white/grey/blue theme with no legacy light/violet variants", !/theme-(paper|violet|custom)/.test(singleThemeGlobals + singleThemeDesign) && singleThemeGlobals.includes("--success:") && singleThemeGlobals.includes("--error:") && singleThemeGlobals.includes("--state-selected:"));
check("legacy lime/neon colors are gone from the theme", !/216,255,117|255,100,124|165,139,255/.test(singleThemeGlobals + singleThemeDesign));
const siteConfigLib = await read("../src/lib/site-config.mjs");
const publicConfigSrc = await read("../src/lib/public-site-config.ts");
const creatorSettingsSrc = await read("../src/app/creator/creator-settings.tsx");
const rootLayoutSrc = await read("../src/app/layout.tsx");
check("the appearance system offers a single fixed theme with no color-mode or legacy options", /THEMES = new Set\(\["obsidian"\]\)/.test(siteConfigLib) && !/colorMode/.test(publicConfigSrc + creatorSettingsSrc) && !/d8ff75|c8ff4d/.test(publicConfigSrc + creatorSettingsSrc) && !/Nhen bilingual/.test(creatorSettingsSrc));
const predecessorSurfaces = [
  "../src/app/page.tsx", "../src/app/saved/page.tsx", "../src/app/notifications/page.tsx",
  "../src/app/notifications/notifications-client.tsx", "../src/app/shorts/page.tsx",
  "../src/app/shorts/community-shorts-client.tsx", "../src/app/videos/public-videos.tsx",
  "../src/app/watch/page.tsx", "../src/app/creator/team/team-client.tsx",
  "../src/app/creator/accept-invite/page.tsx", "../src/app/creator/accept-invite/accept-invite-client.tsx"
];
let predecessorFree = true;
for (const surface of predecessorSurfaces) {
  const source = await read(surface);
  if (/\bNHEN\b|Nhen\?|Nhenbit|نهين/.test(source)) predecessorFree = false;
}
const rootLayout = await read("../src/app/layout.tsx");
const loadingSource = await read("../src/app/loading.tsx");
const iconPng = existsSync(new URL("../src/app/icon.png", import.meta.url));
const applePng = existsSync(new URL("../src/app/apple-icon.png", import.meta.url));
const faviconIco = existsSync(new URL("../src/app/favicon.ico", import.meta.url));
check("the brand mark integrates into favicon and app icons", iconPng && applePng && faviconIco && rootLayout.includes("/icon.png") && rootLayout.includes("/apple-icon.png") && rootLayout.includes("/favicon.ico"));
check("a branded loading state stands in for streaming routes", loadingSource.includes("raye2-app-loading") && loadingSource.includes("aria-busy") && (await read("../src/app/raye2-design-system.css")).includes("raye2-app-loading-mark"));
const designSystem = await read("../src/app/raye2-design-system.css");
const notificationsCss = await read("../src/app/notifications/raye2-notifications.css");
const seriesCss = await read("../src/app/series/raye2-series.css");
check("page shells share one content-width token instead of per-route widths", designSystem.includes("--raye2-ds-content:1320px") && designSystem.includes("--raye2-ds-reading:900px") && !/min\(100%,(850px|900px|1050px|1100px|1360px)\)/.test(designSystem) && notificationsCss.includes("min(1320px,100%)") && seriesCss.includes("min(1320px,100%)") && !/min\((1100px|1360px)/.test(notificationsCss + seriesCss));
const studioPage = await read("../src/app/raye2/studio/page.tsx");
const roleMigration = await read("../supabase/migrations/20261110590000_raye2_creator_role_permissions.sql");
const assignableRoles = ["owner", "admin", "creator", "streamer", "editor", "moderator", "analyst"];
check("the studio admits every assignable creator role (streamer included)", assignableRoles.every(role => studioPage.includes(`"${role}"`) && roleMigration.includes(`'${role}'`)));
check("streamer-only gets live affordances distinct from creator-only uploads", /const canStream = \["owner", "admin", "streamer"\]\.includes\(role\)/.test(studioPage) && /\{canStream && <Link href="\/creator#creator-live-studio"/.test(studioPage));
const voiceControlsSrc = await read("../src/app/raye2/raye2-voice-controls.tsx");
check("voice recording requires consent with a visible indicator and elapsed time", voiceControlsSrc.includes("raye2_request_voice_recording_consent") && voiceControlsSrc.includes("raye2_respond_voice_recording_consent") && voiceControlsSrc.includes("styles.voiceRecording") && voiceControlsSrc.includes("recordingClock"));
const groupVoiceControlsSrc = await read("../src/app/raye2/raye2-group-voice-controls.tsx");
check("group voice rooms surface the same recording consent and indicator", groupVoiceControlsSrc.includes("raye2_request_voice_recording_consent") && groupVoiceControlsSrc.includes("raye2_respond_voice_recording_consent") && groupVoiceControlsSrc.includes("styles.voiceRecording") && groupVoiceControlsSrc.includes("recordingClock") && groupVoiceControlsSrc.includes("isVoiceHost"));
const clipsFeedClient = await read("../src/app/clips/clips-client.tsx");
const clipsReportingMigration = await read("../supabase/migrations/20261110890000_raye2_community_clip_reporting.sql");
check("community clips support preview, visibility, owner removal and reporting", clipsFeedClient.includes("raye2-clip-preview") && clipsFeedClient.includes("p_visibility: visibility") && clipsFeedClient.includes("raye2_remove_community_clip") && clipsFeedClient.includes('p_target_type: "community_clip"') && clipsReportingMigration.includes("'post','comment','profile','community_clip'"));
const clipPermalinkMigration = await read("../supabase/migrations/20261116190000_raye2_clip_permalink_and_share.sql");
const clipDetailPage = await read("../src/app/clips/[id]/page.tsx");
const clipDetailClient = await read("../src/app/clips/[id]/clip-detail-client.tsx");
check("community clips have a permission-checked permalink and share-to-chat",
  clipPermalinkMigration.includes("function public.raye2_get_community_clip(p_clip_id uuid)") &&
  clipPermalinkMigration.includes("function public.raye2_share_clip_to_chat(p_conversation_id uuid, p_clip_id uuid)") &&
  clipPermalinkMigration.includes("if not public.raye2_is_conversation_member(p_conversation_id) then") &&
  clipPermalinkMigration.includes("'kind','clip_share'") &&
  clipPermalinkMigration.includes("allow_clipping") &&
  clipPermalinkMigration.includes("or c.source_owner_id = (select auth.uid())") &&
  clipPermalinkMigration.includes("or private.can_moderate_community()"));
check("the clip permalink page renders pooled media and refuses a non-live clip",
  clipDetailPage.includes("raye2_get_community_clip") &&
  clipDetailPage.includes("resolvePublicObjectUrls") &&
  clipDetailPage.includes("clip.status !== \"published\"") &&
  clipDetailClient.includes("raye2_share_clip_to_chat") &&
  clipDetailClient.includes("raye2_list_shareable_conversations") &&
  clipDetailClient.includes("raye2_remove_community_clip"));
check("the clips feed links to the permalink and chat renders shared clip/video links",
  clipsFeedClient.includes("href={`/clips/${item.id}`}") &&
  clipsFeedClient.includes("copyClipLink") &&
  (await read("../src/app/raye2/raye2-client.tsx")).includes('message.attachment?.kind === "clip_share"') &&
  (await read("../src/app/raye2/raye2-client.tsx")).includes('message.attachment?.kind === "video_share"'));
const communityPostClipsMigration = await read("../supabase/migrations/20261116200000_raye2_community_posts_clips.sql");
check("community posts can embed a live, source-permitted community clip",
  communityPostClipsMigration.includes("add column if not exists linked_clip_id uuid references public.raye2_community_clips(id)") &&
  communityPostClipsMigration.includes("community_posts_clip_link_check") &&
  communityPostClipsMigration.includes("c.id=linked_clip_id and c.status='published' and c.expires_at > now()") &&
  communityPostClipsMigration.includes("left join public.raye2_community_clips cc on cc.id = s.linked_clip_id") &&
  communityClient.includes('from("raye2_community_clips").select("id,title").eq("clipper_id", member.id)') &&
  communityClient.includes('post.linkedClipId && <Link className="raye2-action" href={"/clips/"+post.linkedClipId}') &&
  communityPage.includes("linkedClipId: row.linked_clip_id"));
const chatEphemeralMigration = await read("../supabase/migrations/20261116210000_raye2_chat_ephemeral_slowmode.sql");
const chatEphemeralClient = await read("../src/app/raye2/raye2-client.tsx");
const chatEphemeralCss = await read("../src/app/raye2/raye2.module.css");
check("disappearing messages are bounded by the retention floor and server-stamped",
  chatEphemeralMigration.includes("add column if not exists disappearing_seconds integer") &&
  chatEphemeralMigration.includes("disappearing_seconds is null or disappearing_seconds in (86400, 604800, 2592000)") &&
  chatEphemeralMigration.includes("create or replace function public.raye2_apply_message_expiry()") &&
  chatEphemeralMigration.includes("create trigger raye2_messages_apply_expiry before insert on public.raye2_messages") &&
  chatEphemeralMigration.includes("new.expires_at := now() + (v_seconds || ' seconds')::interval") &&
  chatEphemeralMigration.includes("create or replace function public.raye2_sweep_expired_messages()") &&
  chatEphemeralMigration.includes("sm.source_message_id=m.id and sm.retention_mode='preserved'") &&
  chatEphemeralMigration.includes("'disappearing_messages_expired', v_expired"));
check("group slow mode is manager-only, capped and enforced at insert",
  chatEphemeralMigration.includes("add column if not exists slow_mode_seconds integer not null default 0") &&
  chatEphemeralMigration.includes("slow_mode_seconds between 0 and 3600") &&
  chatEphemeralMigration.includes("create or replace function public.raye2_set_group_slow_mode(") &&
  chatEphemeralMigration.includes("create or replace function public.raye2_guard_message_slow_mode()") &&
  chatEphemeralMigration.includes("create trigger raye2_messages_slow_mode before insert on public.raye2_messages") &&
  chatEphemeralMigration.includes("raise exception 'slow mode is active; wait % seconds'"));
check("the chat UI exposes the disappearing control, badge and slow mode",
  chatEphemeralClient.includes('rpc("raye2_set_conversation_disappearing", { p_conversation_id: selected.conversationId, p_seconds: seconds })') &&
  chatEphemeralClient.includes('rpc("raye2_set_group_slow_mode", { p_group_id: selectedGroup.id, p_seconds: seconds })') &&
  chatEphemeralClient.includes("className={styles.disappearingControl}") &&
  chatEphemeralClient.includes("className={styles.ephemeralBadge}") &&
  chatEphemeralClient.includes("disappearingSeconds: conversation.disappearing_seconds ?? null") &&
  chatEphemeralCss.includes(".page .disappearingControl") &&
  chatEphemeralCss.includes(".page .ephemeralBadge"));
const chatPollsMigration = await read("../supabase/migrations/20261116220000_raye2_chat_polls.sql");
const chatPollComponent = await read("../src/app/raye2/raye2-message-poll.tsx");
check("chat polls are member-scoped, validated and rate-limited",
  chatPollsMigration.includes("create table if not exists public.raye2_message_polls (") &&
  chatPollsMigration.includes("message_id uuid primary key references public.raye2_messages(id) on delete cascade") &&
  chatPollsMigration.includes("create policy \"Raye2 members read conversation polls\"") &&
  chatPollsMigration.includes("revoke all on public.raye2_message_polls, public.raye2_message_poll_options, public.raye2_message_poll_votes from anon, authenticated") &&
  chatPollsMigration.includes("a poll needs between 2 and 10 options") &&
  chatPollsMigration.includes("poll options must be unique") &&
  chatPollsMigration.includes("perform public.raye2_rate_limit('chat.poll','rate.chat.message.hourly',300,3600)"));
check("poll voting and closing enforce choice rules and permissions",
  chatPollsMigration.includes("if not v_poll.allow_multiple and array_length(p_option_ids,1) <> 1 then") &&
  chatPollsMigration.includes("only the poll author or a group manager may close it") &&
  chatPollsMigration.includes("create or replace function public.raye2_get_message_poll(") &&
  chatPollsMigration.includes("'my_votes', coalesce") &&
  chatEphemeralClient.includes('rpc("raye2_create_message_poll", {') &&
  chatEphemeralClient.includes('message.attachment?.kind === "poll" && supabase && <Raye2MessagePoll') &&
  chatPollComponent.includes('rpc("raye2_vote_message_poll", { p_message_id: messageId, p_option_ids: [...selected] })') &&
  chatPollComponent.includes('rpc("raye2_close_message_poll", { p_message_id: messageId })'));
const groupProfileMigration = await read("../supabase/migrations/20261116230000_raye2_group_profile_and_moderation_log.sql");
check("group profile editing and the moderation log are manager-gated",
  groupProfileMigration.includes("create or replace function public.raye2_update_group_profile(") &&
  groupProfileMigration.includes("if auth.uid() is null or not public.raye2_is_group_manager(p_group_id) then") &&
  groupProfileMigration.includes("group image must be an https URL") &&
  groupProfileMigration.includes("at most 12 group topics are allowed") &&
  groupProfileMigration.includes("create table if not exists public.raye2_group_moderation_log (") &&
  groupProfileMigration.includes("revoke all on public.raye2_group_moderation_log from anon, authenticated") &&
  groupProfileMigration.includes("create policy \"Raye2 group managers read the moderation log\"") &&
  groupProfileMigration.includes("create trigger raye2_group_members_moderation after insert or update or delete on public.raye2_group_members") &&
  groupProfileMigration.includes("create trigger raye2_groups_moderation after update on public.raye2_groups") &&
  chatEphemeralClient.includes('rpc("raye2_update_group_profile", {') &&
  chatEphemeralClient.includes('rpc("raye2_list_group_moderation_log", { p_group_id: selectedGroup.id, p_limit: 60 })'));
const cooldownMigration = await read("../supabase/migrations/20261110900000_raye2_creator_cooldown_status.sql");
const capabilitiesUi = await read("../src/app/creator/creator-capabilities.tsx");
check("the creator panel surfaces real quota/cooldown state", cooldownMigration.includes("can_publish_long_video_now") && cooldownMigration.includes("next_allowed_at") && capabilitiesUi.includes("caps.cooldown.can_publish_long_video_now"));
const groupLifecycleMigration = await read("../supabase/migrations/20261110910000_raye2_group_lifecycle.sql");
const spacesClient = await read("../src/app/raye2/raye2-client.tsx");
check("group lifecycle supports leave, ownership transfer and archive", groupLifecycleMigration.includes("raye2_leave_group") && groupLifecycleMigration.includes("raye2_transfer_group_ownership") && groupLifecycleMigration.includes("raye2_set_group_status") && spacesClient.includes('rpc("raye2_transfer_group_ownership"') && spacesClient.includes('rpc("raye2_set_group_status"'));
const messageRetentionMigration = await read("../supabase/migrations/20261110920000_raye2_message_retention.sql");
check("message retention sweeps enabled policies automatically", messageRetentionMigration.includes("raye2_sweep_message_retention") && messageRetentionMigration.includes("sm.retention_mode='preserved'") && messageRetentionMigration.includes("'group_messages_expired', v_group"));
const receiptsMigration = await read("../supabase/migrations/20261110930000_raye2_message_delivery_receipts.sql");
check("messages carry delivery and read receipt state", receiptsMigration.includes("raye2_message_deliveries") && receiptsMigration.includes("raye2_mark_messages_delivered") && receiptsMigration.includes("raye2_message_receipt_status"));
const migrationsBase = new URL("../supabase/migrations/", import.meta.url);
const migrationDir = await readdir(migrationsBase);
const allMigrations = (await Promise.all(migrationDir.filter(n => n.endsWith(".sql")).map(n => readFile(new URL(n, migrationsBase), "utf8")))).join("\n");
check("migrations keep security invariants: empty search_path, fail-closed grants and RLS",
  !/create\s+(?:or\s+replace\s+)?function\s+[\w.]+\s*\([^)]*\)\s*[\s\S]*?security definer(?![\s\S]*?set search_path)[\s\S]*?\$\$;/i.test(allMigrations) &&
  allMigrations.includes("raye2_message_deliveries") &&
  [...new Set([...allMigrations.matchAll(/create table if not exists public\.(raye2_\w+)/gi)].map(m => m[1]))].every(t => new RegExp("alter table public\\." + t + "\\s+enable row level security", "i").test(allMigrations)));
const watchDepthMigration = await read("../supabase/migrations/20261110940000_raye2_watch_together_depth.sql");
check("watch together depth adds presence, moderation and control requests", watchDepthMigration.includes("raye2_watch_heartbeat") && watchDepthMigration.includes("raye2_remove_watch_participant") && watchDepthMigration.includes("raye2_request_watch_control") && watchDepthMigration.includes("raye2_expire_watch_sessions"));
const watchScheduledMigration = await read("../supabase/migrations/20261116180000_raye2_watch_scheduled_and_invites.sql");
check("watch together gains scheduled sessions and private invitation links",
  watchScheduledMigration.includes("add column if not exists scheduled_for timestamptz") &&
  watchScheduledMigration.includes("raye2_watch_session_started") &&
  watchScheduledMigration.includes("raye2_create_watch_session_invite") &&
  watchScheduledMigration.includes("raye2_join_watch_session_invite") &&
  watchScheduledMigration.includes("raye2_revoke_watch_session_invite") &&
  watchScheduledMigration.includes("encode(extensions.digest(p_token,'sha256'),'hex')") &&
  watchScheduledMigration.includes("p_scheduled_for timestamptz default null") &&
  watchScheduledMigration.includes("create table if not exists public.raye2_watch_session_invites") &&
  watchScheduledMigration.includes("alter table public.raye2_watch_session_invites enable row level security"));
check("the watch scheduled/invite migration keeps the watch restriction check on join",
  watchScheduledMigration.includes("raye2_has_active_restriction(auth.uid(), 'watch')") &&
  watchScheduledMigration.includes("if not public.raye2_watch_session_started(p_session_id) then"));
check("the watch panel and invite page wire scheduling and private invitation links",
  (await read("../src/app/raye2/raye2-watch-together-controls.tsx")).includes("p_scheduled_for: scheduled") &&
  (await read("../src/app/raye2/raye2-watch-together-controls.tsx")).includes("raye2_create_watch_session_invite") &&
  (await read("../src/app/raye2/watch-invite/page.tsx")).includes("raye2_join_watch_session_invite"));
const voiceDepthMigration = await read("../supabase/migrations/20261110950000_raye2_voice_depth.sql");
check("voice depth adds raise hand, audio preferences and idle-room expiry", voiceDepthMigration.includes("raye2_set_voice_hand") && voiceDepthMigration.includes("raye2_set_voice_audio_preferences") && voiceDepthMigration.includes("raye2_voice_bulk_moderation") && voiceDepthMigration.includes("raye2_expire_idle_voice_rooms"));
const creatorAnalyticsMigration = await read("../supabase/migrations/20261110960000_raye2_creator_analytics_depth.sql");
check("creator analytics depth reports real metrics and long-video expiry", creatorAnalyticsMigration.includes("raye2_get_creator_analytics") && creatorAnalyticsMigration.includes("'watch_time_available', false") && creatorAnalyticsMigration.includes("raye2_set_video_expiry") && creatorAnalyticsMigration.includes("raye2_expire_long_videos"));
check("predecessor NHEN/Nhen?/Creator Fan Hub labels are gone from Raye2 product surfaces", predecessorFree);
check("the owner-flagged MADE BY ALMUDDATHTHIR credit is retained pending an explicit decision", /MADE BY ALMUDDATHTHIR/.test(rootLayoutSrc));
const platformNavModel = await read("../src/lib/platform-nav.ts");
const communityClientSrc = await read("../src/app/community/community-client.tsx");
const raye2ClientSrc = await read("../src/app/raye2/raye2-client.tsx");
check("all surfaces render navigation from one shared platform-nav model", /export const PLATFORM_NAV_PRIMARY/.test(platformNavModel) && /platformNavItems\(primaryKeys/.test(page) && /platformNavItems\(PLATFORM_NAV_PRIMARY/.test(communityClientSrc) && /platformNavItems\(PLATFORM_NAV_RAYE2/.test(raye2ClientSrc) && !/const platformNav = \[/.test(raye2ClientSrc));
check("temporary Shared Memories expire on their own clock and preserved ones never do", memMigration.includes("function public.raye2_expire_shared_memories()") && memMigration.includes("function public.raye2_guard_memory_expiry()") && memMigration.includes("a temporary Shared Memory requires an expiry"));
check("memory expiry and preservation are guarded and folded into maintenance", memMigration.includes("function public.raye2_set_memory_expiry(") && memMigration.includes("function public.raye2_preserve_memory(") && memMigration.includes("shared_memories_expired") && raye2MemoryClient.includes("raye2_set_memory_expiry") && raye2MemoryClient.includes("raye2_preserve_memory"));

const groupMigration = await read("../supabase/migrations/20261110280000_raye2_group_spaces.sql");
const groupsIndex = await read("../src/app/groups/page.tsx");
const groupDetail = await read("../src/app/groups/[slug]/page.tsx");
check("group spaces expose pinned public read RPCs plus an authenticated roster RPC", groupMigration.includes("create or replace function public.raye2_list_public_groups(") && groupMigration.includes("create or replace function public.raye2_get_group(") && groupMigration.includes("create or replace function public.raye2_get_group_members(") && groupMigration.includes("grant execute on function public.raye2_list_public_groups(integer,text) to anon, authenticated") && groupMigration.includes("grant execute on function public.raye2_get_group(text) to anon, authenticated") && groupMigration.includes("grant execute on function public.raye2_get_group_members(uuid,integer) to authenticated") && !groupMigration.includes("raye2_get_group_members(uuid,integer) to anon") && groupMigration.includes("set search_path = ''"));
check("group listing and detail only expose public joinable groups and gate the roster to members", groupMigration.includes("g.visibility = 'public'") && groupMigration.includes("t.visibility = 'public' and t.status in ('active', 'read_only')") && groupMigration.includes("public.raye2_is_group_member(t.id)") && groupMigration.includes("raye2_is_group_member(p_group_id) or public.raye2_is_group_manager(p_group_id)") && groupMigration.includes("coalesce(mem.member_count, 0)"));
check("group surfaces are RPC-backed, bilingual and member-aware", groupsIndex.includes('rpc("raye2_list_public_groups",{p_limit:48,p_search:search||null})') && groupsIndex.includes('dir={isArabic?"rtl":"ltr"}') && groupDetail.includes('rpc("raye2_get_group",{p_slug:slug})') && groupDetail.includes('rpc("raye2_get_group_members",{p_group_id:group.id,p_limit:100})') && groupDetail.includes("canViewRoster=isMember||isManager"));

const collectionMigration = await read("../supabase/migrations/20261110290000_raye2_collection_contents.sql");
check("collection contents RPCs are owner-scoped, pinned and authenticated-only", collectionMigration.includes("create or replace function public.raye2_get_collection(") && collectionMigration.includes("create or replace function public.raye2_update_collection(") && collectionMigration.includes("create or replace function public.raye2_delete_collection(") && collectionMigration.includes("where id = p_collection_id and owner_id = v_me") && collectionMigration.includes("grant execute on function public.raye2_get_collection(uuid,integer) to authenticated") && collectionMigration.includes("grant execute on function public.raye2_update_collection(uuid,text,text) to authenticated") && collectionMigration.includes("grant execute on function public.raye2_delete_collection(uuid) to authenticated") && !collectionMigration.includes("to anon") && collectionMigration.includes("set search_path = ''"));
check("collection contents resolve only published posts and videos", collectionMigration.includes("cp.status = 'published'") && collectionMigration.includes("vc.published_at is not null") && collectionMigration.includes("mi.is_published = true") && collectionMigration.includes("left join public.member_profiles mp on mp.user_id = cp.author_id"));
check("saved library opens, renames, deletes and empties collections via RPC", savedClient.includes('rpc("raye2_get_collection",{p_collection_id:col.id,p_limit:200})') && savedClient.includes('rpc("raye2_update_collection",{p_collection_id:open.id,p_name:renameValue.trim(),p_description:open.description})') && savedClient.includes('rpc("raye2_delete_collection",{p_collection_id:open.id})') && savedClient.includes('rpc("raye2_remove_from_collection",{p_collection_id:open.id,p_kind:item.item_kind,p_item_id:item.item_id})'));


// Raye2 single-theme palette (plan 1.1): black, white, grey and blue only, no theme switching.
const PALETTE = new Set(["#0b0b0d","#141416","#1c1c1f","#242427","#4d8df6","#2f6fe0","#9dc0ff","#a1a1aa","#d6d6db","#f4f4f6","#5cc98f","#e0b878","#e87d85","#ffffff","#000000"]);
async function collectCss(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = dir + "/" + entry.name;
    if (entry.isDirectory()) out.push(...(await collectCss(full)));
    else if (entry.name.endsWith(".css")) out.push(full);
  }
  return out;
}
const cssFiles = await collectCss(new URL("../src", import.meta.url).pathname);
const strayColors = [];
let themeSwitchRefs = 0;
for (const file of cssFiles) {
  const text = await readFile(file, "utf8");
  if (/prefers-color-scheme|\[data-theme|theme-toggle|theme-switcher/.test(text)) themeSwitchRefs += 1;
  for (const match of text.matchAll(/#[0-9a-fA-F]{6}\b/g)) {
    if (!PALETTE.has(match[0].toLowerCase())) strayColors.push(file.split("/src/")[1] + " " + match[0]);
  }
}
check("all stylesheets use the single black/grey/blue Raye2 palette with no stray colors", strayColors.length === 0);
check("Raye2 ships one theme with no light/dark switching", themeSwitchRefs === 0);

const profileIdentityMigration = await read("../supabase/migrations/20261110970000_raye2_profile_identity_depth.sql");
check("profile identity depth adds cover/links/interests and fixes connection block exclusion", profileIdentityMigration.includes("raye2_update_my_profile") && profileIdentityMigration.includes("add column if not exists cover_url") && profileIdentityMigration.includes("add column if not exists interests") && profileIdentityMigration.includes("(b.blocker_id = v_me and b.blocked_id = p.user_id)") && !profileIdentityMigration.includes("b.blocker_id = p_user_id and b.blocked_id = p_user_id") && profileIdentityMigration.includes("set search_path=''"));

const searchFiltersMigration = await read("../supabase/migrations/20261110980000_raye2_search_filters_privacy.sql");
check("search adds filters, privacy and the Spaces/Mini/Moment/Event result kinds", searchFiltersMigration.includes("p_recency text default null") && searchFiltersMigration.includes("'group'::text as kind") && searchFiltersMigration.includes("'short'::text as kind") && searchFiltersMigration.includes("'moment'::text as kind") && searchFiltersMigration.includes("'event'::text as kind") && searchFiltersMigration.includes("from public.raye2_groups g") && (searchFiltersMigration.match(/not public\.is_member_blocked\(/g) ?? []).length >= 4 && searchFiltersMigration.includes("raye2_get_search_facets"));

const captionsMigration = await read("../supabase/migrations/20261110990000_raye2_media_captions.sql");
check("native media captions are stored, owner-managed and publicly readable only for published media", captionsMigration.includes("create table if not exists public.raye2_media_captions") && captionsMigration.includes("raye2_set_media_caption") && captionsMigration.includes("raye2_get_media_captions") && captionsMigration.includes("v_path !~ ('^creator-media-public/' || v_uid::text || '/')") && captionsMigration.includes("m.processing_status = 'ready'"));

const minisReportMigration = await read("../supabase/migrations/20261111000000_raye2_minis_reporting_takedown.sql");
check("Mini's are reportable and covered by the takedown workflow and moderation queue", minisReportMigration.includes("'community_clip','mini'") && minisReportMigration.includes("'media_item','mini','community_clip'") && minisReportMigration.includes("when 'mini' then coalesce") && minisReportMigration.includes("update public.raye2_minis set status = 'removed'"));

const profileCollectionsMigration = await read("../supabase/migrations/20261111010000_raye2_profile_collections.sql");
check("profile collections add Moments and playlist surfaces", profileCollectionsMigration.includes("raye2_get_profile_collections") && profileCollectionsMigration.includes("cp.is_moment = true") && profileCollectionsMigration.includes("from public.video_playlists p") && profileCollectionsMigration.includes("'moments', coalesce") && profileCollectionsMigration.includes("'playlists', coalesce"));

const mediaExpiryCleanupMigration = await read("../supabase/migrations/20261111020000_raye2_media_expiry_cleanup.sql");
check("expired temporary media queues physical deletion as a retried, observable background job", mediaExpiryCleanupMigration.includes("create table if not exists public.raye2_media_storage_cleanup") && mediaExpiryCleanupMigration.includes("'storage.delete'") && mediaExpiryCleanupMigration.includes("raye2_enqueue_storage_cleanup") && mediaExpiryCleanupMigration.includes("raye2_record_storage_cleanup") && mediaExpiryCleanupMigration.includes("raye2_get_storage_cleanup_stats") && mediaExpiryCleanupMigration.includes("raye2_claim_background_job(p_kind text default null)"));

const profileClipsCommunitiesMigration = await read("../supabase/migrations/20261111030000_raye2_profile_clips_communities.sql");
check("profile collections surface community clips and public communities with visibility and expiry gating", profileClipsCommunitiesMigration.includes("from public.raye2_community_clips c") && profileClipsCommunitiesMigration.includes("from public.raye2_group_members gm") && profileClipsCommunitiesMigration.includes("g.visibility = 'public' and g.status = 'active'") && profileClipsCommunitiesMigration.includes("'clips', coalesce") && profileClipsCommunitiesMigration.includes("'communities', coalesce"));

const accountSessionsMigration = await read("../supabase/migrations/20261111040000_raye2_account_sessions.sql");
check("account settings expose session/device management with ownership-scoped, audited revocation", accountSessionsMigration.includes("raye2_my_sessions") && accountSessionsMigration.includes("raye2_revoke_my_session") && accountSessionsMigration.includes("raye2_revoke_other_sessions") && accountSessionsMigration.includes("delete from auth.sessions where id = p_session_id and user_id = v_uid") && accountSessionsMigration.includes("'user_session_revoked'"));

const videoSchedulingMigration = await read("../supabase/migrations/20261111050000_raye2_video_scheduling.sql");
check("scheduled watch-page publication gates on processing/visibility and promotes due pages via maintenance", videoSchedulingMigration.includes("add column if not exists publish_at timestamptz") && videoSchedulingMigration.includes("raye2_publish_due_videos") && videoSchedulingMigration.includes("a scheduled go-live time must be in the future") && videoSchedulingMigration.includes("'scheduled_videos_published', v_videos"));

const communityAuthClient = await read("../src/app/community/community-client.tsx");
check("account recovery: password reset request and set-new-password flow are wired", communityAuthClient.includes("resetPasswordForEmail") && communityAuthClient.includes("PASSWORD_RECOVERY") && communityAuthClient.includes("auth.updateUser({ password })"));

const siteMiddleware = await read("../middleware.ts");
check("session refresh covers creator routes and member-aware public pages", siteMiddleware.includes('"/creator/:path*"') && siteMiddleware.includes('"/api/creator/:path*"') && siteMiddleware.includes('"/account/:path*"') && siteMiddleware.includes('"/saved/:path*"') && siteMiddleware.includes('"/notifications/:path*"') && siteMiddleware.includes('"/community/:path*"') && siteMiddleware.includes('"/groups/:path*"') && siteMiddleware.includes('"/watch/:path*"') && siteMiddleware.includes('"/raye2/home/:path*"'));

const contentLibraryMigration = await read("../supabase/migrations/20261111060000_raye2_creator_content_library.sql");
check("creator content library derives all publication states owner-scoped", contentLibraryMigration.includes("raye2_creator_content_library") && contentLibraryMigration.includes("when public.raye2_media_is_taken_down(m.media_id) then 'taken_down'") && contentLibraryMigration.includes("when m.published_at is null and m.publish_at is not null then 'scheduled'") && contentLibraryMigration.includes("when m.expires_at is not null and m.expires_at <= now() then 'expired'") && contentLibraryMigration.includes("where m.owner_id = auth.uid()"));

const contentLibraryComponent = await read("../src/app/creator/content-library.tsx");
check("creator content library shows quota and cooldown before publishing", contentLibraryComponent.includes("raye2_get_creator_capabilities") && contentLibraryComponent.includes("long_videos_per_month") && contentLibraryComponent.includes("can_publish_long_video_now") && contentLibraryComponent.includes("library-quota"));

const sharedMomentMigration = await read("../supabase/migrations/20261111070000_raye2_community_feed_linked_slug.sql");
check("community shared moments resolve a real watch-page slug and timestamp", sharedMomentMigration.includes("linked_video_slug text") && sharedMomentMigration.includes("public.raye2_can_view_video(vc.media_id) then vc.slug else null end") && sharedMomentMigration.includes("left join public.video_catalog vc on vc.media_id = s.linked_video_id"));

const groupVoiceControls = await read("../src/app/raye2/raye2-group-voice-controls.tsx");
check("group voice rooms report connection quality and reconnect state", groupVoiceControls.includes("RoomEvent.ConnectionQualityChanged") && groupVoiceControls.includes("RoomEvent.Reconnecting") && groupVoiceControls.includes("RoomEvent.Reconnected") && groupVoiceControls.includes("setReconnecting(false)"));

const eventSpaceAttachMigration = await read("../supabase/migrations/20261111080000_raye2_creator_event_space_attach.sql");
check("creators can attach a community space to an event", eventSpaceAttachMigration.includes("raye2_creator_attachable_spaces") && eventSpaceAttachMigration.includes("space_group_slug text") && eventSpaceAttachMigration.includes("join public.raye2_conversation_members m on m.conversation_id = c.id"));

const cleanupPreviewMigration = await read("../supabase/migrations/20261111090000_raye2_cleanup_preview_estimates.sql");
check("cleanup previews compute affected records and estimated storage", cleanupPreviewMigration.includes("raye2_estimate_cleanup_scope(p_scope, coalesce(p_preserve_chat_history,true), coalesce(p_preserve_shared_memories,true))") && cleanupPreviewMigration.includes("estimated_items,estimated_bytes,result,reason") && cleanupPreviewMigration.includes("'exclusions',jsonb_build_object("));

const watchReactionsMigration = await read("../supabase/migrations/20261111100000_raye2_watch_reactions.sql");
check("Watch Together rooms support participant reactions with a rate limit", watchReactionsMigration.includes("create table if not exists public.raye2_watch_reactions") && watchReactionsMigration.includes("public.raye2_is_watch_participant(p_session_id)") && watchReactionsMigration.includes("interval '1 minute') >= 20") && watchReactionsMigration.includes("array['raye2_watch_reactions']"));

const eventQuestionReportingMigration = await read("../supabase/migrations/20261111110000_raye2_event_question_reporting.sql");
check("event-question reporting is restored alongside all report targets", eventQuestionReportingMigration.includes("target_type in ('post','comment','profile','community_clip','mini','event_question')") && eventQuestionReportingMigration.includes("from public.event_qa q where q.id::text = p_target_id"));

const shareIntoChatMigration = await read("../supabase/migrations/20261111120000_raye2_share_into_chat.sql");
check("videos can be shared into member conversations with a view gate", shareIntoChatMigration.includes("raye2_share_video_to_chat") && shareIntoChatMigration.includes("raye2_is_conversation_member(p_conversation_id)") && shareIntoChatMigration.includes("public.raye2_can_view_video(vc.media_id)") && shareIntoChatMigration.includes("raye2_list_shareable_conversations"));

const storageAllowancesMigration = await read("../supabase/migrations/20261116120000_raye2_storage_allowances_and_control.sql");
check("managed storage buckets include every Raye2 member bucket", storageAllowancesMigration.includes("raye2_managed_buckets") && storageAllowancesMigration.includes("'raye2-community-shorts','raye2-minis','raye2-clips'"));
check("storage reservation allow-list is widened to the Raye2 buckets", storageAllowancesMigration.includes("nhen_media_upload_reservations_bucket_id_check") && storageAllowancesMigration.includes("'raye2-community-shorts','raye2-minis','raye2-clips'"));
check("per-role monthly allowances are seeded and override a role with a per-account row", storageAllowancesMigration.includes("raye2_storage_allowances") && storageAllowancesMigration.includes("raye2_storage_allowance_overrides") && storageAllowancesMigration.includes("raye2_storage_allowance_for") && storageAllowancesMigration.includes("is_override boolean"));
check("my storage status returns the plan, period usage and reset date", storageAllowancesMigration.includes("raye2_my_storage_status") && storageAllowancesMigration.includes("period_end timestamptz") && storageAllowancesMigration.includes("public.raye2_storage_period_used"));
check("the live reservation RPC enforces the monthly allowance and the platform ceiling", storageAllowancesMigration.includes("monthly storage allowance reached") && storageAllowancesMigration.includes("platform storage is temporarily full") && storageAllowancesMigration.includes("raye2_storage_settings") && storageAllowancesMigration.includes("platform_ceiling_bytes"));
check("storage admin control requires an owner or admin and is audit-logged", storageAllowancesMigration.includes("public.raye2_is_platform_admin()") && storageAllowancesMigration.includes("raye2_admin_audit_log") && storageAllowancesMigration.includes("raye2_set_storage_allowance") && storageAllowancesMigration.includes("raye2_set_storage_allowance_override") && storageAllowancesMigration.includes("raye2_set_storage_ceiling"));
check("storage admin RPCs are granted only to authenticated and revoked from anon", storageAllowancesMigration.includes("revoke all on function public.raye2_set_storage_allowance(text,bigint,bigint,text) from public, anon") && storageAllowancesMigration.includes("grant execute on function public.raye2_set_storage_ceiling(bigint,text) to authenticated"));

const storageAllowanceLogic = await read("../src/lib/raye2/storage-allowances.mjs");
const storageAllowanceTests = await read("../tests/raye2-storage-allowances.test.mjs");
check("allowance module mirrors the seeded plan, period and ceiling rules", storageAllowanceLogic.includes("DEFAULT_STORAGE_ALLOWANCES") && storageAllowanceLogic.includes("currentPeriodStart") && storageAllowanceLogic.includes("canReserveWithinAllowance") && storageAllowanceLogic.includes("platform_full"));
check("allowance tests cover role sizes, overrides, period rollover and both rejection paths", storageAllowanceTests.includes("combined is not the sum of creator and streamer") && storageAllowanceTests.includes("an override wins over the role allowance") && storageAllowanceTests.includes("the platform ceiling blocks uploads"));

const mediaLibrarySource = await read("../src/app/creator/media-library.tsx");
check("media library surfaces the personal monthly allowance with reset date", mediaLibrarySource.includes('supabase.rpc("raye2_my_storage_status")') && mediaLibrarySource.includes("allowanceReset") && mediaLibrarySource.includes("allowanceCustom"));

const adminClientSource = await read("../src/app/creator/raye2/admin-client.tsx");
check("admin storage fabric tab loads and mutates allowances, providers and ceiling", adminClientSource.includes('supabase.rpc("raye2_storage_admin_overview")') && adminClientSource.includes('supabase.rpc("raye2_set_storage_allowance"') && adminClientSource.includes('supabase.rpc("raye2_set_storage_provider"') && adminClientSource.includes('supabase.rpc("raye2_set_storage_ceiling"'));

const storagePoolingMigration = await read("../supabase/migrations/20261116130000_raye2_storage_pooling_dedup_and_multipart.sql");
check("provider pooling allows many instances of one provider kind", storagePoolingMigration.includes("add column if not exists provider_kind text") && storagePoolingMigration.includes("drop constraint if exists raye2_storage_providers_provider_id_check") && storagePoolingMigration.includes("raye2_storage_providers_kind_check") && storagePoolingMigration.includes("raye2_storage_providers_instance_check"));
check("content-addressed dedup keys blobs by sha256 with a refcount", storagePoolingMigration.includes("create table if not exists public.raye2_storage_blobs") && storagePoolingMigration.includes("ref_count") && storagePoolingMigration.includes("raye2_storage_object_replicas"));
check("dedup registration charges zero bytes on a hit and locks the digest", storagePoolingMigration.includes("raye2_register_storage_object") && storagePoolingMigration.includes("raye2-storage-blob:") && storagePoolingMigration.includes("v_dedup := true") && storagePoolingMigration.includes("v_charged := v_object.size_bytes"));
check("dedup registration and release are service-role only", storagePoolingMigration.includes("revoke all on function public.raye2_register_storage_object(uuid,text,text) from public, anon, authenticated") && storagePoolingMigration.includes("revoke all on function public.raye2_release_storage_blob(text,text) from public, anon, authenticated"));
check("multipart reservations may exceed the single-shot cap", storagePoolingMigration.includes("raye2_storage_reservations_expected_bytes_check") && storagePoolingMigration.includes("between 1 and 107374182400"));
check("capacity summary and ceiling sync aggregate verified pooled capacity", storagePoolingMigration.includes("raye2_storage_capacity_summary") && storagePoolingMigration.includes("raye2_sync_platform_ceiling") && storagePoolingMigration.includes("platform_ceiling_cap_bytes") && storagePoolingMigration.includes("capacity_verified_at is not null"));

const providerPolicySource = await read("../src/lib/storage/provider-policy.mjs");
check("router selects the least-full pooled instance and summarizes the pool", providerPolicySource.includes("providerKind") && providerPolicySource.includes("summarizeProviderPool") && providerPolicySource.includes("instances.sort") && providerPolicySource.includes("verifiedCapacityBytes"));

const s3AdapterSource = await read("../src/lib/storage/s3-compatible-provider.mjs");
check("S3 adapter supports multipart uploads and pooled instances", s3AdapterSource.includes("createMultipartUpload") && s3AdapterSource.includes("signUploadPart") && s3AdapterSource.includes("completeMultipartUpload") && s3AdapterSource.includes("abortMultipartUpload") && s3AdapterSource.includes("multipartUploads: true") && s3AdapterSource.includes("configuredInstancePrefixes"));

const dedupLogic = await read("../src/lib/storage/dedup.mjs");
const dedupTests = await read("../tests/storage-dedup.test.mjs");
check("dedup module plans hits, savings and last-reference reclaim", dedupLogic.includes("planDedup") && dedupLogic.includes("summarizeDedupSavings") && dedupLogic.includes("planBlobRelease"));
check("dedup tests cover first store, hit, savings ratio and release", dedupTests.includes("a repeated digest is deduplicated") && dedupTests.includes("dedup savings report logical vs physical") && dedupTests.includes("the last reference to a blob may reclaim"));

// Batch 2 — chunked uploads, reconciliation, optimization ladder and BYOS connectors.
const multipartMigration = await read("../supabase/migrations/20261116140000_raye2_multipart_uploads_and_reconciliation.sql");
check("multipart ledger tracks parts, state and reservation linkage", multipartMigration.includes("create table if not exists public.raye2_multipart_uploads") && multipartMigration.includes("uploaded_parts") && multipartMigration.includes("raye2_begin_multipart_upload") && multipartMigration.includes("raye2_record_upload_part") && multipartMigration.includes("raye2_finish_multipart_upload"));
check("reservation RPC accepts pooled instance ids and 100 GiB parts", multipartMigration.includes("p_provider_id !~ '^[a-z0-9][a-z0-9_-]{1,62}$'") && multipartMigration.includes("p_expected_bytes > 107374182400"));
check("provider reconciliation records usage and marks capacity fresh", multipartMigration.includes("raye2_reconcile_storage_provider") && multipartMigration.includes("capacity_verified_at=now()") && multipartMigration.includes("last_reconciled_at=now()"));

const multipartPlanner = await read("../src/lib/storage/multipart-upload.mjs");
const multipartPlannerTests = await read("../tests/storage-multipart-upload.test.mjs");
check("multipart planner sizes parts, resumes and builds an ordered manifest", multipartPlanner.includes("planUploadParts") && multipartPlanner.includes("planResume") && multipartPlanner.includes("buildCompletionManifest") && multipartPlanner.includes("planPartRetry"));
check("multipart planner tests cover the 5 MiB rule and 10000-part ceiling", multipartPlannerTests.includes("every non-final part meets the 5 MiB minimum") && multipartPlannerTests.includes("never exceed the maximum number of parts"));

const multipartRoute = await read("../src/app/api/raye2/storage/multipart/route.ts");
check("multipart route reserves, signs parts, completes and dedups via service role", multipartRoute.includes("raye2_reserve_storage") && multipartRoute.includes("raye2_begin_multipart_upload") && multipartRoute.includes("raye2_record_upload_part") && multipartRoute.includes("raye2_commit_storage_object") && multipartRoute.includes("raye2_register_storage_object") && multipartRoute.includes("createSupabaseServiceClient"));

const chunkedClient = await read("../src/lib/storage/chunked-upload.ts");
const mediaLibrary = await read("../src/app/creator/media-library.tsx");
check("chunked client falls back to Supabase when the pool is unavailable", chunkedClient.includes("MultipartUnavailableError") && chunkedClient.includes("prefersChunkedUpload") && chunkedClient.includes("uploadChunkedToPool") && mediaLibrary.includes("MultipartUnavailableError") && mediaLibrary.includes("uploadToSupabaseStorage"));
check("reconciliation worker lists provider buckets and syncs the ceiling", (await read("../scripts/raye2-storage-reconcile.mjs")).includes("raye2_reconcile_storage_provider") && (await read("../scripts/raye2-storage-reconcile.mjs")).includes("raye2_sync_platform_ceiling") && s3AdapterSource.includes("listObjects"));

const optimization = await read("../src/lib/storage/media-optimization.mjs");
const optimizationTests = await read("../tests/storage-media-optimization.test.mjs");
check("optimization ladder prefers AV1/HEVC and never claims lossless video", optimization.includes("visually lossless") && optimization.includes("chooseVideoCodec") && optimization.includes("planVideoLadder") && optimization.includes("estimatedSavingsPercent"));
check("optimization tests cover codec choice, no-upscale ladder and savings", optimizationTests.includes("preferring AV1 then HEVC") && optimizationTests.includes("never upscales") && optimizationTests.includes("compact rendition"));
check("media worker uses the shared optimization ladder", (await read("../scripts/raye2-media-worker.mjs")).includes("planVideoLadder"));

const byos = await read("../src/lib/storage/byos-connectors.mjs");
const byosTests = await read("../tests/storage-byos-connectors.test.mjs");
check("BYOS connectors are S3-compatible and never store secrets", byos.includes("BYOS_PROVIDERS") && byos.includes("hasSecret: false") && byos.includes("Storj"));
check("BYOS placement keeps public delivery on Raye2-owned providers", byos.includes("planByosPlacement") && byos.includes("public_not_allowed") && byosTests.includes("private overflow only"));

const byosMigration = await read("../supabase/migrations/20261116150000_raye2_byos_connections.sql");
const byosAdminUi = await read("../src/app/creator/raye2/byos-connections.tsx");
check("BYOS connections store only a secret name and never a secret value", byosMigration.includes("raye2_byos_connections") && byosMigration.includes("secret_ref text not null") && !byosMigration.includes("secret_value") && !byosMigration.includes("access_key"));
check("BYOS connections are owner-scoped and admin metadata is gated", byosMigration.includes("public.raye2_upsert_byos_connection") && byosMigration.includes("c.owner_id=auth.uid()") && byosMigration.includes("public.raye2_is_platform_admin()"));
check("only the service role may mark a BYOS connection verified", byosMigration.includes("public.raye2_set_byos_connection_state") && byosMigration.includes("to service_role") && byosMigration.includes("revoke all on function public.raye2_set_byos_connection_state(uuid,text,text) from public, anon, authenticated"));
check("admin BYOS surface loads and disables connections", byosAdminUi.includes('supabase.rpc("raye2_admin_byos_connections")') && byosAdminUi.includes('supabase.rpc("raye2_admin_set_byos_state"') && adminClientSource.includes("<ByosConnections isArabic={isAr} />"));

const uploadSurfaces = await Promise.all(["../src/app/minis/minis-client.tsx", "../src/app/clips/clips-client.tsx", "../src/app/shorts/community-shorts-client.tsx"].map(read));
const uploadHelper = await read("../src/lib/supabase/resumable-upload.ts");
check("every member upload surface prefers the pooled path with a Supabase fallback", uploadSurfaces.every(source => source.includes("prefersChunkedUpload") && source.includes("MultipartUnavailableError") && source.includes("uploadToSupabaseStorage")));
check("the client upload allowlist covers every bucket the surfaces use", ["creator-media-private", "creator-media-public", "raye2-community-shorts", "raye2-minis", "raye2-clips"].every(bucket => uploadHelper.includes('"' + bucket + '"')));

// Batch 4 — object lifecycle, BYOS probing, provider discovery and migration.
const lifecycleMigration = await read("../supabase/migrations/20261116160000_raye2_storage_lifecycle_and_migration.sql");
check("object listing and deletion are owner-scoped through definer RPCs", lifecycleMigration.includes("create or replace function public.raye2_my_storage_objects") && lifecycleMigration.includes("create or replace function public.raye2_request_object_deletion") && lifecycleMigration.includes("o.owner_id=v_actor") && lifecycleMigration.includes("where object_id=p_object_id and owner_id=v_actor for update"));
check("owner object RPCs are revoked from anon and granted only to authenticated", lifecycleMigration.includes("revoke all on function public.raye2_my_storage_objects(integer) from public, anon") && lifecycleMigration.includes("grant execute on function public.raye2_my_storage_objects(integer) to authenticated") && lifecycleMigration.includes("revoke all on function public.raye2_request_object_deletion(uuid) from public, anon"));
check("the admin object listing is gated by the platform admin check", lifecycleMigration.includes("create or replace function public.raye2_admin_storage_objects") && lifecycleMigration.includes("if not public.raye2_is_platform_admin() then"));
check("BYOS probing metadata is additive and never stores a secret value", lifecycleMigration.includes("add column if not exists last_probed_at") && lifecycleMigration.includes("add column if not exists probe_listed_keys") && lifecycleMigration.includes("Never the value"));
check("provider discovery is service-role only and keeps existing usage counters", lifecycleMigration.includes("create or replace function public.raye2_sync_storage_providers") && lifecycleMigration.includes("to service_role") && lifecycleMigration.includes("on conflict (provider_id) do update set") && !lifecycleMigration.includes("used_bytes=excluded.used_bytes"));
check("the migration ledger is service-role only and moves provider byte counters", lifecycleMigration.includes("create table if not exists public.raye2_storage_object_migrations") && lifecycleMigration.includes("revoke all on public.raye2_storage_object_migrations from anon, authenticated") && lifecycleMigration.includes("create or replace function public.raye2_complete_object_migration") && lifecycleMigration.includes("used_bytes=greatest(0,used_bytes-v_migration.size_bytes)") && lifecycleMigration.includes("used_bytes=used_bytes+v_migration.size_bytes"));
check("draining-object selection protects recordings and memories and excludes in-flight moves", lifecycleMigration.includes("create or replace function public.raye2_list_draining_objects") && lifecycleMigration.includes("o.asset_class not in ('voice_recording','memory')") && lifecycleMigration.includes("m.migration_state in ('pending','copied')"));

const objectDelivery = await read("../src/lib/storage/object-delivery.mjs");
const objectDeliveryTests = await read("../tests/storage-object-delivery.test.mjs");
check("object delivery signs private objects and keeps public Supabase buckets unsigned", objectDelivery.includes("planObjectDelivery") && objectDelivery.includes("composeObjectUrl") && objectDelivery.includes("MAX_SIGNED_URL_TTL_SECONDS") && objectDeliveryTests.includes("a private object is never returned as a public URL") && objectDeliveryTests.includes("legacy Supabase public buckets are delivered without signing"));

const migrationPlanner = await read("../src/lib/storage/migration-planner.mjs");
const migrationPlannerTests = await read("../tests/storage-migration-planner.test.mjs");
check("migration planner only moves draining, unprotected, active objects within headroom", migrationPlanner.includes("planStorageMigration") && migrationPlanner.includes("PROTECTED_ASSET_CLASSES") && migrationPlanner.includes("buildMigrationIdempotencyKey") && migrationPlannerTests.includes("protected asset classes are never moved automatically") && migrationPlannerTests.includes("an unverified destination never receives objects"));

const byosProbe = await read("../src/lib/storage/byos-probe.mjs");
const byosProbeTests = await read("../tests/storage-byos-probe.test.mjs");
check("BYOS probe builds a private-only adapter and interprets results safely", byosProbe.includes("buildByosAdapterConfig") && byosProbe.includes("createByosAdapter") && byosProbe.includes("interpretProbe") && byosProbe.includes("isConnectionUsable") && byosProbeTests.includes("a connection is only usable when verified and backed by a secret reference"));

const objectRoute = await read("../src/app/api/raye2/storage/object/route.ts");
const byosRoute = await read("../src/app/api/raye2/storage/byos/route.ts");
const discoverRoute = await read("../src/app/api/raye2/storage/providers/discover/route.ts");
const migrateRoute = await read("../src/app/api/raye2/storage/migrate/route.ts");
check("object route enforces owner scoping before signing or deleting", objectRoute.includes("data.owner_id !== ownerId") && objectRoute.includes("raye2_request_object_deletion") && objectRoute.includes("raye2_mark_storage_object_deleted") && objectRoute.includes("planObjectDelivery"));
check("BYOS route resolves credentials by name and records the probe outcome", byosRoute.includes("readSecret") && byosRoute.includes("connection.owner_id !== ownerId") && byosRoute.includes("raye2_set_byos_connection_state"));
check("discovery route is admin-gated and syncs only configured providers", discoverRoute.includes('rpc("raye2_is_platform_admin")') && discoverRoute.includes("createConfiguredStorageProviders") && discoverRoute.includes("raye2_sync_storage_providers"));
check("migrate route is admin-gated and copies before repointing then deleting", migrateRoute.includes('rpc("raye2_is_platform_admin")') && migrateRoute.includes("raye2_list_draining_objects") && migrateRoute.includes("copyObject") && migrateRoute.indexOf("copyObject") < migrateRoute.indexOf("raye2_complete_object_migration"));

const accountSettingsSource = await read("../src/app/account/account-settings.tsx");
check("account settings expose owner storage and BYOS connection management", accountSettingsSource.includes('raye2_my_storage_objects') && accountSettingsSource.includes('raye2_my_byos_connections') && accountSettingsSource.includes('raye2_upsert_byos_connection') && accountSettingsSource.includes("/api/raye2/storage/object") && accountSettingsSource.includes("/api/raye2/storage/byos"));
check("admin BYOS surface exposes provider reconciliation and migration", byosAdminUi.includes("/api/raye2/storage/providers/discover") && byosAdminUi.includes("/api/raye2/storage/migrate"));

const objectListMigration = lifecycleMigration;
check("owner deletion moves pooled objects out of the legacy Supabase path", objectRoute.includes('row.provider_id === "supabase"') && objectRoute.includes("service.storage.from(String(row.bucket_id)).remove"));
check("object lifecycle RPCs set an empty search path for safety", (objectListMigration.match(/set search_path/g) || []).length >= 6);

// Batch 5 — pooled object delivery resolution across every read surface.
const resolutionMigration = await read("../supabase/migrations/20261116170000_raye2_storage_object_resolution.sql");
check("object resolution is a batched, service-role-only point lookup", resolutionMigration.includes("create or replace function public.raye2_resolve_storage_objects") && resolutionMigration.includes("jsonb_array_length(p_objects) > 200") && resolutionMigration.includes("to service_role") && resolutionMigration.includes("revoke all on function public.raye2_resolve_storage_objects(jsonb) from public, anon, authenticated"));
check("object resolution returns only live rows and is indexed", resolutionMigration.includes("o.object_state in ('active','verified','staged')") && resolutionMigration.includes("raye2_storage_objects_bucket_key_idx") && resolutionMigration.includes("on public.raye2_storage_objects(bucket_id,object_key)"));

const resolveRoute = await read("../src/app/api/raye2/storage/resolve/route.ts");
const resolveHelper = await read("../src/lib/storage/resolve-delivery.ts");
const resolveTests = await read("../tests/storage-resolve-delivery.test.mjs");
check("resolve route signs pooled objects and leaves Supabase objects to the client", resolveRoute.includes("raye2_resolve_storage_objects") && resolveRoute.includes('kind: "legacy"') && resolveRoute.includes("planObjectDelivery") && resolveRoute.includes("createSignedDownload"));
check("resolve route never leaks a private object to a non-owner", resolveRoute.includes("isPrivate && (!viewerId || row.owner_id !== viewerId)") && resolveRoute.includes('kind: "forbidden"'));
check("resolve route validates buckets and object keys before lookup", resolveRoute.includes("isResolvableBucket") && resolveRoute.includes("isValidObjectKey") && resolveRoute.includes("Invalid object reference"));
check("resolve helper degrades to the legacy resolver on any failure", resolveHelper.includes("resolveStorageDeliveries") && resolveHelper.includes("splitStoragePath") && resolveHelper.includes("legacyFill") && resolveTests.includes("a failed request degrades every object to the legacy resolver") && resolveTests.includes("a pooled object resolves to the server-signed URL"));

const readSurfaces = await Promise.all([
  read("../src/app/minis/minis-client.tsx"),
  read("../src/app/clips/clips-client.tsx"),
  read("../src/app/shorts/community-shorts-client.tsx"),
]);
check("every public member feed resolves playback through the registry with a Supabase fallback", readSurfaces.every(source => source.includes("resolveStorageDeliveries") && source.includes("splitStoragePath") && source.includes("getPublicUrl")));
check("the media library resolves previews through the registry before signing privately", (await read("../src/app/creator/media-library.tsx")).includes("resolveStorageDeliveries") && (await read("../src/app/creator/media-library.tsx")).includes("splitStoragePath"));

const serverSurfaces = await Promise.all([
  read("../src/app/u/[handle]/page.tsx"),
  read("../src/app/watch/[slug]/page.tsx"),
  read("../src/app/videos/public-videos.tsx"),
  read("../src/app/watch/page.tsx"),
  read("../src/app/watch/playlists/[slug]/page.tsx"),
  read("../src/app/series/page.tsx"),
  read("../src/app/page.tsx"),
  read("../src/app/raye2/home/page.tsx"),
  read("../src/app/shorts/page.tsx"),
]);
check("every server-rendered playback surface resolves pooled objects before falling back to Supabase", serverSurfaces.every(source => source.includes("resolvePublicObjectUrls") && (source.includes("getPublicUrl") || source.includes("buildWatchCard"))));
check("the watch detail page accepts a pooled origin for videos, HLS and posters", (await read("../src/app/watch/[slug]/page.tsx")).includes("creator-media-public\\u0000"));
check("the creator studio and watch-together client surfaces resolve pooled playback", (await read("../src/app/creator/video-studio.tsx")).includes("resolveStorageDeliveries") && (await read("../src/app/raye2/raye2-watch-together-controls.tsx")).includes("resolveStorageDelivery") && (await read("../src/app/watch/watch-library-more.tsx")).includes("resolveStorageDeliveries"));
check("the shared server resolver exposes a public-object convenience wrapper", (await read("../src/lib/storage/resolve.server.ts")).includes("export async function resolvePublicObjectUrls"));

const migrationCheckScript = await read("../scripts/raye2-migration-check.mjs");
const migrationStub = await read("../scripts/raye2-stub-supabase.sql");
const migrationPostchecks = await read("../scripts/raye2-migration-postchecks.sql");
const packageManifest = JSON.parse(await read("../package.json"));
check("the live migration check applies every migration on a throwaway cluster",
  migrationCheckScript.includes("supabase") && migrationCheckScript.includes("migrations") &&
  migrationCheckScript.includes("ON_ERROR_STOP") && migrationCheckScript.includes("raye2-stub-supabase.sql") &&
  migrationCheckScript.includes("raye2-migration-postchecks.sql"));
check("the Supabase stub mirrors the auth/storage/realtime surfaces the migrations use",
  migrationStub.includes("create table if not exists auth.users") &&
  migrationStub.includes("create or replace function auth.uid()") &&
  migrationStub.includes("create table if not exists storage.objects") &&
  migrationStub.includes("owner_id text") &&
  migrationStub.includes("create table if not exists realtime.messages") &&
  migrationStub.includes("create role anon nologin noinherit"));
check("the migration post-checks assert row level security and pinned search_path",
  migrationPostchecks.includes("public tables without row level security") &&
  migrationPostchecks.includes("security definer functions without a pinned search_path") &&
  migrationPostchecks.includes("storage reservation RPCs must be service-role only"));
check("npm run check runs the static validator and the live migration check",
  typeof packageManifest.scripts.check === "string" &&
  packageManifest.scripts.check.includes("validate-static-site.mjs") &&
  packageManifest.scripts.check.includes("raye2-migration-check.mjs") &&
  packageManifest.scripts["check:migrations"] === "node scripts/raye2-migration-check.mjs");

if (failures.length) {
  console.error("Repository validation failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exitCode = 1;
} else {
  console.log(`Repository validation passed (${assertionCount} assertions).`);
}

import { readFile } from "node:fs/promises";

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
check("Storage object inserts for NHEN buckets require an active matching owner, bucket, and exact-byte reservation", storageReservationGateMigration.includes("before insert on storage.objects") && storageReservationGateMigration.includes("r.user_id=v_user") && storageReservationGateMigration.includes("r.bucket_id=new.bucket_id") && storageReservationGateMigration.includes("r.expected_bytes=v_bytes") && storageReservationGateMigration.includes("r.expires_at>now()") && storageReservationGateMigration.includes("revoke all on function public.enforce_nhen_storage_upload_reservation()") && storageReservationGateMigration.includes("grant execute on function public.enforce_nhen_storage_upload_reservation() to authenticated"));
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

check("homepage provides a separate mobile navigation with the same visibility gates", page.includes('className="mobile-nav" aria-label="Mobile navigation"') && page.includes('className="desktop-nav" aria-label="Main navigation"') && (page.match(/href="#videos"/g) || []).length >= 1);
check("mobile navigation remains horizontally scrollable instead of disappearing on narrow screens", (await read("../src/app/globals.css")).includes(".topbar .mobile-nav{display:flex;order:3;width:100%;gap:22px;overflow-x:auto"));
check("creator dashboard collapses stats and modules for tablet/mobile widths", (await read("../src/app/globals.css")).includes(".dashboard-stats { grid-template-columns: minmax(0, 1fr)") && (await read("../src/app/globals.css")).includes(".module-grid { grid-template-columns: minmax(0, 1fr)"));
check("public event cards and idea form use single-column mobile layouts", (await read("../src/app/globals.css")).includes(".public-events-grid { grid-template-columns: minmax(0, 1fr)") && (await read("../src/app/globals.css")).includes(".idea-form-fields { grid-template-columns: minmax(0, 1fr)"));
check("social links stack cleanly on narrow screens", (await read("../src/app/globals.css")).includes(".public-socials { grid-template-columns: 1fr; gap: 22px;"));
check("homepage integrates published video gallery and navigation", page.includes("import PublicVideos") && page.includes("<PublicVideos />") && page.includes('href="#videos"'));
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
check("published logo and hero assets bind to public page", config.includes('logoUrl: publicMediaUrl(logoItem, ["image"])') && config.includes('heroMediaUrl: publicMediaUrl(heroItem, ["image", "video"])') && page.includes("config.logoUrl && <img") && page.includes("portal-wordmark") && page.includes("Raye2") && page.includes("رايق"));
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
const communityStyles = await read("../src/app/nhen-design-system.css");
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
check("community feed filters have accessible state and responsive styling", communityClient.includes('aria-pressed={postFilter==="all"}') && communityStyles.includes(".nhen-feed-filter") && communityStyles.includes("@media(max-width:640px){.nhen-feed-filter"));
check("community feed filter controls follow the selected Arabic or English locale", communityClient.includes('isArabic?"تصفية المنشورات":"Filter posts"') && communityClient.includes('officialPosts:"رسمي"') && communityClient.includes('memberPosts:"Members"'));
check("NHEN Shorts page resolves the saved locale server-side and localizes its navigation, headings, and empty state", shortsPage.includes('cookies()') && shortsPage.includes('cookieStore.get("nhen_locale")') && shortsPage.includes('dir={isArabic?"rtl":"ltr"}') && shortsPage.includes('labels.empty'));
check("official Shorts pass the selected locale into the shared player and community Shorts localize upload placeholders and dates", shortsPage.includes('locale={locale}') && communityShorts.includes('file?file.name+" · "+duration+" sec":t.none') && communityShorts.includes('toLocaleDateString(isArabic?"ar-EG":"en-US")'));
check("notifications page and interactions honor Arabic RTL and localize status, timestamps, and empty state", notificationsPage.includes('dir={isArabic?"rtl":"ltr"}') && notificationsPage.includes('locale={locale}') && notificationsClient.includes('toLocaleString(isArabic?"ar-EG":"en-US")') && notificationsClient.includes("تحديد الكل كمقروء"));
check("notification delivery covers instantly published community comments as well as approved comments", notificationDeliveryMigration.includes("after insert or update of status on public.community_comments") && notificationDeliveryMigration.includes("tg_op='INSERT'"));
check("notification cards localize activity text, link to the exact community post, and restore optimistic read state on failure", notificationsClient.includes('"/community#post-"+n.targetId') && notificationsClient.includes("started following you") && notificationsClient.includes("بدأ بمتابعتك") && notificationsClient.includes("setItems(xs=>xs.map(x=>x.id===id?{...x,readAt:previous.readAt}:x))"));
check("saved library page and interactions honor Arabic RTL and localize dates, removal, and empty state", savedPage.includes('dir={isArabic?"rtl":"ltr"}') && savedPage.includes('locale={locale}') && savedClient.includes('toLocaleDateString(isArabic?"ar-EG":"en-US")') && savedClient.includes("إزالة من المحفوظات"));
check("saved library combines private community and video bookmarks with type filters and correct removal targets", savedPageUnified.includes('from("video_bookmarks")') && savedPageUnified.includes('from("community_bookmarks")') && savedClient.includes('filter==="videos"') && savedClient.includes('from("video_bookmarks").delete()') && savedClient.includes('from("community_bookmarks").delete()') && savedClient.includes('"/watch/"+item.slug'));
check("member profiles receive saved locale and localize profile editing, follow/block actions, sections, and dates", memberProfilePage.includes('cookieStore.get("nhen_locale")') && memberProfilePage.includes('locale={locale}') && memberProfileClient.includes('dir={isArabic?"rtl":"ltr"}') && memberProfileClient.includes('toLocaleDateString(isArabic?"ar-EG":"en-US")') && memberProfileClient.includes("تعديل الملف الشخصي") && memberProfileClient.includes("إلغاء الحظر"));
check("NHEN discovery search uses the saved locale, RTL direction, and translated result sections and empty states", searchPage.includes('cookieStore.get("nhen_locale")') && searchPage.includes('dir={isArabic?"rtl":"ltr"}') && searchPage.includes("اكتشف") && searchPage.includes("لا توجد فيديوهات مطابقة.") && searchPage.includes("لا يوجد أعضاء مطابقون."));

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
const watchDetailPage = await read("../src/app/watch/[slug]/page.tsx");
const watchDetailClient = await read("../src/app/watch/[slug]/watch-detail-client.tsx");
check("topics and related videos are public pinned SECURITY DEFINER read RPCs granted to anon and authenticated", topicsMigration.includes("create or replace function public.raye2_get_related_videos(") && topicsMigration.includes("create or replace function public.raye2_list_topics(") && topicsMigration.includes("create or replace function public.raye2_get_topic_videos(") && topicsMigration.includes("grant execute on function public.raye2_list_topics(integer,integer) to anon, authenticated") && topicsMigration.includes("set search_path = ''"));
check("related videos rank by shared tags and category while topics only aggregate published videos", topicsMigration.includes("order by c.shared_tags desc, c.published_at desc") && topicsMigration.includes("c.shared_tags > 0 or c.category = (select category from source)") && topicsMigration.includes("length(btrim(tag)) between 1 and 40"));
check("the topic page localizes, links from the watch detail tags, and the watch page loads a related-videos rail", topicPage.includes('cookieStore.get("nhen_locale")') && topicPage.includes('dir={isArabic?"rtl":"ltr"}') && topicPage.includes("raye2_get_topic_videos") && watchDetailPage.includes('rpc("raye2_get_related_videos"') && watchDetailClient.includes('href={"/topics/"+encodeURIComponent(tag)}') && watchDetailClient.includes("raye2-detail-related"));

if (failures.length) {
  console.error("Repository validation failed:");
  for (const failure of failures) console.error(" - " + failure);
  process.exitCode = 1;
} else {
  console.log(`Repository validation passed (${assertionCount} assertions).`);
}

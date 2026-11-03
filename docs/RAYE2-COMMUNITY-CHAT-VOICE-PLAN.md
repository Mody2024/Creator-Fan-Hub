# Raye2 — Community, Chat, Voice & Shared Memories Plan

**Status:** Product plan / proposed specification (not implementation)  
**Target branch:** `development` only  
**Production:** No deployment or merge to `main` is authorized by this document.

## 1. Confirmed product decisions

The following choices were explicitly confirmed:

- Support both **private one-to-one voice calls** and **group voice rooms**.
- Voice-session recording is optional. Recording must be clearly announced and must not begin unless **every participant has actively consented**. A participant joining later must also consent before being included.
- Support both **public and private groups**.
- Add **Watch Together** as a first-class shared viewing feature.
- Chats, groups and rooms need configurable automatic cleanup/expiry so temporary data does not accumulate indefinitely.
- Admins need granular cleanup controls, including the ability to clear selected platform data while preserving chat history and shared memories.

## 2. Product principles

1. Make social spaces feel connected: profiles, creators, videos, Mini's, Moments, groups, chat and voice should link naturally.
2. Keep temporary activity temporary, but never silently destroy content that users have deliberately preserved.
3. Make limits and retention policies centrally configurable in the Admin Panel, with safe technical ceilings and clear explanations.
4. Separate **logical expiry** (content is no longer visible or accessible) from **physical deletion** (the underlying file is actually removed).
5. Use privacy by default: private groups remain private; recordings are off by default; private conversations are not exposed to unrelated group members or admins through ordinary UI.
6. Build for graceful degradation. If realtime or media services are unavailable, text chat and core browsing should continue where possible.

## 3. Chat and messaging

### Direct messages

- One-to-one conversations, message replies and threaded replies where useful.
- Emoji reactions and Raye2 custom reaction packs.
- Edit and delete own messages, with configurable edit windows and clear edited/deleted states.
- Share videos, Mini's, Moments, profiles, groups, events and Watch Together invitations.
- Typing indicators, online/last-active presence controls, read receipts and delivery states.
- Message search, pinned messages, saved messages and bookmarks.
- Message requests and controls for who can contact an account.
- Block, mute, report and restrict controls.
- Optional disappearing messages per conversation, subject to the platform's minimum retention and safety/legal requirements.

### Group chat

- Public discoverable groups and private invite-only groups.
- Group owners, admins, moderators and members with granular permissions.
- Invite links with expiry, usage limits and revocation.
- Join requests, approval queues, member removal and moderation logs.
- Group description, image, rules, topics, pinned messages and announcements.
- Replies, reactions, polls, shared files and shared content collections.
- Slow mode, anti-spam controls, member limits and message rate limits.
- Optional group voice room attached to the group.
- Group events and scheduled voice/watch sessions.

### Message and group lifecycle

Retention is configurable separately for:
- Message text and reactions.
- Attachments and uploaded media.
- Voice messages.
- Pinned content and bookmarks.
- Group inactivity and group closure.
- Group voice-room activity and recordings.

A group can be configured to:
- Remain active indefinitely.
- Become read-only after inactivity.
- Auto-archive after inactivity.
- Expire after a configured period.
- Require an owner/admin to renew it before expiry.

**Important:** Expiring a group container must not silently erase separately saved memories or a user's personal bookmarks. The system should first notify owners and members, offer export/renewal where appropriate, then apply the configured policy. A group may be deleted while a user's explicitly saved copy of a shared memory remains in their private collection, subject to rights and privacy rules.

## 4. Voice and realtime rooms

### Private voice calls

- One-to-one voice calls with incoming-call controls.
- Mute/unmute, speaker/device selection, connection quality indicator and leave/end controls.
- Optional call invitation from a direct chat.
- Block/report controls and configurable call permissions.
- No recording by default.

### Group voice rooms

- Voice rooms attached to public/private groups, plus standalone rooms if enabled by Admin.
- Join/leave, mute, raise hand, speaking indicator and moderator controls.
- Host/co-host roles, remove participant, lock room and waiting room.
- Configurable participant capacity and session duration.
- Optional push-to-talk and noise suppression where supported.
- Reconnect handling and clear network-quality feedback.
- Optional scheduled rooms and recurring community events.

### Recording and consent

- Recording is **off by default**.
- Before recording begins, every current participant must receive a clear consent prompt.
- Recording starts only after all current participants actively consent.
- If someone declines or withdraws consent, recording stops; the product must not quietly continue recording that participant.
- New participants must be asked before they are included in a recording.
- Show a persistent recording indicator and elapsed recording time to everyone.
- Store consent events, recording start/stop events and access history.
- Make recordings private to the authorized room/group by default.
- Configure who can start, view, download, share and delete recordings.
- Provide retention and automatic deletion settings.
- Do not provide secret or background recording.

### Watch Together

- Shared synchronized viewing sessions for eligible Raye2-native videos and supported external players.
- Host controls playback; participants can optionally request control.
- Shared queue, add/remove queue items, reorder and vote on next item.
- In-room text chat and optional voice room.
- Reactions and lightweight polls while watching.
- Invite links, private/public session choice, participant limits and host moderation.
- Reconnection and playback resynchronization after network interruptions.
- Clear indication when an external player has its own restrictions or cannot be fully synchronized.

For YouTube or other external embeds, respect provider terms and player controls. Raye2 can provide its own surrounding chat, reactions and room experience, but must not download, cache or alter external audiovisual streams without permission.

## 5. Shared memories and preservation

Introduce a **Shared Memories** area for groups and trusted circles:

- Save selected messages, photos, event highlights and links into a shared collection.
- Add captions, dates, contributors and optional tags.
- Pin important memories to the group.
- Let members contribute, while owners/moderators control collection permissions.
- Personal bookmarks remain private unless the user deliberately shares them.
- Export a collection where technically and legally supported.
- A memory can have its own retention setting: temporary, group-lifetime, or explicitly preserved.
- If a member leaves or a group expires, apply clear ownership/visibility rules; do not expose private material to former members.

Shared Memories are separate from ordinary chat retention. Admin bulk-cleanup tools must offer an explicit **preserve Shared Memories** option. Preservation is not a promise of infinite storage: quotas and platform-wide storage limits still apply.

## 6. Automatic cleanup and storage recovery

### Separate retention clocks

Admin can configure independent policies for:
- Direct-message history.
- Group-chat history.
- Inactive groups.
- Empty/inactive voice rooms.
- Voice recordings.
- Voice messages.
- Chat attachments.
- Watch Together session metadata.
- Temporary uploads and failed encodes.
- Moments, Mini's and other temporary media.
- Shared Memories.

### Cleanup modes

1. **Automatic expiry:** scheduled deletion/archiving after the configured age.
2. **Clear selected category:** clear one chosen data class, such as expired recordings or temporary uploads.
3. **Clear non-chat temporary data:** remove selected temporary media and session artefacts while preserving chat text.
4. **Preserve memories:** exclude Shared Memories and pinned preservation items from eligible cleanup.
5. **Group closure:** archive, export, then expire the group according to its policy.
6. **Emergency storage recovery:** Admin selects eligible categories and previews estimated space recovery before confirming.

No single "clear everything" action should be irreversible or ambiguous. Show a preview of affected records, estimated storage recovered, exclusions, and whether the action is reversible. Require elevated permission and explicit confirmation for destructive bulk operations.

### Deletion workflow

- Mark expired items inaccessible immediately according to policy.
- Queue physical file deletion and database cleanup in a background worker.
- Retry failures safely and make operations idempotent.
- Track orphaned files and metadata with no corresponding asset.
- Keep a minimal audit record of cleanup job, actor, scope, time and result without retaining deleted message contents.
- Provide a short recovery/quarantine window for eligible user-deleted content if configured.
- Explain that provider lifecycle deletion may not be instantaneous; access must be blocked by application policy even while physical deletion is pending.

## 7. Admin Panel — Platform Rules Engine

Create one central **Platform Rules & Retention** area. Admins should be able to edit settings without code changes, within provider and system ceilings.

### Role presets

- Normal User
- Creator
- Streamer
- Creator + Streamer
- Moderator
- Admin
- Trusted Creator
- Restricted User

Support per-account overrides, temporary role grants and expiry dates. Both-role accounts use their explicitly assigned combined quotas, not the sum of separate role quotas.

### Existing content quotas to carry forward

These are the current planned content rules and must remain visible/editable in Admin:

| Content | Creator | Streamer | Both |
|---|---:|---:|---:|
| Long videos per month | 5 | 0 | 3 |
| Long-video cooldown | 4 days | — | 1 per week |
| Streams per month | 0 | 5 | 3 |
| Streams per week | — | 2 | 1 |
| Mini's per month | 30 | 30 | 20 |
| Moments per month | 30 | 30 | 30 |

Other planned rules:
- Long video maximum duration: 10 minutes.
- Mini maximum duration: 15 seconds.
- Mini's for ordinary users: proposed platform daily cap of 3; Admin can tune this separately from role monthly quotas.
- Moments: planned temporary lifetime of 6 hours unless Admin changes it.
- Stream replay retention: 24 hours after stream ends. This is **replay deletion timing, not a 24-hour live-stream duration**.
- Proposed initial live-stream maximum: 3 hours, editable by Admin within the live provider's technical limits.
- Exclusives: maximum exclusivity window of 7 days.
- Long-video user-selected expiry: up to 14 days, subject to Admin policy.
- The role quota and platform-wide caps must be checked server-side, not only in the interface.

### Chat and voice settings

Admin-configurable settings should include:
- Maximum new DM conversations per user/day.
- Message character limit and messages/minute.
- Group creation limits and maximum group members.
- Public/private group availability and discoverability.
- Invite-link lifetime and usage cap.
- Attachment types and maximum file size.
- Voice-message maximum duration and file size.
- Private call and group voice availability.
- Group voice participant capacity.
- Maximum concurrent rooms and calls.
- Session duration and idle-room timeout.
- Recording availability, eligible roles, consent requirement (mandatory), recording size/duration limits and retention.
- Watch Together participant cap, queue cap and eligible media sources.
- Slow mode, anti-spam thresholds and temporary restrictions.

### Retention settings

- Configure each retention category independently.
- Set minimum and maximum allowed retention.
- Set default, maximum and optional per-group/per-user overrides.
- Configure warning windows before expiry.
- Configure archive versus delete behavior.
- Configure Shared Memories protection and who may override it.
- Configure cleanup schedule, batch size, retry policy and storage-pressure thresholds.

### Admin safety and accountability

- Separate Owner/Super Admin from ordinary Admin.
- Least-privilege permission groups.
- Require strong authentication for privileged accounts.
- Destructive actions require confirmation and a reason.
- Log actor, action, target scope, timestamp, reason and outcome.
- Prevent admins from silently changing or erasing the audit history.
- Support dual approval for especially destructive actions.
- Admins cannot grant themselves higher privileges through ordinary role controls.
- Provide moderation actions: warning, timeout, reduced limits, feature restriction, suspension, ban and appeal/review.

## 8. Proposed starting limits (not yet user-approved)

These are initial launch suggestions only. Admin can tune them after capacity and abuse testing:

| Setting | Proposed starting point |
|---|---:|
| Group members | 50 |
| Groups created per normal user | 5 |
| Message length | 5,000 characters |
| Voice message length | 3 minutes |
| Image attachment | 10 MB |
| Document attachment | 20 MB |
| Private voice call | 2 participants |
| Group voice room | 10 participants |
| Group voice session | 3 hours |
| Recording | Optional, unanimous consent |
| Recording retention | 7 days by default |
| New DM conversations | 100 per day |
| Group invite link | Configurable expiry and use cap |

These are product defaults, not guaranteed infrastructure capacity. Increase them only after measuring real performance and costs.

## 9. Realtime architecture and performance goals

Use separate systems for separate workloads:

- Persistent messages, memberships, roles, group metadata and audit records: database with strict access policies.
- Realtime chat, typing, presence and reactions: realtime messaging/WebSocket layer.
- Voice and group calls: WebRTC with an SFU for multi-participant rooms; TURN relay support for restrictive networks.
- Voice recording: explicit-consent capture and a controlled media-processing/storage pipeline.
- Video storage and delivery: object storage plus encoding and CDN/delivery services; object storage alone does not provide live ingest or transcoding.
- Scheduled cleanup: durable background jobs with retries, idempotency and observability.

Performance targets (targets, not guarantees):
- Chat/reaction delivery: aim under 500 ms in normal conditions.
- Typing indicators: aim under 300 ms.
- Voice connection setup: aim under 3 seconds where network conditions allow.
- Voice round-trip latency: aim under 300 ms for supported routes.
- Show reconnecting/degraded status instead of pretending a delayed event was instant.

No platform can promise literal zero delay across all devices, networks and countries. Measure latency percentiles and optimize the slowest regions and network paths.

## 10. Storage, quotas and cost controls

- Keep a global storage reserve for temporary uploads, processing and non-video assets.
- Reserve a configurable share of capacity for system operations rather than allocating every free GB to user uploads.
- Use signed direct uploads and quota reservations to avoid uncontrolled temporary files.
- Enforce per-user, per-role and platform-wide quotas.
- Delete temporary source copies after successful processing where safe.
- Avoid duplicate files for clips when a reference/manifest is sufficient.
- If a source video is due to expire but a saved Mini must survive, materialize and retain only the permitted independent clip asset.
- Track storage by bucket, content type, user, group and retention class.
- Track delivery requests, bandwidth, realtime connections, voice minutes, TURN relay usage, encoding failures and cleanup backlog.
- Notify Admin at configurable storage thresholds (suggested 70%, 85% and 95%).
- Apply backpressure when limits are reached: pause new uploads or reduce allowed sizes before the platform becomes unstable.

Free-tier quotas are not unlimited. Admin controls can tune application limits but cannot raise the actual limits of Supabase, R2, Vercel or any media/voice provider. Scaling beyond those ceilings requires a provider or architecture change.

## 11. Additional product ideas

### Community experience
- Scheduled events with RSVP and reminders.
- Group announcements and digest summaries.
- Community polls, quizzes and voting.
- Topic channels inside large groups.
- Shared resource/playlist collections.
- Creator office hours and Q&A rooms.
- Co-hosted events and creator collaborations.

### Social discovery
- Search across public users, creators, videos, Mini's, Moments, groups and public events.
- Suggested groups based on followed creators and chosen interests, with privacy controls.
- Public group directory with categories and moderation indicators.
- Invite-only discovery links for private groups.

### Personal controls and accessibility
- Per-group and per-creator notification settings.
- Quiet hours and notification bundles.
- Captions and accessible controls for media.
- Keyboard navigation, readable contrast and reduced-motion setting.
- Session/device management and suspicious-login notifications.
- User data export and account deletion workflows.

### Trust and safety
- Report/block/mute at user, message, group, room and media levels.
- Message requests and configurable contact permissions.
- Anti-spam rate limits and suspicious-activity detection.
- Moderator queue and appeal workflow.
- Group rules shown before joining.
- Clear copyright, consent and content ownership reporting paths.

## 12. Delivery phases

### Phase A — Foundations
- Data model for DMs, groups, memberships, roles, messages, reactions and retention policies.
- Row-level access controls and permission tests.
- Admin Rules Engine and audit log.
- Storage accounting and background cleanup queue.

### Phase B — Messaging and groups
- DMs, public/private groups, roles, invites, reactions, replies, pins, polls and moderation.
- Search, bookmarks, notifications and retention warnings.
- Archive/expiry flows and Shared Memories preservation.

### Phase C — Voice
- Private calls and group voice rooms.
- WebRTC/SFU/TURN integration.
- Participant moderation, reconnects and quality metrics.
- Optional consent-gated recording and retention.

### Phase D — Watch Together and events
- Synchronized playback for supported sources.
- Shared queue, voting, chat/reactions and optional voice.
- Scheduled events, RSVP and reminders.

### Phase E — Hardening and rollout
- Load tests for concurrent chat, rooms and voice participants.
- Cleanup and deletion verification tests.
- Security/privacy review, abuse tests and permission matrix.
- Cost dashboard and capacity alerts.
- Feature flags and staged preview rollout before any production release.

## 13. Acceptance checklist

- [ ] Public and private groups work with correct visibility and membership checks.
- [ ] Private voice calls and group voice rooms work on supported browsers/devices.
- [ ] Recording cannot start without explicit consent from all participants.
- [ ] Late joiners are not recorded before consenting.
- [ ] Admin can independently configure each quota, cooldown and retention category.
- [ ] Expired content becomes inaccessible even if physical deletion is still queued.
- [ ] Cleanup preview clearly lists what will be removed and what will be preserved.
- [ ] Shared Memories can be excluded from bulk cleanup.
- [ ] Chat history can be preserved while temporary media and session artefacts are cleared.
- [ ] Group expiry does not accidentally erase personal bookmarks or separately preserved memories.
- [ ] Every privileged action is auditable.
- [ ] Quotas are enforced server-side and cannot be bypassed by client requests.
- [ ] Load tests report latency and capacity instead of claiming zero delay.
- [ ] No production deployment or merge to `main` occurs without explicit approval.

---

**Planning note:** Items in sections 1 and 2 are confirmed direction. The starting limits in section 8 and technical targets in section 9 are proposals for validation, not promises or already-implemented behavior.

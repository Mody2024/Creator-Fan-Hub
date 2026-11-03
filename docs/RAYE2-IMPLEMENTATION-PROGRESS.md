# Raye2 implementation progress

## Source of truth
- Product plan: [RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md](RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md)
- Implementation branch: \`development\`
- Production/main: unchanged; no merge or deployment authorized.

## Progress snapshot — 2026-11-04
- Phase A — Foundations: **92%**
- Phase B — Messaging and groups: **92%**
- Phase C — Voice: **75%**
- Phase D — Watch Together: **88%**
- Phase E — Hardening: **0%**
- Overall plan completion: **approximately 69%**

Percentages reflect implemented and repository-verified scope. External service deployment, Supabase migration application, and live multi-device acceptance are not counted as complete.

## Current delivery status

### Phase A — Foundations
- [x] Private/public group and membership data model
- [x] Direct conversation and participant data model
- [x] Message, reaction and personal bookmark data model
- [x] Shared Memories model separated from ordinary message retention
- [x] Platform rules and independently configurable retention categories
- [x] Cleanup preview request model with explicit chat/memory preservation flags
- [x] Admin audit log designed as append-only
- [x] Membership-scoped RLS and guarded group/DM/invite/admin RPCs
- [x] Raye2 database migrations and contract tests committed to development (not yet applied to Supabase)
- [ ] Runtime RLS and RPC integration tests
- [x] Reuse existing account-blocking records in Raye2 DM discovery and conversation controls
- [x] Message/account reporting workflow with membership-checked submission
- [x] Owner/admin-gated UI for platform rules, retention policies, cleanup review requests, storage snapshots and audit history

### Phase B — Messaging and groups
- [x] Authenticated responsive Raye2 workspace with DM and group-chat interface
- [x] Replies, reactions, edit/delete windows and personal saved messages
- [x] Public member search and realtime message/group refresh foundation
- [x] Ephemeral online presence and typing indicators on active conversation channels
- [x] Secure participant-only read-receipt RPC and unread counter clearing
- [x] Durable direct/group notification preferences and in-app notification inbox with unread state
- [x] Per-group notification overrides and timezone-aware quiet hours (push delivery and notification bundles remain pending)
- [x] Message requests with incoming/outgoing pending states
- [x] Per-account opt-out for new message requests, enforced by database RPC
- [x] Conversation-scoped message search with bounded results
- [x] Pinned messages with direct-member and group-manager permissions
- [x] User block controls and message/account reporting submission path
- [x] Public group discovery, private/public group creation and public joining
- [x] Private invite link backend with hashed tokens, expiry/use limits and revocation
- [x] Invite acceptance route with sign-in continuation preserving the token
- [x] Shared Memories message-saving backend and workspace view
- [x] Private join-request backend with manager approval/decline RPCs
- [x] Audited group role-change and member-removal RPCs
- [x] Join-request approval/decline inbox and member role/removal controls
- [x] Shared-memory expiry warnings, permanent-preservation and pin controls
- [x] Per-group Shared Memories contribution/export policies enforced by RLS and guarded RPCs
- [x] Member-authorized JSON metadata export with expiry filtering (media files remain external and are not copied)

### Phase C — Voice
- [x] Private-call and group-room session control plane (database schema, membership, invitations, join/decline/leave, expiry)
- [x] Group-room lock, host/co-host transfer and moderator actions
- [x] Recording-off defaults and unanimous consent state machine, including late-joiner consent reset and stop-on-decline/withdrawal
- [x] Participant-scoped private Realtime signaling authorization policies
- [x] Voice control-plane contract tests
- [x] Browser-to-browser WebRTC audio negotiation, microphone permission on explicit call action, mute, remote audio and peer-identity-checked signaling
- [x] Incoming private-call invitations surface across conversations, with caller identity and accept/decline controls
- [x] Audio input/output device selection where browser support allows, microphone switching, and measured RTT/packet-loss quality status
- [x] Member-controlled private-call opt-out, enforced by a database trigger on both invitation and acceptance
- [x] Private-call TURN credential endpoint with short-lived HMAC credentials and participant-scoped authorization
- [ ] Configure/deploy TURN relay and verify restrictive network paths
- [x] LiveKit SFU integration path: group-room discovery/start RPC, joined-member token endpoint, short-lived room-scoped grants and browser room client
- [x] Group voice participant roster, room lock/unlock, and moderator-authorized removal wired through the LiveKit room service
- [ ] LiveKit server deployment/credentials, live multi-user acceptance, remote mute and role-promotion controls
- [ ] Reconnection, ICE restart and quality telemetry
- [ ] Consent-gated recording media pipeline, storage access and retention

### Phase D — Watch Together
- [x] Watch session, participant, shared queue and vote data model with RLS
- [x] Native published-video and HTTPS YouTube/Vimeo source validation
- [x] Session create/join/leave, host playback versioning, queue voting/advance/reorder/remove RPCs
- [x] Realtime publication and participant-scoped room broadcast authorization
- [x] Group-chat Watch Together panel for published Raye2-hosted video sessions
- [x] Host playback controls with persisted position/version and guest resynchronization through Realtime
- [x] Shared queue UI for adding videos, voting and host advancement
- [ ] Private invite links, public external-player embeds/synchronization, in-room reactions/polls, scheduled sessions and live acceptance


### Phase E — Hardening
- [ ] Cleanup worker and physical object deletion
- [ ] Capacity/load tests, security review and cost dashboard
- [ ] Preview acceptance and owner approval

Percentages are based on implemented and verified repository work, not on planned scope.

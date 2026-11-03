# Raye2 implementation progress

## Source of truth
- Product plan: [RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md](RAYE2-COMMUNITY-CHAT-VOICE-PLAN.md)
- Implementation branch: \`development\`
- Production/main: unchanged; no merge or deployment authorized.

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
- [x] Initial database migration and contract tests committed to development (not yet applied to Supabase)
- [ ] Runtime RLS and RPC integration tests
- [ ] Admin UI for rules, retention and cleanup previews

### Phase B — Messaging and groups
- [x] Authenticated responsive Raye2 workspace with DM and group-chat interface
- [x] Replies, reactions, edit/delete windows and personal saved messages
- [x] Public member search and realtime message/group refresh foundation
- [ ] Presence, typing, delivery/read states and notifications
- [x] Public group discovery, private/public group creation and public joining
- [ ] Private invite links, join requests and moderation
- [ ] Shared Memories interface and expiry warnings

### Phase C — Voice
- [ ] Private WebRTC calls
- [ ] Group voice rooms and participant moderation
- [ ] Reconnection and quality telemetry
- [ ] Recording consent state machine and recording pipeline

### Phase D — Watch Together and events
- [ ] Synchronized native/external player sessions
- [ ] Queue, voting, room chat/reactions and optional voice
- [ ] Scheduling, RSVP and reminders

### Phase E — Hardening
- [ ] Cleanup worker and physical object deletion
- [ ] Capacity/load tests, security review and cost dashboard
- [ ] Preview acceptance and owner approval

Percentages are based on implemented and verified repository work, not on planned scope.

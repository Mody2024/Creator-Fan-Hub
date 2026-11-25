// Raye2 Launch 1.0 (Communication Edition) — design reference for what each feature looks like at launch.
// The feature matrix documents launch status. LAUNCH_MEDIA_VISIBLE is also the member-facing home/search switch; server route gates separately enforce admin access. Implementation status is stated
// honestly: "available" = exists in the app today; "new-design" = designed, still needs building; "coming-soon" =
// preserved media feature shown as unavailable to members; "admin-only" = reachable only by administrators.
export type LaunchStatus = "available" | "new-design" | "coming-soon" | "admin-only";

export type LaunchFeature = { id: string; area: string; label: string; status: LaunchStatus; note?: string };

export const LAUNCH_FEATURES: LaunchFeature[] = [
  // Messaging
  { id: "dm", area: "Messaging", label: "Direct messages", status: "available" },
  { id: "group-chat", area: "Messaging", label: "Group conversations", status: "available" },
  { id: "reply-react-mention", area: "Messaging", label: "Replies, reactions, mentions", status: "available", note: "Confirm each against the current chat client." },
  { id: "threads", area: "Messaging", label: "Threads", status: "new-design" },
  { id: "edit-delete-pin", area: "Messaging", label: "Edit, delete, pin, bookmark", status: "new-design" },
  { id: "attachments", area: "Messaging", label: "Images and file attachments", status: "new-design", note: "Images compressed; quotas set in Admin." },
  { id: "voice-messages", area: "Messaging", label: "Voice messages", status: "new-design", note: "Where supported by the browser." },
  { id: "search", area: "Messaging", label: "Searchable history", status: "new-design" },
  // Communities and groups
  { id: "groups-browse", area: "Groups", label: "Browse and open groups", status: "available" },
  { id: "group-create", area: "Groups", label: "Members create their own groups", status: "new-design" },
  { id: "group-identity", area: "Groups", label: "Icon, banner, colors, welcome, onboarding", status: "new-design" },
  { id: "roles", area: "Groups", label: "Roles, hierarchy, permissions, ownership transfer", status: "new-design" },
  { id: "rooms", area: "Groups", label: "Rooms: text, voice, announcement, forum, private, temporary", status: "new-design" },
  // Voice
  { id: "voice", area: "Voice", label: "Voice calls and group voice", status: "available" },
  { id: "stage", area: "Voice", label: "Stage rooms, hand raising, speaker queue, scheduling", status: "new-design" },
  { id: "screen-share", area: "Voice", label: "Screen sharing (live only, never stored)", status: "new-design", note: "Browser support varies; see limitations." },
  // Polls
  { id: "polls-basic", area: "Polls", label: "Polls and voting", status: "available" },
  { id: "polls-pro", area: "Polls", label: "Image choices, multi-select, deadlines, live results, permissions", status: "new-design" },
  // Administration
  { id: "invites-redeem", area: "Invitations", label: "Redeem an invitation link", status: "available" },
  { id: "invites-admin", area: "Invitations", label: "Invitation management dashboard", status: "new-design" },
  { id: "storage-admin", area: "Admin", label: "Storage, limits, retention and cleanup controls", status: "new-design", note: "Retention rules already in the product are preserved." },
  { id: "admin-panel", area: "Admin", label: "Admin panel", status: "admin-only" },
  // Beyond Discord (concepts)
  { id: "workspaces", area: "Beyond", label: "Shared notes, docs, links, resources", status: "new-design" },
  { id: "tasks", area: "Beyond", label: "Task boards and deadlines", status: "new-design" },
  { id: "events", area: "Beyond", label: "Events, calendar, reminders", status: "available", note: "Events page exists; calendar and reminders are new design." },
  { id: "identity", area: "Beyond", label: "Badges and achievements", status: "new-design" },
  { id: "smart", area: "Beyond", label: "Translation, summaries, optional AI assistance", status: "new-design" },
  // Preserved media platform
  { id: "watch", area: "Media", label: "Video uploads and playback", status: "coming-soon" },
  { id: "minis", area: "Media", label: "Mini's", status: "coming-soon" },
  { id: "moments", area: "Media", label: "Moments", status: "coming-soon" },
  { id: "clips", area: "Media", label: "Clips", status: "coming-soon" },
  { id: "live", area: "Media", label: "Streaming", status: "coming-soon" },
  { id: "series", area: "Media", label: "Series and exclusives", status: "coming-soon" }
];

// Launch 1.0 design: media surfaces (video grid, Mini's tab, "every format" promo) are hidden from the member home.
// The full-platform design (tag design/full-platform-v1) keeps all of them.
export const LAUNCH_MEDIA_VISIBLE = false;

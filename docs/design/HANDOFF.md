# Raye2 redesign — handoff

Read this first. It tells you where everything is, how to work safely, and exactly what is left.
**Never put tokens or secrets in the repo or in chat.** Use your own GitHub access.

## 1. What exists (branches and tags)
| Name | What it is | Rule |
|---|---|---|
| tag `design/full-platform-v1` / branch `design/full-platform` | **Raye2 — Full Platform Design** (complete redesign incl. media) | Preserved. Do not modify. |
| branch `redesign/chalk-shell` (PR #2) | Working branch the full design was built on | Frozen reference. |
| branch `design/launch-1.0` (PR #4) | **Raye2 — Launch 1.0 (Communication Edition)**, independent duplicate | **Work here.** |
| `development`, `main` | Product branches | Do not touch (repo rule: AGENTS.md says work on `development`; `main` is production). Open PRs only. |

Scope of the whole job is **DESIGN ONLY**: no backend, database, auth, API or production changes, no deploys.
Brief in short: launch is communication-first (messaging, groups, roles, rooms, voice, screen share, polls, invite-only admin), lightweight (~30 users, ~2 GB storage), PWA-installable. Media (video, Mini's, Moments, Clips, Live, Series) stays preserved and shows **Coming Soon** to members; admins keep everything. Do not copy Discord; use Discord and WhatsApp only as references.

## 2. Design system (do not break)
- Palette is enforced by `tests/raye2-palette-purity.test.mjs`: `#0b0b0d #141416 #1c1c1f #242427 #2f6fe0 #4d8df6 #9dc0ff #a1a1aa #f4f4f6` (+ rgba). One dark theme only.
- Font: chalk handwriting everywhere (`--raye2-font-chalk` = Playpen Sans Arabic first); inputs, tables, code use `--raye2-font-clean`. Never letter-space or uppercase Arabic (`raye2-chalk.css` already forbids it).
- Brand: smiley mark + hand-lettered wordmark images in `public/brand/` (`raye2-wordmark-en.png`, `raye2-wordmark-ar.png`). Wordmarks must stay **images**, never live text (tests enforce it). A creator-uploaded logo overrides the smiley via `BrandProvider`.
- Type: nothing under 12px; body 16px. Icons: `shell-icons.tsx` (one inline-SVG family).
- Language lives **only in account settings**; first visit follows browser language (`locale-bootstrap.tsx`). Every string needs EN and AR.
- CSS load order (last wins): `globals.css`, `raye2-design-system.css`, `raye2/raye2-brand-system.css`, `raye2-polish.css`, `raye2-shell/raye2-shell.css`, `raye2-shell/raye2-chalk.css`.
- CSS modules (`raye2.module.css`, etc.) need at least one local class in every selector; put global selectors in `raye2-shell.css`.

## 3. Architecture added by the redesign (`src/app/raye2-shell/`)
`shell-top.tsx` top bar · `shell-rail.tsx` side menu (launch map: MAIN / PERSONAL / SOON) · `bottom-nav.tsx` phone bar · `bottom-sheet.tsx` / `shell-menu.tsx` sheets and dropdowns (with exit animations) · `shell-frame.tsx` + one tiny `layout.tsx` per section (clips, events, groups, search, u, account, watch, ...) wrapping pages in top bar + rail · `coming-soon.tsx` (screen + `ComingSoonGate`) · `workspace-shell.tsx` / `workspace-chrome.tsx` creator workspace chrome (`data-raye2-ws="on"` on main) · `auth-brand.tsx` sign-in/invite brand · `nav-progress.tsx` tap feedback · `brand-context.tsx` · `shell-data.ts` string table + menus.
Other: `src/lib/launch-features.ts` (feature status matrix, `LAUNCH_MEDIA_VISIBLE`), `src/lib/localized-copy.ts` (shows owner copy only in the page language, splits "EN · AR"), `docs/design/launch-1.0.md` (availability + implementation list), `public/design/launch-1.0/index.html` (static design reference for screens that do not exist yet).
Body attributes used by CSS: `data-raye2-bottomnav="on"`, `data-raye2-thread="open"` (set by chat while a conversation is open), `html[data-raye2-nav]` (navigation in progress).

## 4. How to work and verify
```
npm ci
npx tsc --noEmit && npm run lint && npm test && npm run build
```
Baseline: **5 tests fail on untouched `development` too** (117 admin dashboard, 139 brand/loading state, 496 palette, 668 single theme, 960 public surface). Any new failure is yours. `scripts/validate-static-site.mjs` also crashes on a missing `loading.tsx` (pre-existing). Many tests assert exact CSS/markup strings: update them deliberately, keeping their intent.
Look at real pixels, do not guess: `npm i @sparticuz/chromium puppeteer-core` in a scratch folder, run `next start`, screenshot at 390x844 and 1366x800, English and Arabic (set cookie `raye2_locale=ar`). Start the server and take screenshots in the same shell command, and let `next build` finish before starting.
Vercel Preview has **no Supabase env vars**, so previews show empty or "not configured" states. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for the Preview environment (ideally a separate test project) to see real data.

## 5. What is left (priority order)
**A. Verify with a real signed-in session (not possible in my sandbox)**
1. Chat (`src/app/raye2/raye2-client.tsx`, `raye2.module.css` "Launch 1.0 chat layer"): group rail, chat list, filter chips, one-pane phone flow, bubbles, day dividers, grouped messages, hover/tap actions, composer. Compiles and passes tests but was never seen rendered.
2. Arabic on chat, account settings, creator workspace, admin and invite pages.
3. Real-data states: polls, events, groups lists, notifications, saved (all showed empty states in previews).

**B. Chat completion**
4. Right-hand member/details panel; room (channel) list inside a group; thread side panel; edit/pin/bookmark UI inside the new bubbles; restyle voice controls, manage-group modal, in-chat polls (fonts were scaled up but not reviewed).

**C. Launch screens that are design reference only (need real components)**
5. Create group (3 steps), roles and permissions, rooms and categories, stage voice room, screen share, professional polls (image choices, multi-select, deadlines, live results), invitation management, storage/limits/retention admin, calendar and reminders, shared notes/docs/tasks, badges, translation/summaries. See `public/design/launch-1.0/index.html` and `docs/design/launch-1.0.md`. Build them with the existing shell components and keep the status table honest.
6. Admin panel: only the top bar was redesigned; its section tabs and content are not. Creator workspace modules are still one long stacked page (only the chrome is new).

**D. Wiring and polish**
7. `ComingSoonGate` needs `adminBypass` connected to the existing admin check; launch preview currently shows Coming Soon to everyone.
8. Launch search page still shows the "Videos" filter chip and section.
9. PWA: no manifest or service worker yet. Accessibility audit (contrast, focus order, screen-reader labels). 37 lint warnings (unused vars). Fix or consciously rebaseline the 5 old tests and the validator.
10. Full-platform only: Shorts viewer header, watch-detail Arabic, chat floating composer polish.

## 6. Gotchas
- Section layouts must not call auth on routes outside the middleware session-refresh matcher (`tests/raye2-session-refresh-coverage.test.mjs`); the top bar detects the member in the browser instead.
- Do not add a text wordmark, a light theme, or colors outside the palette.
- Keep `className="dashboard-shell raye2-creator-shell"` strings intact (tests); the layout hook is `data-raye2-ws`.

import type { SVGProps } from "react";

// One icon family for the whole shell: 24px grid, round caps, slightly loose strokes so it reads as
// chalk-drawn rather than corporate-geometric. Inline SVG: no dependency, identical on every device.
export type ShellIconName =
  | "home" | "watch" | "plus" | "community" | "user" | "shorts" | "search" | "bell" | "bookmark"
  | "studio" | "upload" | "more" | "clips" | "series" | "hash" | "logout" | "mini" | "moment" | "live" | "post" | "settings" | "language" | "close" | "chat";

const PATHS: Record<ShellIconName, string> = {
  home: "M3.5 11.2 12 4l8.5 7.2M5.8 9.6V19a1 1 0 0 0 1 1h3.4v-5.2h3.6V20h3.4a1 1 0 0 0 1-1V9.6",
  watch: "M4 6.5A1.5 1.5 0 0 1 5.5 5h13A1.5 1.5 0 0 1 20 6.5v8a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 14.5zM10 8.6l4.6 2.4L10 13.4zM8 19.5h8",
  plus: "M12 5v14M5 12h14",
  community: "M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2.8 19a5.7 5.7 0 0 1 11.4 0M16 5.4a3 3 0 0 1 0 5.6M17.2 13.6A5.7 5.7 0 0 1 21.2 19",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM4.5 20a7.5 7.5 0 0 1 15 0",
  shorts: "M8 3.5h8a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2v-13a2 2 0 0 1 2-2ZM10.4 9.2l4 2.3-4 2.3z",
  search: "M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6ZM16 16l4.4 4.4",
  bell: "M6.2 16.5V11a5.8 5.8 0 0 1 11.6 0v5.5l1.4 1.5H4.8zM10 20.2a2.2 2.2 0 0 0 4 0",
  bookmark: "M6.5 4.5A1.5 1.5 0 0 1 8 3h8a1.5 1.5 0 0 1 1.5 1.5V21L12 17.2 6.5 21z",
  studio: "M12 3.5l1.9 4.6 4.9.4-3.7 3.2 1.1 4.8L12 14l-4.2 2.5 1.1-4.8L5.2 8.5l4.9-.4z",
  upload: "M12 16V5M7.5 9.2 12 4.7l4.5 4.5M5 15v3.2a1.8 1.8 0 0 0 1.8 1.8h10.4a1.8 1.8 0 0 0 1.8-1.8V15",
  mini: "M7 4.5h10v15H7zM11 9v6M9 12h4",
  moment: "M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17ZM12 7.5V12l3 2",
  live: "M12 13.2a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2ZM8.2 15.8a5.4 5.4 0 0 1 0-7.6M15.8 8.2a5.4 5.4 0 0 1 0 7.6M5.4 18.6a9.4 9.4 0 0 1 0-13.2M18.6 5.4a9.4 9.4 0 0 1 0 13.2",
  post: "M5 19l.9-3.6L16.6 4.7a1.6 1.6 0 0 1 2.3 0l.4.4a1.6 1.6 0 0 1 0 2.3L8.6 18.1zM14.6 6.7l2.7 2.7",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM19 12a7 7 0 0 0-.1-1.2l1.8-1.4-1.8-3.1-2.1.8a7 7 0 0 0-2-1.2L14.5 3h-3.6l-.3 2.9a7 7 0 0 0-2 1.2l-2.1-.8-1.8 3.1 1.8 1.4a7 7 0 0 0 0 2.4l-1.8 1.4 1.8 3.1 2.1-.8a7 7 0 0 0 2 1.2l.3 2.9h3.6l.3-2.9a7 7 0 0 0 2-1.2l2.1.8 1.8-3.1-1.8-1.4c.1-.4.1-.8.1-1.2Z",
  language: "M3.5 12a8.5 8.5 0 1 0 17 0 8.5 8.5 0 0 0-17 0ZM3.8 9.5h16.4M3.8 14.5h16.4M12 3.5c2.4 2.4 3.4 5.2 3.4 8.5s-1 6.1-3.4 8.5c-2.4-2.4-3.4-5.2-3.4-8.5s1-6.1 3.4-8.5Z",
  close: "M6 6l12 12M18 6 6 18",
  more: "M5.5 12h.01M12 12h.01M18.5 12h.01",
  clips: "M6.2 8.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8ZM6.2 20.4a2.4 2.4 0 1 0 0-4.8 2.4 2.4 0 0 0 0 4.8ZM8 7l12 9.5M8 17l5-3.9M13.6 10.2 20 5.6",
  series: "M5 7.5h14M7.5 4h9M4.5 11h15a1 1 0 0 1 1 1v6.5a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1V12a1 1 0 0 1 1-1Z",
  hash: "M9.5 4 7.5 20M16.5 4l-2 16M4.5 9h16M3.5 15h16",
  logout: "M10 4.5H6.5A1.5 1.5 0 0 0 5 6v12a1.5 1.5 0 0 0 1.5 1.5H10M15 8l4 4-4 4M19 12H9.5",
  chat: "M5 5.5h14a1.5 1.5 0 0 1 1.5 1.5v8.5A1.5 1.5 0 0 1 19 17h-8l-4.5 3.5V17H5a1.5 1.5 0 0 1-1.5-1.5V7A1.5 1.5 0 0 1 5 5.5Z"
};

export default function ShellIcon({ name, size = 24, ...rest }: { name: ShellIconName; size?: number } & Omit<SVGProps<SVGSVGElement>, "name">) {
  return (
    <svg className="raye2-shell-icon" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}

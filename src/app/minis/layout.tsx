import type { ReactNode } from "react";
import ShellFrame from "@/app/raye2-shell/shell-frame";
import { ComingSoonGate } from "@/app/raye2-shell/coming-soon";

// Launch 1.0: media is preserved but unavailable to members (administrators keep access in the real product).
export default function Layout({ children }: { children: ReactNode }) {
  return <ShellFrame><ComingSoonGate feature="minis">{children}</ComingSoonGate></ShellFrame>;
}

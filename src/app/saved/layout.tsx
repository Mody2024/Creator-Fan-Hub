import type { ReactNode } from "react";
import ShellFrame from "@/app/raye2-shell/shell-frame";

export default function Layout({ children }: { children: ReactNode }) {
  return <ShellFrame>{children}</ShellFrame>;
}

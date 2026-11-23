import { cookies } from "next/headers";
import WorkspaceChrome from "./workspace-chrome";

/** Server wrapper: reads the language once and hands the role-aware chrome to the client. */
export default async function WorkspaceShell({ role }: { role: string }) {
  const locale = (await cookies()).get("raye2_locale")?.value === "ar" ? "ar" : "en";
  return <WorkspaceChrome locale={locale} role={role} />;
}

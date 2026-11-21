import Link from "next/link";
import type { ReactNode } from "react";
import { SHELL_T, type ShellLocale } from "./shell-data";

/**
 * Raye2 identity: the chalk smiley (or a creator-uploaded logo override) plus the hand-lettered wordmark,
 * "Raye2" in English and the Arabic lettering in Arabic. Both wordmarks are images, never live text.
 */
export default function ShellBrand({ locale, mark }: { locale: ShellLocale; mark?: ReactNode }) {
  const ar = locale === "ar";
  return (
    <Link className="raye2-shell-brand" href="/" aria-label={SHELL_T[locale].brand}>
      {mark ?? <img className="raye2-brand-mark" src="/brand/raye2-mark.png" alt="" width={38} height={38} />}
      <img
        className="raye2-brand-word"
        src={ar ? "/brand/raye2-wordmark-ar.png" : "/brand/raye2-wordmark-en.png"}
        alt=""
        width={ar ? 64 : 76}
        height={ar ? 30 : 30}
      />
    </Link>
  );
}

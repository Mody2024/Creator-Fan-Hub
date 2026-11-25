"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useBrandLogo } from "./brand-context";

/** Centered identity for sign-in and invite screens: smiley above the hand-lettered wordmark (EN or AR). */
export default function AuthBrand({ href = "/" }: { href?: string }) {
  const uploaded = useBrandLogo();
  const [arabic, setArabic] = useState(false);
  useEffect(() => { setArabic(/(?:^|; )raye2_locale=ar(?:;|$)/.test(document.cookie)); }, []);
  return (
    <Link className="raye2-auth-brand" href={href} aria-label="Raye2">
      {uploaded ? <img className="site-logo-image raye2-auth-mark" src={uploaded} alt="" /> : <img className="raye2-auth-mark" src="/brand/raye2-mark.png" alt="" width={72} height={72} />}
      <img className="raye2-auth-word" src={arabic ? "/brand/raye2-wordmark-ar.png" : "/brand/raye2-wordmark-en.png"} alt="" height={34} />
    </Link>
  );
}

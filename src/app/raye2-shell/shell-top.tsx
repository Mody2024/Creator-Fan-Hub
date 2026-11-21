"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import ShellIcon from "./shell-icons";
import ShellMenu from "./shell-menu";
import LanguageSwitch from "@/app/language-switch";
import { SHELL_T, createItemsFor, type ShellLocale } from "./shell-data";

/** Sticky glass top bar: uploaded logo (the only brand mark), search pill, Create menu, notifications, Join. */
export default function ShellTopBar({ locale, brand }: { locale: ShellLocale; brand?: ReactNode }) {
  const t = SHELL_T[locale];
  return (
    <header className="raye2-shell-top">
      <Link className="raye2-shell-brand" href="/" aria-label={t.brand}>
        {brand}
      </Link>
      <form className="raye2-shell-search" action="/search" role="search">
        <ShellIcon name="search" size={20} />
        <input type="search" name="q" placeholder={t.search} aria-label={t.search} maxLength={80} />
      </form>
      <div className="raye2-shell-actions">
        <Link className="raye2-shell-iconbtn raye2-shell-search-link" href="/search" aria-label={t.search}><ShellIcon name="search" size={22} /></Link>
        <ShellMenu label={t.create} icon="plus" items={createItemsFor(locale)} />
        <Link className="raye2-shell-iconbtn" href="/notifications" aria-label={t.notifications}><ShellIcon name="bell" size={22} /></Link>
        <span className="raye2-shell-lang"><LanguageSwitch initialLocale={locale} variant="header" /></span>
        <Link className="raye2-shell-join" href="/community#join">{t.join}</Link>
      </div>
    </header>
  );
}

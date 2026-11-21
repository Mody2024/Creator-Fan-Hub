"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import ShellIcon from "./shell-icons";
import ShellMenu from "./shell-menu";
import ShellBrand from "./shell-brand";
import { SHELL_T, createItemsFor, type ShellLocale } from "./shell-data";

/** Sticky glass top bar: smiley mark + hand-lettered wordmark, search pill, Create menu, notifications, Join. */
export default function ShellTopBar({ locale, mark }: { locale: ShellLocale; mark?: ReactNode }) {
  const t = SHELL_T[locale];
  return (
    <header className="raye2-shell-top">
      <ShellBrand locale={locale} mark={mark} />
      <form className="raye2-shell-search" action="/search" role="search">
        <ShellIcon name="search" size={20} />
        <input type="search" name="q" placeholder={t.search} aria-label={t.search} maxLength={80} />
      </form>
      <div className="raye2-shell-actions">
        <Link className="raye2-shell-iconbtn raye2-shell-search-link" href="/search" aria-label={t.search}><ShellIcon name="search" size={22} /></Link>
        <ShellMenu label={t.create} icon="plus" items={createItemsFor(locale)} />
        <Link className="raye2-shell-iconbtn" href="/notifications" aria-label={t.notifications}><ShellIcon name="bell" size={22} /></Link>
        <Link className="raye2-shell-join" href="/community#join">{t.join}</Link>
      </div>
    </header>
  );
}

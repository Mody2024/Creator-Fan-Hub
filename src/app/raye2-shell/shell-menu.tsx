"use client";

import Link from "next/link";
import { useEffect, useId, useRef, useState } from "react";
import ShellIcon, { type ShellIconName } from "./shell-icons";
import type { MenuItem } from "./shell-data";

/**
 * Desktop popover menu (the phone equivalent is BottomSheet). Arrow keys move between items,
 * Home/End jump, Esc closes and returns focus to the trigger, and an outside press closes it.
 */
export default function ShellMenu({ label, icon, items }: { label: string; icon: ShellIconName; items: MenuItem[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  useEffect(() => {
    if (!open) return;
    root.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    function onPointer(event: PointerEvent) {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      const links = Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
      const index = links.indexOf(document.activeElement as HTMLElement);
      if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
      else if (event.key === "ArrowDown") { event.preventDefault(); links[(index + 1) % links.length]?.focus(); }
      else if (event.key === "ArrowUp") { event.preventDefault(); links[(index - 1 + links.length) % links.length]?.focus(); }
      else if (event.key === "Home") { event.preventDefault(); links[0]?.focus(); }
      else if (event.key === "End") { event.preventDefault(); links[links.length - 1]?.focus(); }
      else if (event.key === "Tab") setOpen(false);
    }
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onPointer); document.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <div className="raye2-menu" ref={root}>
      <button ref={trigger} type="button" className="raye2-shell-create" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? menuId : undefined} onClick={() => setOpen(value => !value)}>
        <ShellIcon name={icon} size={20} strokeWidth={2.2} /><span>{label}</span>
      </button>
      {open ? (
        <div className="raye2-menu-panel" id={menuId} role="menu" aria-label={label}>
          {items.map(item => (
            <Link key={item.href + item.label} href={item.href} role="menuitem" className="raye2-menu-item" onClick={() => setOpen(false)}>
              <span className="raye2-menu-item-icon"><ShellIcon name={item.icon} size={20} /></span>
              <span className="raye2-sheet-row-text"><strong>{item.label}</strong>{item.hint ? <small>{item.hint}</small> : null}</span>
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}

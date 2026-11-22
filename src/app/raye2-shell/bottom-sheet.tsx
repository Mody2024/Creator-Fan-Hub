"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import ShellIcon from "./shell-icons";

type Props = { open: boolean; onClose: () => void; title: string; closeLabel: string; children: ReactNode };

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Modal bottom sheet: focus moves in on open and returns on close, Tab is trapped, Esc and the
 * backdrop close it, background scroll is locked, and dragging the handle down dismisses it.
 */
export default function BottomSheet({ open, onClose, title, closeLabel, children }: Props) {
  const sheetRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<HTMLElement | null>(null);
  const dragStart = useRef<number | null>(null);
  const [dragY, setDragY] = useState(0);
  const [mounted, setMounted] = useState(open);
  const [closing, setClosing] = useState(false);
  const wasMounted = useRef(open);

  // Keep the sheet in the DOM for the exit animation, then unmount it.
  useEffect(() => {
    if (open) { wasMounted.current = true; setMounted(true); setClosing(false); return; }
    if (!wasMounted.current) return;
    setClosing(true);
    const timer = window.setTimeout(() => { wasMounted.current = false; setMounted(false); setClosing(false); }, 220);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    returnFocus.current = document.activeElement as HTMLElement | null;
    const sheet = sheetRef.current;
    const first = sheet?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? sheet)?.focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.key !== "Tab" || !sheet) return;
      const items = Array.from(sheet.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!items.length) return;
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) { event.preventDefault(); lastItem.focus(); }
      else if (!event.shiftKey && document.activeElement === lastItem) { event.preventDefault(); firstItem.focus(); }
    }
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      returnFocus.current?.focus?.();
    };
  }, [open, onClose]);

  if (!mounted) return null;

  return (
    <div className="raye2-sheet-layer" data-closing={closing ? "true" : "false"} data-dragging={dragStart.current !== null ? "true" : "false"}>
      <button type="button" className="raye2-sheet-backdrop" aria-label={closeLabel} tabIndex={-1} onClick={onClose} />
      <div
        ref={sheetRef}
        className="raye2-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        style={dragY ? { transform: `translateY(${dragY}px)`, transition: "none" } : undefined}
      >
        <div
          className="raye2-sheet-grab"
          onPointerDown={event => { dragStart.current = event.clientY; event.currentTarget.setPointerCapture(event.pointerId); }}
          onPointerMove={event => { if (dragStart.current !== null) setDragY(Math.max(0, event.clientY - dragStart.current)); }}
          onPointerUp={() => { const shouldClose = dragY > 90; dragStart.current = null; setDragY(0); if (shouldClose) onClose(); }}
          onPointerCancel={() => { dragStart.current = null; setDragY(0); }}
        >
          <span className="raye2-sheet-handle" aria-hidden="true" />
        </div>
        <header className="raye2-sheet-head">
          <h2>{title}</h2>
          <button type="button" className="raye2-sheet-close" onClick={onClose} aria-label={closeLabel}><ShellIcon name="close" size={20} /></button>
        </header>
        <div className="raye2-sheet-body">{children}</div>
      </div>
    </div>
  );
}

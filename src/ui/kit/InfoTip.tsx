"use client";
/**
 * A small ⓘ beside a label that holds the full sentence the label's short line leaves out. It opens on hover,
 * on keyboard focus and on a tap (touch has no hover), and closes on Escape, on leaving or on a tap outside.
 */
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconInfo } from "./icons";
import { cn } from "../cn";

export function InfoTip({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", esc); };
  }, [open]);
  return (
    <span ref={ref} className={cn("relative inline-flex shrink-0", className)} onMouseEnter={() => setOpen(true)} onMouseLeave={() => setOpen(false)}>
      {/* the glyph is 14px; the invisible ring around it makes the tap target 44px */}
      <button type="button" aria-label={label} aria-describedby={open ? id : undefined} onClick={() => setOpen((o) => !o)} onFocus={() => setOpen(true)} onBlur={() => setOpen(false)}
        className="relative flex size-4 cursor-help items-center justify-center rounded-full text-gray-500 transition-colors hover:text-brand-palette-600 focus-visible:text-brand-palette-600 after:absolute after:-inset-3.5 after:content-['']">
        <IconInfo size={14} />
      </button>
      {open && (
        <span id={id} role="tooltip" className="absolute -left-2 top-full z-30 mt-2 w-max max-w-60 rounded-xl bg-gray-900 px-3 py-2 text-xs font-normal leading-relaxed text-white shadow-lg">
          {children}
        </span>
      )}
    </span>
  );
}

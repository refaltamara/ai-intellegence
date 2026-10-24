"use client";
/**
 * The side sheet (DESIGN.md 6.2 Drawer): it slides over the page from the right, Escape and the backdrop close
 * it, focus goes in and stays inside, and returns to the button that opened it. Header and footer sit on grey;
 * the body scrolls between them.
 */
import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { IconClose } from "./icons";

const FOCUSABLE = "button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";

export function Drawer({ open, title, onClose, children, footer, wide }: { open: boolean; title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const titleId = useId();
  const box = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    if (!open) return;
    const back = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    const onKey = (e: KeyboardEvent) => {
      // a dialog opened from the drawer (a confirm) sits on top and owns the keys until it closes
      const dialogs = document.querySelectorAll('[role="dialog"][aria-modal="true"]');
      if (dialogs[dialogs.length - 1] !== box.current) return;
      // a select list or calendar opened inside the drawer closes first
      if (e.key === "Escape" && !document.querySelector("[data-dropdown-portal]")) { e.preventDefault(); close.current(); return; }
      if (e.key !== "Tab" || !box.current) return;
      const all = Array.from(box.current.querySelectorAll<HTMLElement>(FOCUSABLE));
      if (!all.length) return;
      const at = all.indexOf(document.activeElement as HTMLElement);
      if (e.shiftKey && at <= 0) { e.preventDefault(); all[all.length - 1].focus(); }
      else if (!e.shiftKey && at === all.length - 1) { e.preventDefault(); all[0].focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("keydown", onKey); back?.focus?.(); };
  }, [open]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div data-tw className="fixed inset-0 z-50 font-sans text-[#1C1C1C]">
      <div aria-hidden="true" className="absolute inset-0 bg-black/30" onMouseDown={onClose} />
      <div ref={box} role="dialog" aria-modal="true" aria-labelledby={titleId}
        className={cn("absolute inset-y-0 right-0 flex w-full flex-col border-0 border-l border-gray-200 bg-white shadow-2xl", wide ? "sm:w-160" : "sm:w-105")}>
        <div className="flex items-center justify-between gap-3 border-0 border-b border-gray-200 bg-gray-50 px-5 py-3">
          <h2 id={titleId} className="text-lg font-semibold leading-tight text-gray-900">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="grid h-10 w-10 cursor-pointer place-items-center rounded-xl text-gray-600 hover:bg-gray-100 hover:text-gray-900 max-md:h-11 max-md:w-11">
            <IconClose size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-5 py-4 text-sm text-gray-700">{children}</div>
        {footer && <div className="flex flex-wrap items-center justify-end gap-2 border-0 border-t border-gray-200 bg-gray-50 px-5 py-3">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

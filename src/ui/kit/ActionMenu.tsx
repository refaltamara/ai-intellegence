"use client";
/**
 * The "more actions" menu on a row or a page (DESIGN.md 6.2, after the agency dashboard's action-menu):
 * a three-dot button whose list is portalled to the body so a table's overflow never clips it. It opens
 * below the button, or above when there is no room. Focus moves into it, arrows move, Escape returns
 * focus to the button, a click outside or a scroll closes it. Picking an item puts focus back on the button
 * first, so a dialog the item opens returns focus there instead of to a row that is gone.
 */
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { cn } from "../cn";
import { IconMore } from "./icons";

export type ActionItem = { key: string; label: string; onSelect: () => void; danger?: boolean; disabled?: boolean; hint?: string };

export function ActionMenu({ items, label, className }: { items: ActionItem[]; label: string; className?: string }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top?: number; bottom?: number; right: number }>({ right: 0 });
  const btn = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const tall = items.length * 40 + 16;
    const below = window.innerHeight - r.bottom;
    setPos(below < tall + 16 && r.top > below ? { bottom: window.innerHeight - r.top + 8, right: window.innerWidth - r.right } : { top: r.bottom + 8, right: window.innerWidth - r.right });
  }, [open, items.length]);

  useEffect(() => {
    if (!open) return;
    menu.current?.querySelector<HTMLElement>("[role=menuitem]:not([disabled])")?.focus();
    const onDown = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !btn.current?.contains(e.target as Node)) setOpen(false); };
    const onMove = (e: Event) => { if (!(e.target instanceof Node && menu.current?.contains(e.target))) setOpen(false); };
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => { document.removeEventListener("mousedown", onDown); window.removeEventListener("scroll", onMove, true); window.removeEventListener("resize", onMove); };
  }, [open]);

  function keys(e: React.KeyboardEvent) {
    const all = Array.from(menu.current?.querySelectorAll<HTMLElement>("[role=menuitem]:not([disabled])") ?? []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape" || e.key === "Tab") { e.preventDefault(); setOpen(false); btn.current?.focus(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); all[(at + 1) % all.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); all[(at - 1 + all.length) % all.length]?.focus(); }
    else if (e.key === "Home") { e.preventDefault(); all[0]?.focus(); }
    else if (e.key === "End") { e.preventDefault(); all[all.length - 1]?.focus(); }
  }

  return (
    <>
      <button ref={btn} type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} aria-controls={open ? id : undefined} onClick={() => setOpen((o) => !o)}
        className={cn("inline-flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-xl border border-slate-200 bg-white text-gray-700 transition-colors hover:border-brand-palette-300 hover:text-brand-palette-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-palette-600 max-md:h-11 max-md:w-11", open && "border-brand-palette-300 bg-brand-palette-50 text-brand-palette-700", className)}>
        <IconMore size={18} />
      </button>
      {open && createPortal(
        <div ref={menu} id={id} role="menu" aria-label={label} data-dropdown-portal onKeyDown={keys} style={{ position: "fixed", top: pos.top, bottom: pos.bottom, right: pos.right }}
          className="z-60 flex min-w-52 flex-col rounded-2xl border border-gray-100 bg-white p-1.5 font-sans shadow-xl">
          {items.map((i) => (
            <button key={i.key} type="button" role="menuitem" disabled={i.disabled} onClick={() => { setOpen(false); btn.current?.focus(); i.onSelect(); }}
              className={cn("flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors disabled:cursor-not-allowed disabled:text-gray-500",
                i.danger ? "text-red-600 hover:bg-red-50 focus-visible:bg-red-50" : "text-gray-700 hover:bg-gray-100 focus-visible:bg-gray-100")}>
              <span className="font-semibold">{i.label}</span>
              {i.hint && <small className="text-xs text-gray-500">{i.hint}</small>}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </>
  );
}

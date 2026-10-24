"use client";
/**
 * The small menu under "Add to a deck" / "Add to a Pulse": the team's decks or Pulses, then "+ New …".
 * Opens downwards, or upwards (`up`) from a footer; takes focus on its first item, moves with the arrows, closes on Escape.
 */
import { useEffect, useRef } from "react";

export type PickItem = { key: string; label: string; hint?: string; pick: () => void };

export function PickMenu({ loading, items, newLabel, onNew, error, onClose, up = false }: { loading: boolean; items: PickItem[]; newLabel: string; onNew: () => void; error?: string; onClose: () => void; up?: boolean }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    ref.current?.querySelector<HTMLElement>("[role=menuitem]")?.focus();
  }, [loading]);
  function keys(e: React.KeyboardEvent) {
    const all = Array.from(ref.current?.querySelectorAll<HTMLElement>("[role=menuitem]") ?? []);
    const at = all.indexOf(document.activeElement as HTMLElement);
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); all[(at + 1) % all.length]?.focus(); }
    else if (e.key === "ArrowUp") { e.preventDefault(); all[(at - 1 + all.length) % all.length]?.focus(); }
  }
  const row = "flex min-h-10 w-full cursor-pointer items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm outline-none transition-colors hover:bg-gray-100 focus-visible:bg-gray-100";
  return (
    <span ref={ref} role="menu" onKeyDown={keys} className={`absolute left-0 z-40 ${up ? "bottom-full mb-2" : "top-full mt-2"} flex max-h-72 w-64 flex-col overflow-y-auto rounded-2xl border border-gray-100 bg-white p-1.5 font-sans shadow-xl`}>
      {loading && <span className="px-3 py-2 text-sm text-gray-500">Loading…</span>}
      {items.map((i) => (
        <button key={i.key} type="button" role="menuitem" onClick={i.pick} className={row}>
          <span className="min-w-0 truncate font-semibold text-gray-900">{i.label}</span>
          {i.hint && <small className="shrink-0 text-xs text-gray-500">{i.hint}</small>}
        </button>
      ))}
      <button type="button" role="menuitem" onClick={onNew} className={`${row} font-semibold text-brand-palette-700`}>{newLabel}</button>
      {error && <span role="alert" className="px-3 py-2 text-xs text-red-700">{error}</span>}
    </span>
  );
}

"use client";
/** Searchable multi-select: chips for the chosen items, a search box, a filtered dropdown. */
import { useEffect, useId, useRef, useState } from "react";
import { cn } from "./cn";
import { IconCheck } from "./kit/icons";

export type Option = { id: string; name: string; hint?: string };

export function MultiSelect({ options, value, onChange, placeholder, max = 40 }: { options: Option[]; value: string[]; onChange: (next: string[]) => void; placeholder?: string; max?: number }) {
  const listId = useId();
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onDoc = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  const byId = new Map(options.map((o) => [o.id, o]));
  const needle = q.trim().toLowerCase();
  const shown = options.filter((o) => !needle || o.name.toLowerCase().includes(needle) || o.id.toLowerCase().includes(needle)).slice(0, max);
  const toggle = (id: string) => onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id]);
  return (
    <div className="relative w-full font-sans" ref={box}>
      <div onClick={() => setOpen(true)}
        className={cn("flex min-h-11 w-full cursor-text flex-wrap items-center gap-1.5 rounded-2xl border bg-white px-2 py-1.5 transition-all duration-200", open ? "border-brand-palette-600 ring-2 ring-brand-palette-500/15" : "border-slate-200")}>
        {value.map((id) => (
          <span key={id} className="inline-flex items-center gap-1 rounded-lg bg-brand-palette-50 py-0.5 pl-2 pr-0.5 text-xs font-semibold text-brand-palette-800">
            {byId.get(id)?.name ?? id}
            <button type="button" aria-label={`Remove ${byId.get(id)?.name ?? id}`} onClick={(e) => { e.stopPropagation(); toggle(id); }} className="flex h-5 w-5 cursor-pointer items-center justify-center rounded-md hover:bg-brand-palette-100 focus-visible:outline-2 focus-visible:outline-brand-palette-600">×</button>
          </span>
        ))}
        <input value={q} placeholder={value.length ? "" : placeholder} role="combobox" aria-expanded={open} aria-controls={listId} aria-label={placeholder ?? "Search"}
          onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1)); if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && shown.length === 1) { e.preventDefault(); toggle(shown[0].id); setQ(""); } }}
          className="h-7 min-w-24 flex-1 border-0 bg-transparent px-1.5 font-sans text-sm text-gray-900 outline-none placeholder:text-gray-500" />
      </div>
      {open && (
        <div id={listId} role="listbox" aria-multiselectable="true" className="absolute left-0 right-0 top-full z-40 mt-2 max-h-64 overflow-y-auto rounded-xl border border-gray-100 bg-white p-1 shadow-xl">
          {shown.length === 0 && <p className="px-3 py-3 text-center text-xs text-gray-500">No match for &ldquo;{q}&rdquo;</p>}
          {shown.map((o) => {
            const on = value.includes(o.id);
            return (
              <div key={o.id} role="option" aria-selected={on} onMouseDown={(e) => { e.preventDefault(); toggle(o.id); }}
                className={cn("flex min-h-10 cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm", on ? "bg-brand-palette-50 text-brand-palette-800" : "text-gray-700 hover:bg-gray-100")}>
                <span aria-hidden="true" className={cn("flex h-4 w-4 shrink-0 items-center justify-center rounded border", on ? "border-brand-palette-600 bg-brand-palette-600 text-white" : "border-gray-300 bg-white")}>{on && <IconCheck size={12} />}</span>
                <span className="min-w-0 flex-1 truncate">{o.name}</span>
                {o.hint && <small className="shrink-0 text-xs text-gray-500">{o.hint}</small>}
              </div>
            );
          })}
          {options.length > shown.length && needle === "" && <p className="px-3 py-2 text-xs text-gray-500">{options.length - shown.length} more; type to search</p>}
        </div>
      )}
    </div>
  );
}

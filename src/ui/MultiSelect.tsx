"use client";
/** Searchable multi-select: chips for the chosen items, a search box, a filtered dropdown. */
import { useEffect, useRef, useState } from "react";

export type Option = { id: string; name: string; hint?: string };

export function MultiSelect({ options, value, onChange, placeholder, max = 40 }: { options: Option[]; value: string[]; onChange: (next: string[]) => void; placeholder?: string; max?: number }) {
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
    <div className={`ms ${open ? "open" : ""}`} ref={box}>
      <div className="ms-box" onClick={() => setOpen(true)}>
        {value.map((id) => (
          <span className="ms-chip" key={id}>{byId.get(id)?.name ?? id}<i onClick={(e) => { e.stopPropagation(); toggle(id); }} title="Remove">×</i></span>
        ))}
        <input value={q} placeholder={value.length ? "" : placeholder} onFocus={() => setOpen(true)} onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onKeyDown={(e) => { if (e.key === "Backspace" && !q && value.length) onChange(value.slice(0, -1)); if (e.key === "Escape") setOpen(false); if (e.key === "Enter" && shown.length === 1) { e.preventDefault(); toggle(shown[0].id); setQ(""); } }} />
      </div>
      {open && (
        <div className="ms-list">
          {shown.length === 0 && <div className="ms-empty">No match for “{q}”</div>}
          {shown.map((o) => (
            <div className={`ms-opt ${value.includes(o.id) ? "on" : ""}`} key={o.id} onMouseDown={(e) => { e.preventDefault(); toggle(o.id); }}>
              <span className="ms-check">{value.includes(o.id) ? "✓" : ""}</span>
              <span>{o.name}</span>
              {o.hint && <small>{o.hint}</small>}
            </div>
          ))}
          {options.length > shown.length && needle === "" && <div className="ms-empty">{options.length - shown.length} more; type to search</div>}
        </div>
      )}
    </div>
  );
}

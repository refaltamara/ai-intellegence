"use client";
/**
 * What CeMO can do, behind "/" (or the + button) in the composer, the way Claude
 * does it. Picking one fills the box with an example question to edit; nothing
 * about the mechanism reaches the thread (CLAUDE.md: skills are internal).
 */
import Link from "next/link";
import { useEffect, useRef } from "react";
import { isFairBadge } from "../brand/demo";
import { cn } from "./cn";

/** badge: whose it is ("Fair", or the client's name for what the team made); by: its maker, on hover */
export type SkillOption = { name: string; title: string; description: string; example: string; group: string; badge?: string; by?: string };

export function matchSkills(options: SkillOption[], query: string): SkillOption[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (!words.length) return options;
  return options.filter((o) => {
    const hay = `${o.title} ${o.description} ${o.example} ${o.group}`.toLowerCase();
    return words.every((w) => hay.includes(w));
  });
}

export function SlashMenu({ options, index, onPick, onHover }: { options: SkillOption[]; index: number; onPick: (o: SkillOption) => void; onHover: (i: number) => void }) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-i="${index}"]`)?.scrollIntoView({ block: "nearest" });
  }, [index]);
  let lastGroup = "";
  return (
    <div className="absolute inset-x-0 bottom-full z-20 mb-2 overflow-hidden rounded-2xl border border-gray-100 bg-white shadow-xl" role="listbox" aria-label="What CeMO can do">
      <div className="max-h-[min(46vh,380px)] overflow-y-auto p-1.5" ref={listRef}>
        {options.length === 0 && <p className="px-3 py-3.5 text-sm text-gray-500">Nothing matches. Ask it in your own words instead.</p>}
        {options.map((o, i) => {
          const head = o.group !== lastGroup ? (lastGroup = o.group) : null;
          const on = i === index;
          return (
            <div key={o.name}>
              {head && <h6 className="px-3 pb-1 pt-2.5 text-xs font-semibold text-gray-500">{head}</h6>}
              <button type="button" role="option" aria-selected={on} data-i={i}
                className={cn("flex w-full cursor-pointer flex-col gap-0.5 rounded-xl px-3 py-2 text-left", on ? "bg-brand-palette-50" : "hover:bg-gray-50")}
                onMouseEnter={() => onHover(i)} onMouseDown={(e) => { e.preventDefault(); onPick(o); }}>
                <span className={cn("flex items-center gap-2 text-sm font-semibold", on ? "text-brand-palette-700" : "text-gray-900")}>
                  {o.title}
                  {o.badge && (
                    <i title={o.by ? `Made by ${o.by}` : undefined} className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold not-italic", isFairBadge(o.badge) ? "bg-brand-palette-100 text-brand-palette-800" : "bg-gray-100 text-gray-700")}>{o.badge}</i>
                  )}
                </span>
                <span className="line-clamp-1 text-xs text-gray-500">{o.description}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="flex items-center justify-between gap-3 border-t border-gray-100 bg-gray-50 px-4 py-2 text-xs text-gray-500">
        <span className="hidden sm:inline">↑↓ to move · Enter to pick · Esc to close</span>
        <Link href="/skills" className="font-semibold text-brand-palette-700 hover:underline">Everything CeMO can do</Link>
      </div>
    </div>
  );
}

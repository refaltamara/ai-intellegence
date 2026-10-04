"use client";
/**
 * What CeMO can do, behind "/" (or the + button) in the composer, the way Claude
 * does it. Picking one fills the box with an example question to edit; nothing
 * about the mechanism reaches the thread (CLAUDE.md: skills are internal).
 */
import Link from "next/link";
import { useEffect, useRef } from "react";

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
    <div className="cmdmenu" role="listbox" aria-label="What CeMO can do">
      <div className="items" ref={listRef}>
        {options.length === 0 && <div className="none">Nothing matches. Ask it in your own words instead.</div>}
        {options.map((o, i) => {
          const head = o.group !== lastGroup ? (lastGroup = o.group) : null;
          return (
            <div key={o.name}>
              {head && <h6>{head}</h6>}
              <button type="button" role="option" aria-selected={i === index} data-i={i} className={i === index ? "on" : ""}
                onMouseEnter={() => onHover(i)} onMouseDown={(e) => { e.preventDefault(); onPick(o); }}>
                <b>{o.title}{o.badge && <i className={`badge ${o.badge === "Fair" ? "fair" : "client"}`} title={o.by ? `Made by ${o.by}` : undefined}>{o.badge}</i>}</b>
                <span>{o.description}</span>
              </button>
            </div>
          );
        })}
      </div>
      <div className="foot">
        <span>↑↓ to move · Enter to pick · Esc to close</span>
        <Link href="/skills">Everything CeMO can do</Link>
      </div>
    </div>
  );
}

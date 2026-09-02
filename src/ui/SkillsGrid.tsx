"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type SkillCard = { name: string; layer: string; title: string; description: string; example: string; first_release: boolean; available: boolean; phase: string };

export function SkillsGrid({ cards, layers }: { cards: SkillCard[]; layers: { key: string; title: string; blurb: string }[] }) {
  const [filter, setFilter] = useState<string | null>(null);
  const router = useRouter();
  const use = (s: SkillCard) => router.push(s.name === "discovery" ? "/skills/discovery" : `/?skill=${s.name}`);
  return (
    <>
      <div className="sk-hero">
        <div>
          <h2>Skills are questions only this data can answer</h2>
          <p>Each skill is a named analysis with a defined output — a list, a flag, a chart — built on one of the data layers below. Run any skill once in Ask, or schedule it as an agent. Greyed skills wait for a data layer that is not loaded yet.</p>
        </div>
        <div className="sk-filters">
          {[{ key: null, title: "All" }, ...layers].map((l) => (
            <button key={l.key ?? "all"} className={filter === l.key ? "on" : ""} onClick={() => setFilter(l.key)}>{l.title}</button>
          ))}
        </div>
      </div>
      {layers.filter((l) => !filter || l.key === filter).map((l) => (
        <div className="sk-group" key={l.key}>
          <header><h3>{l.title}</h3><span>{l.blurb}</span></header>
          <div className="sk-grid">
            {cards.filter((c) => c.layer === l.key).map((s) => (
              <button key={s.name} className={`sk ${s.available ? "" : "off"}`} onClick={() => use(s)} title={s.available ? `Use /${s.name} in Ask` : "Unavailable until its data layer is loaded"}>
                <div className="top"><span className="name"><span className="slash">/</span>{s.name}</span>{s.first_release && s.available ? <span className="p1">First release</span> : !s.available ? <span className="p2">Phase {s.phase}</span> : null}</div>
                <div className="desc">{s.description}</div>
                <div className="ex"><b>Try:</b> {s.example}</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

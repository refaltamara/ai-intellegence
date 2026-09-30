"use client";
/**
 * Mentions over time: content (or views) per brand per week, twelve weeks up to
 * the period's end. Hover a week for every brand's value; click a point to ask
 * about that brand in that week. The legend hides and shows lines.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { compact, dayMonth, int } from "@/competitor/view";
import { askHref, type AskRef } from "@/dashboard/askref";
import type { TrendSeries } from "@/dashboard/data";

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];

function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(Math.max(1, v)));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

export function MentionsChart({ weeks, series, base, chosen }: { weeks: string[]; series: TrendSeries[]; base: Omit<AskRef, "k" | "brand" | "week">; chosen: "filter" | "top" }) {
  const router = useRouter();
  const [metric, setMetric] = useState<"posts" | "views">("posts");
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [at, setAt] = useState<number | null>(null);
  const shown = series.filter((s) => !hidden.has(s.brand_id));
  const W = 1000, H = 300, padL = 52, padR = 16, padT = 16, padB = 34;
  const max = niceCeil(Math.max(1, ...shown.flatMap((s) => s[metric])));
  const x = (i: number) => padL + ((W - padL - padR) * i) / Math.max(1, weeks.length - 1);
  const y = (v: number) => padT + (H - padT - padB) * (1 - v / max);
  const fmt = metric === "posts" ? int : compact;
  const colour = (id: string) => SERIES[series.findIndex((s) => s.brand_id === id) % SERIES.length];
  if (!series.length) return <div className="empty">No brand has content in these weeks.</div>;
  return (
    <div className="mentions viz">
      <div className="mtools">
        <div className="seg sm" role="tablist" aria-label="Measure">
          <a role="tab" aria-selected={metric === "posts"} className={metric === "posts" ? "on" : ""} href="#" onClick={(e) => { e.preventDefault(); setMetric("posts"); }}>Content</a>
          <a role="tab" aria-selected={metric === "views"} className={metric === "views" ? "on" : ""} href="#" onClick={(e) => { e.preventDefault(); setMetric("views"); }}>Views</a>
        </div>
        <span className="hint">{chosen === "top" ? "The eight brands with the most content this period; pick brands above to compare others." : "The brands you picked."} Click a point to ask about that week.</span>
      </div>
      <div className="mplot" onMouseLeave={() => setAt(null)}>
        {at != null && (
          <div className="tip" style={{ left: `${(x(at) / W) * 100}%`, transform: at > weeks.length * 0.7 ? "translateX(-105%)" : "translateX(5%)" }}>
            <b>Week of {dayMonth(weeks[at])}</b>
            {shown.slice().sort((a, b) => b[metric][at] - a[metric][at]).map((s) => (
              <div key={s.brand_id}><i style={{ background: colour(s.brand_id) }} />{s.name}: {fmt(s[metric][at])}</div>
            ))}
          </div>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric === "posts" ? "Content" : "Views"} per brand per week`} style={{ width: "100%", height: "auto", display: "block" }}>
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t * max)} y2={y(t * max)} stroke="var(--line)" strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={padL - 8} y={y(t * max) + 4} textAnchor="end" fontSize="11" fill="var(--text-3)">{fmt(t * max)}</text>
            </g>
          ))}
          {weeks.map((w, i) => (i % 2 === (weeks.length - 1) % 2 ? <text key={w} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill="var(--text-3)">{dayMonth(w)}</text> : null))}
          {weeks.map((w, i) => (
            <rect key={`hit-${w}`} x={x(i) - (W - padL - padR) / weeks.length / 2} y={padT} width={(W - padL - padR) / weeks.length} height={H - padT - padB} fill="transparent" onMouseEnter={() => setAt(i)} style={{ pointerEvents: "all" }} className="hit" />
          ))}
          {at != null && <line x1={x(at)} x2={x(at)} y1={padT} y2={H - padB} stroke="var(--line-2)" />}
          {shown.map((s) => (
            <polyline key={s.brand_id} fill="none" stroke={colour(s.brand_id)} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" points={s[metric].map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
          ))}
          {shown.map((s) => s[metric].map((v, i) => (
            <circle key={`${s.brand_id}-${i}`} cx={x(i)} cy={y(v)} r={at === i ? 5 : 3} fill="#fff" stroke={colour(s.brand_id)} strokeWidth={2} className="pt"
              onMouseEnter={() => setAt(i)} onClick={() => router.push(askHref({ ...base, k: "week", brand: s.brand_id, week: weeks[i] }))}>
              <title>{`${s.name}, week of ${dayMonth(weeks[i])}: ${fmt(v)}. Click to ask why.`}</title>
            </circle>
          )))}
        </svg>
      </div>
      <div className="legend">
        {series.map((s) => (
          <button key={s.brand_id} className={hidden.has(s.brand_id) ? "off" : ""} onClick={() => setHidden((h) => { const n = new Set(h); if (n.has(s.brand_id)) n.delete(s.brand_id); else n.add(s.brand_id); return n; })}>
            <i style={{ background: colour(s.brand_id) }} />{s.name}
          </button>
        ))}
      </div>
    </div>
  );
}

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
import { AXIS, ChartTip, GRID, LegendToggles, SERIES, TipRow, niceCeil } from "../kit/chart";
import { Segmented } from "../kit/Segmented";
import { Empty } from "../kit/Section";

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
  const toggle = (id: string) => setHidden((h) => { const n = new Set(h); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  if (!series.length) return <Empty>No brand has content in these weeks. Pick a longer period or other brands above.</Empty>;
  return (
    // data-tw: a Pulse board (still on legacy.css) draws this chart too, and its table view must not take legacy's table rules
    <div data-tw className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <Segmented label="Measure" size="sm" value={metric} onChange={setMetric} options={[{ key: "posts", label: "Content" }, { key: "views", label: "Views" }]} />
        <span className="text-xs text-gray-500">{chosen === "top" ? "The eight brands with the most content this period; pick brands above to compare others." : "The brands you picked."} Click a point to ask about that week.</span>
      </div>
      <LegendToggles items={series.map((s) => ({ key: s.brand_id, label: s.name, colour: colour(s.brand_id) }))} hidden={hidden} onToggle={toggle} />
      <div className="relative" onMouseLeave={() => setAt(null)}>
        {at != null && (
          <ChartTip left={`${(x(at) / W) * 100}%`} flip={at > weeks.length * 0.7}>
            <b>Week of {dayMonth(weeks[at])}</b>
            {shown.slice().sort((a, b) => b[metric][at] - a[metric][at]).map((s) => <TipRow key={s.brand_id} colour={colour(s.brand_id)} name={s.name} value={fmt(s[metric][at])} />)}
          </ChartTip>
        )}
        <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${metric === "posts" ? "Content" : "Views"} per brand per week`} className="block h-auto w-full">
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line x1={padL} x2={W - padR} y1={y(t * max)} y2={y(t * max)} stroke={GRID} strokeDasharray={t === 0 ? undefined : "3 4"} />
              <text x={padL - 8} y={y(t * max) + 4} textAnchor="end" fontSize="11" fill={AXIS}>{fmt(t * max)}</text>
            </g>
          ))}
          {weeks.map((w, i) => (i % 2 === (weeks.length - 1) % 2 ? <text key={w} x={x(i)} y={H - 10} textAnchor="middle" fontSize="11" fill={AXIS}>{dayMonth(w)}</text> : null))}
          {weeks.map((w, i) => (
            <rect key={`hit-${w}`} x={x(i) - (W - padL - padR) / weeks.length / 2} y={padT} width={(W - padL - padR) / weeks.length} height={H - padT - padB} fill="transparent" onMouseEnter={() => setAt(i)} style={{ pointerEvents: "all" }} />
          ))}
          {at != null && <line x1={x(at)} x2={x(at)} y1={padT} y2={H - padB} stroke="var(--color-gray-300)" />}
          {shown.map((s) => (
            <polyline key={s.brand_id} fill="none" stroke={colour(s.brand_id)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" points={s[metric].map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
          ))}
          {shown.map((s) => s[metric].map((v, i) => (
            <circle key={`${s.brand_id}-${i}`} cx={x(i)} cy={y(v)} r={at === i ? 5 : 4} fill={at === i ? colour(s.brand_id) : "#fff"} stroke={colour(s.brand_id)} strokeWidth={2} className="cursor-pointer"
              onMouseEnter={() => setAt(i)} onClick={() => router.push(askHref({ ...base, k: "week", brand: s.brand_id, week: weeks[i] }))}>
              <title>{`${s.name}, week of ${dayMonth(weeks[i])}: ${fmt(v)}. Click to ask why.`}</title>
            </circle>
          )))}
        </svg>
      </div>
      <details className="text-sm">
        <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs font-semibold text-gray-600 hover:text-brand-palette-700 max-md:min-h-11">Table view</summary>
        <div className="mt-2 overflow-x-auto rounded-2xl border border-card-border">
          <table className="w-full border-collapse text-xs">
            <thead className="border-0 border-b border-card-border"><tr><th className="px-3 py-2 text-left font-semibold text-gray-900">{metric === "posts" ? "Content" : "Views"}</th>{weeks.map((w) => <th key={w} className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-900">{dayMonth(w)}</th>)}</tr></thead>
            <tbody>{series.map((s) => <tr key={s.brand_id} className="border-0 border-b border-card-border last:border-b-0 even:bg-gray-50/60"><td className="whitespace-nowrap px-3 py-2 text-gray-700">{s.name}</td>{s[metric].map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(v)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

"use client";
/**
 * A team's own Dashboard panel (src/dashboard/panels.ts), drawn in the product's style: a line or stacked bars over
 * time, ranked bars, the parts of a whole, one number, or a table. Marks follow the chart rules the rest of the app
 * uses (2px lines, markers with a surface ring, 2px gaps between fills, a legend from two series, a table view,
 * hover for the exact value). It prints the rows as the query builder counted them; nothing is worked out here
 * but the drawing. A Builder may change it by asking, or take it off.
 */
import { useState } from "react";
import { compact, dayMonth, int } from "@/competitor/view";
import { CHART_LABEL } from "@/dashboard/charts";
import type { PanelColumn, PanelData } from "@/dashboard/panels";
import { AXIS, ChartTip, GRID, SERIES, Swatch, niceCeil } from "../kit/chart";
import { Button } from "../kit/Button";
import { CARD, Empty, SectionTitle } from "../kit/Section";
import { TABLE, TABLE_FRAME, TD, TD_NUM, TH, TH_NUM, THEAD, TR } from "../kit/Table";
import { cn } from "../cn";
const TIME = ["day", "week", "month"];

export function fmt(v: unknown, f: PanelColumn["format"]): string {
  if (v == null || v === "") return "–";
  if (typeof v !== "number") return String(v);
  if (f === "pct") return `${v.toFixed(1)}%`;
  if (f === "compact") return compact(v);
  if (f === "num") return v.toFixed(1);
  if (f === "change_pct") return `${v > 0 ? "▲ +" : v < 0 ? "▼ " : ""}${v.toFixed(1)}%`;
  if (f === "change_pts") return `${v > 0 ? "▲ +" : v < 0 ? "▼ " : ""}${v.toFixed(1)} pts`;
  return int(v);
}
const timeLabel = (k: string, v: string) => (k === "month" ? v : dayMonth(v));

/** The panel's parts: the time, the other group, the measure and its change column. */
function parts(d: PanelData) {
  const cols = d.columns;
  const time = cols.find((c) => TIME.includes(c.key)) ?? null;
  const groups = cols.filter((c) => c.format === "text" && c.key !== time?.key);
  const measures = cols.filter((c) => c.format !== "text" && !c.format.startsWith("change"));
  const m = measures[0] ?? null;
  const ch = m ? cols.find((c) => c.key === `${m.key}_change_pct` || c.key === `${m.key}_change_pts`) ?? null : null;
  return { time, group: groups[0] ?? null, measures, m, ch };
}

type Tip = { left: number; lines: string[] } | null;

function TipBox({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return <ChartTip left={`${tip.left}%`} flip={tip.left > 60}>{tip.lines.map((l, i) => (i === 0 ? <b key={i}>{l}</b> : <span key={i}>{l}</span>))}</ChartTip>;
}

/** Series over time: one per value of the other group (the eight largest), else one. */
function overTime(d: PanelData, stacked: boolean) {
  const { time, group, m, ch } = parts(d);
  if (!time || !m) return null;
  const xs = [...new Set(d.rows.map((r) => String(r[time.key])))].sort();
  const totals = new Map<string, number>();
  if (group) for (const r of d.rows) totals.set(String(r[group.key]), (totals.get(String(r[group.key])) ?? 0) + (Number(r[m.key]) || 0));
  const names = group ? [...totals.entries()].sort((a, b) => b[1] - a[1]).slice(0, stacked ? 6 : 8).map(([k]) => k) : [m.label];
  const series = names.map((name) => ({
    name,
    data: xs.map((x) => {
      const r = d.rows.find((y) => String(y[time.key]) === x && (!group || String(y[group.key]) === name));
      return { v: r ? (r[m.key] as number | null) : null, c: r && ch ? (r[ch.key] as number | null) : null };
    }),
  }));
  return { time, group, m, ch, xs, series, dropped: group ? totals.size - names.length : 0 };
}

function TimeChart({ d, stacked }: { d: PanelData; stacked: boolean }) {
  const [tip, setTip] = useState<Tip>(null);
  const t = overTime(d, stacked);
  if (!t) return <PanelTable d={d} />;
  const W = 640, H = 220, padL = 46, padR = 18, padT = 14, padB = 30;
  const n = t.xs.length;
  const maxY = niceCeil(Math.max(1, ...(stacked ? t.xs.map((_, i) => t.series.reduce((a, s) => a + (s.data[i].v ?? 0), 0)) : t.series.flatMap((s) => s.data.map((p) => p.v ?? 0)))));
  const yOf = (v: number) => padT + (H - padT - padB) * (1 - v / maxY);
  const xOf = (i: number) => (n <= 1 ? (W + padL - padR) / 2 : padL + ((W - padL - padR) * i) / (n - 1));
  const band = (W - padL - padR) / Math.max(1, n);
  const barW = Math.min(26, band * 0.62);
  const show = (e: React.MouseEvent, lines: string[]) => {
    const host = (e.currentTarget as SVGElement).closest("[data-viz]") as HTMLElement | null;
    if (!host) return;
    const r = host.getBoundingClientRect();
    setTip({ left: ((e.clientX - r.left) / r.width) * 100, lines });
  };
  // the window ends inside its last week or month: that point is so far, not a whole period
  const label = (x: string) => `${timeLabel(t.time.key, x)}${d.partial && x === t.xs[n - 1] ? " (so far)" : ""}`;
  return (
    <div data-viz className="relative flex flex-col gap-3" onMouseLeave={() => setTip(null)}>
      {t.series.length >= 2 && <div className="flex flex-wrap gap-x-4 gap-y-1">{t.series.map((s, si) => <Swatch key={s.name} colour={SERIES[si]}>{s.name}</Swatch>)}</div>}
      <TipBox tip={tip} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={d.spec.title} className="block h-auto w-full">
        <g stroke={GRID} strokeWidth="1">{[0, 0.5, 1].map((f) => <line key={f} x1={padL} x2={W - padR} y1={yOf(f * maxY)} y2={yOf(f * maxY)} strokeDasharray={f === 0 ? undefined : "3 4"} />)}</g>
        <g fill={AXIS} fontSize="10">
          {[0, 0.5, 1].map((f) => <text key={f} x={padL - 6} y={yOf(f * maxY) + 3} textAnchor="end">{fmt(f * maxY, t.m.format)}</text>)}
          {t.xs.map((x, i) => (n <= 8 || i % Math.ceil(n / 8) === 0 || i === n - 1) && <text key={x} x={stacked ? padL + band * i + band / 2 : xOf(i)} y={H - 10} textAnchor="middle">{label(x)}</text>)}
        </g>
        {stacked
          ? t.xs.map((x, i) => {
              let acc = 0;
              const cx = padL + band * i + band / 2;
              return t.series.map((s, si) => {
                const v = s.data[i].v ?? 0;
                const y0 = yOf(acc), y1 = yOf(acc + v);
                acc += v;
                const h = Math.max(0, y0 - y1 - (si ? 2 : 0));
                return <rect key={`${x}${si}`} x={cx - barW / 2} y={y1} width={barW} height={h} fill={SERIES[si]} rx={si === t.series.length - 1 ? 4 : 0} onMouseMove={(e) => show(e, [label(x), `${s.name}: ${fmt(v, t.m.format)}`])} />;
              });
            })
          : t.series.map((s, si) => {
              const pts = s.data.map((p, i) => (p.v == null ? null : ([xOf(i), yOf(p.v)] as const)));
              const drawn = pts.filter((p): p is readonly [number, number] => p != null);
              return (
                <g key={s.name}>
                  <polyline fill="none" stroke={SERIES[si]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={drawn.map((p) => p.join(",")).join(" ")} />
                  {pts.map((p, i) => p && (
                    <circle key={i} cx={p[0]} cy={p[1]} r={n > 40 ? 3 : 4} fill={SERIES[si]} stroke="#fff" strokeWidth="2"
                      onMouseMove={(e) => show(e, [label(t.xs[i]), `${s.name}: ${fmt(s.data[i].v, t.m.format)}`, ...(t.ch && s.data[i].c != null ? [`vs the ${t.time.key} before: ${fmt(s.data[i].c, t.ch.format)}`] : [])])} />
                  ))}
                </g>
              );
            })}
      </svg>
      {t.ch && t.series.length === 1 && t.series[0].data.length > 1 && t.series[0].data[t.series[0].data.length - 1].c != null && (
        <p className="text-sm text-gray-700">Latest {t.time.key}{d.partial ? " so far" : ""}: {fmt(t.series[0].data[t.series[0].data.length - 1].v, t.m.format)}, {fmt(t.series[0].data[t.series[0].data.length - 1].c, t.ch.format)} vs the whole {t.time.key} before{d.partial ? "; it is not over yet in this view" : ""}</p>
      )}
      {t.dropped > 0 && <p className="text-xs text-gray-500">The {stacked ? "six" : "eight"} largest shown; {t.dropped} more in the table view.</p>}
      <TableView d={d} />
    </div>
  );
}

function Bars({ d }: { d: PanelData }) {
  const { time, group, m, ch } = parts(d);
  const by = group ?? time;
  if (!by || !m) return <PanelTable d={d} />;
  const rows = d.rows.slice(0, 15);
  const max = Math.max(1, ...rows.map((r) => Math.abs(Number(r[m.key]) || 0)));
  return (
    <div className="flex flex-col gap-2">
      {rows.map((r, i) => {
        const v = Number(r[m.key]) || 0;
        const name = by.key === time?.key ? timeLabel(by.key, String(r[by.key])) : String(r[by.key] ?? "–");
        return (
          <div key={i} className="grid grid-cols-[minmax(0,10rem)_1fr_auto] items-center gap-3 text-sm" title={`${name}: ${fmt(r[m.key], m.format)}${ch && r[ch.key] != null ? ` (${fmt(r[ch.key], ch.format)})` : ""}`}>
            <span className="truncate text-gray-700">{name}</span>
            <span className="block h-3 overflow-hidden rounded-r-md"><i className="block h-full rounded-r-md" style={{ width: `${Math.max(1.5, (Math.abs(v) / max) * 100)}%`, background: SERIES[0] }} /></span>
            <span className="whitespace-nowrap text-right font-semibold tabular-nums text-gray-900">{fmt(r[m.key], m.format)}{ch && r[ch.key] != null && <small className="ml-1 font-regular text-gray-500">{fmt(r[ch.key], ch.format)}</small>}</span>
          </div>
        );
      })}
      {d.rows.length > 15 && <p className="text-xs text-gray-500">The first 15 of {d.rows.length}.</p>}
    </div>
  );
}

function Share({ d }: { d: PanelData }) {
  const { group, m } = parts(d);
  if (!group || !m) return <PanelTable d={d} />;
  const rows = d.rows.slice(0, 8);
  const total = rows.reduce((a, r) => a + Math.max(0, Number(r[m.key]) || 0), 0) || 1;
  return (
    <div className="flex flex-col gap-3">
      {/* 2px white gaps between the parts so neighbours never run together */}
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-md" role="img" aria-label={`${d.spec.title}: ${rows.map((r) => `${r[group.key]} ${fmt(r[m.key], m.format)}`).join(", ")}`}>
        {rows.map((r, i) => <i key={i} className="block h-full min-w-0.5" style={{ flexGrow: Math.max(0, Number(r[m.key]) || 0) / total, background: SERIES[i] }} title={`${r[group.key]}: ${fmt(r[m.key], m.format)}`} />)}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1">{rows.map((r, i) => <Swatch key={i} colour={SERIES[i]}>{String(r[group.key] ?? "–")}: <b className="font-semibold tabular-nums text-gray-900">{fmt(r[m.key], m.format)}</b></Swatch>)}</div>
      {d.rows.length > 8 && <p className="text-xs text-gray-500">The first 8 of {d.rows.length}.</p>}
    </div>
  );
}

function Num({ d }: { d: PanelData }) {
  const { measures } = parts(d);
  const r = d.rows[0] ?? {};
  if (!measures.length) return <PanelTable d={d} />;
  const [main, ...rest] = measures;
  return (
    <div className="flex flex-col gap-1">
      <b className="text-3xl font-bold leading-tight tabular-nums text-gray-900">{fmt(r[main.key], main.format)}</b>
      <span className="text-sm text-gray-500">{main.label}</span>
      {rest.length > 0 && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-700">{rest.map((c) => <span key={c.key}>{c.label}: <b className="font-semibold tabular-nums text-gray-900">{fmt(r[c.key], c.format)}</b></span>)}</div>}
    </div>
  );
}

export function PanelTable({ d }: { d: PanelData }) {
  const time = d.columns.find((c) => TIME.includes(c.key));
  return (
    <div className={cn(TABLE_FRAME, "max-h-[480px] overflow-auto")}>
      <table className={TABLE}>
        <thead className={cn(THEAD, "sticky top-0 z-20")}><tr>{d.columns.map((c) => <th key={c.key} className={c.format === "text" ? TH : TH_NUM}>{c.label}</th>)}</tr></thead>
        <tbody>{d.rows.slice(0, 60).map((r, i) => <tr key={i} className={TR}>{d.columns.map((c) => <td key={c.key} className={c.format === "text" ? TD : TD_NUM}>{c.key === time?.key ? timeLabel(c.key, String(r[c.key])) : fmt(r[c.key], c.format)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

/** the chart's numbers as a table, folded away under it */
function TableView({ d }: { d: PanelData }) {
  return (
    <details className="group text-sm">
      <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs font-semibold text-gray-600 hover:text-brand-palette-700 max-md:min-h-11">Table view</summary>
      <div className="mt-2"><PanelTable d={d} /></div>
    </details>
  );
}

export function PanelBody({ d }: { d: PanelData }) {
  if (d.status !== "ok") return d.status === "error" ? <p role="alert" className="rounded-2xl bg-red-50 px-4 py-3 text-sm text-red-700">{d.message}</p> : <Empty>{d.message}</Empty>;
  switch (d.spec.chart) {
    case "line": return <TimeChart d={d} stacked={false} />;
    case "stacked": return <TimeChart d={d} stacked />;
    case "bar": return <Bars d={d} />;
    case "share": return <Share d={d} />;
    case "number": return <Num d={d} />;
    default: return <PanelTable d={d} />;
  }
}

/** The panel on the Dashboard, with a Builder's Change and Remove. */
export function PanelView({ d, title, builder, onChange, onRemove, changing }: { d: PanelData; title: string; builder: boolean; onChange?: () => void; onRemove?: () => void; changing?: boolean }) {
  const span = d.window.from === d.window.to ? dayMonth(d.window.from) : `${dayMonth(d.window.from)} to ${dayMonth(d.window.to)}`;
  return (
    <div className={cn(CARD, "min-w-0")}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
        <SectionTitle title={title} hint={<>{d.spec.description} · {span} · {CHART_LABEL[d.spec.chart]}</>} />
        {builder && (onChange || onRemove) && (
          <span className="flex shrink-0 gap-2">
            {onChange && <Button size="sm" variant="outline" aria-expanded={changing} onClick={onChange}>Change</Button>}
            {onRemove && <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={onRemove}>Remove</Button>}
          </span>
        )}
      </div>
      <PanelBody d={d} />
    </div>
  );
}

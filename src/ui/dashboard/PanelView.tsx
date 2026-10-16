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

const SERIES = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)", "var(--series-6)", "var(--series-7)", "var(--series-8)"];
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

type Tip = { x: number; y: number; lines: string[] } | null;

function TipBox({ tip }: { tip: Tip }) {
  if (!tip) return null;
  return <div className="tip" style={{ left: tip.x, top: tip.y }}>{tip.lines.map((l, i) => (i === 0 ? <b key={i}>{l}</b> : <div key={i}>{l}</div>))}</div>;
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
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
    const host = (e.currentTarget as SVGElement).closest(".viz") as HTMLElement | null;
    if (!host) return;
    const r = host.getBoundingClientRect();
    setTip({ x: e.clientX - r.left, y: e.clientY - r.top - 8, lines });
  };
  // the window ends inside its last week or month: that point is so far, not a whole period
  const label = (x: string) => `${timeLabel(t.time.key, x)}${d.partial && x === t.xs[n - 1] ? " (so far)" : ""}`;
  return (
    <div className="viz" onMouseLeave={() => setTip(null)}>
      <TipBox tip={tip} />
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={d.spec.title} style={{ width: "100%", height: "auto", display: "block" }}>
        <g stroke="var(--line)" strokeWidth="1">{[0, 0.5, 1].map((f) => <line key={f} x1={padL} x2={W - padR} y1={yOf(f * maxY)} y2={yOf(f * maxY)} />)}</g>
        <g fill="var(--text-3)" fontSize="10">
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
                    <circle key={i} cx={p[0]} cy={p[1]} r={n > 40 ? 3 : 4} fill={SERIES[si]} stroke="var(--bg)" strokeWidth="2"
                      onMouseMove={(e) => show(e, [label(t.xs[i]), `${s.name}: ${fmt(s.data[i].v, t.m.format)}`, ...(t.ch && s.data[i].c != null ? [`vs the ${t.time.key} before: ${fmt(s.data[i].c, t.ch.format)}`] : [])])} />
                  ))}
                </g>
              );
            })}
      </svg>
      {t.series.length >= 2 && <div className="legend">{t.series.map((s, si) => <span key={s.name}><i style={{ background: SERIES[si] }} />{s.name}</span>)}</div>}
      {t.ch && t.series.length === 1 && t.series[0].data.length > 1 && t.series[0].data[t.series[0].data.length - 1].c != null && (
        <p className="pchange">Latest {t.time.key}{d.partial ? " so far" : ""}: {fmt(t.series[0].data[t.series[0].data.length - 1].v, t.m.format)}, {fmt(t.series[0].data[t.series[0].data.length - 1].c, t.ch.format)} vs the whole {t.time.key} before{d.partial ? "; it is not over yet in this view" : ""}</p>
      )}
      {t.dropped > 0 && <p className="muted pnote">The {stacked ? "six" : "eight"} largest shown; {t.dropped} more in the table view.</p>}
      <details><summary>Table view</summary><PanelTable d={d} /></details>
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
    <div className="viz pbars">
      {rows.map((r, i) => {
        const v = Number(r[m.key]) || 0;
        const name = by.key === time?.key ? timeLabel(by.key, String(r[by.key])) : String(r[by.key] ?? "–");
        return (
          <div key={i} className="pbar" title={`${name}: ${fmt(r[m.key], m.format)}${ch && r[ch.key] != null ? ` (${fmt(r[ch.key], ch.format)})` : ""}`}>
            <span className="pn">{name}</span>
            <span className="pt"><i style={{ width: `${Math.max(1.5, (Math.abs(v) / max) * 100)}%`, background: SERIES[0] }} /></span>
            <span className="pv">{fmt(r[m.key], m.format)}{ch && r[ch.key] != null && <small> {fmt(r[ch.key], ch.format)}</small>}</span>
          </div>
        );
      })}
      {d.rows.length > 15 && <p className="muted pnote">The first 15 of {d.rows.length}.</p>}
    </div>
  );
}

function Share({ d }: { d: PanelData }) {
  const { group, m } = parts(d);
  if (!group || !m) return <PanelTable d={d} />;
  const rows = d.rows.slice(0, 8);
  const total = rows.reduce((a, r) => a + Math.max(0, Number(r[m.key]) || 0), 0) || 1;
  return (
    <div className="viz pshare">
      <div className="pstack" role="img" aria-label={`${d.spec.title}: ${rows.map((r) => `${r[group.key]} ${fmt(r[m.key], m.format)}`).join(", ")}`}>
        {rows.map((r, i) => <i key={i} style={{ flexGrow: Math.max(0, Number(r[m.key]) || 0) / total, background: SERIES[i] }} title={`${r[group.key]}: ${fmt(r[m.key], m.format)}`} />)}
      </div>
      <div className="legend">{rows.map((r, i) => <span key={i}><i style={{ background: SERIES[i] }} />{String(r[group.key] ?? "–")}: {fmt(r[m.key], m.format)}</span>)}</div>
      {d.rows.length > 8 && <p className="muted pnote">The first 8 of {d.rows.length}.</p>}
    </div>
  );
}

function Num({ d }: { d: PanelData }) {
  const { measures } = parts(d);
  const r = d.rows[0] ?? {};
  if (!measures.length) return <PanelTable d={d} />;
  const [main, ...rest] = measures;
  return (
    <div className="pnum">
      <b>{fmt(r[main.key], main.format)}</b>
      <span>{main.label}</span>
      {rest.length > 0 && <div className="pmore">{rest.map((c) => <span key={c.key}>{c.label}: <b>{fmt(r[c.key], c.format)}</b></span>)}</div>}
    </div>
  );
}

export function PanelTable({ d }: { d: PanelData }) {
  const time = d.columns.find((c) => TIME.includes(c.key));
  return (
    <div className="tablewrap still mini">
      <table>
        <thead><tr>{d.columns.map((c) => <th key={c.key} className={c.format === "text" ? "" : "num"}>{c.label}</th>)}</tr></thead>
        <tbody>{d.rows.slice(0, 60).map((r, i) => <tr key={i}>{d.columns.map((c) => <td key={c.key} className={c.format === "text" ? "" : "num"}>{c.key === time?.key ? timeLabel(c.key, String(r[c.key])) : fmt(r[c.key], c.format)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function PanelBody({ d }: { d: PanelData }) {
  if (d.status !== "ok") return <p className="muted">{d.message}</p>;
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
export function PanelView({ d, title, builder, onChange, onRemove }: { d: PanelData; title: string; builder: boolean; onChange?: () => void; onRemove?: () => void }) {
  const span = d.window.from === d.window.to ? dayMonth(d.window.from) : `${dayMonth(d.window.from)} to ${dayMonth(d.window.to)}`;
  return (
    <div className="card dpanel">
      <div className="dphead">
        <div>
          <h3>{title}</h3>
          <small className="muted">{d.spec.description} · {span} · {CHART_LABEL[d.spec.chart]}</small>
        </div>
        {builder && (onChange || onRemove) && (
          <span className="dpacts">
            {onChange && <button className="btn sm ghost" onClick={onChange}>Change</button>}
            {onRemove && <button className="btn sm ghost" onClick={onRemove}>Remove</button>}
          </span>
        )}
      </div>
      <PanelBody d={d} />
    </div>
  );
}

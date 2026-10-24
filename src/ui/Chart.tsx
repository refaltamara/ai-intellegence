"use client";
/**
 * Minimal SVG charts for ChartSpec: line (share of voice / weekly volume) and
 * stacked_bar (funnel mix). Marks follow the dataviz specs: 2px lines, >=8px end
 * markers with a surface ring, <=24px bars with 2px surface gaps, hairline grid,
 * legend for >=2 series, hover tooltip, and a table view for accessibility.
 */
import { useState } from "react";
import type { ChartSpec } from "@/skills/types";

// the categorical palette that sat on legacy.css's .viz, kept as it was so every chart reads the same
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];
const GRID = "var(--color-gray-200)";
const AXIS = "var(--color-gray-500)";
const LABEL = "var(--color-gray-600)";
const fmt = (n: number | null | undefined) => (n == null ? "" : Math.abs(n) >= 1000 ? n.toLocaleString("en-US", { maximumFractionDigits: 0 }) : n.toLocaleString("en-US", { maximumFractionDigits: 2 }));

export function Chart({ spec }: { spec: ChartSpec }) {
  const [tip, setTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const W = 640, H = 220, padL = 44, padR = 16, padT = 14, padB = 30;
  const series = spec.series.slice(0, 8);
  const n = spec.x.length;
  const stacked = spec.type === "stacked_bar";
  const maxY = stacked
    ? Math.max(1, ...spec.x.map((_, i) => series.reduce((a, s) => a + (s.data[i] ?? 0), 0)))
    : Math.max(1, ...series.flatMap((s) => s.data.map((v) => v ?? 0)));
  const niceMax = niceCeil(maxY);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);
  const yOf = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax);
  const xOf = (i: number) => (n <= 1 ? (W + padL - padR) / 2 : padL + ((W - padL - padR) * i) / (n - 1));
  const bandW = (W - padL - padR) / Math.max(1, n);
  const barW = Math.min(24, bandW * 0.6);

  return (
    <div data-viz className="relative" onMouseLeave={() => setTip(null)}>
      {tip && <div className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-gray-900 px-2.5 py-1.5 text-xs text-white shadow-lg [&_b]:font-semibold" style={{ left: tip.x, top: tip.y }} dangerouslySetInnerHTML={{ __html: tip.text }} />}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={spec.title ?? spec.y_label ?? "chart"} className="block h-auto w-full">
        <g stroke={GRID} strokeWidth="1">
          {ticks.map((t) => <line key={t} x1={padL} x2={W - padR} y1={yOf(t)} y2={yOf(t)} />)}
        </g>
        <g fill={AXIS} fontSize="10">
          {ticks.map((t) => <text key={t} x={padL - 6} y={yOf(t) + 3} textAnchor="end">{fmt(t)}</text>)}
          {spec.x.map((label, i) => (n <= 8 || i % Math.ceil(n / 8) === 0) && (
            <text key={label + i} x={stacked ? padL + bandW * i + bandW / 2 : xOf(i)} y={H - 10} textAnchor="middle">{shortLabel(label)}</text>
          ))}
        </g>
        {stacked
          ? spec.x.map((label, i) => {
              let acc = 0;
              const cx = padL + bandW * i + bandW / 2;
              return series.map((s, si) => {
                const v = s.data[i] ?? 0;
                const y0 = yOf(acc), y1 = yOf(acc + v);
                acc += v;
                const h = Math.max(0, y0 - y1 - 2);
                return (
                  <rect key={si} x={cx - barW / 2} y={y1 + (si === series.length - 1 ? 0 : 2)} width={barW} height={h} fill={SERIES[si]} rx={si === series.length - 1 ? 4 : 0}
                    onMouseMove={(e) => showTip(e, setTip, `<b>${label}</b> · ${s.name}: ${fmt(v)}${spec.y_label?.includes("%") ? "%" : ""}`)} />
                );
              });
            })
          : series.map((s, si) => {
              const pts = s.data.map((v, i) => [xOf(i), yOf(v ?? 0)] as const);
              const last = pts[pts.length - 1];
              return (
                <g key={si}>
                  <polyline fill="none" stroke={SERIES[si]} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" points={pts.map((p) => p.join(",")).join(" ")} />
                  {pts.map(([x, y], i) => (
                    <circle key={i} cx={x} cy={y} r={n > 40 ? 3 : 4} fill={SERIES[si]} stroke="#fff" strokeWidth="2"
                      onMouseMove={(e) => showTip(e, setTip, `<b>${spec.x[i]}</b> · ${s.name}: ${fmt(s.data[i])}${spec.y_label?.includes("%") ? "%" : ""}`)} />
                  ))}
                  {series.length <= 4 && last && <text x={last[0] + 6} y={last[1] + 3} fontSize="10" fill={LABEL}>{fmt(s.data[s.data.length - 1])}</text>}
                </g>
              );
            })}
      </svg>
      {series.length >= 2 && (
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600">
          {series.map((s, si) => <span key={s.name} className="inline-flex items-center gap-1.5"><i aria-hidden="true" className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES[si] }} />{s.name}</span>)}
        </div>
      )}
      <details className="mt-2 text-xs">
        <summary className="cursor-pointer font-semibold text-gray-600 hover:text-brand-palette-700">Table view</summary>
        <div className="mt-2 overflow-auto rounded-xl border border-gray-100">
          <table className="w-full">
            <thead><tr className="bg-gray-50"><th className="px-3 py-2 text-left font-semibold text-gray-700">{spec.y_label ?? ""}</th>{spec.x.map((x) => <th key={x} className="whitespace-nowrap px-3 py-2 text-right font-semibold text-gray-700">{x}</th>)}</tr></thead>
            <tbody className="divide-y divide-gray-100">{series.map((s) => <tr key={s.name}><td className="px-3 py-2 text-gray-700">{s.name}</td>{s.data.map((v, i) => <td key={i} className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(v)}</td>)}</tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

function showTip(e: React.MouseEvent, set: (t: { x: number; y: number; text: string } | null) => void, text: string) {
  const host = (e.currentTarget as SVGElement).closest("[data-viz]") as HTMLElement | null;
  if (!host) return;
  const r = host.getBoundingClientRect();
  set({ x: e.clientX - r.left, y: e.clientY - r.top - 8, text });
}

function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  const nice = m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10;
  return nice * p;
}

function shortLabel(s: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s.slice(5) : s.length > 14 ? s.slice(0, 13) + "…" : s;
}

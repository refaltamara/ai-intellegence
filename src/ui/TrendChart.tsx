"use client";
/**
 * The Pulse trend: how much arrived each hour (or day), and which way it leaned. Volume is stacked bars on top;
 * the shares sit in their own chart underneath on a 0 to 100% axis, at the same x positions, so a falling line
 * under rising bars is readable at a glance without a second axis on one plot (the dataviz "one axis" rule).
 * One hover band per hour drives one tooltip for both. Built for the page width rather than the 640px card
 * charts: at 70-odd hours the bars have to stay wide enough to see.
 */
import { useState } from "react";
import { AXIS, ChartTip, GRID, Swatch, TipRow, niceCeil } from "./kit/chart";

export type TrendBar = { name: string; data: number[]; color: string };
export type TrendLine = { name: string; data: (number | null)[]; color: string };

const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 1 : 0 }));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-14 09:00" → { day: "14 Sep", hour: "09" } */
function parse(h: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})/.exec(h);
  return m ? { day: `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`, hour: m[4] } : { day: h, hour: "" };
}
const SURFACE = "#fff";
const STRONG = "var(--color-gray-700)";

export function TrendChart({ x, bars, lines, barLabel, lineLabel, peakNote, height = 300, grain = "hour" }: {
  x: string[];
  bars: TrendBar[];
  lines: TrendLine[];
  barLabel: string;
  lineLabel: string;
  peakNote?: string;
  height?: number;
  /** one bar per hour (x is "YYYY-MM-DD HH:00") or per day (x is "YYYY-MM-DD") */
  grain?: "hour" | "day";
}) {
  const [at, setAt] = useState<number | null>(null);
  const W = 1240, padL = 54, padR = 16;
  const n = x.length;
  const band = (W - padL - padR) / Math.max(1, n);
  const barW = Math.max(2, Math.min(26, band - 2));
  const cx = (i: number) => padL + band * i + band / 2;
  const totals = x.map((_, i) => bars.reduce((a, s) => a + (s.data[i] ?? 0), 0));
  const niceMax = niceCeil(Math.max(1, ...totals));
  const peakAt = totals.indexOf(Math.max(...totals));
  const hovered = at != null ? parse(x[at]) : null;

  // volume on top, the shares below at about two fifths of its height
  const VH = lines.length ? Math.round(height * 0.66) : height, vT = 20, vB = 34;
  const SH = Math.max(150, Math.round(height * 0.5)), sT = 14, sB = 30;
  const yOf = (v: number) => vT + (VH - vT - vB) * (1 - v / niceMax);
  const yPct = (v: number) => sT + (SH - sT - sB) * (1 - v / 100);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);

  const xLabels = (h: number) => (
    <g fill={AXIS} fontSize="11">
      {x.map((s, i) => {
        const { day, hour } = parse(s);
        if (grain === "day") {
          const every = Math.max(1, Math.ceil(n / 16));
          return i % every === 0 ? <text key={`x${i}`} x={cx(i)} y={h - 10} textAnchor="middle">{day}</text> : null;
        }
        const every = n > 96 ? 12 : n > 48 ? 6 : 3;
        return Number(hour) % every === 0 ? <text key={`x${i}`} x={cx(i)} y={h - 10} textAnchor="middle">{hour}</text> : null;
      })}
    </g>
  );
  // midnight dividers, and the day they open on the top chart
  const midnights = (top: number, bottom: number, label: boolean) => grain === "hour" && x.map((h, i) => parse(h).hour === "00" && (
    <g key={`d${i}`}>
      <line x1={cx(i) - band / 2} x2={cx(i) - band / 2} y1={top} y2={bottom} stroke="var(--color-gray-300)" strokeWidth="1" strokeDasharray="3 3" />
      {label && <text x={cx(i) - band / 2 + 6} y={top + 2} fontSize="12" fontWeight="600" fill={AXIS} stroke={SURFACE} strokeWidth="3" paintOrder="stroke">{parse(h).day}</text>}
    </g>
  ));
  // one hover band per hour, so the tooltip carries every series at once
  const hits = (top: number, bottom: number) => x.map((_, i) => <rect key={`h${i}`} x={cx(i) - band / 2} y={top} width={band} height={bottom - top} fill="transparent" onMouseEnter={() => setAt(i)} />);
  const cross = (top: number, bottom: number) => at != null && <line x1={cx(at)} x2={cx(at)} y1={top} y2={bottom} stroke={AXIS} strokeWidth="1" pointerEvents="none" />;
  const f = at != null ? (cx(at) - padL) / (W - padL - padR) : 0;
  const unitLabel = grain === "day" ? "day (WIB)" : "hour, by hour of the day (WIB)";

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1">
        {bars.map((s) => <Swatch key={s.name} colour={s.color}>{s.name}</Swatch>)}
        {lines.map((s) => <Swatch key={s.name} colour={s.color}>{s.name} (line)</Swatch>)}
      </div>
      <div className="relative flex flex-col gap-1" onMouseLeave={() => setAt(null)}>
        {at != null && hovered && (
          <ChartTip left={`${(cx(at) / W) * 100}%`} flip={f > 0.6}>
            <b>{grain === "day" ? hovered.day : `${hovered.day} ${hovered.hour}:00`}</b>
            {bars.map((s) => <TipRow key={s.name} colour={s.color} name={s.name} value={fmt(s.data[at])} />)}
            {lines.map((s) => <TipRow key={s.name} colour={s.color} name={s.name} value={s.data[at] == null ? "–" : `${fmt(s.data[at])}%`} />)}
          </ChartTip>
        )}
        <p className="text-xs text-gray-500">{barLabel} per {unitLabel}</p>
        <svg viewBox={`0 0 ${W} ${VH}`} role="img" className="block h-auto w-full" aria-label={`${barLabel} per ${grain}`}>
          <g stroke={GRID} strokeWidth="1">{ticks.map((t) => <line key={t} x1={padL} x2={W - padR} y1={yOf(t)} y2={yOf(t)} strokeDasharray={t === 0 ? undefined : "3 4"} />)}</g>
          {midnights(vT, VH - vB, true)}
          <g fill={AXIS} fontSize="11">{ticks.map((t) => <text key={t} x={padL - 8} y={yOf(t) + 4} textAnchor="end">{fmt(t)}</text>)}</g>
          {xLabels(VH)}
          {x.map((_, i) => {
            let acc = 0;
            return bars.map((s, si) => {
              const v = s.data[i] ?? 0;
              const y0 = yOf(acc), y1 = yOf(acc + v);
              acc += v;
              return v > 0 ? <rect key={`${i}-${si}`} x={cx(i) - barW / 2} y={y1} width={barW} height={Math.max(1, y0 - y1)} fill={s.color} rx={barW > 6 ? 2 : 0} /> : null;
            });
          })}
          {peakNote && peakAt >= 0 && (
            <text x={Math.min(cx(peakAt), W - padR - 60)} y={Math.max(yOf(totals[peakAt]) - 10, vT + 12)} fontSize="12" fontWeight="700" fill={STRONG} textAnchor="middle" stroke={SURFACE} strokeWidth="3.5" paintOrder="stroke">{peakNote}</text>
          )}
          {hits(vT, VH - vB)}
          {cross(vT, VH - vB)}
        </svg>
        {lines.length > 0 && (
          <>
            <p className="pt-2 text-xs text-gray-500">{lineLabel[0].toUpperCase() + lineLabel.slice(1)}</p>
            <svg viewBox={`0 0 ${W} ${SH}`} role="img" className="block h-auto w-full" aria-label={`${lines.map((l) => l.name).join(" and ")}, ${lineLabel}`}>
              <g stroke={GRID} strokeWidth="1">{[0, 50, 100].map((p) => <line key={p} x1={padL} x2={W - padR} y1={yPct(p)} y2={yPct(p)} strokeDasharray={p === 0 ? undefined : "3 4"} />)}</g>
              {midnights(sT, SH - sB, false)}
              <g fill={AXIS} fontSize="11">{[0, 50, 100].map((p) => <text key={p} x={padL - 8} y={yPct(p) + 4} textAnchor="end">{p}%</text>)}</g>
              {xLabels(SH)}
              {lines.map((s) => {
                const segs: string[][] = [];
                s.data.forEach((v, i) => {
                  if (v == null) { segs.push([]); return; }
                  if (!segs.length) segs.push([]);
                  segs[segs.length - 1].push(`${cx(i)},${yPct(v)}`);
                });
                return segs.filter((p) => p.length > 1).map((p, k) => (
                  <polyline key={`${s.name}${k}`} points={p.join(" ")} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                ));
              })}
              {lines.map((s) => {
                const last = [...s.data].map((v, i) => [v, i] as const).reverse().find(([v]) => v != null);
                return last ? <g key={`e${s.name}`}><circle cx={cx(last[1])} cy={yPct(last[0] as number)} r="4.5" fill={s.color} stroke={SURFACE} strokeWidth="2" />
                  <text x={cx(last[1]) - 8} y={yPct(last[0] as number) - 9} fontSize="12" fontWeight="700" fill={STRONG} textAnchor="end" stroke={SURFACE} strokeWidth="3" paintOrder="stroke">{fmt(last[0])}%</text></g> : null;
              })}
              {hits(sT, SH - sB)}
              {cross(sT, SH - sB)}
            </svg>
          </>
        )}
      </div>
      <details className="text-sm">
        <summary className="inline-flex min-h-8 cursor-pointer items-center text-xs font-semibold text-gray-600 hover:text-brand-palette-700 max-md:min-h-11">Table view</summary>
        <div className="mt-2 max-h-105 overflow-auto rounded-2xl border border-card-border">
          <table className="w-full border-collapse text-xs">
            <thead className="sticky top-0 z-20 border-0 border-b border-card-border bg-white">
              <tr>
                <th className="px-3 py-2 text-left font-semibold text-gray-900">{grain === "day" ? "Day" : "Hour"}</th>
                {bars.map((s) => <th key={s.name} className="px-3 py-2 text-right font-semibold text-gray-900">{s.name}</th>)}
                {lines.map((s) => <th key={s.name} className="px-3 py-2 text-right font-semibold text-gray-900">{s.name}</th>)}
              </tr>
            </thead>
            <tbody>{x.map((h, i) => {
              const p = parse(h);
              return (
                <tr key={h} className="border-0 border-b border-card-border last:border-b-0 even:bg-gray-50/60">
                  <td className="whitespace-nowrap px-3 py-2 text-gray-700">{grain === "day" ? p.day : `${p.day} ${p.hour}:00`}</td>
                  {bars.map((s) => <td key={s.name} className="px-3 py-2 text-right tabular-nums text-gray-700">{fmt(s.data[i])}</td>)}
                  {lines.map((s) => <td key={s.name} className="px-3 py-2 text-right tabular-nums text-gray-700">{s.data[i] == null ? "–" : `${fmt(s.data[i])}%`}</td>)}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

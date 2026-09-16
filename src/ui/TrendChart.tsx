"use client";
/**
 * The Pulse trend: how much arrived each hour, and which way it leaned. Volume is
 * stacked bars on the left axis; the share lines are percentages on the right, so a
 * falling line next to rising bars is readable at a glance — the question everyone
 * actually asks in a crisis. Built for the page width rather than the 640px card
 * charts: at 70-odd hours the bars have to stay wide enough to see.
 */
import { useState } from "react";

export type TrendBar = { name: string; data: number[]; color: string };
export type TrendLine = { name: string; data: (number | null)[]; color: string };

const fmt = (n: number | null | undefined) => (n == null ? "–" : n.toLocaleString("en-US", { maximumFractionDigits: n < 10 ? 1 : 0 }));
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2026-09-14 09:00" → { day: "14 Sep", hour: "09" } */
function parse(h: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2})/.exec(h);
  return m ? { day: `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]}`, hour: m[4] } : { day: h, hour: "" };
}

export function TrendChart({ x, bars, lines, barLabel, lineLabel, peakNote, height = 300 }: {
  x: string[];
  bars: TrendBar[];
  lines: TrendLine[];
  barLabel: string;
  lineLabel: string;
  peakNote?: string;
  height?: number;
}) {
  const [at, setAt] = useState<number | null>(null);
  const W = 1240, H = height, padL = 54, padR = lines.length ? 46 : 16, padT = 20, padB = 46;
  const n = x.length;
  const totals = x.map((_, i) => bars.reduce((a, s) => a + (s.data[i] ?? 0), 0));
  const niceMax = niceCeil(Math.max(1, ...totals));
  const band = (W - padL - padR) / Math.max(1, n);
  const barW = Math.max(2, Math.min(26, band - 2));
  const yOf = (v: number) => padT + (H - padT - padB) * (1 - v / niceMax);
  const yPct = (v: number) => padT + (H - padT - padB) * (1 - v / 100);
  const cx = (i: number) => padL + band * i + band / 2;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * niceMax);
  const peakAt = totals.indexOf(Math.max(...totals));
  const hovered = at != null ? parse(x[at]) : null;

  return (
    <div className="viz trend" onMouseLeave={() => setAt(null)}>
      {at != null && hovered && (
        <div className="tip" style={{ left: `${((cx(at) - padL) / (W - padL - padR)) * 100}%`, top: 8 }}>
          <b>{hovered.day} {hovered.hour}:00</b>
          {bars.map((s) => <div key={s.name}><i style={{ background: s.color }} />{s.name}: {fmt(s.data[at])}</div>)}
          {lines.map((s) => <div key={s.name}><i style={{ background: s.color }} />{s.name}: {s.data[at] == null ? "–" : `${fmt(s.data[at])}%`}</div>)}
        </div>
      )}
      <svg viewBox={`0 0 ${W} ${H}`} role="img" style={{ width: "100%", height: "auto", display: "block" }}
        aria-label={`${barLabel} per hour with ${lines.map((l) => l.name).join(" and ")}`}>
        <g stroke="var(--line)" strokeWidth="1">{ticks.map((t) => <line key={t} x1={padL} x2={W - padR} y1={yOf(t)} y2={yOf(t)} />)}</g>
        {/* midnight dividers and the day they open */}
        {x.map((h, i) => parse(h).hour === "00" && (
          <g key={`d${i}`}>
            <line x1={cx(i) - band / 2} x2={cx(i) - band / 2} y1={padT} y2={H - padB} stroke="var(--line-2)" strokeWidth="1" strokeDasharray="3 3" />
            <text x={cx(i) - band / 2 + 6} y={padT + 2} fontSize="12" fontWeight="600" fill="var(--text-3)" stroke="var(--bg)" strokeWidth="3" paintOrder="stroke">{parse(h).day}</text>
          </g>
        ))}
        <g fill="var(--text-3)" fontSize="11">
          {ticks.map((t) => <text key={t} x={padL - 8} y={yOf(t) + 4} textAnchor="end">{fmt(t)}</text>)}
          {lines.length > 0 && [0, 25, 50, 75, 100].map((p) => <text key={p} x={W - padR + 8} y={yPct(p) + 4} fill="var(--text-3)">{p}%</text>)}
          {x.map((h, i) => {
            const { hour } = parse(h);
            const every = n > 96 ? 12 : n > 48 ? 6 : 3;
            return Number(hour) % every === 0 ? <text key={`x${i}`} x={cx(i)} y={H - 26} textAnchor="middle">{hour}</text> : null;
          })}
          <text x={padL} y={H - 8} fill="var(--text-3)" fontSize="11">{barLabel} per hour, by hour of the day (WIB){lines.length ? ` · right axis: ${lineLabel}` : ""}</text>
        </g>
        {/* volume */}
        {x.map((_, i) => {
          let acc = 0;
          return bars.map((s, si) => {
            const v = s.data[i] ?? 0;
            const y0 = yOf(acc), y1 = yOf(acc + v);
            acc += v;
            return v > 0 ? <rect key={`${i}-${si}`} x={cx(i) - barW / 2} y={y1} width={barW} height={Math.max(1, y0 - y1)} fill={s.color} rx={barW > 6 ? 2 : 0} /> : null;
          });
        })}
        {/* share lines */}
        {lines.map((s) => {
          const segs: string[][] = [];
          s.data.forEach((v, i) => {
            if (v == null) { segs.push([]); return; }
            if (!segs.length) segs.push([]);
            segs[segs.length - 1].push(`${cx(i)},${yPct(v)}`);
          });
          return segs.filter((p) => p.length > 1).map((p, k) => (
            <polyline key={`${s.name}${k}`} points={p.join(" ")} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
          ));
        })}
        {lines.map((s) => {
          const last = [...s.data].map((v, i) => [v, i] as const).reverse().find(([v]) => v != null);
          return last ? <g key={`e${s.name}`}><circle cx={cx(last[1])} cy={yPct(last[0] as number)} r="4.5" fill={s.color} stroke="var(--bg)" strokeWidth="2" />
            <text x={cx(last[1]) - 8} y={yPct(last[0] as number) - 9} fontSize="12" fontWeight="700" fill={s.color} textAnchor="end" stroke="var(--bg)" strokeWidth="3" paintOrder="stroke">{fmt(last[0])}%</text></g> : null;
        })}
        {peakNote && peakAt >= 0 && (
          <text x={Math.min(cx(peakAt), W - padR - 60)} y={Math.max(yOf(totals[peakAt]) - 10, padT + 12)} fontSize="12" fontWeight="700" fill="var(--text-2)" textAnchor="middle" stroke="var(--bg)" strokeWidth="3.5" paintOrder="stroke">{peakNote}</text>
        )}
        {/* one hover band per hour, so the tooltip carries every series at once */}
        {x.map((_, i) => <rect key={`h${i}`} x={cx(i) - band / 2} y={padT} width={band} height={H - padT - padB} fill="transparent" onMouseEnter={() => setAt(i)} />)}
        {at != null && <line x1={cx(at)} x2={cx(at)} y1={padT} y2={H - padB} stroke="var(--text-3)" strokeWidth="1" pointerEvents="none" />}
      </svg>
      <div className="legend">
        {bars.map((s) => <span key={s.name}><i style={{ background: s.color }} />{s.name}</span>)}
        {lines.map((s) => <span key={s.name}><i style={{ background: s.color, height: 3, borderRadius: 2 }} />{s.name}</span>)}
      </div>
    </div>
  );
}

function niceCeil(v: number): number {
  const p = 10 ** Math.floor(Math.log10(v));
  const m = v / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10) * p;
}

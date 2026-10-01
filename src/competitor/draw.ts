/**
 * Drawing helpers shared by every slide of the weekly deck: Fair's white and
 * blue, the page chrome, titles, chips and rich text. Works on PptxGenJS and on
 * the PDF recorder alike (src/competitor/pdfdeck.ts).
 */
import type PptxGenJS from "pptxgenjs";
import type { EvidencePost, Flag, WeeklyReport } from "./types";
import { compact, dayMonth, formatName, pct, TIER_NAME, type Seg } from "./view";

export type Slide = PptxGenJS.Slide;
export type Runs = PptxGenJS.TextProps[];

export const C = {
  blue: "1D4ED8", blue5: "2563EB", blue1: "DBEAFE", blue05: "EFF6FF",
  ink: "0F172A", ink6: "475569", ink4: "94A3B8", line: "E2E8F0", white: "FFFFFF",
  warn: "B45309", warnBg: "FEF3C7", bar: "CBD5E1",
};
export const FONT = "Arial";
export const W = 13.333;
export const M = 0.5;
export const CW = W - 2 * M;

export const arrow = (f: Flag) => (f.direction === "up" ? "▲" : "▼");
export const text = (t: string, o: PptxGenJS.TextPropsOptions = {}): PptxGenJS.TextProps => ({ text: t, options: { fontFace: FONT, ...o } });

export function segRuns(segs: Seg[], size: number, color = C.ink): Runs {
  return segs.filter((s) => s.t).map((s) => text(s.t, { fontSize: size, bold: !!s.strong, color: s.muted ? C.ink4 : color }));
}

export function add(slide: Slide, runs: Runs | string, o: PptxGenJS.TextPropsOptions) {
  slide.addText(runs as Runs, { fontFace: FONT, margin: 0, valign: "top", isTextBox: true, ...o } as PptxGenJS.TextPropsOptions);
}

export function chrome(slide: Slide, r: WeeklyReport, page: number, sampleLabel?: string) {
  add(slide, `${r.title} · ${r.week.label}`, { x: M, y: 0.32, w: 8, h: 0.25, fontSize: 10, color: C.ink4 });
  if (sampleLabel) add(slide, sampleLabel, { x: W - M - 4.5, y: 0.32, w: 4.5, h: 0.25, fontSize: 10, color: C.warn, align: "right" });
  add(slide, r.client ? `Fair · prepared for ${r.client}` : "Fair Intelligence", { x: M, y: 7.08, w: 6, h: 0.22, fontSize: 9, color: C.ink4 });
  add(slide, String(page), { x: W - M - 1, y: 7.08, w: 1, h: 0.22, fontSize: 9, color: C.ink4, align: "right" });
}

export function title(slide: Slide, t: string, sub?: string) {
  add(slide, t, { x: M, y: 0.62, w: CW, h: 0.6, fontSize: 26, bold: true, color: C.ink, valign: "middle", fit: "shrink" });
  if (sub) add(slide, sub, { x: M, y: 1.22, w: CW, h: 0.3, fontSize: 12, color: C.ink6 });
}

export function chip(slide: Slide, t: string, x: number, y: number, o: { fill?: string; color?: string; w?: number; size?: number } = {}) {
  const w = o.w ?? Math.max(0.7, t.length * 0.075 + 0.3);
  slide.addShape("roundRect", { x, y, w, h: 0.26, fill: { color: o.fill ?? C.blue05 }, line: { color: o.fill ?? C.blue05, width: 0 }, rectRadius: 0.13 });
  add(slide, t, { x, y, w, h: 0.26, fontSize: o.size ?? 9, bold: true, color: o.color ?? C.blue, align: "center", valign: "middle" });
  return w;
}


/** One post as a card: who, reach, format, date, the caption; the evidence ref in the corner. `brand` names the brand too (posts from several brands). */
export function postCard(s: Slide, p: EvidencePost, x: number, y: number, w: number, h: number, o: { brand?: boolean } = {}) {
  s.addShape("roundRect", { x, y, w, h, fill: { color: C.white }, line: { color: C.line, width: 0.75 }, rectRadius: 0.06 });
  chip(s, p.ref, x + w - 0.62, y + 0.12, { w: 0.5, fill: C.blue1 });
  const handle = p.creator_handle ? `@${p.creator_handle}` : "brand account";
  add(s, [text(handle, { fontSize: handle.length > 22 ? 8.5 : handle.length > 18 ? 9.5 : 11, bold: true, color: C.blue5, hyperlink: { url: p.url } })], { x: x + 0.14, y: y + 0.12, w: w - 0.8, h: 0.26, valign: "middle" });
  const line1 = [p.source === "owned" ? "Brand account" : TIER_NAME[p.tier ?? "unknown"] ?? p.tier, `${compact(p.views)} views`, p.er != null ? `${pct(p.er)} ER` : null].filter(Boolean).join(" · ");
  const line2 = [o.brand ? p.group : null, p.content_format && p.content_format !== "other" ? formatName(p.content_format) : null, p.has_cart ? "yellow cart" : null, dayMonth(p.posted_at)].filter(Boolean).join(" · ");
  add(s, [text(line1, { fontSize: 9, color: C.ink, breakLine: true }), text(line2, { fontSize: 8.5, color: C.ink4 })], { x: x + 0.14, y: y + 0.42, w: w - 0.28, h: 0.42 });
  if (p.caption) add(s, `“${p.caption.length > 100 ? p.caption.slice(0, 99) + "…" : p.caption}”`, { x: x + 0.14, y: y + 0.92, w: w - 0.28, h: h - 1.02, fontSize: 9, italic: true, color: C.ink6 });
}

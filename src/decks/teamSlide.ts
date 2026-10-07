/**
 * A team's own slide (DECISIONS, 7 Oct 2026, "Teams build their own"): an analysis the
 * team saved (a recipe, or a skill pinned from Chats) drawn in any deck, PR, Social or
 * Brand & KOL. The slide picks its shape from the rows: bars over time when the rows
 * run by day, week or month; a split when they divide one whole (sentiment, stance,
 * side); bars for a short ranked list; a table otherwise. The rows are the analysis's
 * own, counted in SQL; the slide only prints them and names its biggest value.
 */
import type PptxGenJS from "pptxgenjs";
import { C, CW, FONT, M, add, text, title, type Slide } from "../competitor/draw";
import type { Finding, FindingColumn } from "../competitor/types";
import { compact, dayMonth, int, pct } from "../competitor/view";

const TIME = ["day", "week", "month"];
const SPLIT = ["sentiment", "stance", "voice", "source"];
const SERIES = ["E5484D", "94A3B8", "1E5EFF", "0E9F6E", "D98E04", "7C5CFF"];
const NAMED: Record<string, string> = { negative: "E5484D", neutral: "94A3B8", positive: "0E9F6E", unlabelled: "E2E8F0", unknown: "CBD5E1", unclear: "CBD5E1" };

export type TeamShape = "time" | "split" | "bars" | "table";

const isNum = (c: FindingColumn) => c.format === "int" || c.format === "num" || c.format === "compact" || c.format === "pct";

/** A value as the slide prints it. */
export function cell(v: unknown, f: FindingColumn["format"]): string {
  if (v == null || v === "") return "–";
  if (typeof v === "number") return f === "pct" ? pct(v) : f === "compact" ? compact(v) : f === "int" ? int(v) : f === "num" ? v.toFixed(Math.abs(v) < 1 ? 2 : 1) : String(v);
  if (f === "date" && typeof v === "string") return dayMonth(v);
  const t = String(v).replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 59) + "…" : t;
}

/** The column that is the bar's height: a count first, else the first measure. */
function measureOf(cols: FindingColumn[]): FindingColumn | null {
  const nums = cols.filter(isNum);
  return nums.find((c) => c.format !== "pct") ?? nums[0] ?? null;
}

const timeLabel = (key: string, v: string) => (key === "month" ? v : dayMonth(v.slice(0, 10)));

/** How the rows read best. */
export function teamShape(f: Pick<Finding, "columns" | "rows">): TeamShape {
  const cols = f.columns;
  const m = measureOf(cols);
  if (!m || !f.rows.length) return "table";
  const texts = cols.filter((c) => !isNum(c) && c.key !== "url");
  if (texts.some((c) => TIME.includes(c.key))) return "time";
  if (texts.length === 1 && m.format !== "pct" && f.rows.length <= 6 && (SPLIT.includes(texts[0].key) || f.rows.length <= 3)) return "split";
  if (texts.length >= 1 && f.rows.length <= 12) return "bars";
  return "table";
}

/** One sentence from the rows themselves: the peak, the biggest part or the top row. */
export function teamLine(f: Finding): string | undefined {
  if (f.status !== "ok" || !f.rows.length) return undefined;
  const m = measureOf(f.columns);
  if (!m) return undefined;
  const shape = teamShape(f);
  const texts = f.columns.filter((c) => !isNum(c) && c.key !== "url");
  const val = (r: Record<string, unknown>) => (typeof r[m.key] === "number" ? (r[m.key] as number) : 0);
  if (shape === "time") {
    const t = texts.find((c) => TIME.includes(c.key))!;
    const by = new Map<string, number>();
    for (const r of f.rows) by.set(String(r[t.key]), (by.get(String(r[t.key])) ?? 0) + val(r));
    const peak = [...by.entries()].sort((a, b) => b[1] - a[1])[0];
    const total = [...by.values()].reduce((a, b) => a + b, 0);
    return `${cell(total, m.format)} ${m.label.toLowerCase()} in all; the most on ${timeLabel(t.key, peak[0])} (${cell(peak[1], m.format)}).`;
  }
  const top = [...f.rows].sort((a, b) => val(b) - val(a))[0];
  const name = texts[0] ? cell(top[texts[0].key], texts[0].format) : "The top row";
  if (shape === "split") {
    const total = f.rows.reduce((a, r) => a + val(r), 0);
    return `${name}: ${pct(total ? Math.round((val(top) / total) * 1000) / 10 : null)} of ${cell(total, m.format)} ${m.label.toLowerCase()}.`;
  }
  return `${name} leads with ${cell(val(top), m.format)} ${m.label.toLowerCase()}.`;
}

function bars(s: Slide, labels: string[], stacks: { values: number[]; color: string }[], x: number, y: number, w: number, h: number) {
  const totals = labels.map((_, i) => stacks.reduce((a, st) => a + (st.values[i] ?? 0), 0));
  const max = Math.max(1, ...totals);
  const slot = w / Math.max(1, labels.length);
  s.addShape("line", { x, y: y + h, w, h: 0, line: { color: C.line, width: 0.75 } });
  labels.forEach((l, i) => {
    let top = y + h;
    for (const st of stacks) {
      const v = st.values[i] ?? 0;
      if (!v) continue;
      const bh = (v / max) * (h - 0.1);
      top -= bh;
      s.addShape("rect", { x: x + i * slot + slot * 0.14, y: top, w: Math.max(0.02, slot * 0.72), h: Math.max(0.01, bh), fill: { color: st.color }, line: { color: "FFFFFF", width: 0 } });
    }
    if (labels.length <= 16 && totals[i]) add(s, int(totals[i]), { x: x + i * slot, y: top - 0.24, w: slot, h: 0.2, fontSize: 8, color: C.ink6, align: "center" });
    if (i % Math.max(1, Math.ceil(labels.length / 14)) === 0) add(s, l, { x: x + i * slot - 0.2, y: y + h + 0.04, w: Math.max(0.9, slot + 0.4), h: 0.2, fontSize: 8, color: C.ink4, align: labels.length <= 16 ? "center" : "left" });
  });
}

function legend(s: Slide, items: [string, string][], x: number, y: number) {
  items.slice(0, 6).forEach(([l, c], i) => {
    s.addShape("rect", { x: x + i * 2.0, y: y + 0.04, w: 0.2, h: 0.14, fill: { color: c }, line: { color: "FFFFFF", width: 0 } });
    add(s, l, { x: x + i * 2.0 + 0.26, y, w: 1.7, h: 0.22, fontSize: 9, color: C.ink6 });
  });
}

function rowsTable(s: Slide, f: Finding, y: number, maxH: number) {
  const cols = f.columns.slice(0, 7);
  const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [3, 6, 3, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
  const head = cols.map((c) => ({ text: [text(c.label, { fontSize: 9.5, bold: true, color: C.ink6 })], options: { ...hb, align: isNum(c) ? "right" : "left", border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] } })) as PptxGenJS.TableRow;
  const rows = f.rows.slice(0, 10);
  const body = rows.map((row) => cols.map((c, i) => {
    const v = row[c.key];
    const url = c.key === "url" && typeof v === "string" ? v : null;
    return { text: [text(url ? "open" : cell(v, c.format), { fontSize: 10, bold: i === 0, color: url ? C.blue5 : C.ink, ...(url ? { hyperlink: { url } } : {}) })], options: { ...hb, align: isNum(c) ? "right" : "left" } };
  })) as PptxGenJS.TableRow[];
  const textCols = cols.filter((c) => !isNum(c)).length;
  const numW = 1.3;
  const textW = textCols ? (CW - numW * (cols.length - textCols)) / textCols : numW;
  const rh = Math.min(0.38, maxH / Math.max(1, rows.length + 1));
  s.addTable([head, ...body], { x: M, y, w: CW, colW: cols.map((c) => (isNum(c) ? numW : textW)), rowH: [0.32, ...body.map(() => rh)] });
}

/**
 * Draw one team slide. `frame` draws the deck's own chrome (top line, page); `period` names
 * the version's dates; `foot` is where the deck puts its footnote.
 */
export function teamSlide(pres: PptxGenJS, f: Finding, o: { frame: (s: Slide) => void; period: string; foot: (s: Slide, t: string) => void }): void {
  const s = pres.addSlide();
  o.frame(s);
  title(s, f.title, teamLine(f));
  const from = [f.by ? `Made by ${f.by}` : "Your team's slide", f.question && f.question !== f.title ? `“${f.question.length > 90 ? f.question.slice(0, 89) + "…" : f.question}”` : null].filter(Boolean).join(" · ");
  add(s, from, { x: M, y: 1.62, w: CW, h: 0.26, fontSize: 9.5, color: C.ink6, fit: "shrink" });
  if (f.status !== "ok" || !f.rows.length) {
    s.addShape("roundRect", { x: M, y: 2.1, w: CW, h: 1.0, fill: { color: C.blue05 }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
    add(s, f.message || `Nothing for ${o.period}.`, { x: M + 0.3, y: 2.2, w: CW - 0.6, h: 0.8, fontSize: 13, color: C.ink6, valign: "middle" });
    s.addNotes(`${f.title}: ${f.message ?? "no rows"}`);
    return;
  }
  const shape = teamShape(f);
  const m = measureOf(f.columns)!;
  const texts = f.columns.filter((c) => !isNum(c) && c.key !== "url");
  const val = (r: Record<string, unknown>) => (typeof r[m.key] === "number" ? (r[m.key] as number) : 0);
  if (shape === "time") {
    const t = texts.find((c) => TIME.includes(c.key))!;
    const series = texts.find((c) => c !== t);
    const times = [...new Set(f.rows.map((r) => String(r[t.key])))].sort().slice(-40);
    // the parts read bottom up in a fixed order: negative first, the rest after
    const ORDER = ["negative", "against", "neutral", "positive", "unlabelled", "unknown", "unclear"];
    const rank = (x: string) => (ORDER.includes(x.toLowerCase()) ? ORDER.indexOf(x.toLowerCase()) : 3.5);
    const names = series ? [...new Set(f.rows.map((r) => String(r[series.key])))].sort((a, b) => rank(a) - rank(b)).slice(0, 6) : [m.label];
    const color = (n: string, i: number) => NAMED[n.toLowerCase()] ?? SERIES[i % SERIES.length];
    const stacks = names.map((n, i) => ({ values: times.map((tm) => f.rows.filter((r) => String(r[t.key]) === tm && (!series || String(r[series.key]) === n)).reduce((a, r) => a + val(r), 0)), color: series ? color(n, i) : C.blue5 }));
    add(s, `${m.label} per ${t.key}`, { x: M, y: 2.0, w: CW, h: 0.24, fontSize: 10, bold: true, color: C.ink6 });
    bars(s, times.map((tm) => timeLabel(t.key, tm)), stacks, M + 0.2, 2.45, CW - 0.4, 3.4);
    if (series) legend(s, names.map((n, i) => [n, color(n, i)]), M, 6.2);
  } else if (shape === "split") {
    const total = f.rows.reduce((a, r) => a + val(r), 0) || 1;
    const name = texts[0];
    let x = M;
    f.rows.forEach((r, i) => {
      const w = (val(r) / total) * CW;
      const n = String(r[name.key]);
      const c = NAMED[n.toLowerCase()] ?? SERIES[i % SERIES.length];
      if (w > 0) s.addShape("rect", { x, y: 2.3, w, h: 0.7, fill: { color: c }, line: { color: "FFFFFF", width: 1 } });
      if (w > 0.9) add(s, pct(Math.round((val(r) / total) * 1000) / 10), { x, y: 2.3, w, h: 0.7, fontSize: 12, bold: true, color: "FFFFFF", align: "center", valign: "middle" });
      x += w;
    });
    legend(s, f.rows.map((r, i) => [`${cell(r[name.key], name.format)} · ${cell(val(r), m.format)}`, NAMED[String(r[name.key]).toLowerCase()] ?? SERIES[i % SERIES.length]]), M, 3.2);
    rowsTable(s, f, 3.8, 2.6);
  } else if (shape === "bars") {
    const name = texts[0];
    const rows = [...f.rows].sort((a, b) => val(b) - val(a)).slice(0, 12);
    const max = Math.max(1, ...rows.map(val));
    const rh = Math.min(0.38, 4.3 / rows.length);
    const others = f.columns.filter((c) => isNum(c) && c !== m).slice(0, 3);
    rows.forEach((r, i) => {
      const y = 2.05 + i * rh;
      add(s, cell(r[name.key], name.format), { x: M, y, w: 3.2, h: rh, fontSize: 10, bold: true, color: C.ink, valign: "middle" });
      s.addShape("rect", { x: M + 3.3, y: y + rh * 0.2, w: Math.max(0.03, (val(r) / max) * 5.6), h: rh * 0.6, fill: { color: C.blue5 }, line: { color: "FFFFFF", width: 0 } });
      add(s, cell(r[m.key], m.format), { x: M + 3.3 + (val(r) / max) * 5.6 + 0.08, y, w: 1.0, h: rh, fontSize: 10, color: C.ink, valign: "middle" });
      add(s, others.map((c) => `${c.label}: ${cell(r[c.key], c.format)}`).join(" · "), { x: M + 9.2, y, w: CW - 9.2, h: rh, fontSize: 9, color: C.ink6, valign: "middle" });
    });
  } else {
    rowsTable(s, f, 2.05, 4.3);
  }
  o.foot(s, `${f.rows_total > 10 && shape !== "time" ? `First 10 of ${int(f.rows_total)} rows. ` : ""}The team's own analysis, counted again for ${o.period}${f.data_window ? ` (${dayMonth(f.data_window.from)}–${dayMonth(f.data_window.to)})` : ""}.`);
  s.addNotes(`${f.title}\n${teamLine(f) ?? ""}\n${f.question}`);
}

/** The team slides as the fact sheet prints them, for Ask AI on the slide. */
export function teamSheet(fs: Finding[] | undefined): string[] {
  if (!fs?.length) return [];
  const out = ["", "TEAM SLIDES (the team's own analyses, counted for this period)"];
  for (const f of fs) {
    out.push(`- ${f.title}${f.by ? ` (made by ${f.by})` : ""}: ${f.status !== "ok" ? f.message ?? "no rows" : teamLine(f) ?? ""}`);
    for (const r of f.rows.slice(0, 10)) out.push(`  ${f.columns.map((c) => `${c.label} ${cell(r[c.key], c.format)}`).join(", ")}`);
  }
  return out;
}

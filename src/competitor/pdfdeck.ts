/**
 * The weekly report as a PDF, drawn from the same layout as the deck. The deck
 * builder (buildDeck) lays the slides out on a recorder instead of PptxGenJS;
 * this file replays what it recorded with pdfkit, at the same coordinates.
 * One layout, two files, and no LibreOffice (Vercel has none).
 *
 * Only what the deck uses is drawn: text boxes (rich runs, alignment, shrink to
 * fit, links), rounded rectangles, ellipses, lines, tables (column spans, cell
 * margins, per-side borders, fills) and single-series column charts. Speaker
 * notes stay in the .pptx. Arial is set in Liberation Sans, which has the same
 * metrics, so lines break where PowerPoint breaks them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import { buildDeck, DECK_SIZE, type DeckOptions } from "./deck";
import type { Narrative } from "./narrative";
import type { WeeklyReport } from "./types";

type Hex = string;
type RunOptions = {
  fontSize?: number; bold?: boolean; italic?: boolean; color?: Hex; breakLine?: boolean; paraSpaceAfter?: number;
  hyperlink?: { url: string }; align?: "left" | "center" | "right"; fontFace?: string;
};
type Run = { text: string; options?: RunOptions };
type BoxOptions = RunOptions & { x: number; y: number; w: number; h: number; valign?: "top" | "middle" | "bottom"; fit?: "shrink" | "resize" | "none"; margin?: number | number[] };
type ShapeOptions = { x: number; y: number; w: number; h: number; fill?: { color: Hex }; line?: { color?: Hex; width?: number }; rectRadius?: number };
type Border = { type?: "none" | "solid"; pt?: number; color?: Hex };
type CellOptions = RunOptions & { valign?: "top" | "middle" | "bottom"; margin?: number | number[]; border?: Border | Border[]; fill?: { color: Hex }; colspan?: number };
type Cell = { text: Run[] | string; options?: CellOptions };
type TableOptions = { x: number; y: number; w?: number; colW?: number[]; rowH?: number[] | number };
type ChartSeries = { name: string; labels: string[]; values: number[] };
type ChartOptions = {
  x: number; y: number; w: number; h: number; barGapWidthPct?: number; chartColors?: Hex[];
  catAxisLabelFontSize?: number; catAxisLabelColor?: Hex; catAxisLineShow?: boolean; catAxisLineColor?: Hex;
  valAxisLabelFontSize?: number; valAxisLabelColor?: Hex; valAxisLabelFormatCode?: string; valGridLine?: { color?: Hex; size?: number };
};

export type DrawOp =
  | { op: "text"; runs: Run[]; o: BoxOptions }
  | { op: "shape"; kind: string; o: ShapeOptions }
  | { op: "table"; rows: Cell[][]; o: TableOptions }
  | { op: "chart"; data: ChartSeries[]; o: ChartOptions };

/** Stands in for PptxGenJS while the deck lays itself out, and keeps every call. */
class RecordingSlide {
  ops: DrawOp[] = [];
  addText(t: Run[] | string, o: BoxOptions) {
    const runs = typeof t === "string" ? [{ text: t, options: {} }] : t;
    this.ops.push({ op: "text", runs, o });
    return this;
  }
  addShape(kind: string, o: ShapeOptions) {
    this.ops.push({ op: "shape", kind, o });
    return this;
  }
  addTable(rows: Cell[][], o: TableOptions) {
    this.ops.push({ op: "table", rows, o });
    return this;
  }
  addChart(_type: string, data: ChartSeries[], o: ChartOptions) {
    this.ops.push({ op: "chart", data, o });
    return this;
  }
  addNotes() {
    return this;
  }
}
class RecordingDeck {
  slides: RecordingSlide[] = [];
  ChartType = { bar: "bar" };
  addSlide() {
    const s = new RecordingSlide();
    this.slides.push(s);
    return s;
  }
}

/** The deck's slides as drawing operations. */
export function recordDeck(r: WeeklyReport, n: Narrative, opts: DeckOptions = {}): DrawOp[][] {
  const rec = new RecordingDeck();
  buildDeck(rec as unknown as Parameters<typeof buildDeck>[0], r, n, opts);
  return rec.slides.map((s) => s.ops);
}

// ---------------------------------------------------------------- drawing
const PT = 72;
const FONT_DIR = path.join(process.cwd(), "assets/fonts");
let fontCache: Record<string, Buffer> | null = null;
function fonts(): Record<string, Buffer> {
  if (!fontCache) {
    fontCache = {
      regular: readFileSync(path.join(FONT_DIR, "LiberationSans-Regular.ttf")),
      bold: readFileSync(path.join(FONT_DIR, "LiberationSans-Bold.ttf")),
      italic: readFileSync(path.join(FONT_DIR, "LiberationSans-Italic.ttf")),
      boldItalic: readFileSync(path.join(FONT_DIR, "LiberationSans-BoldItalic.ttf")),
    };
  }
  return fontCache;
}
const faceOf = (o: RunOptions) => (o.bold && o.italic ? "boldItalic" : o.bold ? "bold" : o.italic ? "italic" : "regular");
const colour = (c: Hex | undefined, fallback = "000000") => `#${(c ?? fallback).replace(/^#/, "")}`;
/** PowerPoint's single line spacing is about 1.2 × the font size. */
const LINE = 1.2;

type Doc = InstanceType<typeof PDFDocument>;
type Para = { runs: Run[]; after: number };

function paragraphs(runs: Run[], base: RunOptions): Para[] {
  const out: Para[] = [];
  let cur: Run[] = [];
  let after = 0;
  for (const r of runs) {
    const o = { ...base, ...(r.options ?? {}) };
    // a newline inside a run is a paragraph break too
    const parts = String(r.text ?? "").split("\n");
    parts.forEach((part, i) => {
      if (i > 0) { out.push({ runs: cur, after: 0 }); cur = []; }
      cur.push({ text: part, options: o });
    });
    after = o.paraSpaceAfter ?? 0;
    if (o.breakLine) { out.push({ runs: cur, after }); cur = []; after = 0; }
  }
  if (cur.length) out.push({ runs: cur, after });
  return out.filter((p) => p.runs.some((r) => r.text.length) || p.after > 0 || out.length === 1);
}

function sizeOf(o: RunOptions, scale: number): number {
  return (o.fontSize ?? 18) * scale;
}

/** Height of a paragraph set in width `w` (points), at `scale` of the font sizes. */
function measure(doc: Doc, paras: Para[], w: number, scale: number): number {
  let h = 0;
  for (const p of paras) {
    const size = Math.max(...p.runs.map((r) => sizeOf(r.options!, scale)));
    const text = p.runs.map((r) => r.text).join("");
    const bold = p.runs.find((r) => sizeOf(r.options!, scale) === size)?.options;
    doc.font(fonts()[faceOf(bold ?? {})]).fontSize(size);
    const lines = text ? Math.max(1, Math.round(doc.heightOfString(text, { width: w, lineGap: 0 }) / doc.currentLineHeight(true))) : 1;
    h += lines * size * LINE + p.after;
  }
  return h;
}

function drawParagraphs(doc: Doc, paras: Para[], x: number, y: number, w: number, scale: number, align: "left" | "center" | "right") {
  let top = y;
  for (const p of paras) {
    const size = Math.max(...p.runs.map((r) => sizeOf(r.options!, scale)));
    const runs = p.runs.filter((r) => r.text.length);
    if (!runs.length) { top += size * LINE + p.after; continue; }
    const pAlign = runs[0].options?.align ?? align;
    // pdfkit puts the first baseline one ascent below `y`; PowerPoint centres a line in 1.2 × size
    const lineGap = size * LINE - size * 1.149;
    let first = true;
    runs.forEach((r, i) => {
      const o = r.options!;
      doc.font(fonts()[faceOf(o)]).fontSize(sizeOf(o, scale)).fillColor(colour(o.color));
      const opt = { width: w, align: pAlign, continued: i < runs.length - 1, lineGap, height: 10_000, ...(o.hyperlink?.url ? { link: o.hyperlink.url } : {}) };
      if (first) { doc.text(r.text, x, top + lineGap / 2, opt); first = false; }
      else doc.text(r.text, opt);
    });
    const lines = measure(doc, [{ runs: p.runs, after: 0 }], w, scale) / (size * LINE);
    top += lines * size * LINE + p.after;
  }
}

function box(doc: Doc, runs: Run[], o: BoxOptions & { margin?: number | number[] }, inset: [number, number, number, number] = [0, 0, 0, 0]) {
  const base: RunOptions = { fontSize: o.fontSize, bold: o.bold, italic: o.italic, color: o.color, align: o.align };
  const paras = paragraphs(runs, base);
  const [mt, mr, mb, ml] = inset;
  const x = o.x * PT + ml;
  const w = Math.max(1, o.w * PT - ml - mr);
  const h = o.h * PT - mt - mb;
  let scale = 1;
  let height = measure(doc, paras, w, scale);
  if (o.fit === "shrink") {
    while (height > h && scale > 0.5) {
      scale -= 0.05;
      height = measure(doc, paras, w, scale);
    }
  }
  const top = o.y * PT + mt;
  const y = o.valign === "middle" ? top + (h - height) / 2 : o.valign === "bottom" ? top + h - height : top;
  drawParagraphs(doc, paras, x, y, w, scale, o.align ?? "left");
}

/** A PowerPoint margin in points: one number for all sides, or [top, right, bottom, left]. */
function margins(m: number | number[] | undefined, fallback: [number, number, number, number]): [number, number, number, number] {
  if (m == null) return fallback;
  if (typeof m === "number") return [m, m, m, m];
  return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0, m[3] ?? 0];
}

function shape(doc: Doc, kind: string, o: ShapeOptions) {
  const x = o.x * PT, y = o.y * PT, w = o.w * PT, h = o.h * PT;
  const stroke = o.line && (o.line.width ?? 0.75) > 0 && o.line.color ? { color: colour(o.line.color), width: o.line.width ?? 0.75 } : null;
  doc.save();
  if (kind === "line") {
    doc.moveTo(x, y).lineTo(x + w, y + h).lineWidth(stroke?.width ?? 0.75).strokeColor(stroke?.color ?? "#000000").stroke();
    doc.restore();
    return;
  }
  if (kind === "ellipse") doc.ellipse(x + w / 2, y + h / 2, w / 2, h / 2);
  else if (kind === "roundRect") doc.roundedRect(x, y, w, h, Math.min((o.rectRadius ?? 0.1) * PT, Math.min(w, h) / 2));
  else doc.rect(x, y, w, h);
  if (o.fill && stroke) doc.lineWidth(stroke.width).fillAndStroke(colour(o.fill.color), stroke.color);
  else if (o.fill) doc.fill(colour(o.fill.color));
  else if (stroke) doc.lineWidth(stroke.width).stroke(stroke.color);
  doc.restore();
}

function table(doc: Doc, rows: Cell[][], o: TableOptions) {
  const cols = o.colW ?? [];
  const nCols = cols.length || Math.max(...rows.map((r) => r.reduce((a, c) => a + (c.options?.colspan ?? 1), 0)));
  const colW = cols.length ? cols : Array.from({ length: nCols }, () => (o.w ?? 1) / nCols);
  const rowH = Array.isArray(o.rowH) ? o.rowH : rows.map(() => (o.rowH as number | undefined) ?? 0.4);
  const DEFAULT_MARGIN: [number, number, number, number] = [3.6, 7.2, 3.6, 7.2];
  // layout: each row grows to fit its tallest cell, as PowerPoint does
  const layout = rows.map((row, ri) => {
    let col = 0;
    const cells = row.map((c) => {
      const span = c.options?.colspan ?? 1;
      const x = o.x + colW.slice(0, col).reduce((a, b) => a + b, 0);
      const w = colW.slice(col, col + span).reduce((a, b) => a + b, 0);
      col += span;
      return { c, x, w };
    });
    const need = Math.max(0, ...cells.map(({ c, w }) => {
      const m = margins(c.options?.margin, DEFAULT_MARGIN);
      const runs = typeof c.text === "string" ? [{ text: c.text }] : c.text;
      return (measure(doc, paragraphs(runs, { fontSize: c.options?.fontSize ?? 12 }), w * PT - m[1] - m[3], 1) + m[0] + m[2]) / PT;
    }));
    return { cells, h: Math.max(rowH[ri] ?? 0.4, need) };
  });
  let y = o.y;
  for (const row of layout) {
    for (const { c, x, w } of row.cells) {
      const co = c.options ?? {};
      if (co.fill) shape(doc, "rect", { x, y, w, h: row.h, fill: co.fill });
      const b = Array.isArray(co.border) ? co.border : co.border ? [co.border, co.border, co.border, co.border] : [];
      const edges: [number, number, number, number][] = [[x, y, x + w, y], [x + w, y, x + w, y + row.h], [x, y + row.h, x + w, y + row.h], [x, y, x, y + row.h]];
      b.forEach((e, i) => {
        if (!e || e.type === "none" || !e.pt) return;
        const [x1, y1, x2, y2] = edges[i];
        doc.save().moveTo(x1 * PT, y1 * PT).lineTo(x2 * PT, y2 * PT).lineWidth(e.pt).strokeColor(colour(e.color, "CCCCCC")).stroke().restore();
      });
      const runs = typeof c.text === "string" ? [{ text: c.text, options: {} }] : c.text;
      box(doc, runs, { x, y, w, h: row.h, valign: co.valign ?? "top", align: co.align, fontSize: co.fontSize ?? 12, bold: co.bold, color: co.color }, margins(co.margin, DEFAULT_MARGIN));
    }
    y += row.h;
  }
}

/** An axis that ends just above the tallest bar, in about six round steps (1, 2 or 5 × a power of ten). */
export function niceAxis(v: number): { max: number; step: number } {
  if (!(v > 0)) return { max: 1, step: 0.25 };
  const raw = v / 6;
  const p = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 5, 10].map((m) => m * p).find((x) => x >= raw)!;
  return { max: Math.ceil(v / step - 1e-9) * step, step };
}

function axisLabel(v: number, code: string | undefined): string {
  if (code && code.includes("%")) return `${v.toFixed(v !== 0 && Math.abs(v) < 0.1 ? 2 : 1)}%`;
  return Math.round(v).toLocaleString("en-US");
}

function chart(doc: Doc, data: ChartSeries[], o: ChartOptions) {
  const s = data[0];
  if (!s || !s.values.length) return;
  const labelW = 0.55;
  const x0 = o.x * PT + labelW * PT, x1 = (o.x + o.w) * PT - 0.1 * PT;
  const y0 = o.y * PT + 0.12 * PT, y1 = (o.y + o.h) * PT - 0.32 * PT;
  const { max, step } = niceAxis(Math.max(...s.values));
  const ticks = Math.round(max / step);
  const vSize = o.valAxisLabelFontSize ?? 8;
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    const y = y1 - ((y1 - y0) * i) / ticks;
    if (i > 0) doc.save().moveTo(x0, y).lineTo(x1, y).lineWidth(o.valGridLine?.size ?? 0.5).strokeColor(colour(o.valGridLine?.color, "E2E8F0")).stroke().restore();
    doc.font(fonts().regular).fontSize(vSize).fillColor(colour(o.valAxisLabelColor, "94A3B8"))
      .text(axisLabel(v, o.valAxisLabelFormatCode), o.x * PT, y - vSize * 0.6, { width: labelW * PT - 6, align: "right", lineBreak: false });
  }
  const n = s.values.length;
  const band = (x1 - x0) / n;
  const gap = (o.barGapWidthPct ?? 50) / 100;
  const bw = band / (1 + gap);
  const cSize = o.catAxisLabelFontSize ?? 7;
  s.values.forEach((v, i) => {
    const h = ((y1 - y0) * Math.max(0, v)) / max;
    const bx = x0 + band * i + (band - bw) / 2;
    if (h > 0) doc.save().rect(bx, y1 - h, bw, h).fill(colour(o.chartColors?.[i % (o.chartColors?.length || 1)], "1D4ED8")).restore();
    doc.font(fonts().regular).fontSize(cSize).fillColor(colour(o.catAxisLabelColor, "475569"))
      .text(s.labels[i] ?? "", x0 + band * i, y1 + 4, { width: band, align: "center", lineBreak: false });
  });
  if (o.catAxisLineShow !== false) doc.save().moveTo(x0, y1).lineTo(x1, y1).lineWidth(0.75).strokeColor(colour(o.catAxisLineColor, "E2E8F0")).stroke().restore();
}

/** Draw recorded slides into a PDF, one page per slide. */
export function drawPdf(slides: DrawOp[][], meta: { title: string; author?: string } = { title: "Report" }): Promise<Buffer> {
  const size: [number, number] = [DECK_SIZE.w * PT, DECK_SIZE.h * PT];
  // the font option keeps pdfkit off its bundled Helvetica files, which a serverless bundle does not carry
  const doc = new PDFDocument({ size, margin: 0, autoFirstPage: false, font: fonts().regular as unknown as string, info: { Title: meta.title, Author: meta.author ?? "Fair" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  for (const ops of slides) {
    doc.addPage({ size, margin: 0 });
    for (const op of ops) {
      if (op.op === "text") box(doc, op.runs, op.o, margins(op.o.margin, [3.6, 7.2, 3.6, 7.2]));
      else if (op.op === "shape") shape(doc, op.kind, op.o);
      else if (op.op === "table") table(doc, op.rows, op.o);
      else if (op.op === "chart") chart(doc, op.data, op.o);
    }
  }
  doc.end();
  return done;
}

/** The weekly report as a PDF in memory. */
export async function pdfBuffer(r: WeeklyReport, n: Narrative, opts: DeckOptions = {}): Promise<Buffer> {
  return drawPdf(recordDeck(r, n, opts), { title: `${r.title} · ${r.week.label}` });
}

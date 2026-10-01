/**
 * The slides decks add to the weekly set (Decks, DECISIONS 2 Oct 2026): the
 * trend (each brand's views period on period, one slide per platform), the top
 * creators, the top content, and findings pinned from Chats. Every number comes
 * from the report; the narrative supplies the title and the takeaway under it.
 */
import type PptxGenJS from "pptxgenjs";
import { add, C, chrome, CW, FONT, M, postCard, text, title, type Slide } from "./draw";
import type { Narrative } from "./narrative";
import { seriesLabel } from "./period";
import { trendPlatforms } from "./slides";
import type { Cell, Finding, FindingColumn, GroupResult, Platform, WeeklyReport } from "./types";
import { change, compact, dayMonth, int, PLATFORM_NAME, pct, pts, TIER_NAME, wordsOf } from "./view";

function footnote(s: Slide, t: string, y = 6.62) {
  add(s, t, { x: M, y, w: CW, h: 0.4, fontSize: 9, color: C.ink4 });
}

// -------------------------------------------------------------------- trend
/** The brands a trend slide shows on a platform: the client first, then the watchlist by views this period; eight at most. */
export function trendRows(r: WeeklyReport, pl: Platform): GroupResult[] {
  const watched = r.watchlist.filter((g) => g.cells[pl]?.covered).sort((a, b) => (b.cells[pl]?.now?.views ?? 0) - (a.cells[pl]?.now?.views ?? 0));
  const client = r.client && r.portfolio.cells[pl]?.covered ? [r.portfolio] : [];
  return [...client, ...watched].slice(0, 8);
}

function trendPanel(s: Slide, r: WeeklyReport, g: GroupResult, c: Cell, x: number, y: number, w: number, h: number) {
  const now = c.now!;
  const prev = c.prev!;
  const series = [...c.history, now];
  const flag = c.flags.find((f) => f.metric === "views");
  const client = g.group.kind === "client";
  add(s, client ? r.client : g.group.name, { x, y, w, h: 0.3, fontSize: 12.5, bold: true, color: client ? C.blue5 : C.ink, valign: "middle", fit: "shrink" });
  add(s, [
    text(compact(now.views), { fontSize: 19, bold: true, color: flag ? C.blue : C.ink }),
    text(`  ${flag ? (flag.direction === "up" ? "▲ " : "▼ ") : ""}${change(now.views, prev.views)}`, { fontSize: 10.5, bold: !!flag, color: flag ? C.blue : C.ink6 }),
  ], { x, y: y + 0.32, w, h: 0.42, valign: "middle" });
  add(s, `SOV ${pct(now.views_share)} (${pts(now.views_share, prev.views_share)}) · ${int(now.posts)} posts`, { x, y: y + 0.76, w, h: 0.24, fontSize: 9, color: C.ink4 });
  const top = y + 1.12;
  const base = y + h - 0.26;
  const max = Math.max(1, ...series.map((p) => p.views));
  const band = w / series.length;
  const bw = band * 0.62;
  series.forEach((p, i) => {
    const bh = ((base - top) * p.views) / max;
    const last = i === series.length - 1;
    const color = last ? (flag ? C.blue : C.blue5) : C.bar;
    if (bh > 0) s.addShape("rect", { x: x + band * i + (band - bw) / 2, y: base - bh, w: bw, h: bh, fill: { color }, line: { color, width: 0 } });
    if (series.length <= 10 || i % 2 === series.length % 2) add(s, seriesLabel(r.grain, p.week), { x: x + band * i - 0.1, y: base + 0.04, w: band + 0.2, h: 0.18, fontSize: 7.5, color: last ? C.ink : C.ink4, align: "center", bold: last });
  });
  s.addShape("line", { x, y: base, w, h: 0, line: { color: C.line, width: 0.75 } });
}

/** One slide per platform with a watched brand in coverage; returns the pages taken. */
export function trendSlides(pres: PptxGenJS, r: WeeklyReport, n: Narrative, startPage: number, sampleLabel?: string): number {
  const w8 = wordsOf(r);
  const pls = trendPlatforms(r);
  pls.forEach((pl, i) => {
    const s = pres.addSlide();
    chrome(s, r, startPage + i, sampleLabel);
    const words = n.trends?.find((t) => t.platform === pl);
    title(s, words?.title ?? `${PLATFORM_NAME[pl]} views, ${w8.unit} on ${w8.unit}`, words?.takeaway ?? `Each brand's ${PLATFORM_NAME[pl]} views over the last ${r.rules.lookback_weeks + 1} ${w8.unit}s · blue = ${w8.this}`);
    const rows = trendRows(r, pl);
    const cols = Math.min(4, rows.length);
    const lines = Math.ceil(rows.length / cols);
    const gx = 0.4, gy = 0.3;
    const pw = (CW - gx * (cols - 1)) / cols;
    const ph = Math.min(2.6, (6.45 - 1.72 - gy * (lines - 1)) / lines);
    rows.forEach((g, j) => {
      const x = M + (j % cols) * (pw + gx);
      const y = 1.72 + Math.floor(j / cols) * (ph + gy);
      trendPanel(s, r, g, g.cells[pl]!, x, y, pw, ph);
    });
    footnote(s, `Views of distinct posts per ${w8.unit}, by posting date; the latest ${w8.unit}s keep collecting views. SOV = the brand's share of all ${PLATFORM_NAME[pl]} views in the panel. A blue number is a significant move under the deck's rule.`);
    s.addNotes(`${words?.title ?? ""}\n${words?.takeaway ?? ""}`);
  });
  return pls.length;
}

// ----------------------------------------------------------------- creators
export function creatorsSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const w8 = wordsOf(r);
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.creators?.title ?? `The creators who brought the most views ${w8.this}`, n.creators?.takeaway);
  const rows = r.creators ?? [];
  const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [3, 6, 3, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
  const right: PptxGenJS.TableCellProps = { ...hb, align: "right" };
  const head = ["", "Creator", "Posted for", "Platform", "Tier", "Followers", "Posts", "Views", "ER", ""]
    .map((h, i) => ({ text: [text(h, { fontSize: 9.5, bold: true, color: C.ink6 })], options: { ...(i >= 5 && i <= 8 ? right : hb), border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] } })) as PptxGenJS.TableRow;
  // reach far above engagement reads as paid distribution: say so next to the number, never assert it
  const low = (c: (typeof rows)[number]) => c.er != null && c.er < r.rules.boosted_er_pct && c.views >= 1_000_000;
  const rank = (i: number) => rows.slice(0, i + 1).filter((x) => x.platform === rows[i].platform).length;
  const body = rows.map((c, i) => [
    { text: [text(String(rank(i)), { fontSize: 10, bold: true, color: C.blue5 })], options: hb },
    { text: [text(`@${c.handle}`, { fontSize: 11, bold: true, color: C.blue5, ...(c.top_post ? { hyperlink: { url: c.top_post.url } } : {}) })], options: hb },
    { text: [text(c.brands.slice(0, 3).join(", ") + (c.brands.length > 3 ? ` +${c.brands.length - 3}` : ""), { fontSize: 10, color: C.ink })], options: hb },
    { text: [text(PLATFORM_NAME[c.platform], { fontSize: 10, color: C.ink6 })], options: hb },
    { text: [text(TIER_NAME[c.tier ?? "unknown"] ?? c.tier ?? "–", { fontSize: 10, color: C.ink6 })], options: hb },
    { text: [text(c.followers != null ? compact(c.followers) : "–", { fontSize: 10, color: C.ink })], options: right },
    { text: [text(int(c.posts), { fontSize: 10, color: C.ink })], options: right },
    { text: [text(compact(c.views), { fontSize: 11, bold: true, color: C.ink })], options: right },
    { text: [text(c.er != null ? pct(c.er) : "–", { fontSize: 10, color: C.ink })], options: right },
    { text: [text(c.first_time ? "FIRST TIME" : "", { fontSize: 8, bold: true, color: C.blue, charSpacing: 0.5, breakLine: c.first_time && low(c) }), ...(low(c) ? [text("LOW ENGAGEMENT", { fontSize: 8, bold: true, color: C.warn, charSpacing: 0.5 })] : [])], options: hb },
  ]) as PptxGenJS.TableRow[];
  const rh = Math.min(0.44, 4.5 / Math.max(1, rows.length));
  s.addTable([head, ...body], { x: M, y: 1.7, w: CW, colW: [0.4, 2.35, 2.75, 1.0, 1.05, 1.0, 0.75, 1.0, 0.8, 1.233], rowH: [0.34, ...body.map(() => rh)] });
  const first = rows.filter((c) => c.first_time).length;
  footnote(s, `Creator posts only (brand accounts excluded), across the brands in this deck, ${w8.this}, ranked by views on each platform. First time = no post for these brands in the ${r.rules.lookback_weeks} ${w8.unit}s before${first ? ` (${int(first)} here)` : ""}. ER = engagements ÷ views, as each platform counts them; low engagement = under ${r.rules.boosted_er_pct}% on 1.0M views or more, the pattern of paid distribution. The handle links to the creator's biggest post.`);
  s.addNotes(`${n.creators?.title ?? ""}\n${n.creators?.takeaway ?? ""}\n` + rows.map((c) => `@${c.handle} ${c.top_post?.url ?? ""}`).join("\n"));
}

// ------------------------------------------------------------------ content
export function contentSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const w8 = wordsOf(r);
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.content?.title ?? `The posts that drew the most views ${w8.this}`, n.content?.takeaway ?? `The most-viewed posts on each platform, ${r.week.label}`);
  const posts = r.content ?? [];
  const gx = 0.25, gy = 0.25;
  const cw = (CW - gx * 2) / 3;
  const ch = (6.85 - 1.72 - gy) / 2;
  posts.slice(0, 6).forEach((p, i) => {
    const x = M + (i % 3) * (cw + gx);
    const y = 1.72 + Math.floor(i / 3) * (ch + gy);
    postCard(s, p, x, y, cw, ch, { brand: true });
  });
  s.addNotes(`${n.content?.title ?? ""}\n${n.content?.takeaway ?? ""}\n` + posts.map((p) => `${p.ref} ${p.group} ${p.url}`).join("\n"));
}

// ----------------------------------------------------------------- findings
/** A finding's value as the slide prints it. */
export function findingCell(v: unknown, f: FindingColumn["format"]): string {
  if (v == null || v === "") return "–";
  if (typeof v === "number") return f === "pct" ? pct(v) : f === "compact" ? compact(v) : f === "int" ? int(v) : f === "num" ? v.toFixed(Math.abs(v) < 1 ? 2 : 1) : String(v);
  if (f === "date" && typeof v === "string") return dayMonth(v);
  if (Array.isArray(v)) return v.slice(0, 3).join(", ");
  const t = String(v).replace(/\s+/g, " ").trim();
  return t.length > 60 ? t.slice(0, 59) + "…" : t;
}

function findingSlide(pres: PptxGenJS, r: WeeklyReport, f: Finding, words: { title: string; takeaway: string } | undefined, page: number, sampleLabel?: string) {
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, words?.title ?? f.title, words?.takeaway);
  const source = [`From Chats: “${f.question.length > 90 ? f.question.slice(0, 89) + "…" : f.question}”`, f.title, f.data_window ? `data ${dayMonth(f.data_window.from)}–${dayMonth(f.data_window.to)}` : null].filter(Boolean).join(" · ");
  add(s, source, { x: M, y: 1.66, w: CW, h: 0.26, fontSize: 9.5, color: C.ink6, fit: "shrink" });
  if (f.status !== "ok" || !f.rows.length) {
    s.addShape("roundRect", { x: M, y: 2.1, w: CW, h: 1.0, fill: { color: C.blue05 }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
    add(s, f.message || `No rows for ${wordsOf(r).this}.`, { x: M + 0.3, y: 2.2, w: CW - 0.6, h: 0.8, fontSize: 13, color: C.ink6, valign: "middle" });
    s.addNotes(`${f.title}: ${f.message ?? "no rows"}`);
    return;
  }
  const cols = f.columns.slice(0, 7);
  const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [3, 6, 3, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
  const isNum = (c: FindingColumn) => c.format === "int" || c.format === "num" || c.format === "compact" || c.format === "pct";
  const head = cols.map((c) => ({ text: [text(c.label, { fontSize: 9.5, bold: true, color: C.ink6 })], options: { ...hb, align: isNum(c) ? "right" : "left", border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] } })) as PptxGenJS.TableRow;
  const rows = f.rows.slice(0, 10);
  const body = rows.map((row) => cols.map((c, i) => {
    const v = row[c.key];
    const url = c.key === "url" && typeof v === "string" ? v : null;
    return { text: [text(url ? "open" : findingCell(v, c.format), { fontSize: 10, bold: i === 0, color: url ? C.blue5 : C.ink, ...(url ? { hyperlink: { url } } : {}) })], options: { ...hb, align: isNum(c) ? "right" : "left" } };
  })) as PptxGenJS.TableRow[];
  const textCols = cols.filter((c) => !isNum(c)).length;
  const numW = 1.15;
  const textW = textCols ? (CW - numW * (cols.length - textCols)) / textCols : numW;
  const rh = Math.min(0.4, 4.1 / Math.max(1, rows.length));
  s.addTable([head, ...body], { x: M, y: 2.05, w: CW, colW: cols.map((c) => (isNum(c) ? numW : textW)), rowH: [0.34, ...body.map(() => rh)] });
  footnote(s, `${f.rows_total > rows.length ? `First ${int(rows.length)} of ${int(f.rows_total)} rows. ` : ""}Pinned from a conversation in Chats and run again for ${r.week.label}, with the same question and settings.`);
  s.addNotes(`${words?.title ?? f.title}\n${words?.takeaway ?? ""}\n${source}`);
}

export function findingSlides(pres: PptxGenJS, r: WeeklyReport, n: Narrative, startPage: number, sampleLabel?: string): number {
  const fs = r.findings ?? [];
  fs.forEach((f, i) => findingSlide(pres, r, f, n.findings?.find((x) => x.key === f.key), startPage + i, sampleLabel));
  return fs.length;
}

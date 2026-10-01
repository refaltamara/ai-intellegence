/**
 * The slides decks add to the weekly set (Decks, DECISIONS 2 Oct 2026): the
 * trend (each brand's views period on period, one slide per platform), the top
 * creators, the top content, campaigns and launches and products and angles
 * (read from captions), and findings pinned from Chats. Every number comes
 * from the report; the narrative supplies the title and the takeaway under it.
 */
import type PptxGenJS from "pptxgenjs";
import { add, C, chrome, CW, FONT, M, postCard, text, title, type Slide } from "./draw";
import type { Narrative } from "./narrative";
import { seriesLabel } from "./period";
import { trendPlatforms } from "./slides";
import type { Cell, Finding, FindingColumn, GroupResult, Platform, WeeklyReport } from "./types";
import { change, compact, dayMonth, EVENT_LABEL, HOOK_LABEL, int, OFFER_LABEL, PLATFORM_NAME, pct, pts, TIER_NAME, wordsOf } from "./view";

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

// ---------------------------------------------------------------- captions
/** "Read from captions: 812 of 1,240 posts this week, 91% of views (posts with 10K+ views and brand accounts)." */
function captionCoverage(r: WeeklyReport): string {
  const c = r.captions!.coverage;
  return `Read from captions: ${int(c.read)} of ${int(c.posts)} posts ${wordsOf(r).this}, ${c.read_views_share}% of their views (posts with ${compact(r.captions!.floor)}+ views and brand accounts). Names come from the captions; every count is posts, creators and views in the panel.`;
}

const linkRun = (top: { handle: string | null; url: string; views: number } | null, size = 9.5) =>
  top ? [text(top.handle ? `@${top.handle}` : "brand account", { fontSize: size, color: C.blue5, hyperlink: { url: top.url } }), text(` · ${compact(top.views)}`, { fontSize: size - 0.5, color: C.ink4 })] : [text("–", { fontSize: size, color: C.ink4 })];

export function campaignsSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const w8 = wordsOf(r);
  const K = r.captions!;
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.campaigns?.title ?? `What the brands are running ${w8.this}`, n.campaigns?.takeaway);
  const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [3, 6, 3, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
  const right: PptxGenJS.TableCellProps = { ...hb, align: "right" };
  const heads = ["Brand", "Campaign or event", "Type", "Posts", "Brand acct", "Creators", "Views", "First seen", "Top post"];
  const head = heads.map((h, i) => ({ text: [text(h, { fontSize: 9.5, bold: true, color: C.ink6 })], options: { ...(i >= 3 && i <= 6 ? right : hb), border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] } })) as PptxGenJS.TableRow;
  const rows = K.events.slice(0, 9);
  const body = rows.map((e) => [
    { text: [text(e.name, { fontSize: 10.5, bold: true, color: e.client ? C.blue5 : C.ink })], options: hb },
    { text: [text(e.event_name, { fontSize: 10.5, bold: true, color: C.ink })], options: hb },
    { text: [text(EVENT_LABEL[e.event] ?? e.event, { fontSize: 9.5, color: C.ink6 })], options: hb },
    { text: [text(int(e.posts), { fontSize: 10.5, color: C.ink })], options: right },
    { text: [text(e.owned_posts ? int(e.owned_posts) : "–", { fontSize: 10, color: e.owned_posts ? C.ink : C.ink4 })], options: right },
    { text: [text(int(e.creators), { fontSize: 10.5, color: C.ink })], options: right },
    { text: [text(compact(e.views), { fontSize: 10.5, bold: true, color: C.ink })], options: right },
    { text: e.new ? [text("NEW ", { fontSize: 8.5, bold: true, color: C.blue, charSpacing: 0.5 }), text(dayMonth(e.first_seen), { fontSize: 9.5, color: C.blue })] : [text(e.first_seen ? dayMonth(e.first_seen) : "–", { fontSize: 9.5, color: C.ink6 })], options: hb },
    { text: linkRun(e.top), options: hb },
  ]) as PptxGenJS.TableRow[];
  const rh = Math.min(0.42, 3.6 / Math.max(1, rows.length));
  s.addTable([head, ...body], { x: M, y: 1.7, w: CW, colW: [1.45, 2.5, 1.15, 0.75, 0.95, 0.85, 0.85, 1.25, 2.583], rowH: [0.34, ...body.map(() => rh)] });
  // offers, brand by brand
  const offers = K.offers.filter((o) => o.read >= 5).slice(0, 6);
  if (offers.length) {
    const y = 1.7 + 0.34 + rh * rows.length + 0.25;
    add(s, "OFFERS IN CAPTIONS", { x: M, y, w: CW, h: 0.24, fontSize: 9.5, bold: true, color: C.ink4, charSpacing: 1 });
    add(s, offers.flatMap((o, i) => [
      text(`${i ? "   ·   " : ""}${o.name} `, { fontSize: 10.5, bold: true, color: o.client ? C.blue5 : C.ink }),
      text(`${o.offer_share}% of posts${o.top_offer ? `, mostly ${OFFER_LABEL[o.top_offer] ?? o.top_offer}` : ""}`, { fontSize: 10.5, color: C.ink6 }),
    ]), { x: M, y: y + 0.26, w: CW, h: 0.5, fit: "shrink" });
  }
  footnote(s, `${captionCoverage(r)} First seen = the first post naming it among the posts read${K.coverage.prev_read_views_share >= 50 ? `; new = first seen ${w8.this}` : ` (${w8.last} is not read yet, so nothing is marked new)`}. Brand acct = posts from the brand's own accounts.`);
  s.addNotes(`${n.campaigns?.title ?? ""}\n${n.campaigns?.takeaway ?? ""}\n` + rows.map((e) => `${e.name} · ${e.event_name}: ${e.top?.url ?? ""}`).join("\n"));
}

export function anglesSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const w8 = wordsOf(r);
  const K = r.captions!;
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.angles?.title ?? `The products and angles that drew the views ${w8.this}`, n.angles?.takeaway);
  const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [3, 6, 3, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
  const right: PptxGenJS.TableCellProps = { ...hb, align: "right" };
  const heads = ["Brand", "Product", "Posts", "Creators", "Views", "Hook that brought the views", "Angle of the top post", "Offer", "Top post"];
  const head = heads.map((h, i) => ({ text: [text(h, { fontSize: 9.5, bold: true, color: C.ink6 })], options: { ...(i >= 2 && i <= 4 || i === 7 ? right : hb), border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] } })) as PptxGenJS.TableRow;
  const rows = K.products.slice(0, 10);
  const body = rows.map((p) => [
    { text: [text(p.name, { fontSize: 10.5, bold: true, color: p.client ? C.blue5 : C.ink })], options: hb },
    { text: [text(p.product, { fontSize: 10.5, bold: true, color: C.ink })], options: hb },
    { text: [text(int(p.posts), { fontSize: 10.5, color: C.ink })], options: right },
    { text: [text(int(p.creators), { fontSize: 10.5, color: C.ink })], options: right },
    { text: [text(compact(p.views), { fontSize: 10.5, bold: true, color: C.ink })], options: right },
    { text: p.hook ? [text(HOOK_LABEL[p.hook] ?? p.hook, { fontSize: 10, color: C.ink }), text(`  ${p.hook_views_share}% of views`, { fontSize: 8.5, color: C.ink4 })] : [text("–", { fontSize: 10, color: C.ink4 })], options: hb },
    { text: [text(p.angle ? `“${p.angle}”` : "–", { fontSize: 10, italic: !!p.angle, color: p.angle ? C.ink : C.ink4 })], options: hb },
    { text: [text(p.offer_share ? `${p.offer_share}%` : "–", { fontSize: 10, color: C.ink6 })], options: right },
    { text: linkRun(p.top, 9), options: hb },
  ]) as PptxGenJS.TableRow[];
  const rh = Math.min(0.42, 4.3 / Math.max(1, rows.length));
  s.addTable([head, ...body], { x: M, y: 1.7, w: CW, colW: [1.2, 1.75, 0.6, 0.75, 0.8, 2.15, 2.683, 0.7, 1.7], rowH: [0.34, ...body.map(() => rh)] });
  footnote(s, `${captionCoverage(r)} Products named in at least two posts. Hook = what the posts do to hold attention, with the share of the product's views it brought; offer = share of the product's posts with an offer in the caption.`);
  s.addNotes(`${n.angles?.title ?? ""}\n${n.angles?.takeaway ?? ""}\n` + rows.map((p) => `${p.name} · ${p.product}: ${p.top?.url ?? ""}`).join("\n"));
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

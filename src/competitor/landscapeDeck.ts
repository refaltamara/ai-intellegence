/**
 * The landscape slides of the weekly deck (DECISIONS, 1 Oct 2026): creator
 * tiers, what creators put in front of the camera, posting pattern, competitor
 * close-ups, patterns worth knowing, and the client's moves for the week. Every
 * number comes from `report.landscape`; the narrative supplies titles, the
 * takeaway under each title, close-up labels and "next" lines, and the actions.
 */
import type PptxGenJS from "pptxgenjs";
import { add, C, chip, chrome, CW, FONT, M, text, title, W, type Runs, type Slide } from "./draw";
import type { CloseUp, TierName } from "./landscape";
import type { Narrative } from "./narrative";
import { hasClient } from "./slides";
import type { WeeklyReport } from "./types";
import { categoryCell, closeupLines, closeupPicks, compact, dayMonth, hourLabel, int, listAnd, PATTERN_NAME, patternHow, PLATFORM_NAME, patternSignal, postingBehind, productName, TIER_NAME, tierLegend, wordsOf } from "./view";

const TIER_COLOR: Record<TierName, string> = { nano: "D5DBE4", micro: "94A3B8", mid: "475569", macro: "0F172A", mega: "2563EB", unknown: "E2E8F0" };
const LABEL = { fontSize: 10, color: C.ink4, bold: true, charSpacing: 1 } as const;
/** brands with fewer posts than this stay off the per-brand tables: too few to read a mix from */
const MIN_ROW_POSTS = 20;
const tzName = (tz: string) => (tz === "Asia/Jakarta" ? "WIB" : tz);

function footnote(s: Slide, t: string, y = 6.62) {
  add(s, t, { x: M, y, w: CW, h: 0.4, fontSize: 9, color: C.ink4 });
}

/** A 100% bar in tier colours. */
function tierBar(s: Slide, shares: { tier: TierName; share: number }[], x: number, y: number, w: number, h: number) {
  const total = shares.reduce((a, b) => a + b.share, 0);
  if (!total) {
    s.addShape("rect", { x, y, w, h, fill: { color: C.line }, line: { color: C.line, width: 0 } });
    return;
  }
  let cx = x;
  for (const t of shares) {
    if (t.share <= 0) continue;
    const ww = (w * t.share) / total;
    s.addShape("rect", { x: cx, y, w: ww, h, fill: { color: TIER_COLOR[t.tier] }, line: { color: TIER_COLOR[t.tier], width: 0 } });
    cx += ww;
  }
}

// ------------------------------------------------------------- creator tiers
export function tiersSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const L = r.landscape!;
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.tiers?.title ?? "Creator tiers: where each brand puts its content", n.tiers?.takeaway);
  // legend
  let lx = M;
  add(s, "Followers:", { x: lx, y: 1.68, w: 0.9, h: 0.24, fontSize: 10, color: C.ink6, valign: "middle" });
  lx += 0.92;
  for (const l of tierLegend()) {
    s.addShape("rect", { x: lx, y: 1.74, w: 0.13, h: 0.13, fill: { color: TIER_COLOR[l.tier as TierName] }, line: { color: TIER_COLOR[l.tier as TierName], width: 0 } });
    const w = l.label.length * 0.075 + 0.3;
    add(s, l.label, { x: lx + 0.18, y: 1.68, w, h: 0.24, fontSize: 10, color: C.ink6, valign: "middle" });
    lx += 0.18 + w;
  }
  const cols = { brand: M, posts: M + 1.95, content: M + 3.05, views: M + 6.85, top: M + 10.6 };
  const barW = 3.5;
  const hy = 2.1;
  for (const [t, x, w] of [["Creator posts", cols.posts, 1.0], ["Share of content", cols.content, barW], ["Share of views", cols.views, barW], ["Biggest tier by views", cols.top, 2.2]] as const) add(s, t, { x, y: hy, w, h: 0.26, fontSize: 10, color: C.ink6 });
  s.addShape("line", { x: M, y: hy + 0.32, w: CW, h: 0, line: { color: C.ink4, width: 0.75 } });
  const rows = [...L.tiers.rows].filter((t) => t.client || t.posts >= MIN_ROW_POSTS).sort((a, b) => Number(b.client) - Number(a.client) || b.posts - a.posts).slice(0, 8);
  const rh = Math.min(0.56, 3.6 / Math.max(1, rows.length));
  rows.forEach((t, i) => {
    const y = hy + 0.4 + i * rh;
    const color = t.client ? C.blue5 : C.ink;
    add(s, t.name, { x: cols.brand, y, w: 2.1, h: rh, fontSize: 12.5, bold: true, color, valign: "middle", fit: "shrink" });
    add(s, int(t.posts), { x: cols.posts, y, w: 0.9, h: rh, fontSize: 12, color, valign: "middle" });
    tierBar(s, t.tiers.map((x) => ({ tier: x.tier, share: x.posts })), cols.content, y + rh / 2 - 0.12, barW, 0.24);
    tierBar(s, t.tiers.map((x) => ({ tier: x.tier, share: x.views })), cols.views, y + rh / 2 - 0.12, barW, 0.24);
    add(s, t.top ? `${TIER_NAME[t.top.tier]} · ${int(t.top.posts)} posts · ${compact(t.top.views)} views (${t.top.views_share}%)` : "–", { x: cols.top, y, w: W - M - cols.top, h: rh, fontSize: 9.5, color: t.client ? C.blue5 : C.ink, valign: "middle", fit: "shrink" });
    s.addShape("line", { x: M, y: y + rh, w: CW, h: 0, line: { color: C.line, width: 0.5 } });
  });
  const bench = L.tiers.benchmark.filter((b) => b.median_views != null && b.posts >= 5).map((b) => `${TIER_NAME[b.tier]} ${compact(b.median_views)}`).join(" · ");
  const ov = L.tiers.overall;
  const big = [...ov].sort((a, b) => b.content_share - a.content_share)[0];
  const best = [...ov].sort((a, b) => b.views_share - a.views_share)[0];
  const after = hy + 0.4 + rows.length * rh + 0.3;
  footnote(s, [
    bench ? `Median views per creator post ${wordsOf(r).this}: ${bench}.` : "",
    big ? ` Across these brands ${TIER_NAME[big.tier]} is ${big.content_share}% of creator posts and ${big.views_share}% of views${best && best.tier !== big.tier ? `; ${TIER_NAME[best.tier]} is ${best.content_share}% of posts and ${best.views_share}% of views` : ""}.` : "",
    " Creator posts only; brand accounts excluded.",
  ].join(""), Math.min(6.3, after));
  s.addNotes(`${n.tiers?.title ?? ""}\n${n.tiers?.takeaway ?? ""}`);
}

// ----------------------------------------------------------------- products
export function productsSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const L = r.landscape!;
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.products?.title ?? "What each brand's creators put in front of the camera", n.products?.takeaway);
  const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [4, 6, 4, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
  const head = ["Brand", "Top categories named in captions (posts · views)", r.platforms.includes("tiktok") ? "In the TikTok cart (posts · views)" : "In the cart", "Names none"]
    .map((h) => ({ text: [text(h, { fontSize: 10, bold: true, color: C.ink6 })], options: { ...hb, border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] } })) as PptxGenJS.TableRow;
  const rows = [...L.products].filter((p) => p.client || p.posts >= MIN_ROW_POSTS).sort((a, b) => Number(b.client) - Number(a.client) || b.posts - a.posts).slice(0, 8);
  const body = rows.map((p) => [
    { text: [text(p.name, { fontSize: 12, bold: true, color: p.client ? C.blue5 : C.ink })], options: hb },
    { text: [text(categoryCell(p) || "–", { fontSize: 10.5, color: C.ink })], options: hb },
    { text: [text(p.cart.length ? p.cart.slice(0, 2).map((c) => `${productName(c.name)} (${int(c.posts)} · ${compact(c.views)})`).join("\n") : "–", { fontSize: 9.5, color: p.cart.length ? C.ink : C.ink4 })], options: hb },
    { text: [text(`${p.unnamed_share}%`, { fontSize: 10.5, color: C.ink6 })], options: { ...hb, align: "right" } },
  ]) as PptxGenJS.TableRow[];
  const rh = Math.min(0.62, 4.5 / Math.max(1, rows.length));
  s.addTable([head, ...body], { x: M, y: 1.7, w: CW, colW: [2.0, 5.6, 3.6, 1.13], rowH: [0.36, ...body.map(() => rh)] });
  footnote(s, "Counts = posts whose caption names the category; a post can name several. Cart = TikTok Shop products tagged on the post. “Names none” = share of the brand's posts whose caption names no category.");
  s.addNotes(`${n.products?.title ?? ""}\n${n.products?.takeaway ?? ""}`);
}

// ------------------------------------------------------------------ posting
export function postingSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const L = r.landscape!;
  const P = L.posting;
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.posting?.title ?? "Posting pattern", n.posting?.takeaway);
  // left: posts per day, the period before then this one
  const cx = M;
  const cw = 6.05;
  const w8 = wordsOf(r);
  add(s, `${r.client ? `WATCHLIST + ${r.client.toUpperCase()}` : "WATCHLIST"} · POSTS PER DAY`, { x: cx, y: 1.68, w: cw, h: 0.24, ...LABEL });
  const cur = P.days.filter((d) => d.current);
  const sorted = [...cur].map((d) => d.posts).sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0;
  const peak = [...cur].sort((a, b) => b.posts - a.posts)[0];
  const spike = peak && median > 0 && peak.posts >= median * 1.25 ? peak.date : null;
  const max = Math.max(1, ...P.days.map((d) => d.posts));
  const top = 2.25, base = 4.95;
  const band = cw / P.days.length;
  const bw = band * 0.68;
  // a month of days is too many to label each: the counts go above the spike only, the dates every week
  const dense = P.days.length > 14;
  P.days.forEach((d, i) => {
    const h = ((base - top) * d.posts) / max;
    const x = cx + band * i + (band - bw) / 2;
    const color = d.date === spike ? C.blue5 : d.current ? "94A3B8" : "D5DBE4";
    if (h > 0) s.addShape("rect", { x, y: base - h, w: bw, h, fill: { color }, line: { color, width: 0 } });
    if (!dense || d.date === spike) add(s, int(d.posts), { x: cx + band * i - (dense ? 0.25 : 0.05), y: base - h - 0.24, w: band + (dense ? 0.5 : 0.1), h: 0.22, fontSize: 8, color: d.current ? C.ink : C.ink4, align: "center" });
    if (!dense || (Number(d.date.slice(8, 10)) - 1) % 7 === 0) add(s, String(Number(d.date.slice(8, 10))), { x: cx + band * i - (dense ? 0.15 : 0), y: base + 0.05, w: band + (dense ? 0.3 : 0), h: 0.2, fontSize: 8.5, color: C.ink6, align: "center" });
  });
  s.addShape("line", { x: cx, y: base, w: cw, h: 0, line: { color: C.line, width: 0.75 } });
  const before = P.days.filter((d) => !d.current);
  const split = before.length * 2 === P.days.length ? cw / 2 : (cw * before.length) / P.days.length;
  if (before.length) add(s, `${w8.last} · ${dayMonth(before[0].date)}–${dayMonth(before[before.length - 1].date)}`, { x: cx, y: base + 0.27, w: split, h: 0.2, fontSize: 8.5, color: C.ink4, align: "center" });
  if (cur.length) add(s, `${w8.this} · ${dayMonth(cur[0].date)}–${dayMonth(cur[cur.length - 1].date)}`, { x: cx + split, y: base + 0.27, w: cw - split, h: 0.2, fontSize: 8.5, color: C.ink6, align: "center", bold: true });
  const curPosts = cur.reduce((a, d) => a + d.posts, 0);
  const prevPosts = P.days.filter((d) => !d.current).reduce((a, d) => a + d.posts, 0);
  const promoPeak = [...cur].sort((a, b) => b.promo_posts - a.promo_posts)[0];
  add(s, `${int(curPosts)} posts ${w8.this} against ${int(prevPosts)} ${w8.last}.${promoPeak?.promo_posts ? ` Promo captions peak on ${dayMonth(promoPeak.date)} (${int(promoPeak.promo_posts)} posts).` : ""}${spike ? ` Blue = ${w8.this}'s spike.` : ""}`, { x: cx, y: base + 0.55, w: cw, h: 0.5, fontSize: 10, color: C.ink6 });

  // right: per brand
  const rx = M + cw + 0.4;
  const rw = W - M - rx;
  const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [3, 5, 3, 5], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
  const head = ["Brand", "Peak day", "Concentration", "What sits behind it"].map((h) => ({ text: [text(h, { fontSize: 9.5, bold: true, color: C.ink6 })], options: { ...hb, border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] } })) as PptxGenJS.TableRow;
  const brands = [...P.brands].filter((b) => b.client || b.posts >= MIN_ROW_POSTS).sort((a, b) => Number(b.client) - Number(a.client) || b.posts - a.posts).slice(0, 7);
  const body = brands.map((b) => [
    { text: [text(b.name, { fontSize: 10.5, bold: true, color: b.client ? C.blue5 : C.ink })], options: hb },
    { text: [text(b.peak_day ? dayMonth(b.peak_day) : "–", { fontSize: 10, color: b.client ? C.blue5 : C.ink })], options: hb },
    { text: [text(`${b.peak_posts_share}% of posts, ${b.peak_views_share}% of views`, { fontSize: 9.5, color: C.ink })], options: hb },
    { text: [text(postingBehind(b), { fontSize: 9, color: C.ink6 })], options: hb },
  ]) as PptxGenJS.TableRow[];
  const rh = Math.min(0.52, 3.9 / Math.max(1, brands.length));
  s.addTable([head, ...body], { x: rx, y: 1.68, w: rw, colW: [1.35, 0.85, 1.55, rw - 3.75], rowH: [0.32, ...body.map(() => rh)] });

  // bottom: time of day
  s.addShape("line", { x: M, y: 6.12, w: CW, h: 0, line: { color: C.line, width: 0.75 } });
  const tz = tzName(L.tz);
  const w = P.window;
  const hm = P.hour_median_range;
  add(s, [
    text("Time of day: ", { fontSize: 10.5, bold: true, color: C.ink }),
    text(`${w ? `${w.share}% of ${w8.this}'s posts go up between ${hourLabel(w.from)} and ${hourLabel(w.to)} ${tz}` : "Posting is spread across the day"}${P.peak_hour != null ? `, peaking at ${hourLabel(P.peak_hour)}` : ""}.${hm ? ` Median views per post by hour run from ${compact(hm.low)} to ${compact(hm.high)}.` : ""}`, { fontSize: 10.5, color: C.ink }),
  ], { x: M, y: 6.2, w: CW, h: 0.5 });
  s.addNotes(`${n.posting?.title ?? ""}\n${n.posting?.takeaway ?? ""}`);
}

// ---------------------------------------------------------------- close-ups
function closeupColumn(s: Slide, r: WeeklyReport, c: CloseUp, words: { label: string; next: string } | undefined, x: number, w: number) {
  const L = r.landscape!;
  add(s, c.name, { x, y: 1.68, w: w - 2.2, h: 0.5, fontSize: 24, bold: true, color: C.ink, valign: "middle", fit: "shrink" });
  if (words?.label) add(s, words.label.toUpperCase(), { x: x + w - 2.6, y: 1.8, w: 2.6, h: 0.3, fontSize: 10.5, bold: true, color: C.blue5, align: "right", charSpacing: 1 });
  const stats: [string, string][] = [[int(c.posts), "content"], [compact(c.views), "views"], [compact(c.likes), "likes"], [c.er != null ? `${c.er.toFixed(1)}%` : "–", "eng. rate"]];
  const sw = w / 4;
  stats.forEach(([v, l], i) => {
    add(s, v, { x: x + i * sw, y: 2.28, w: sw, h: 0.42, fontSize: 19, color: C.ink, valign: "middle" });
    add(s, l, { x: x + i * sw, y: 2.7, w: sw, h: 0.26, fontSize: 10, color: C.ink6 });
  });
  s.addShape("line", { x, y: 3.05, w, h: 0, line: { color: C.line, width: 0.75 } });
  const lines = [...closeupLines(c, L.posting.brands.find((b) => b.key === c.key), wordsOf(r).this), { label: "Next", text: words?.next ?? "", muted: false }];
  const lh = 0.74;
  lines.forEach((l, i) => {
    const y = 3.12 + i * lh;
    add(s, l.label.toUpperCase(), { x, y, w: 1.3, h: lh - 0.08, fontSize: 9, color: l.label === "Next" ? C.blue5 : C.ink4, charSpacing: 0.5, bold: l.label === "Next" });
    add(s, l.text, { x: x + 1.35, y, w: w - 1.35, h: lh - 0.08, fontSize: 10.5, color: l.muted ? C.ink4 : C.ink, fit: "shrink" });
    if (i < lines.length - 1) s.addShape("line", { x, y: y + lh - 0.04, w, h: 0, line: { color: C.line, width: 0.5 } });
  });
}

export function closeupSlides(pres: PptxGenJS, r: WeeklyReport, n: Narrative, startPage: number, sampleLabel?: string): number {
  const picks = closeupPicks(r);
  picks.forEach((pair, i) => {
    const s = pres.addSlide();
    chrome(s, r, startPage + i, sampleLabel);
    title(s, n.closeup_titles?.[i] ?? `${pair.map((c) => c.name).join(" and ")}: a closer look`, `Competitor close-up · ${r.week.label} · ${listAnd(r.platforms.map((p) => PLATFORM_NAME[p]))} together`);
    const gap = 0.55;
    const w = pair.length === 1 ? CW : (CW - gap) / 2;
    pair.forEach((c, j) => {
      const x = M + j * (w + gap);
      closeupColumn(s, r, c, n.closeups?.find((k) => k.key === c.key), x, w);
      if (j === 1) s.addShape("line", { x: x - gap / 2, y: 1.75, w: 0, h: 4.85, line: { color: C.line, width: 0.75 } });
    });
    const ownOn = [...new Set(pair.flatMap((c) => c.owned?.platforms ?? []))].map((p) => PLATFORM_NAME[p] ?? p);
    footnote(s, `Eng. rate = likes + comments ÷ views, ${r.platforms.length === 2 ? "both platforms" : "all platforms"} together.${ownOn.length ? ` Own channel = the brand's ${listAnd(ownOn)} accounts.` : ""} Promo language = discount, sale, voucher, flash sale, cashback.`, 6.72);
    s.addNotes(pair.map((c) => `${c.name}: ${n.closeups?.find((k) => k.key === c.key)?.next ?? ""}`).join("\n"));
  });
  return picks.length;
}

// ----------------------------------------------------------------- patterns
export function patternsSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const L = r.landscape!;
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.patterns?.title ?? "Patterns worth knowing", n.patterns?.takeaway);
  const shown = L.patterns.slice(0, 5);
  const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [4, 6, 4, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
  const head = ["Pattern", "Brand", "Signal", "Accounts", "Posts", "Views", "Share of brand views", "Example"]
    .map((h) => ({ text: [text(h, { fontSize: 9.5, bold: true, color: C.ink6 })], options: { ...hb, border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] } })) as PptxGenJS.TableRow;
  const body = shown.map((p) => {
    const ex = p.examples[0];
    return [
      { text: [text(PATTERN_NAME[p.kind], { fontSize: 11, bold: true, color: C.blue5 })], options: hb },
      { text: [text(p.name, { fontSize: 11, bold: true, color: p.client ? C.blue5 : C.ink })], options: hb },
      { text: [text(patternSignal(p), { fontSize: 9.5, color: C.ink })], options: hb },
      { text: [text(int(p.accounts), { fontSize: 11, color: C.ink })], options: { ...hb, align: "right" } },
      { text: [text(int(p.posts), { fontSize: 11, color: C.ink })], options: { ...hb, align: "right" } },
      { text: [text(compact(p.views), { fontSize: 11, bold: true, color: C.ink })], options: { ...hb, align: "right" } },
      { text: [text(`${p.views_share}%`, { fontSize: 11, color: C.ink })], options: { ...hb, align: "right" } },
      { text: ex ? [text(ex.handle ? `@${ex.handle}` : "post", { fontSize: 9.5, color: C.blue5, hyperlink: { url: ex.url } }), text(` · ${compact(ex.views)}`, { fontSize: 9, color: C.ink4 })] : [text("–", { fontSize: 9.5, color: C.ink4 })], options: hb },
    ];
  }) as PptxGenJS.TableRow[];
  const rh = Math.min(0.72, 2.9 / Math.max(1, shown.length));
  s.addTable([head, ...body], { x: M, y: 1.7, w: CW, colW: [2.2, 1.6, 2.9, 0.95, 0.75, 0.9, 1.25, 1.783], rowH: [0.34, ...body.map(() => rh)] });
  // how each pattern is spotted
  const kinds = [...new Set(shown.map((p) => p.kind))];
  const by = 1.7 + 0.34 + rh * shown.length + 0.3;
  const bh = Math.min(6.9 - by, 0.5 + 0.48 * kinds.length);
  s.addShape("roundRect", { x: M, y: by, w: CW, h: bh, fill: { color: C.blue05 }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
  const runs: Runs = [text("HOW WE SPOT EACH PATTERN", { fontSize: 9.5, bold: true, color: C.ink4, breakLine: true, charSpacing: 1, paraSpaceAfter: 4 })];
  kinds.forEach((k, i) => runs.push(text(`${PATTERN_NAME[k]}. `, { fontSize: 10, bold: true, color: C.ink }), text(patternHow(k, r.grain), { fontSize: 10, color: C.ink6, breakLine: i < kinds.length - 1, paraSpaceAfter: 4 })));
  add(s, runs, { x: M + 0.25, y: by + 0.15, w: CW - 0.5, h: bh - 0.3, fit: "shrink" });
  s.addNotes(`${n.patterns?.title ?? ""}\n${n.patterns?.takeaway ?? ""}\n` + shown.map((p) => `${PATTERN_NAME[p.kind]} · ${p.name}: ${p.examples.map((e) => e.url).join(" ")}`).join("\n"));
}

// ------------------------------------------------------------------ actions
const PRIORITY_STYLE: Record<string, { fill: string; color: string }> = {
  High: { fill: C.blue, color: C.white },
  Medium: { fill: C.blue1, color: C.blue },
  Test: { fill: "F1F5F9", color: C.ink6 },
};

export function movesSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.actions_title ?? (r.client ? `What ${r.client} should do next` : "What to do next"), `From ${wordsOf(r).this}'s moves, creator tiers, products, timing and patterns`);
  const k = n.actions.length;
  const top = 1.72;
  const rh = Math.min(1.08, (6.95 - top) / k);
  n.actions.forEach((a, i) => {
    const y = top + i * rh;
    s.addShape("line", { x: M, y, w: CW, h: 0, line: { color: C.line, width: 0.75 } });
    add(s, String(i + 1).padStart(2, "0"), { x: M, y: y + 0.12, w: 0.55, h: 0.36, fontSize: 15, bold: true, color: C.blue5 });
    add(s, a.title, { x: M + 0.6, y: y + 0.1, w: 3.05, h: rh - 0.18, fontSize: 13.5, bold: true, color: C.ink, fit: "shrink" });
    add(s, [text(a.detail, { fontSize: 10.5, color: C.ink, breakLine: true }), text(`Based on: ${a.based_on}`, { fontSize: 8.5, color: C.ink4 })], { x: M + 3.85, y: y + 0.1, w: 6.75, h: rh - 0.16, fit: "shrink" });
    const p = PRIORITY_STYLE[a.priority ?? "Medium"] ?? PRIORITY_STYLE.Medium;
    chip(s, (a.priority ?? "Medium").toUpperCase(), W - M - 1.3, y + 0.14, { w: 1.3, fill: p.fill, color: p.color });
    if (hasClient(r)) add(s, a.brands.join(" · "), { x: W - M - 1.6, y: y + 0.46, w: 1.6, h: rh - 0.55, fontSize: 9, color: C.ink6, align: "right", fit: "shrink" });
  });
  s.addNotes(n.actions.map((a, i) => `${i + 1}. [${a.priority ?? ""}] ${a.title} — ${a.detail} (${a.brands.join(", ")}; based on ${a.based_on})`).join("\n"));
}

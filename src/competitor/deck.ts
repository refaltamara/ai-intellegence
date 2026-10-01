/**
 * The weekly competitor report as a PowerPoint deck (Fair's white and blue:
 * hairline tables, blue only for what the rule highlights, last week muted).
 * Slides: summary · scoreboard · movers · what's driving it (one per mover) ·
 * the landscape (creator tiers, products, posting pattern, close-ups, patterns;
 * src/competitor/landscapeDeck.ts) · what the client should do · appendix:
 * client portfolio · appendix: evidence and how to read. Every number comes from the report; the narrative supplies
 * the words and is checked before rendering.
 */
import PptxGenJS from "pptxgenjs";
import type { Narrative } from "./narrative";
import type { Cell, EvidencePost, Flag, GroupResult, Mover, Platform, WeeklyReport } from "./types";
import { PLATFORM_NAME, TIER_NAME, change, compact, dayMonth, flagValue, formatName, int, lensLines, metricLabel, pct, pts } from "./view";
import { landscapeSlides, movesSlide } from "./landscapeDeck";
import { add, arrow, C, chip, chrome, CW, FONT, M, segRuns, text, title, W, type Runs, type Slide } from "./draw";

// ------------------------------------------------------------------ 1 summary
function summarySlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, sampleLabel?: string) {
  const s = pres.addSlide();
  chrome(s, r, 1, sampleLabel);
  add(s, r.title, { x: M, y: 0.7, w: 9, h: 0.4, fontSize: 16, bold: true, color: C.blue });
  add(s, r.week.label, { x: M, y: 1.08, w: 9, h: 0.8, fontSize: 40, bold: true, color: C.ink, valign: "middle" });
  add(s, `Prepared for ${r.client} · ${r.platforms.map((p) => PLATFORM_NAME[p]).join(" and ")} · week ${Number(r.week.iso.slice(-2))}`, { x: M, y: 1.9, w: 9, h: 0.3, fontSize: 13, color: C.ink6 });

  const gap = 0.3;
  const cw = (CW - 2 * gap) / 3;
  n.summary.forEach((it, i) => {
    const x = M + i * (cw + gap);
    const y = 2.65;
    s.addShape("roundRect", { x, y, w: cw, h: 3.2, fill: { color: C.blue05 }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
    add(s, it.label, { x: x + 0.3, y: y + 0.28, w: cw - 0.6, h: 0.3, fontSize: 12, bold: true, color: C.blue });
    add(s, it.stat, { x: x + 0.3, y: y + 0.62, w: cw - 0.6, h: 0.75, fontSize: 38, bold: true, color: C.ink, valign: "middle" });
    add(s, it.stat_label, { x: x + 0.3, y: y + 1.38, w: cw - 0.6, h: 0.3, fontSize: 11, color: C.ink6 });
    add(s, it.text, { x: x + 0.3, y: y + 1.8, w: cw - 0.6, h: 1.25, fontSize: 15, color: C.ink, paraSpaceAfter: 0 });
  });

  const core = r.watchlist.filter((g) => g.group.kind === "core").map((g) => g.group.name);
  const relevant = r.watchlist.filter((g) => g.group.kind === "when_relevant").map((g) => g.group.name);
  add(s, [
    text("Watchlist  ", { fontSize: 10, bold: true, color: C.ink6 }),
    text(core.join(" · "), { fontSize: 10, color: C.ink6 }),
    text("      When relevant  ", { fontSize: 10, bold: true, color: C.ink6 }),
    text(relevant.join(" · "), { fontSize: 10, color: C.ink6 }),
  ], { x: M, y: 6.15, w: CW, h: 0.28 });
  add(s, `Highlighted = outside the brand's own ${r.rules.lookback_weeks}-week normal. Source: Fair social listening panel, posts about Indonesian beauty brands on ${r.platforms.map((p) => PLATFORM_NAME[p]).join(" and ")}.`, { x: M, y: 6.47, w: CW, h: 0.28, fontSize: 9, color: C.ink4 });
  s.addNotes(n.summary.map((x) => `${x.label}: ${x.stat} ${x.stat_label}. ${x.text}`).join("\n"));
}

// --------------------------------------------------------------- scoreboard
function flagOf(c: Cell | undefined, metric: Flag["metric"]): Flag | undefined {
  return c?.flags.find((f) => f.metric === metric);
}

function metricCell(c: Cell | undefined, metric: Flag["metric"], compactRow = false): PptxGenJS.TableCell {
  const base: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [2, 6, 2, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
  if (!c?.covered || !c.now || !c.prev) return { text: [text("—", { fontSize: 11, color: C.ink4 })], options: { ...base, align: "center" } };
  const f = flagOf(c, metric);
  const now = c.now;
  const prev = c.prev;
  if ((now.posts === 0 && prev.posts === 0) || (metric === "er" && now.er == null)) return { text: [text("—", { fontSize: 11, color: C.ink4 })], options: { ...base, align: "center" } };
  const main = `${f && metric === "er" ? arrow(f) + " " : ""}${metric === "posts" ? int(now.posts) : metric === "views" ? compact(now.views) : pct(now.er)}`;
  const wow = metric === "posts" ? change(now.posts, prev.posts) : metric === "views" ? change(now.views, prev.views) : pts(now.er, prev.er);
  const sub =
    metric === "er" ? `last week ${pct(prev.er)}`
    : `SOV ${pct(metric === "posts" ? now.posts_share : now.views_share)} (${pts(metric === "posts" ? now.posts_share : now.views_share, metric === "posts" ? prev.posts_share : prev.views_share)})`;
  const runs: Runs = [
    text(main, { fontSize: compactRow ? 10.5 : 12, bold: true, color: f ? C.blue : C.ink }),
    text(`  ${wow}`, { fontSize: compactRow ? 9 : 10, color: f ? C.blue : C.ink6, breakLine: !compactRow }),
  ];
  if (!compactRow) runs.push(text(`${f && metric !== "er" ? arrow(f) + " " : ""}${sub}`, { fontSize: 9, color: f ? C.blue : C.ink4, bold: !!f && metric !== "er" }));
  else if (f && metric !== "er") runs.push(text(` ${arrow(f)}`, { fontSize: 9, color: C.blue, bold: true }));
  return { text: runs, options: { ...base, fill: f ? { color: C.blue1 } : undefined } };
}

function scoreTable(r: WeeklyReport, rows: { label: string; strong?: boolean; group?: GroupResult; section?: string }[], compactRow: boolean): PptxGenJS.TableRow[] {
  const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "bottom", margin: [2, 6, 3, 6], border: [{ type: "none" }, { type: "none" }, { type: "none" }, { type: "none" }] };
  const head1: PptxGenJS.TableRow = [{ text: "", options: hb }];
  for (const pl of r.platforms) {
    const p = r.panel[pl]!;
    head1.push({
      text: [text(PLATFORM_NAME[pl], { fontSize: 13, bold: true, color: C.ink }), text(`   panel ${int(p.now.posts)} posts (${p.prev.posts ? change(p.now.posts, p.prev.posts) : "–"})`, { fontSize: 9, color: C.ink4 })],
      options: { ...hb, colspan: 3 },
    });
  }
  const sb: PptxGenJS.TableCellProps = { ...hb, border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] };
  const head2: PptxGenJS.TableRow = [{ text: "", options: sb }];
  for (const _ of r.platforms) for (const m of ["Posts", "Views", "Engagement rate"]) head2.push({ text: [text(m, { fontSize: 10, color: C.ink6, bold: true })], options: sb });
  const body: PptxGenJS.TableRow[] = rows.map((row) => {
    if (row.section) {
      return [{ text: [text(row.section, { fontSize: 9, bold: true, color: C.ink4 })], options: { ...hb, valign: "bottom", colspan: 1 + 3 * r.platforms.length, border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] } }];
    }
    const g = row.group!;
    const label: PptxGenJS.TableCell = {
      text: [text(row.label, { fontSize: compactRow ? 10.5 : 12, bold: true, color: C.ink })],
      options: { fontFace: FONT, valign: "middle", margin: [2, 6, 2, 0], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }], fill: row.strong ? { color: C.blue05 } : undefined },
    };
    return [label, ...r.platforms.flatMap((pl) => (["posts", "views", "er"] as const).map((m) => metricCell(g.cells[pl], m, compactRow)))];
  });
  return [head1, head2, ...body];
}

/** One line of what the reader must know before trusting the table: gaps in coverage and panel-wide swings. */
function coverageLine(r: WeeklyReport): string {
  const out = r.watchlist.filter((g) => r.platforms.every((pl) => !g.cells[pl]?.covered)).map((g) => g.group.name);
  const partial = r.watchlist
    .filter((g) => { const n = r.platforms.filter((pl) => g.cells[pl]?.covered).length; return n > 0 && n < r.platforms.length; })
    .map((g) => `${g.group.name} (${r.platforms.filter((pl) => g.cells[pl]?.covered).map((pl) => PLATFORM_NAME[pl]).join(", ")} only)`);
  const swings = r.platforms
    .filter((pl) => Math.abs(r.panel[pl]?.posts_change_pct ?? 0) >= r.rules.panel_swing_pct)
    .map((pl) => `${PLATFORM_NAME[pl]} ${change(r.panel[pl]!.now.posts, r.panel[pl]!.prev.posts)}`);
  return [
    out.length ? `Not in coverage yet: ${out.join(", ")}` : null,
    partial.length ? `One platform only: ${partial.join(", ")}` : null,
    swings.length ? `Whole-panel posts moved ${swings.join(", ")} against last week, so brands are judged on SOV` : null,
  ].filter(Boolean).join(" · ") + (out.length || partial.length || swings.length ? "." : "");
}

function scoreboardSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, n.scoreboard_title, `${r.week.label} against ${r.previous_week.label} · the watchlist on ${r.platforms.map((p) => PLATFORM_NAME[p]).join(" and ")} · blue = a significant move`);
  const covered = (g: GroupResult) => r.platforms.some((pl) => g.cells[pl]?.covered);
  const core = r.watchlist.filter((g) => g.group.kind === "core" && covered(g));
  const relevant = r.watchlist.filter((g) => g.group.kind === "when_relevant" && covered(g));
  type Row = { label: string; group?: GroupResult; section?: string };
  const rows: Row[] = [
    ...core.map((g) => ({ label: g.group.name, group: g })),
    ...(relevant.length ? [{ label: "", section: "WHEN RELEVANT" }, ...relevant.map((g) => ({ label: g.group.name, group: g }))] : []),
  ];
  const colW = [2.13, ...r.platforms.flatMap(() => [1.7, 1.7, 1.7])];
  const rowH = [0.42, 0.32, ...rows.map((x) => (x.section ? 0.3 : 0.6))];
  s.addTable(scoreTable(r, rows, false), { x: M, y: 1.68, w: CW, colW, rowH, fontFace: FONT });

  const rule = `Blue = unusual for that brand (outside its ${r.rules.lookback_weeks}-week range, ≥${r.rules.z} SD from its average), ≥${r.rules.min_change_pct}% against last week (≥${r.rules.min_er_change_pts} pt for ER), and ≥${r.rules.min_posts} posts or ≥${compact(r.rules.min_views)} views. SOV = share of all posts or views in the panel on that platform.`;
  const coverage = coverageLine(r);
  const top = 1.68 + rowH.reduce((a, b) => a + b, 0) + 0.16;
  add(s, [text(rule, { fontSize: 9, color: C.ink4, breakLine: !!coverage }), ...(coverage ? [text(coverage, { fontSize: 9, color: C.warn })] : [])], { x: M, y: top, w: CW, h: 6.98 - top });
  s.addNotes(`${n.scoreboard_title}\n\n${rule}\n\n${r.notes.map((x) => x.text).join("\n")}`);
}

// ------------------------------------------------------------------ movers
function moversSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  if (!r.movers.length) {
    title(s, n.movers_title, `No watchlist brand moved outside its own ${r.rules.lookback_weeks}-week normal on any platform.`);
    add(s, "Quiet week", { x: M, y: 1.85, w: 5, h: 0.6, fontSize: 30, bold: true, color: C.blue });
    add(s, "Closest to the line, and why each is not news:", { x: M, y: 2.55, w: CW, h: 0.3, fontSize: 13, color: C.ink6 });
    const hb: PptxGenJS.TableCellProps = { fontFace: FONT, valign: "middle", margin: [3, 6, 3, 6], border: [{ type: "none" }, { type: "none" }, { pt: 0.75, color: C.line }, { type: "none" }] };
    const head = ["Brand", "Platform", "Measure", "This week", "Last week", "Why it is not highlighted"].map((h) => ({ text: [text(h, { fontSize: 10, bold: true, color: C.ink6 })], options: { ...hb, border: [{ type: "none" }, { type: "none" }, { pt: 1, color: C.ink4 }, { type: "none" }] } })) as PptxGenJS.TableRow;
    const why = MISS_TEXT(r);
    const body = r.near_misses.map((x) => {
      const unit = x.metric === "er" ? "er" : r.rules.basis;
      return [
        x.name, PLATFORM_NAME[x.platform], x.metric === "er" ? "Engagement rate" : `SOV of ${x.metric}`,
        x.value == null ? "–" : flagValue(unit, x.metric, x.value), x.previous == null ? "–" : flagValue(unit, x.metric, x.previous), why[x.miss ?? ""] ?? x.miss ?? "",
      ].map((t, i) => ({ text: [text(t, { fontSize: 12, bold: i === 0, color: i >= 4 ? C.ink6 : C.ink })], options: hb }));
    }) as PptxGenJS.TableRow[];
    s.addTable([head, ...body], { x: M, y: 3.0, w: CW, colW: [2.0, 1.4, 1.9, 1.4, 1.4, 4.23], rowH: [0.38, ...body.map(() => 0.5)] });
    s.addNotes(`${n.movers_title}\nQuiet week: nothing on the watchlist moved outside its own normal range. Closest to the line: ${r.near_misses.map((x) => `${x.name} ${PLATFORM_NAME[x.platform]} ${x.metric}`).join("; ")}.`);
    return;
  }
  title(s, n.movers_title, `Each brand's highlighted measure over the last ${r.rules.lookback_weeks + 1} weeks · blue bar = this week`);
  const k = r.movers.length;
  const gap = 0.35;
  const side = k === 1 && r.near_misses.length > 0 ? 4.3 : 0;
  const pw = (CW - side - gap * (k - 1) - (side ? 0.5 : 0)) / k;
  if (side) nearMissPanel(s, r, W - M - side, 1.72, side);
  r.movers.forEach((m, i) => {
    const x = M + i * (pw + gap);
    const y = 1.72;
    const c = r.watchlist.find((g) => g.group.key === m.key)!.cells[m.platform]!;
    const f = m.flag;
    add(s, m.name, { x, y, w: pw - 1.3, h: 0.36, fontSize: 17, bold: true, color: C.ink, valign: "middle" });
    chip(s, PLATFORM_NAME[m.platform], x + pw - 1.15, y + 0.05, { w: 1.15 });
    add(s, metricLabel(f.metric, f.unit, m.platform), { x, y: y + 0.42, w: pw, h: 0.28, fontSize: 10.5, color: C.ink6 });
    add(s, [text(`${arrow(f)} `, { fontSize: 22, color: C.blue, bold: true }), text(flagValue(f.unit, f.metric, f.value), { fontSize: 30, color: C.blue, bold: true })], { x, y: y + 0.72, w: pw, h: 0.62, valign: "middle" });
    add(s, `last week ${flagValue(f.unit, f.metric, f.previous)} · ${r.rules.lookback_weeks}-week range ${flagValue(f.unit, f.metric, f.low)}–${flagValue(f.unit, f.metric, f.high)}`, { x, y: y + 1.36, w: pw, h: 0.28, fontSize: 10, color: C.ink6 });
    const pick = (p: typeof c.history[number]) => (f.metric === "er" ? p.er : f.unit === "share" ? (f.metric === "posts" ? p.posts_share : p.views_share) : f.metric === "posts" ? p.posts : p.views) ?? 0;
    const series = [...c.history, c.now!];
    s.addChart(pres.ChartType.bar, [{ name: metricLabel(f.metric, f.unit, m.platform), labels: series.map((p) => dayMonth(p.week)), values: series.map(pick) }], {
      x: x - 0.05, y: y + 1.72, w: pw + 0.1, h: 3.05,
      barDir: "col", barGapWidthPct: 45,
      chartColors: [...c.history.map(() => C.bar), C.blue],
      catAxisLabelFontSize: 7, catAxisLabelColor: C.ink6, catAxisLabelFontFace: FONT, catAxisLineShow: true, catAxisLineColor: C.line,
      valAxisLabelFontSize: 8, valAxisLabelColor: C.ink4, valAxisLabelFontFace: FONT, valAxisLineShow: false,
      valAxisLabelFormatCode: f.unit === "count" ? "#,##0" : '0.0"%"',
      valGridLine: { color: C.line, size: 0.5 }, catGridLine: { style: "none" },
      showLegend: false, showValue: false, showTitle: false,
    });
  });
  const others = r.flagged.filter((f) => !r.movers.some((m) => m.key === f.key && m.platform === f.platform && m.flag.metric === f.flag.metric));
  if (others.length) {
    const items = others.map((o) => `${o.name} ${PLATFORM_NAME[o.platform]} ${o.flag.metric === "er" ? "ER" : o.flag.metric} ${arrow(o.flag)}`);
    const shown: string[] = [];
    for (const it of items) if ([...shown, it].join(" · ").length <= 150) shown.push(it);
    const more = items.length - shown.length;
    add(s, [
      text("Also highlighted this week   ", { fontSize: 10, bold: true, color: C.ink6 }),
      text(shown.join("  ·  ") + (more ? `  ·  +${more} more` : ""), { fontSize: 10, color: C.blue }),
    ], { x: M, y: 6.62, w: CW, h: 0.3 });
  }
  s.addNotes(`${n.movers_title}\n` + r.movers.map((m) => `${m.name} (${PLATFORM_NAME[m.platform]}): ${metricLabel(m.flag.metric, m.flag.unit, m.platform)} ${flagValue(m.flag.unit, m.flag.metric, m.flag.value)} from ${flagValue(m.flag.unit, m.flag.metric, m.flag.previous)}.`).join("\n"));
}

const MISS_TEXT = (r: WeeklyReport): Record<string, string> => ({
  "within normal range": `within ${r.rules.z} SD of its ${r.rules.lookback_weeks}-week average`,
  "inside 8-week range": `inside its ${r.rules.lookback_weeks}-week range`,
  "change too small": `under ${r.rules.min_change_pct}% against last week`,
});

function nearMissPanel(s: Slide, r: WeeklyReport, x: number, y: number, w: number) {
  s.addShape("roundRect", { x, y, w, h: 4.75, fill: { color: C.blue05 }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
  add(s, "Closest to the line", { x: x + 0.25, y: y + 0.2, w: w - 0.5, h: 0.3, fontSize: 13, bold: true, color: C.ink });
  add(s, "Moved, but not enough to count as news:", { x: x + 0.25, y: y + 0.52, w: w - 0.5, h: 0.26, fontSize: 10, color: C.ink6 });
  const why = MISS_TEXT(r);
  r.near_misses.forEach((nm, i) => {
    const yy = y + 0.95 + i * 1.2;
    const unit = nm.metric === "er" ? "er" : r.rules.basis;
    add(s, [
      text(`${nm.name} · ${PLATFORM_NAME[nm.platform]}`, { fontSize: 11, bold: true, color: C.ink, breakLine: true }),
      text(`${nm.metric === "er" ? "Engagement rate" : `SOV of ${nm.metric}`} ${nm.value == null ? "–" : flagValue(unit, nm.metric, nm.value)}`, { fontSize: 10, color: C.ink }),
      text(`  (${nm.previous == null ? "–" : flagValue(unit, nm.metric, nm.previous)} last week)`, { fontSize: 10, color: C.ink4, breakLine: true }),
      text(why[nm.miss ?? ""] ?? nm.miss ?? "", { fontSize: 9, color: C.ink6 }),
    ], { x: x + 0.25, y: yy, w: w - 0.5, h: 1.05 });
  });
}

// ----------------------------------------------------------------- drivers
function postCard(s: Slide, p: EvidencePost, x: number, y: number, w: number, h: number) {
  s.addShape("roundRect", { x, y, w, h, fill: { color: C.white }, line: { color: C.line, width: 0.75 }, rectRadius: 0.06 });
  chip(s, p.ref, x + w - 0.62, y + 0.12, { w: 0.5, fill: C.blue1 });
  const handle = p.creator_handle ? `@${p.creator_handle}` : "brand account";
  add(s, [text(handle, { fontSize: handle.length > 22 ? 8.5 : handle.length > 18 ? 9.5 : 11, bold: true, color: C.blue5, hyperlink: { url: p.url } })], { x: x + 0.14, y: y + 0.12, w: w - 0.8, h: 0.26, valign: "middle" });
  const line1 = [p.source === "owned" ? "Brand account" : TIER_NAME[p.tier ?? "unknown"] ?? p.tier, `${compact(p.views)} views`, p.er != null ? `${pct(p.er)} ER` : null].filter(Boolean).join(" · ");
  const line2 = [p.content_format && p.content_format !== "other" ? formatName(p.content_format) : null, p.has_cart ? "yellow cart" : null, dayMonth(p.posted_at)].filter(Boolean).join(" · ");
  add(s, [text(line1, { fontSize: 9, color: C.ink, breakLine: true }), text(line2, { fontSize: 8.5, color: C.ink4 })], { x: x + 0.14, y: y + 0.42, w: w - 0.28, h: 0.42 });
  if (p.caption) add(s, `“${p.caption.length > 100 ? p.caption.slice(0, 99) + "…" : p.caption}”`, { x: x + 0.14, y: y + 0.92, w: w - 0.28, h: h - 1.02, fontSize: 9, italic: true, color: C.ink6 });
}

function driverSlide(pres: PptxGenJS, r: WeeklyReport, m: Mover, d: Narrative["drivers"][number], page: number, sampleLabel?: string) {
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, d.title, `What's driving it · ${m.name} on ${PLATFORM_NAME[m.platform]} · this week, last week in grey`);
  const f = m.flag;
  // left: the move, the why, attention → action
  const lx = M;
  const lw = 4.05;
  chip(s, PLATFORM_NAME[m.platform], lx, 1.75, { w: 1.15 });
  add(s, metricLabel(f.metric, f.unit, m.platform), { x: lx + 1.3, y: 1.75, w: lw - 1.3, h: 0.26, fontSize: 10, color: C.ink6, valign: "middle" });
  add(s, [text(`${arrow(f)} `, { fontSize: 24, color: C.blue, bold: true }), text(flagValue(f.unit, f.metric, f.value), { fontSize: 34, bold: true, color: C.blue })], { x: lx, y: 2.12, w: lw, h: 0.7, valign: "middle" });
  add(s, `from ${flagValue(f.unit, f.metric, f.previous)} last week · normal ${flagValue(f.unit, f.metric, f.low)}–${flagValue(f.unit, f.metric, f.high)}`, { x: lx, y: 2.84, w: lw, h: 0.26, fontSize: 10, color: C.ink6 });
  add(s, d.why, { x: lx, y: 3.25, w: lw, h: 1.75, fontSize: 13.5, color: C.ink, fit: "shrink" });
  s.addShape("roundRect", { x: lx, y: 5.15, w: lw, h: 1.72, fill: { color: C.blue05 }, line: { color: C.blue1, width: 0.75 }, rectRadius: 0.08 });
  add(s, "Attention → action", { x: lx + 0.2, y: 5.3, w: lw - 0.4, h: 0.26, fontSize: 10, bold: true, color: C.blue });
  add(s, d.attention_to_action, { x: lx + 0.2, y: 5.6, w: lw - 0.4, h: 1.18, fontSize: 12, color: C.ink, fit: "shrink" });

  // right: the five lenses, then the posts behind them
  const rx = M + lw + 0.45;
  const rw = W - M - rx;
  const lines = lensLines(m);
  const lh = 0.47;
  lines.forEach((l, i) => {
    const y = 1.72 + i * lh;
    s.addShape("line", { x: rx, y: y + lh, w: rw, h: 0, line: { color: C.line, width: 0.75 } });
    add(s, l.label, { x: rx, y, w: 1.55, h: lh, fontSize: 10.5, bold: true, color: l.warn ? C.warn : C.ink6, valign: "middle" });
    add(s, segRuns(l.segs, 11, l.warn ? C.warn : C.ink), { x: rx + 1.6, y, w: rw - 1.6, h: lh, valign: "middle", fit: "shrink" });
  });
  const py = 1.72 + lines.length * lh + 0.3;
  add(s, "The posts behind it", { x: rx, y: py, w: rw, h: 0.26, fontSize: 10.5, bold: true, color: C.ink6 });
  const posts = m.what.top_posts;
  const pg = 0.2;
  const cw = (rw - pg * 2) / 3;
  const ch = 6.87 - (py + 0.34);
  posts.forEach((p, i) => postCard(s, p, rx + i * (cw + pg), py + 0.34, cw, ch));
  s.addNotes(`${d.title}\n\n${d.why}\n\nAttention → action: ${d.attention_to_action}\n\n` + lines.map((l) => `${l.label}: ${l.segs.map((x) => x.t).join("")}`).join("\n") + "\n\n" + posts.map((p) => `${p.ref} ${p.url}`).join("\n"));
}

// ----------------------------------------------------------------- actions
function actionsSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, `What ${r.client} should do this week`, "From this week's moves: what's new, what's working, what may be worth testing");
  const k = n.actions.length;
  const gap = 0.3;
  const cw = (CW - gap * (k - 1)) / k;
  n.actions.forEach((a, i) => {
    const x = M + i * (cw + gap);
    const y = 1.8;
    const h = 4.95;
    s.addShape("roundRect", { x, y, w: cw, h, fill: { color: C.white }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
    s.addShape("ellipse", { x: x + 0.3, y: y + 0.3, w: 0.52, h: 0.52, fill: { color: C.blue }, line: { color: C.blue, width: 0 } });
    add(s, String(i + 1), { x: x + 0.3, y: y + 0.3, w: 0.52, h: 0.52, fontSize: 16, bold: true, color: C.white, align: "center", valign: "middle" });
    add(s, a.title, { x: x + 0.3, y: y + 1.0, w: cw - 0.6, h: 1.2, fontSize: 18, bold: true, color: C.ink });
    add(s, a.detail, { x: x + 0.3, y: y + 2.3, w: cw - 0.6, h: 1.55, fontSize: 13, color: C.ink6 });
    let cx = x + 0.3;
    for (const b of a.brands) cx += chip(s, b, cx, y + 3.95, { fill: C.blue1 }) + 0.1;
    add(s, `Based on: ${a.based_on}`, { x: x + 0.3, y: y + 4.35, w: cw - 0.6, h: 0.4, fontSize: 9, color: C.ink4, fit: "shrink" });
  });
  s.addNotes(n.actions.map((a, i) => `${i + 1}. ${a.title} — ${a.detail} (${a.brands.join(", ")}; based on ${a.based_on})`).join("\n"));
}

// ---------------------------------------------------------------- appendix
function portfolioSlide(pres: PptxGenJS, r: WeeklyReport, n: Narrative, page: number, sampleLabel?: string) {
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, `Appendix · ${r.client} this week`, n.portfolio_note ?? `${r.client}'s brands on the same measures and the same rule as the watchlist · blue = a significant move`);
  const withPosts = r.client_brands.filter((g) => r.platforms.some((pl) => (g.cells[pl]?.now?.posts ?? 0) + (g.cells[pl]?.prev?.posts ?? 0) > 0));
  const rows = [{ label: r.portfolio.group.name, strong: true, group: r.portfolio }, ...withPosts.map((g) => ({ label: g.group.name, group: g }))];
  const colW = [2.13, ...r.platforms.flatMap(() => [1.7, 1.7, 1.7])];
  const rowH = [0.4, 0.3, ...rows.map(() => 0.36)];
  s.addTable(scoreTable(r, rows, true), { x: M, y: 1.62, w: CW, colW, rowH, fontFace: FONT });
  const top = 1.62 + rowH.reduce((a, b) => a + b, 0) + 0.12;
  add(s, `Each value: this week, change against last week. Portfolio = distinct posts across ${r.client}'s ${r.client_brands.length} brands; brands with no posts on either platform in the two weeks are left out.`, { x: M, y: Math.min(top, 6.7), w: CW, h: 0.3, fontSize: 8.5, color: C.ink4 });
  s.addNotes(`${r.client} portfolio and brands. ${n.portfolio_note ?? ""}`);
}

function evidenceSlide(pres: PptxGenJS, r: WeeklyReport, page: number, sampleLabel?: string) {
  const s = pres.addSlide();
  chrome(s, r, page, sampleLabel);
  title(s, "Appendix · Evidence and how to read this report");
  const lw = 8.1;
  if (r.evidence.length) {
    const heads = ["", "Brand", "Post", "Date", "Views", "ER"];
    const xs = [0, 0.5, 1.8, 4.35, 5.05, 5.85];
    heads.forEach((h, i) => add(s, h, { x: M + xs[i], y: 1.45, w: 2.5, h: 0.24, fontSize: 9, bold: true, color: C.ink6 }));
    const rh = Math.min(0.52, 5.25 / r.evidence.length);
    r.evidence.forEach((p, i) => {
      const y = 1.75 + i * rh;
      s.addShape("line", { x: M, y: y + rh - 0.02, w: lw, h: 0, line: { color: C.line, width: 0.5 } });
      add(s, p.ref, { x: M, y, w: 0.45, h: rh, fontSize: 9, bold: true, color: C.blue, valign: "middle" });
      add(s, `${p.group} · ${PLATFORM_NAME[p.platform]}`, { x: M + xs[1], y, w: 1.25, h: rh, fontSize: 9, color: C.ink, valign: "middle", fit: "shrink" });
      add(s, [text(p.creator_handle ? `@${p.creator_handle}` : "brand account", { fontSize: 9, color: C.blue5, hyperlink: { url: p.url } })], { x: M + xs[2], y, w: 2.5, h: rh, valign: "middle", fit: "shrink" });
      add(s, dayMonth(p.posted_at), { x: M + xs[3], y, w: 0.7, h: rh, fontSize: 9, color: C.ink6, valign: "middle" });
      add(s, compact(p.views), { x: M + xs[4], y, w: 0.75, h: rh, fontSize: 9, color: C.ink, valign: "middle" });
      add(s, p.er != null ? pct(p.er) : "–", { x: M + xs[5], y, w: 0.6, h: rh, fontSize: 9, color: C.ink, valign: "middle" });
      const cap = (p.caption ?? "").trim();
      add(s, cap.length > 58 ? cap.slice(0, 57) + "…" : cap, { x: M + 6.5, y, w: lw - 6.5, h: rh, fontSize: 8, italic: true, color: C.ink4, valign: "middle" });
    });
  } else {
    add(s, "No driver slides this week, so no posts are cited.", { x: M, y: 1.6, w: lw, h: 0.3, fontSize: 12, color: C.ink6 });
  }
  const rx = M + lw + 0.4;
  const rw = W - M - rx;
  s.addShape("roundRect", { x: rx, y: 1.45, w: rw, h: 5.42, fill: { color: C.blue05 }, line: { color: C.line, width: 0.75 }, rectRadius: 0.08 });
  const rules = r.rules;
  const how: Runs = [
    text("How to read this report", { fontSize: 11, bold: true, color: C.ink, breakLine: true }),
    text(`A move is highlighted only when it is unusual for that brand (outside its own ${rules.lookback_weeks}-week range, ≥${rules.z} standard deviations from its average), large (≥${rules.min_change_pct}% against last week, ≥${rules.min_er_change_pts} pt for engagement rate) and big enough to matter (≥${rules.min_posts} posts or ≥${compact(rules.min_views)} views).`, { fontSize: 9, color: C.ink6, breakLine: true, paraSpaceAfter: 6 }),
    text(`Posts and views are judged as share of voice (SOV): the brand's share of every post or view in the panel on that platform that week. At most ${rules.max_movers} brands get a "what's driving it" slide, the most unusual first.`, { fontSize: 9, color: C.ink6, breakLine: true, paraSpaceAfter: 6 }),
    text("Engagement rate = likes, comments, shares and saves over views on TikTok; likes and comments over views on Instagram. Never compared across platforms.", { fontSize: 9, color: C.ink6, breakLine: true, paraSpaceAfter: 8 }),
    text("Data notes", { fontSize: 11, bold: true, color: C.ink, breakLine: true }),
    ...r.notes.map((x, i) => text(x.text, { fontSize: 9, color: x.kind === "coverage" ? C.warn : C.ink6, breakLine: i < r.notes.length - 1, paraSpaceAfter: 5 })),
  ];
  add(s, how, { x: rx + 0.22, y: 1.62, w: rw - 0.44, h: 5.1, fit: "shrink" });
  s.addNotes(r.evidence.map((p) => `${p.ref} ${p.group} ${p.url}`).join("\n"));
}

export type DeckOptions = { sampleLabel?: string };

/** Lay out every slide on a presentation: the real PptxGenJS for the .pptx, or the recorder the PDF is drawn from (src/competitor/pdfdeck.ts). */
export function buildDeck(pres: PptxGenJS, r: WeeklyReport, n: Narrative, opts: DeckOptions = {}): void {
  let page = 1;
  summarySlide(pres, r, n, opts.sampleLabel);
  scoreboardSlide(pres, r, n, ++page, opts.sampleLabel);
  moversSlide(pres, r, n, ++page, opts.sampleLabel);
  r.movers.forEach((m) => driverSlide(pres, r, m, n.drivers.find((d) => d.key === m.key)!, ++page, opts.sampleLabel));
  if (r.landscape) {
    page += landscapeSlides(pres, r, n, page + 1, opts.sampleLabel);
    movesSlide(pres, r, n, ++page, opts.sampleLabel);
  } else actionsSlide(pres, r, n, ++page, opts.sampleLabel);
  portfolioSlide(pres, r, n, ++page, opts.sampleLabel);
  evidenceSlide(pres, r, ++page, opts.sampleLabel);
}

/** The deck as a .pptx file in memory (serverless-safe: nothing touches the disk). */
export async function deckBuffer(r: WeeklyReport, n: Narrative, opts: DeckOptions = {}): Promise<Buffer> {
  const pres = new PptxGenJS();
  pres.layout = "LAYOUT_WIDE";
  pres.author = "Fair";
  pres.company = "Fair";
  pres.title = `${r.title} · ${r.week.label}`;
  pres.theme = { headFontFace: FONT, bodyFontFace: FONT };
  buildDeck(pres, r, n, opts);
  return (await pres.write({ outputType: "nodebuffer" })) as Buffer;
}

export async function renderDeck(r: WeeklyReport, n: Narrative, path: string, opts: DeckOptions = {}): Promise<string> {
  const { writeFile } = await import("node:fs/promises");
  await writeFile(path, await deckBuffer(r, n, opts));
  return path;
}

/** Slide size in inches (LAYOUT_WIDE), for the PDF. */
export const DECK_SIZE = { w: W, h: 7.5 };

/**
 * The words of the weekly report, written by the model from the facts
 * (DECISIONS, 29 Sep 2026). The model sees a fact sheet in which every number is
 * already formatted the way the deck prints it, writes the narrative through one
 * tool, and `checkNarrative` rejects any number the facts do not contain and any
 * field over its word limit. A rejected draft goes back with the problems, twice
 * at most; after that, or without a model, the report ships with a plain
 * narrative built from the facts, so a scheduled report never fails for words.
 */
import type Anthropic from "@anthropic-ai/sdk";
import { anthropicClient, describeModelError } from "../chat/client";
import { hasModelCredentials, modelId } from "../chat/loop";
import { findingCell, trendRows } from "./libraryDeck";
import { checkNarrative, PRIORITIES, type Narrative } from "./narrative";
import type { PeriodWords } from "./period";
import { deckSlides, hasClient, isDeck, trendPlatforms, type SlideKind } from "./slides";
import type { Cell, GroupResult, Mover, Platform, WeeklyReport } from "./types";
import { change, closeupLines, closeupPicks, compact, dayMonth, EVENT_LABEL, flagValue, HOOK_LABEL, hourLabel, int, lensLines, metricLabel, OFFER_LABEL, PATTERN_NAME, patternHow, patternSignal, PLATFORM_NAME, postingBehind, productName, pct, pts, TIER_NAME, tierLegend, wordsOf } from "./view";

export type Written = { narrative: Narrative; by: "model" | "fallback"; attempts: number; problems: string[] };
type Create = (params: Anthropic.MessageCreateParamsNonStreaming) => Promise<Anthropic.Message>;

const MAX_ATTEMPTS = 3;
const TOOL_NAME = "write_weekly_report";

// ------------------------------------------------------------- fact sheet
function cellLine(r: WeeklyReport, pl: Platform, c: Cell | undefined): string {
  if (!c?.covered || !c.now || !c.prev) return `  ${PLATFORM_NAME[pl]}: not in coverage`;
  const w = wordsOf(r);
  const n = c.now, p = c.prev;
  const flags = c.flags.map((f) => `HIGHLIGHTED ${f.metric === "er" ? "engagement rate" : f.metric} ${f.direction} (${f.metric === "er" ? pts(f.value, f.previous) : `SOV ${pct(f.value)} from ${pct(f.previous)}`}, ${w.span(r.rules.lookback_weeks)} range ${flagValue(f.unit, f.metric, f.low)}–${flagValue(f.unit, f.metric, f.high)})`);
  return `  ${PLATFORM_NAME[pl]}: posts ${int(n.posts)} (${change(n.posts, p.posts)}; SOV ${pct(n.posts_share)}, ${pts(n.posts_share, p.posts_share)}) · views ${compact(n.views)} (${change(n.views, p.views)}; SOV ${pct(n.views_share)}, ${pts(n.views_share, p.views_share)}) · ER ${pct(n.er)} (${w.last} ${pct(p.er)}, ${pts(n.er, p.er)}) · creators ${int(n.creators)} (${w.last} ${int(p.creators)})${flags.length ? ` · ${flags.join("; ")}` : ""}`;
}

function groupBlock(r: WeeklyReport, g: GroupResult): string {
  return [`- ${g.group.name}${g.group.untracked?.length ? ` (not collected yet: ${g.group.untracked.join(", ")})` : ""}`, ...r.platforms.map((pl) => cellLine(r, pl, g.cells[pl]))].join("\n");
}

function moverBlock(r: WeeklyReport, m: Mover, i: number): string {
  const w = wordsOf(r);
  const f = m.flag;
  const posts = m.what.top_posts.map((p) => `    ${p.ref} ${p.creator_handle ? "@" + p.creator_handle : "brand account"}: ${compact(p.views)} views${p.er != null ? `, ${pct(p.er)} ER` : ""}${p.content_format ? `, ${p.content_format}` : ""}${p.has_cart ? ", yellow cart" : ""}. "${(p.caption ?? "").replace(/\s+/g, " ").slice(0, 140)}"`);
  return [
    `${i + 1}. key="${m.key}" ${m.name} on ${PLATFORM_NAME[m.platform]}: ${metricLabel(f.metric, f.unit, m.platform)} ${f.direction} to ${flagValue(f.unit, f.metric, f.value)} from ${flagValue(f.unit, f.metric, f.previous)} ${w.last} (${w.span(r.rules.lookback_weeks)} range ${flagValue(f.unit, f.metric, f.low)}–${flagValue(f.unit, f.metric, f.high)})`,
    ...lensLines(m, { lookback: r.rules.lookback_weeks, grain: r.grain }).map((l) => `   ${l.label}: ${l.segs.map((s) => s.t).join("")}`),
    `   Top posts:`,
    ...posts,
    m.other_flags.length ? `   Also highlighted for ${m.name}: ${m.other_flags.map((o) => `${PLATFORM_NAME[o.platform]} ${o.flag.metric} ${o.flag.direction}`).join(", ")}` : "",
  ].filter(Boolean).join("\n");
}

/** Everything the model may say, with every number already printed the way the deck prints it. */
export function factSheet(r: WeeklyReport): string {
  const w = wordsOf(r);
  const has = new Set(deckSlides(r));
  const core = r.watchlist.filter((g) => g.group.kind === "core");
  const relevant = r.watchlist.filter((g) => g.group.kind === "when_relevant");
  const panel = r.platforms.map((pl) => {
    const p = r.panel[pl];
    return p ? `${PLATFORM_NAME[pl]} panel: ${int(p.now.posts)} posts (${change(p.now.posts, p.prev.posts)} against ${w.last}), ${compact(p.now.views)} views (${change(p.now.views, p.prev.views)})` : "";
  }).filter(Boolean);
  return [
    `REPORT: ${r.title}${r.client ? ` for ${r.client}` : ""}, ${w.unit} ${r.week.iso} (${r.week.label}), against ${r.previous_week.label}. Platforms: ${r.platforms.map((p) => PLATFORM_NAME[p]).join(", ")}.`,
    `RULE: a move is highlighted when it is outside the brand's own ${w.span(r.rules.lookback_weeks)} range, at least ${r.rules.z} SD from its average, at least ${r.rules.min_change_pct}% against ${w.last} (${r.rules.min_er_change_pts} pt for ER) and at least ${r.rules.min_posts} posts or ${compact(r.rules.min_views)} views. Posts and views are judged as share of voice (SOV) of the panel.`,
    "",
    "PANEL",
    ...panel,
    "",
    "WATCHLIST (core)",
    ...core.map((g) => groupBlock(r, g)),
    ...(relevant.length ? ["", "WATCHLIST (when relevant: mention only if they moved)", ...relevant.map((g) => groupBlock(r, g))] : []),
    "",
    r.movers.length ? `MOVERS (${has.has("drivers") ? `one driver slide each, in this order; drivers[].key must be exactly: ${r.movers.map((m) => `"${m.key}"`).join(", ")}` : "highlighted on the movers slide"})` : `MOVERS: none. This is a quiet ${w.unit}${has.has("drivers") ? "; drivers must be an empty list" : ""}.`,
    ...r.movers.map((m, i) => moverBlock(r, m, i)),
    ...(r.flagged.length > r.movers.length ? ["", `ALSO HIGHLIGHTED: ${r.flagged.filter((f) => !r.movers.some((m) => m.key === f.key && m.platform === f.platform && m.flag.metric === f.flag.metric)).map((f) => `${f.name} ${PLATFORM_NAME[f.platform]} ${f.flag.metric} ${f.flag.direction}`).join("; ")}`] : []),
    ...(r.near_misses.length && !r.movers.length ? ["", "CLOSEST TO THE LINE (not highlighted)", ...r.near_misses.map((x) => `- ${x.name} ${PLATFORM_NAME[x.platform]} ${x.metric === "er" ? "engagement rate" : `SOV of ${x.metric}`} ${x.value == null ? "–" : pct(x.value)} (${w.last} ${x.previous == null ? "–" : pct(x.previous)}): ${x.miss}`)] : []),
    ...(hasClient(r)
      ? [
          "",
          `CLIENT: ${r.client} (${has.has("portfolio") ? "reported in the appendix; " : ""}the actions are for ${r.client}). Their brands: ${r.client_brands.map((g) => g.group.name).join(", ")}.`,
          groupBlock(r, r.portfolio),
          ...r.client_brands.filter((g) => r.platforms.some((pl) => g.cells[pl]?.flags.length)).map((g) => groupBlock(r, g)),
        ]
      : ["", "CLIENT: none. This deck reports on the watchlist for the team reading it; actions are for that team (brands: [\"All brands\"])."]),
    ...(r.landscape ? ["", ...landscapeSheet(r, has)] : []),
    ...(isDeck(r) ? deckSheet(r, has) : []),
    "",
    "DATA NOTES",
    ...r.notes.map((n) => `- ${n.text}`),
  ].join("\n");
}

const count = (n: number, one: string) => `${int(n)} ${n === 1 ? one : `${one}s`}`;

/** The landscape slides' facts, printed the way the slides print them. A deck reads only the slides it carries; the weekly report carries them all. */
function landscapeSheet(r: WeeklyReport, has: Set<SlideKind>): string[] {
  const L = r.landscape!;
  const w = wordsOf(r);
  const tag = (b: { name: string; client: boolean }) => `${b.name}${b.client ? " (client)" : ""}`;
  const out: string[] = [];
  if (has.has("tiers")) {
    out.push(`CREATOR TIERS (creator posts only, brand accounts excluded; followers: ${tierLegend().map((t) => t.label).join(", ")})`);
    for (const t of L.tiers.rows) {
      out.push(`- ${tag(t)}: ${int(t.posts)} creator posts, ${compact(t.views)} views. Share of content: ${t.tiers.map((x) => `${TIER_NAME[x.tier]} ${x.content_share}%`).join(", ")}. Share of views: ${t.tiers.map((x) => `${TIER_NAME[x.tier]} ${x.views_share}%`).join(", ")}.${t.top ? ` Biggest tier by views: ${TIER_NAME[t.top.tier]}, ${int(t.top.posts)} posts, ${compact(t.top.views)} views (${t.top.views_share}%).` : ""}`);
    }
    out.push(`Median views per creator post ${w.this}: ${L.tiers.benchmark.filter((b) => b.median_views != null).map((b) => `${TIER_NAME[b.tier]} ${compact(b.median_views)} (${int(b.posts)} posts)`).join(" · ")}.`);
    out.push(`Across these brands: ${L.tiers.overall.map((o) => `${TIER_NAME[o.tier]} ${o.content_share}% of posts, ${o.views_share}% of views`).join("; ")}.`, "");
  }
  if (has.has("products")) {
    out.push("PRODUCTS (categories named in captions, posts · views; a post can name several; cart = TikTok Shop products tagged)");
    for (const p of L.products) {
      out.push(`- ${tag(p)}: ${int(p.posts)} posts, ${p.unnamed_share}% name no category. ${p.categories.map((c) => `${c.label} ${int(c.posts)} posts · ${compact(c.views)} views`).join("; ") || "no category named"}.${p.cart.length ? ` Cart: ${p.cart.map((c) => `${productName(c.name)} ${count(c.posts, "post")} · ${compact(c.views)} views`).join("; ")}.` : ""}`);
    }
    out.push("");
  }
  const P = L.posting;
  if (has.has("posting")) {
    const cur = P.days.filter((d) => d.current);
    const prev = P.days.filter((d) => !d.current);
    out.push(`POSTING (the watchlist${r.client ? ` and ${r.client}` : ""} together; days and hours in ${L.tz})`);
    out.push(`Posts per day ${w.last}: ${prev.map((d) => `${dayMonth(d.date)} ${int(d.posts)} (promo ${int(d.promo_posts)})`).join(", ")}.`);
    out.push(`Posts per day ${w.this}: ${cur.map((d) => `${dayMonth(d.date)} ${int(d.posts)} (promo ${int(d.promo_posts)})`).join(", ")}.`);
    out.push(`${w.this.charAt(0).toUpperCase() + w.this.slice(1)} ${int(cur.reduce((a, d) => a + d.posts, 0))} posts against ${int(prev.reduce((a, d) => a + d.posts, 0))} ${w.last}.${P.window ? ` ${P.window.share}% of ${w.this}'s posts go up between ${hourLabel(P.window.from)} and ${hourLabel(P.window.to)}` : ""}${P.peak_hour != null ? `, peaking at ${hourLabel(P.peak_hour)}` : ""}.${P.hour_median_range ? ` Median views per post by hour run from ${compact(P.hour_median_range.low)} to ${compact(P.hour_median_range.high)}.` : ""}`);
    for (const b of P.brands) out.push(`- ${tag(b)}: ${int(b.posts)} posts; peak day ${b.peak_day ? dayMonth(b.peak_day) : "–"} with ${b.peak_posts_share}% of posts and ${b.peak_views_share}% of views; ${postingBehind(b)}.`);
    out.push("");
  }
  if (has.has("closeups")) {
    const picks = closeupPicks(r);
    out.push(`CLOSE-UPS (${picks.length} ${picks.length === 1 ? "slide" : "slides"}: ${picks.map((p) => p.map((c) => c.name).join(" + ")).join("; ")}). closeups[].key must be exactly, in order: ${picks.flat().map((c) => `"${c.key}"`).join(", ")}. closeup_titles: exactly ${picks.length}.`);
    for (const c of picks.flat()) {
      out.push(`- key="${c.key}" ${c.name}: ${int(c.posts)} content (${int(c.tiktok_posts)} TikTok, ${int(c.instagram_posts)} Instagram), ${compact(c.views)} views, ${compact(c.likes)} likes, ${compact(c.comments)} comments, eng. rate ${c.er != null ? `${c.er.toFixed(1)}%` : "–"} (likes + comments ÷ views).`);
      for (const l of closeupLines(c, P.brands.find((b) => b.key === c.key), w.this)) out.push(`    ${l.label}: ${l.text}`);
      if (c.top_post) out.push(`    Top post: ${c.top_post.handle ? "@" + c.top_post.handle : "brand account"}, ${compact(c.top_post.views)} views on ${PLATFORM_NAME[c.top_post.platform]}.`);
    }
    const client = L.closeups.find((c) => c.client);
    if (client) {
      out.push(`- ${r.client} for comparison (not a close-up slide): ${int(client.posts)} content, ${compact(client.views)} views, eng. rate ${client.er != null ? `${client.er.toFixed(1)}%` : "–"}.`);
      for (const l of closeupLines(client, P.brands.find((b) => b.key === client.key), w.this)) out.push(`    ${l.label}: ${l.text}`);
    }
    out.push("");
  }
  if (has.has("patterns")) {
    out.push(L.patterns.length ? "PATTERNS (shown on the patterns slide, biggest first)" : `PATTERNS: none ${w.this}; leave patterns out.`);
    for (const p of L.patterns.slice(0, 5)) {
      out.push(`- ${PATTERN_NAME[p.kind]} · ${tag(p)}: ${patternSignal(p)}; ${count(p.accounts, "account")}, ${count(p.posts, "post")}, ${compact(p.views)} views, ${p.views_share}% of the brand's views.${p.examples[0] ? ` ${p.kind === "affiliate" ? "Biggest" : "Top post"} ${p.examples[0].handle ? "@" + p.examples[0].handle : ""} ${compact(p.examples[0].views)} views.` : ""} (${patternHow(p.kind, r.grain)})`);
    }
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out;
}

/** The deck-only slides' facts: trend, top creators, top content, findings from Chats. */
function deckSheet(r: WeeklyReport, has: Set<SlideKind>): string[] {
  const w = wordsOf(r);
  const out: string[] = [];
  if (has.has("trend")) {
    const pls = trendPlatforms(r);
    out.push("", `TREND (views per ${w.unit}, oldest first, then ${w.this}; one trend slide per platform; trends[].platform must be exactly, in order: ${pls.map((p) => `"${p}"`).join(", ")})`);
    for (const pl of pls) {
      out.push(`${PLATFORM_NAME[pl]}:`);
      for (const g of trendRows(r, pl)) {
        const c = g.cells[pl]!;
        const n = c.now!, p = c.prev!;
        out.push(`- ${g.group.kind === "client" ? `${r.client} (client)` : g.group.name}: ${c.history.map((h) => compact(h.views)).join(", ")}, ${w.this} ${compact(n.views)} (${change(n.views, p.views)} against ${w.last}; SOV ${pct(n.views_share)}, ${pts(n.views_share, p.views_share)}); posts ${int(n.posts)} (${change(n.posts, p.posts)})${c.flags.length ? ` · HIGHLIGHTED ${c.flags.map((f) => `${f.metric === "er" ? "engagement rate" : f.metric} ${f.direction}`).join(", ")}` : ""}`);
      }
    }
  }
  if (has.has("creators")) {
    const rows = r.creators ?? [];
    out.push("", `TOP CREATORS (creator posts only, across the brands in this deck, ${w.this}, ranked by views on each platform; first time = no post for these brands in the ${r.rules.lookback_weeks} ${w.unit}s before; ${int(rows.filter((c) => c.first_time).length)} first-time creators in the list; low engagement = ER under ${r.rules.boosted_er_pct}% on 1.0M views or more, which looks paid)`);
    rows.forEach((c) => out.push(`- @${c.handle} (${PLATFORM_NAME[c.platform]}, ${TIER_NAME[c.tier ?? "unknown"] ?? c.tier}${c.followers != null ? `, ${compact(c.followers)} followers` : ""}) for ${c.brands.join(", ")}: ${count(c.posts, "post")}, ${compact(c.views)} views${c.er != null ? `, ER ${pct(c.er)}` : ""}${c.first_time ? "; first time" : ""}${c.er != null && c.er < r.rules.boosted_er_pct && c.views >= 1_000_000 ? "; low engagement" : ""}`));
  }
  if (has.has("content")) {
    out.push("", "TOP CONTENT (the most-viewed posts, as the slide shows them)");
    for (const p of r.content ?? []) out.push(`- ${p.ref} ${p.creator_handle ? "@" + p.creator_handle : "brand account"} for ${p.group} on ${PLATFORM_NAME[p.platform]}: ${compact(p.views)} views${p.er != null ? `, ${pct(p.er)} ER` : ""}${p.content_format ? `, ${p.content_format}` : ""}${p.has_cart ? ", yellow cart" : ""}. "${(p.caption ?? "").slice(0, 140)}"`);
  }
  if ((has.has("campaigns") || has.has("angles")) && r.captions) {
    const K = r.captions;
    out.push("", `READ FROM CAPTIONS (the model named each post's product, campaign or event, offer, hook and angle; every number is a count in the panel). Coverage: ${int(K.coverage.read)} of ${int(K.coverage.posts)} posts ${w.this} were read, ${K.coverage.read_views_share}% of their views (posts with ${compact(K.floor)}+ views and brand accounts are read).`);
    if (has.has("campaigns")) {
      out.push("CAMPAIGNS AND LAUNCHES (biggest first; first seen = the first post naming it among the posts read)");
      for (const e of K.events) out.push(`- ${e.name}${e.client ? " (client)" : ""} · ${EVENT_LABEL[e.event] ?? e.event} "${e.event_name}": ${count(e.posts, "post")}${e.owned_posts ? ` (${int(e.owned_posts)} from brand accounts)` : ""}, ${count(e.creators, "creator")}, ${compact(e.views)} views; first seen ${dayMonth(e.first_seen)}${e.new ? ` (new ${w.this})` : e.new === null ? " (whether it is new is unknown: earlier posts are not read)" : ""}; ${w.last} ${count(e.posts_prev, "post")}.${e.top ? ` Top post ${e.top.handle ? "@" + e.top.handle : "brand account"}, ${compact(e.top.views)} views.` : ""}`);
      out.push("OFFERS (share of each brand's read posts with an offer in the caption)");
      for (const o of K.offers.filter((x) => x.read >= 5)) out.push(`- ${o.name}${o.client ? " (client)" : ""}: ${o.offer_share}% of ${count(o.read, "read post")} (${int(o.offer_posts)})${o.top_offer ? `, most often ${OFFER_LABEL[o.top_offer] ?? o.top_offer} (${count(o.top_offer_posts, "post")})` : ""}.`);
    }
    if (has.has("angles")) {
      out.push("PRODUCTS AND ANGLES (products named in at least two posts, biggest first)");
      for (const p of K.products) out.push(`- ${p.name}${p.client ? " (client)" : ""} · ${p.product}: ${count(p.posts, "post")}, ${count(p.creators, "creator")}, ${compact(p.views)} views (${w.last} ${count(p.posts_prev, "post")}); hook ${p.hook ? `${HOOK_LABEL[p.hook] ?? p.hook}, ${p.hook_views_share}% of its views` : "–"}; top post's angle ${p.angle ? `"${p.angle}"` : "–"}; offer in ${p.offer_share}% of its posts.${p.top ? ` Top post ${p.top.handle ? "@" + p.top.handle : "brand account"}, ${compact(p.top.views)} views.` : ""}`);
    }
  }
  if (has.has("findings")) {
    const fs = r.findings ?? [];
    out.push("", `FINDINGS PINNED FROM CHATS (one slide each; findings[].key must be exactly, in order: ${fs.map((f) => `"${f.key}"`).join(", ")}). Each was asked in Chats and is run again for ${r.week.label}.`);
    for (const f of fs) {
      out.push(`- key="${f.key}" ${f.title}. Asked: "${f.question}".${f.data_window ? ` Data ${f.data_window.from} to ${f.data_window.to}.` : ""} ${f.status === "ok" ? `${int(f.rows_total)} rows; the first:` : `No result: ${f.message ?? f.status}.`}`);
      if (f.status === "ok") {
        out.push(`    ${f.columns.map((c) => c.label).join(" | ")}`);
        for (const row of f.rows.slice(0, 10)) out.push(`    ${f.columns.map((c) => findingCell(row[c.key], c.format)).join(" | ")}`);
      }
    }
  }
  return out;
}

// ------------------------------------------------------------------ model
const SYSTEM = `You write the words of Fair's Weekly Competitor Pulse, a short deck a brand's marketing team reads on Monday morning. The numbers are already computed; you phrase them.

Rules:
- Use only numbers that appear in the fact sheet, written exactly as they appear there (same rounding and unit: "34.5M", "11.2%", "+43%", "2.0 pt"). Never compute a new number: no sums, differences, averages or ratios of your own. When unsure, say it without a number.
- Plain English, short sentences, no filler, no hype. Say what moved, who drove it and what it means for the client.
- Watchlist brands fill the report; the client's own brands appear only in portfolio_note and as the brands an action is for.
- A highlighted move is news; everything else is context. In a quiet week say so plainly and use near misses and the client's own numbers.
- High views at very low engagement read as paid distribution; say "looks paid", never assert it.

Fields and word limits (hard limits; a longer field is rejected):
- summary: exactly three items, labels "New", "Working", "Worth testing" in that order. stat: the one number for the callout (max 9 characters). stat_label: max 6 words. text: max 18 words.
- scoreboard_title: max 12 words, the headline of the week. movers_title: max 12 words.
- drivers: one per mover, in the given order, key exactly as given. title max 10 words; why max 45 words (who and what drove it, from the lens lines); attention_to_action max 28 words (does the attention turn into buying: cart, reach vs engagement).
- actions: one to three things the client should do this week. title max 9 words; detail max 30 words; brands: the client's brand names it applies to, or ["All brands"]; based_on: which move it comes from, e.g. "Timephoria · Instagram views".
- portfolio_note: optional, max 30 words, the client's own notable move.

Call ${TOOL_NAME} exactly once with the whole narrative.`;

/** The extra rules when the report carries the landscape slides (reports from 1 Oct 2026). */
const SYSTEM_LANDSCAPE = `This report also has landscape slides: creator tiers, products, posting pattern, competitor close-ups and patterns. They are where the insight lives: say what each brand actually did and what it means for the client, the way a strategist would brief a brand team.

Fields and limits for the landscape (hard limits):
- tiers, products, posting: { title, takeaway }. title max 12 words: the finding, not the topic ("MOP is the only makeup brand working Macro and Mega creators", not "Creator tiers"). takeaway max 28 words: the one comparison that matters, with its numbers.
- closeups: one per close-up brand, in the given order, key exactly as given. label max 3 words naming the brand's play ("Own-channel reach", "Offer cadence", "Seeding wave"). next max 22 words: what to watch next week, concrete (a date, a product, a creator).
- closeup_titles: one per close-up slide, max 12 words, naming the brands and what they share.
- patterns (only when the fact sheet lists patterns): { title, takeaway }. Say what the pattern is and why it matters to the client.
- actions_title: max 12 words, e.g. "What Paragon does next: four moves, two before 7.7".
- actions (this replaces the one-to-three rule above): three to five, most important first. title max 10 words, an instruction. detail max 48 words: the number that justifies it (from any slide), then exactly what to do, with whom, how much and by when. priority: "High" (do this week), "Medium" (this month) or "Test" (a small pilot). based_on: the slide or move it comes from. Never write "look closely", "monitor" or "check": recommend a move.`;

const EXAMPLE = `Example of the voice (a different week): summary New "11.2%" / "Timephoria's share of Instagram views" / "Timephoria pushed a new skintint stick through mid-tier reviewers; the top two reviews drew 5.2M and 4.7M views." Driver why: "Mid-tier reviewers carried a new skintint stick: 125 creators posted, double last week's 62, and Instagram views rose from 81K to 34.5M. Engagement stayed at 0.2%, so the reach looks paid rather than earned." Action: "Meet the skintint stick where people buy" / "Timephoria's stick lives in Instagram reviews with no cart. A base-product review series on TikTok with cart links meets the same shopper closer to checkout."`;

/** The prompt for a deck (Decks, 2 Oct 2026): the same voice and number rules, with only the fields of the slides it carries. */
export function deckSystem(r: WeeklyReport): string {
  const w = wordsOf(r);
  const has = new Set(deckSlides(r));
  const who = r.client || "the team reading it";
  const next = w.unit === "week" ? "this month" : "this quarter";
  const fields = [
    `- summary: exactly three items, labels "New", "Working", "Worth testing" in that order. stat: the one number for the callout (max 9 characters). stat_label: max 6 words. text: max 18 words.`,
    has.has("scoreboard") ? `- scoreboard_title: max 12 words, the headline of the ${w.unit}.` : "",
    has.has("movers") ? "- movers_title: max 12 words." : "",
    has.has("drivers") ? "- drivers: one per mover, in the given order, key exactly as given. title max 10 words; why max 45 words (who and what drove it, from the lens lines); attention_to_action max 28 words (does the attention turn into buying: cart, reach vs engagement)." : "",
    has.has("trend") ? `- trends: one per trend slide, platform exactly as given, in order. title max 12 words: the finding ("Timephoria's TikTok views tripled in three ${w.unit}s", not "Trend"); takeaway max 28 words: the ${w.over} comparison that matters, with its numbers.` : "",
    has.has("creators") ? "- creators: { title, takeaway } for the top-creators slide: who carried the views, their tiers, how many are first-timers. title max 12 words, takeaway max 28." : "",
    has.has("content") ? "- content: { title, takeaway } for the top-content slide: what the most-viewed posts share (format, product, cart, creator). title max 12 words, takeaway max 28." : "",
    has.has("campaigns") ? `- campaigns: { title, takeaway } for the campaigns slide: name what each brand is running (launches, sale events, collabs) as the fact sheet names it, say which are new ${w.this}, and what it means. title max 12 words, takeaway max 28.` : "",
    has.has("angles") ? "- angles: { title, takeaway } for the products-and-angles slide: which product drew the views and through which hook and angle, quoted as the fact sheet quotes it. title max 12 words, takeaway max 28." : "",
    ...(["tiers", "products", "posting"] as const).filter((k) => has.has(k)).map((k) => `- ${k}: { title, takeaway }. title max 12 words: the finding, not the topic. takeaway max 28 words: the one comparison that matters, with its numbers.`),
    has.has("closeups") ? `- closeups: one per close-up brand, in the given order, key exactly as given. label max 3 words naming the brand's play ("Own-channel reach", "Offer cadence", "Seeding wave"). next max 22 words: what to watch next ${w.unit}, concrete (a date, a product, a creator). closeup_titles: one per close-up slide, max 12 words.` : "",
    has.has("patterns") ? "- patterns: { title, takeaway }: what the pattern is and why it matters. title max 12 words, takeaway max 28." : "",
    has.has("findings") ? `- findings: one per finding pinned from Chats, key exactly as given, in order. title max 12 words: what the analysis shows ${w.this}; takeaway max 28 words, with numbers from its rows.` : "",
    has.has("moves")
      ? `- actions_title: max 12 words. actions: three to five, most important first. title max 10 words, an instruction. detail max 48 words: the number that justifies it (from any slide), then exactly what to do, with whom, how much and by when. priority: "High" (do this ${w.unit}), "Medium" (${next}) or "Test" (a small pilot). brands: ${hasClient(r) ? `the client's brand names it applies to, or ["All brands"]` : `["All brands"]`}. based_on: the slide or move it comes from. Never write "look closely", "monitor" or "check": recommend a move.`
      : "",
    has.has("portfolio") ? "- portfolio_note: optional, max 30 words, the client's own notable move." : "",
  ].filter(Boolean);
  return `You write the words of "${r.title}", a Fair Intelligence deck${r.client ? ` prepared for ${r.client}` : ""} on ${r.week.label} against ${r.previous_week.label}. The numbers are already computed; you phrase them.

Rules:
- Use only numbers that appear in the fact sheet, written exactly as they appear there (same rounding and unit: "34.5M", "11.2%", "+43%", "2.0 pt"). Never compute a new number: no sums, differences, averages or ratios of your own. When unsure, say it without a number.
- Plain English, short sentences, no filler, no hype. Say what moved, who drove it and what it means for ${who}, the way a strategist would brief a brand team.
- The deck compares ${w.this} with ${w.last}: say "${w.this}" and "${w.last}", never another period.
- Watchlist brands fill the deck${r.client ? "; the client's own brands appear only in portfolio_note and as the brands an action is for" : ""}.
- A highlighted move is news; everything else is context. In a quiet ${w.unit} say so plainly.
- High views at very low engagement read as paid distribution; say "looks paid", never assert it.

Fields and word limits (hard limits; a longer field is rejected; write only these fields):
${fields.join("\n")}

Call ${TOOL_NAME} exactly once with the whole narrative.`;
}

const SECTION = { type: "object", properties: { title: { type: "string" }, takeaway: { type: "string" } }, required: ["title", "takeaway"] };
const summaryProp = () => ({
  type: "array", minItems: 3, maxItems: 3,
  items: { type: "object", properties: { label: { type: "string", enum: ["New", "Working", "Worth testing"] }, stat: { type: "string" }, stat_label: { type: "string" }, text: { type: "string" } }, required: ["label", "stat", "stat_label", "text"] },
});
const driversProp = (keys: string[]) => ({
  type: "array", minItems: keys.length, maxItems: keys.length,
  items: { type: "object", properties: { key: keys.length ? { type: "string", enum: keys } : { type: "string" }, title: { type: "string" }, why: { type: "string" }, attention_to_action: { type: "string" } }, required: ["key", "title", "why", "attention_to_action"] },
});

/** A deck's tool: the fields of the slides it carries, nothing else. */
function deckTool(r: WeeklyReport, clientBrands: string[]): Anthropic.Tool {
  const has = new Set(deckSlides(r));
  const props: Record<string, unknown> = { summary: summaryProp() };
  const required = ["summary"];
  const want = (k: string, schema: unknown, need = true) => { props[k] = schema; if (need) required.push(k); };
  if (has.has("scoreboard")) want("scoreboard_title", { type: "string" });
  if (has.has("movers")) want("movers_title", { type: "string" });
  if (has.has("drivers")) want("drivers", driversProp(r.movers.map((m) => m.key)));
  if (has.has("trend")) {
    const pls = trendPlatforms(r);
    want("trends", { type: "array", minItems: pls.length, maxItems: pls.length, items: { type: "object", properties: { platform: { type: "string", enum: pls }, title: { type: "string" }, takeaway: { type: "string" } }, required: ["platform", "title", "takeaway"] } });
  }
  for (const k of ["creators", "content", "campaigns", "angles", "tiers", "products", "posting", "patterns"] as const) if (has.has(k)) want(k, SECTION);
  if (has.has("closeups")) {
    const l = landscapeProps(r, clientBrands);
    want("closeups", l.closeups);
    want("closeup_titles", l.closeup_titles);
  }
  if (has.has("findings")) {
    const keys = (r.findings ?? []).map((f) => f.key);
    want("findings", { type: "array", minItems: keys.length, maxItems: keys.length, items: { type: "object", properties: { key: { type: "string", enum: keys }, title: { type: "string" }, takeaway: { type: "string" } }, required: ["key", "title", "takeaway"] } });
  }
  if (has.has("moves")) {
    const l = landscapeProps(r, clientBrands);
    want("actions_title", l.actions_title);
    want("actions", l.actions);
  }
  if (has.has("portfolio")) want("portfolio_note", { type: "string" }, false);
  return { name: TOOL_NAME, description: "Write the narrative of this deck.", input_schema: { type: "object", properties: props, required } } as Anthropic.Tool;
}

function tool(r: WeeklyReport, clientBrands: string[]): Anthropic.Tool {
  if (isDeck(r)) return deckTool(r, clientBrands);
  const keys = r.movers.map((m) => m.key);
  return {
    name: TOOL_NAME,
    description: "Write the narrative of this week's report.",
    input_schema: {
      type: "object",
      properties: {
        summary: {
          type: "array", minItems: 3, maxItems: 3,
          items: { type: "object", properties: { label: { type: "string", enum: ["New", "Working", "Worth testing"] }, stat: { type: "string" }, stat_label: { type: "string" }, text: { type: "string" } }, required: ["label", "stat", "stat_label", "text"] },
        },
        scoreboard_title: { type: "string" },
        movers_title: { type: "string" },
        drivers: {
          type: "array", minItems: keys.length, maxItems: keys.length,
          items: { type: "object", properties: { key: keys.length ? { type: "string", enum: keys } : { type: "string" }, title: { type: "string" }, why: { type: "string" }, attention_to_action: { type: "string" } }, required: ["key", "title", "why", "attention_to_action"] },
        },
        actions: {
          type: "array", minItems: 1, maxItems: 3,
          items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, brands: { type: "array", items: { type: "string", enum: [...clientBrands, "All brands"] } }, based_on: { type: "string" } }, required: ["title", "detail", "brands", "based_on"] },
        },
        portfolio_note: { type: "string" },
        ...(r.landscape ? landscapeProps(r, clientBrands) : {}),
      },
      required: ["summary", "scoreboard_title", "movers_title", "drivers", "actions", ...(r.landscape ? ["actions_title", "tiers", "products", "posting", "closeups", "closeup_titles", ...(r.landscape.patterns.length ? ["patterns"] : [])] : [])],
    },
  } as Anthropic.Tool;
}

function landscapeProps(r: WeeklyReport, clientBrands: string[]): Record<string, unknown> {
  const section = { type: "object", properties: { title: { type: "string" }, takeaway: { type: "string" } }, required: ["title", "takeaway"] };
  const picks = closeupPicks(r);
  const keys = picks.flat().map((c) => c.key);
  return {
    actions_title: { type: "string" },
    actions: {
      type: "array", minItems: 3, maxItems: 5,
      items: { type: "object", properties: { title: { type: "string" }, detail: { type: "string" }, brands: { type: "array", items: { type: "string", enum: [...clientBrands, "All brands"] } }, based_on: { type: "string" }, priority: { type: "string", enum: PRIORITIES } }, required: ["title", "detail", "brands", "based_on", "priority"] },
    },
    tiers: section,
    products: section,
    posting: section,
    patterns: section,
    closeups: {
      type: "array", minItems: keys.length, maxItems: keys.length,
      items: { type: "object", properties: { key: keys.length ? { type: "string", enum: keys } : { type: "string" }, label: { type: "string" }, next: { type: "string" } }, required: ["key", "label", "next"] },
    },
    closeup_titles: { type: "array", minItems: picks.length, maxItems: picks.length, items: { type: "string" } },
  };
}

function asNarrative(input: unknown, r: WeeklyReport): Narrative {
  const o = (input ?? {}) as Partial<Narrative>;
  const deck = isDeck(r);
  return {
    week: r.week.iso,
    summary: Array.isArray(o.summary) ? o.summary : [],
    scoreboard_title: String(o.scoreboard_title ?? ""),
    movers_title: String(o.movers_title ?? ""),
    drivers: Array.isArray(o.drivers) ? o.drivers : [],
    actions: Array.isArray(o.actions) ? o.actions : [],
    ...(o.portfolio_note ? { portfolio_note: String(o.portfolio_note) } : {}),
    ...(r.landscape || deck
      ? {
          actions_title: String(o.actions_title ?? ""),
          tiers: o.tiers, products: o.products, posting: o.posting,
          closeups: Array.isArray(o.closeups) ? o.closeups : [],
          closeup_titles: Array.isArray(o.closeup_titles) ? o.closeup_titles.map(String) : [],
          ...(o.patterns ? { patterns: o.patterns } : {}),
        }
      : {}),
    ...(deck
      ? {
          ...(Array.isArray(o.trends) ? { trends: o.trends } : {}),
          ...(o.creators ? { creators: o.creators } : {}),
          ...(o.content ? { content: o.content } : {}),
          ...(o.campaigns ? { campaigns: o.campaigns } : {}),
          ...(o.angles ? { angles: o.angles } : {}),
          ...(Array.isArray(o.findings) ? { findings: o.findings } : {}),
        }
      : {}),
  };
}

/** Write this week's narrative: the model when it is configured and its draft passes the check, otherwise the plain narrative. */
export async function writeNarrative(r: WeeklyReport, opts: { create?: Create } = {}): Promise<Written> {
  const clientBrands = r.client_brands.map((g) => g.group.name);
  const create: Create | null = opts.create ?? (hasModelCredentials() ? (p) => anthropicClient().messages.create(p) : null);
  let problems: string[] = [];
  let attempts = 0;
  if (create) {
    const messages: Anthropic.MessageParam[] = [{ role: "user", content: `${EXAMPLE}\n\nFact sheet for ${wordsOf(r).this}:\n\n${factSheet(r)}` }];
    try {
      while (attempts < MAX_ATTEMPTS) {
        attempts++;
        const res = await create({
          model: modelId(),
          max_tokens: r.landscape || isDeck(r) ? 6000 : 3000,
          system: [{ type: "text", text: isDeck(r) ? deckSystem(r) : r.landscape ? `${SYSTEM}\n\n${SYSTEM_LANDSCAPE}` : SYSTEM, cache_control: { type: "ephemeral" } }],
          tools: [tool(r, clientBrands)],
          tool_choice: { type: "auto" },
          messages,
        });
        const use = res.content.find((b): b is Anthropic.ToolUseBlock => b.type === "tool_use" && b.name === TOOL_NAME);
        if (!use) {
          problems = ["no narrative was written (the tool was not called)"];
          messages.push({ role: "assistant", content: res.content.length ? res.content : [{ type: "text", text: "(no answer)" }] });
          messages.push({ role: "user", content: `Call ${TOOL_NAME} with the narrative.` });
          continue;
        }
        const n = asNarrative(use.input, r);
        problems = checkNarrative(n, r);
        if (!problems.length) return { narrative: n, by: "model", attempts, problems: [] };
        messages.push({ role: "assistant", content: res.content });
        messages.push({ role: "user", content: [{ type: "tool_result", tool_use_id: use.id, is_error: true, content: `Rejected. Fix these and call ${TOOL_NAME} again with the whole narrative:\n- ${problems.join("\n- ")}` }] });
      }
    } catch (e) {
      problems = [`model error: ${describeModelError(e)}`];
    }
  }
  return { narrative: plainNarrative(r), by: "fallback", attempts, problems };
}

// ---------------------------------------------------------- plain narrative
const SHORT: Record<string, string> = { posts: "share of posts", views: "share of views", er: "engagement rate" };
/** a value as the deck prints it, or null when the deck would print "<0.1%" (not a number the check can match) */
const printed = (s: string) => (s.startsWith("<") ? null : s);

/**
 * The narrative when the model is unavailable or keeps failing the check: plain
 * sentences from the facts, printed as the deck prints them, within every limit.
 */
export function plainNarrative(r: WeeklyReport): Narrative {
  const w = wordsOf(r);
  const who = r.client || "the team";
  const movers = r.movers.slice(0, 3);
  const labels = ["New", "Working", "Worth testing"] as const;
  const summary: Narrative["summary"] = movers.map((m, i) => {
    const f = m.flag;
    const now = printed(flagValue(f.unit, f.metric, f.value));
    const before = printed(flagValue(f.unit, f.metric, f.previous));
    return {
      label: labels[i],
      stat: now ?? (f.direction === "up" ? "Up" : "Down"),
      stat_label: `${m.name} ${PLATFORM_NAME[m.platform]} ${SHORT[f.metric]}`.split(/\s+/).slice(0, 6).join(" "),
      text: `${f.direction === "up" ? "Up" : "Down"}${before ? ` from ${before} ${w.last}` : ` against ${w.last}`}, outside its own ${w.span(r.rules.lookback_weeks)} range.`,
    };
  });
  if (!movers.length) summary.push({ label: labels[0], stat: "Quiet", stat_label: `watchlist ${w.this}`, text: "No watchlist brand moved outside its own normal range." });
  for (const pl of r.platforms) {
    if (summary.length >= 3) break;
    const p = r.panel[pl];
    if (!p || !p.prev.posts) continue;
    summary.push({ label: labels[summary.length], stat: change(p.now.posts, p.prev.posts), stat_label: `${PLATFORM_NAME[pl]} panel posts vs ${w.last}`, text: `Every brand's posts on ${PLATFORM_NAME[pl]} are judged against this whole-panel move.` });
  }
  while (summary.length < 3) summary.push({ label: labels[summary.length], stat: "Quiet", stat_label: `watchlist ${w.this}`, text: "No watchlist brand moved outside its own normal range." });

  const names = movers.map((m) => m.name);
  const scoreboard_title = movers.length ? `${names.join(", ").split(/\s+/).slice(0, 8).join(" ")} moved beyond normal` : `A quiet ${w.unit} on the watchlist`;
  const count = ["No brand", "One brand", "Two brands", "Three brands"][movers.length] ?? "Several brands";
  const movers_title = movers.length ? `${count} moved outside ${movers.length === 1 ? "its" : "their"} normal range` : "Nothing moved beyond normal; here is what came closest";

  const drivers: Narrative["drivers"] = r.movers.map((m) => {
    const top = m.what.top_posts[0];
    const why = [
      `${int(m.who.creators)} creators posted for ${m.name} on ${PLATFORM_NAME[m.platform]}, against ${int(m.who.creators_prev)} ${w.last}.`,
      top ? `The top post, by ${top.creator_handle ? "@" + top.creator_handle : "a brand account"}, drew ${compact(top.views)} views.` : "",
    ].filter(Boolean).join(" ");
    return {
      key: m.key,
      title: `${m.name}: ${SHORT[m.flag.metric]} ${m.flag.direction} on ${PLATFORM_NAME[m.platform]}`.split(/\s+/).slice(0, 10).join(" "),
      why,
      attention_to_action: `Read the lens lines and the posts behind them before reacting: one ${w.unit} outside the normal range is a signal to watch, not yet a trend.`,
    };
  });

  const actions: Narrative["actions"] = movers.length
    ? movers.map((m) => ({
        title: `Look closely at ${m.name} on ${PLATFORM_NAME[m.platform]}`.split(/\s+/).slice(0, 9).join(" "),
        detail: `Its ${SHORT[m.flag.metric]} moved outside its own normal range. Check the posts behind it and decide whether ${who} should answer.`,
        brands: ["All brands"],
        based_on: `${m.name} · ${PLATFORM_NAME[m.platform]} ${SHORT[m.flag.metric]}`,
      }))
    : [{ title: `Use the quiet ${w.unit} to test a brief`, detail: `No watchlist brand moved beyond normal. A quiet ${w.unit} is a good moment to test a new creator brief without a competitor push in the way.`, brands: ["All brands"], based_on: "Scoreboard · no highlighted moves" }];

  const n: Narrative = { week: r.week.iso, summary, scoreboard_title, movers_title, drivers, actions };
  if (r.landscape) plainLandscape(r, n);
  if (isDeck(r)) plainDeck(r, n);
  // belt and braces: anything the check still objects to loses its number
  for (const p of checkNarrative(n, r)) {
    const m = /^summary\[(\d)\]\.(stat|text|stat_label)/.exec(p);
    if (m) {
      const s = n.summary[Number(m[1])];
      if (m[2] === "stat") s.stat = "—";
      else if (m[2] === "text") s.text = "See the scoreboard for this move.";
      else s.stat_label = w.this;
    }
    const d = /^drivers\.([^.]+)\.why/.exec(p);
    if (d) { const x = n.drivers.find((y) => y.key === d[1]); if (x) x.why = "See the lens lines and posts on this slide."; }
    const t = /^(trends\[(\d+)\]|creators|content|campaigns|angles|tiers|products|posting|patterns|findings\.([^.]+))\.takeaway/.exec(p);
    if (t) {
      const sec = t[2] != null ? n.trends?.[Number(t[2])] : t[3] != null ? n.findings?.find((f) => f.key === t[3]) : n[t[1] as "creators" | "content" | "campaigns" | "angles" | "tiers" | "products" | "posting" | "patterns"];
      if (sec) sec.takeaway = "The numbers are on the slide.";
    }
  }
  return n;
}

/** The deck slides' words without a model: a plain title and one takeaway each, and prioritised moves when the deck has no landscape to draw them from. */
function plainDeck(r: WeeklyReport, n: Narrative) {
  const w = wordsOf(r);
  const has = new Set(deckSlides(r));
  if (has.has("trend")) {
    n.trends = trendPlatforms(r).map((pl) => {
      const top = trendRows(r, pl).find((g) => g.group.kind !== "client");
      const c = top?.cells[pl];
      return {
        platform: pl,
        title: `${PLATFORM_NAME[pl]} views, ${w.unit} on ${w.unit}`,
        takeaway: top && c?.now && c.prev ? `${top.group.name} drew the most ${PLATFORM_NAME[pl]} views ${w.this}: ${compact(c.now.views)}, ${change(c.now.views, c.prev.views)} against ${w.last}.` : `Views per ${w.unit} for each brand.`,
      };
    });
  }
  const c0 = r.creators?.[0];
  if (has.has("creators")) n.creators = { title: `The creators who brought the most views ${w.this}`, takeaway: c0 ? `@${c0.handle} led with ${compact(c0.views)} views for ${c0.brands[0]}${c0.first_time ? ", posting for these brands for the first time" : ""}.` : "No creator posts in the period." };
  const p0 = r.content?.[0];
  if (has.has("content")) n.content = { title: `The posts that drew the most views ${w.this}`, takeaway: p0 ? `The top post, by ${p0.creator_handle ? "@" + p0.creator_handle : "a brand account"} for ${p0.group}, drew ${compact(p0.views)} views.` : "No posts in the period." };
  const e0 = r.captions?.events[0];
  if (has.has("campaigns")) n.campaigns = { title: `What the brands are running ${w.this}`, takeaway: e0 ? `${e0.name}'s ${e0.event_name} led: ${count(e0.posts, "post")}, ${compact(e0.views)} views${e0.new ? `, new ${w.this}` : ""}.` : "No campaign named in the captions read." };
  const pr0 = r.captions?.products[0];
  if (has.has("angles")) n.angles = { title: `The products and angles that drew the views ${w.this}`, takeaway: pr0 ? `${pr0.name}'s ${pr0.product} drew ${compact(pr0.views)} views across ${count(pr0.posts, "post")}${pr0.angle ? `; the top post's angle: "${pr0.angle}"` : ""}.` : "No product named in two or more captions." };
  if (has.has("findings")) n.findings = (r.findings ?? []).map((f) => ({ key: f.key, title: f.title, takeaway: f.status === "ok" ? `The analysis from Chats, run again for ${r.week.label}.` : f.message ?? "No result for this period." }));
  if (has.has("moves") && !r.landscape) {
    n.actions_title = r.client ? `What ${r.client} should do next` : "What to do next";
    const acts: Narrative["actions"] = n.actions.map((a, i) => ({ ...a, priority: i === 0 && r.movers.length ? "High" : "Medium" }));
    if (c0 && acts.length < 5) acts.push({ title: `Brief creators like @${c0.handle}`, detail: `@${c0.handle} brought ${compact(c0.views)} views for ${c0.brands[0]} ${w.this}. Shortlist creators of the same tier and format for the next brief.`, brands: ["All brands"], based_on: "Top creators", priority: "Test" });
    while (acts.length < 3) acts.push({ title: "Test one new creator brief", detail: `Compare its first ${w.unit} against the numbers in this deck before scaling it.`, brands: ["All brands"], based_on: "Scoreboard", priority: "Test" });
    n.actions = acts.slice(0, 5);
  }
}

/** The landscape words without a model: titles, one plain takeaway each, close-up labels, and three to five moves. */
function plainLandscape(r: WeeklyReport, n: Narrative) {
  const L = r.landscape!;
  const client = L.tiers.rows.find((t) => t.client);
  const big = [...L.tiers.overall].sort((a, b) => b.content_share - a.content_share)[0];
  n.tiers = {
    title: "Creator tiers: where each brand puts its content",
    takeaway: [client?.top ? `${r.client}'s ${TIER_NAME[client.top.tier]} creators brought ${client.top.views_share}% of its creator views.` : "", big ? `Across these brands ${TIER_NAME[big.tier]} is ${big.content_share}% of posts and ${big.views_share}% of views.` : ""].filter(Boolean).join(" "),
  };
  const lead = [...L.products].filter((p) => !p.client && p.categories.length).sort((a, b) => b.categories[0].views - a.categories[0].views)[0];
  n.products = {
    title: "What each brand's creators put in front of the camera",
    takeaway: lead ? `${lead.name}'s ${lead.categories[0].label.toLowerCase()} posts drew the most views on the watchlist: ${int(lead.categories[0].posts)} posts, ${compact(lead.categories[0].views)} views.` : `Most captions name no product category ${wordsOf(r).this}.`,
  };
  const w = L.posting.window;
  n.posting = {
    title: "Posting pattern: when the watchlist posts",
    takeaway: w ? `${w.share}% of ${wordsOf(r).this}'s posts went up in one stretch of the day; peaks by brand are in the table.` : `Posting was spread across the ${wordsOf(r).unit}.`,
  };
  const picks = closeupPicks(r);
  n.closeups = picks.flat().map((c) => ({
    key: c.key,
    label: c.owned && c.owned.views_share >= 50 ? "Own-channel reach" : c.repeat_share != null && c.repeat_share >= 30 ? "Repeat creators" : c.promo_share >= 15 ? "Offer cadence" : "Creator-led",
    next: `Watch whether next ${wordsOf(r).unit}'s posts keep the same mix.`,
  }));
  n.closeup_titles = picks.map((pair) => `${pair.map((c) => c.name).join(" and ")}: a closer look`);
  const p0 = L.patterns[0];
  if (p0) n.patterns = { title: `Patterns worth knowing ${wordsOf(r).this}`, takeaway: `${PATTERN_NAME[p0.kind]} on ${p0.name}: ${int(p0.accounts)} accounts, ${int(p0.posts)} posts, ${compact(p0.views)} views.` };
  n.actions_title = r.client ? `What ${r.client} should do next` : "What to do next";
  const acts: Narrative["actions"] = n.actions.map((a, i) => ({ ...a, priority: i === 0 && r.movers.length ? "High" : "Medium" }));
  if (p0 && acts.length < 5) acts.push({ title: `Look into ${p0.name}'s ${PATTERN_NAME[p0.kind].toLowerCase()}`.split(/\s+/).slice(0, 10).join(" "), detail: `${int(p0.accounts)} accounts brought ${compact(p0.views)} views for ${p0.name} ${wordsOf(r).this}. Decide whether ${r.client || "the team"} should run the same play.`, brands: ["All brands"], based_on: `Patterns · ${p0.name}`, priority: "Test" });
  if (client?.top && acts.length < 5) acts.push({ title: `Review ${r.client}'s creator tier mix`, detail: `${TIER_NAME[client.top.tier]} creators brought ${client.top.views_share}% of ${r.client}'s creator views. Check the tier slide before the next brief.`, brands: ["All brands"], based_on: "Creator tiers", priority: "Medium" });
  while (acts.length < 3) acts.push({ title: `Use the quiet ${wordsOf(r).unit} to test a brief`, detail: "No competitor push is in the way. Test one new creator brief and compare it against this week's numbers.", brands: ["All brands"], based_on: "Scoreboard", priority: "Test" });
  n.actions = acts.slice(0, 5);
}

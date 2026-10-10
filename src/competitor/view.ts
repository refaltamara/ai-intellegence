/**
 * How the weekly report's numbers are shown, in one place: the deck, the
 * dashboard and the narrative check all format through here, so a number in
 * the text can always be traced to the same number on the slide.
 */
import { TIER_BANDS } from "../config/thresholds";
import type { CloseUp, Landscape, Pattern, PatternKind, PostingBrand, ProductRow } from "./landscape";
import { EVENT_NAME, HOOK_NAME, OFFER_NAME } from "../captions/prompt";
import { periodWords, type Grain } from "./period";
import type { Cell, Mover, Platform, WeekPoint, WeeklyReport } from "./types";

/** "TikTok and X"; "Instagram, Threads, TikTok and X" */
export const listAnd = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");

export const PLATFORM_NAME: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram", threads: "Threads", x: "X", youtube: "YouTube" };
export const METRIC_NAME = { posts: "posts", views: "views", er: "engagement rate" } as const;
export const TIER_NAME: Record<string, string> = { nano: "Nano", micro: "Micro", mid: "Mid-tier", macro: "Macro", mega: "Mega", unknown: "Unknown tier" };
const FORMAT_NAME: Record<string, string> = {
  product_showcase: "product showcase", review: "review", tutorial: "tutorial", tips_educational: "tips & education", grwm: "GRWM",
  pov_storytelling: "POV storytelling", before_after: "before/after", trend_challenge: "trend challenge", comparison: "comparison",
};
export const formatName = (f: string) => FORMAT_NAME[f] ?? f.replace(/_/g, " ");

export function int(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

/** 34,468,258 → "34.5M"; 185,300,000 → "185M"; 81,300 → "81K" */
export function compact(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "–";
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e8) return `${Math.round(n / 1e6)}M`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `${Math.round(n / 1e3)}K`;
  return String(Math.round(n));
}

/** a share or a rate in % */
export function pct(v: number | null | undefined, dp = 1): string {
  if (v == null || !Number.isFinite(v)) return "–";
  if (v === 0) return "0%";
  if (v > 0 && v < 0.05 && dp === 1) return "<0.1%";
  return `${v.toFixed(dp)}%`;
}

const minus = (s: string) => s.replace("-", "−");

/** relative change of a count: "+142%", "−40%", "×426" past +999%, "new" from zero */
export function change(now: number, prev: number): string {
  if (prev === 0) return now === 0 ? "–" : "new";
  const r = (now / prev - 1) * 100;
  if (r >= 1000) return `×${Math.round(now / prev)}`;
  const v = Math.round(r);
  return v > 0 ? `+${v}%` : v === 0 ? "0%" : minus(`${v}%`);
}

/** a difference in points: "+1.3 pt", "−0.4 pt" */
export function pts(now: number | null, prev: number | null, dp = 1): string {
  if (now == null || prev == null) return "–";
  const d = Number((now - prev).toFixed(dp));
  return d > 0 ? `+${d.toFixed(dp)} pt` : d === 0 ? `0 pt` : minus(`${d.toFixed(dp)} pt`);
}

export function dayMonth(iso: string): string {
  const d = new Date(iso.slice(0, 10) + "T00:00:00Z");
  return `${d.getUTCDate()} ${["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][d.getUTCMonth()]}`;
}

/** "cushion-foundation-glad2glow-coverage-tinggi-glow" → "Cushion foundation glad2glow coverage tinggi…" */
export function productName(slug: string): string {
  const words = slug.replace(/[-_]+/g, " ").trim().split(/\s+/);
  const s = words.slice(0, 4).join(" ") + (words.length > 4 ? "…" : "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** The value a flag judged, as shown: shares and rates in %, counts plain. */
export function flagValue(unit: "share" | "count" | "er", metric: "posts" | "views" | "er", v: number): string {
  if (unit === "count") return metric === "views" ? compact(v) : int(v);
  return pct(v, 1);
}

export function metricLabel(metric: "posts" | "views" | "er", unit: "share" | "count" | "er", platform: Platform): string {
  if (metric === "er") return `Engagement rate on ${PLATFORM_NAME[platform]}`;
  if (unit === "share") return `Share of all ${PLATFORM_NAME[platform]} ${metric} in the panel`;
  return `${PLATFORM_NAME[platform]} ${metric}`;
}

/** Segments of text with emphasis, so the deck can style "(last week)" values as muted. */
export type Seg = { t: string; muted?: boolean; strong?: boolean };

/** Caption tags as slides print them (src/captions/prompt.ts holds the classes). */
export const EVENT_LABEL: Record<string, string> = EVENT_NAME;
export const OFFER_LABEL: Record<string, string> = OFFER_NAME;
export const HOOK_LABEL: Record<string, string> = HOOK_NAME;

/** The report's period words, for the slides and the fact sheet. */
export const wordsOf = (r: Pick<WeeklyReport, "grain">) => periodWords(r.grain);

export function lensLines(m: Mover, p: { lookback: number; grain?: Grain } = { lookback: 8 }): { label: string; segs: Seg[]; warn?: boolean }[] {
  const lines: { label: string; segs: Seg[]; warn?: boolean }[] = [];
  const pl = PLATFORM_NAME[m.platform];
  const w = periodWords(p.grain);

  // Who
  const movedTier = [...m.who.tier_mix].filter((t) => t.tier !== "unknown").sort((a, b) => Math.abs(b.share - b.share_prev) - Math.abs(a.share - a.share_prev))[0];
  const who: Seg[] = [{ t: `${int(m.who.creators)} creators`, strong: true }, { t: ` (${int(m.who.creators_prev)})`, muted: true }];
  if (m.who.new_creator_share != null) who.push({ t: ` · ${m.who.new_creator_share}% first-time in ${p.lookback} ${w.unit}s` }, { t: m.who.new_creator_share_prev != null ? ` (${m.who.new_creator_share_prev}%)` : "", muted: true });
  if (movedTier) who.push({ t: ` · ${TIER_NAME[movedTier.tier]} ${pct(movedTier.share, 0)} of creator posts` }, { t: ` (${pct(movedTier.share_prev, 0)})`, muted: true });
  lines.push({ label: "Who", segs: who });

  // What
  const top = m.what.top_posts[0];
  const what: Seg[] = top
    ? [{ t: `Top post ${top.creator_handle ? "@" + top.creator_handle : "(brand account)"}`, strong: true }, { t: `, ${compact(top.views)} views` }, { t: m.what.top_post_view_share != null ? ` (${m.what.top_post_view_share}% of views)` : "", muted: true }]
    : [{ t: `No posts ${w.this}` }];
  // the format whose share moved most, when that move is worth a mention; otherwise the leading format
  const movedFormat = [...m.what.formats].sort((a, b) => Math.abs(b.share - b.share_prev) - Math.abs(a.share - a.share_prev))[0];
  const leadFormat = [...m.what.formats].sort((a, b) => b.share - a.share)[0];
  const format = movedFormat && Math.abs(movedFormat.share - movedFormat.share_prev) >= 3 ? movedFormat : leadFormat && leadFormat.share > 0 ? leadFormat : null;
  if (format) what.push({ t: ` · ${formatName(format.format)} ${format.share}% of posts` }, { t: ` (${format.share_prev}%)`, muted: true });
  lines.push({ label: "What", segs: what });

  // Campaign
  const tags = m.campaign.tags.slice(0, 2);
  lines.push({
    label: "Campaign",
    segs: tags.length
      ? tags.flatMap((t, i) => [
          { t: `${i ? " · " : ""}#${t.tag}`, strong: true },
          { t: ` ${t.creators} creators` },
          ...(t.brand_share != null && t.brand_share >= 60 ? [{ t: `, ${Math.round(t.brand_share)}% of the tag is ${m.name}`, muted: true }] : []),
        ])
      : [{ t: "No hashtag beyond generic and brand-name tags reached 3 creators", muted: true }],
  });

  // Owned vs earned
  lines.push({
    label: "Owned vs earned",
    segs: m.owned
      ? [{ t: `Brand accounts ${pct(m.owned.posts.now, 0)} of posts`, strong: true }, { t: ` (${pct(m.owned.posts.prev, 0)})`, muted: true }, { t: ` · ${pct(m.owned.views.now, 0)} of views` }, { t: ` (${pct(m.owned.views.prev, 0)})`, muted: true }]
      : [{ t: `Brand-account posts are not collected on ${pl} yet`, muted: true }],
  });

  // Action
  const product = m.action?.products[0];
  lines.push({
    label: "Action",
    segs: m.action
      ? [
          { t: `Yellow cart on ${pct(m.action.cart_share.now, 0)} of posts`, strong: true },
          { t: ` (${pct(m.action.cart_share.prev, 0)})`, muted: true },
          ...(product ? [{ t: ` · top cart product: ${productName(product.name)}` }] : []),
        ]
      : [{ t: `No shopping signal on ${pl} (cart is TikTok only)`, muted: true }],
  });

  if (m.distribution.boosted) lines.push({ label: "Distribution", warn: true, segs: [{ t: `${compact(m.distribution.views)} views at ${pct(m.distribution.er)} engagement`, strong: true }, { t: ": the pattern of paid distribution, not organic reach" }] });
  return lines;
}

/** Every number the deck can show, by kind, for the narrative check. */
export function displayedNumbers(r: WeeklyReport): { percent: number[]; points: number[]; views: number[]; counts: number[]; ratios: number[] } {
  const percent: number[] = [];
  const points: number[] = [];
  const views: number[] = [];
  const counts: number[] = [];
  const ratios: number[] = [];
  const point = (p: WeekPoint | null) => {
    if (!p) return;
    counts.push(p.posts, p.creators, p.owned_posts, p.posts_rated, p.cart_posts);
    views.push(p.views, p.owned_views, p.views_rated, p.engagements);
    for (const v of [p.er, p.posts_share, p.views_share]) if (v != null) percent.push(v);
  };
  const pair = (now: number, prev: number, into: "counts" | "views") => {
    if (prev > 0) {
      const r = (now / prev - 1) * 100;
      percent.push(Math.abs(r));
      ratios.push(now / prev);
    }
    (into === "counts" ? counts : views).push(Math.abs(now - prev));
  };
  const cell = (c: Cell | undefined) => {
    if (!c) return;
    point(c.now);
    point(c.prev);
    c.history.forEach(point);
    if (c.now && c.prev) {
      pair(c.now.posts, c.prev.posts, "counts");
      pair(c.now.views, c.prev.views, "views");
      pair(c.now.creators, c.prev.creators, "counts");
      for (const [a, b] of [[c.now.er, c.prev.er], [c.now.posts_share, c.prev.posts_share], [c.now.views_share, c.prev.views_share]] as const) {
        if (a != null && b != null) {
          points.push(Math.abs(a - b));
          if (b > 0) percent.push(Math.abs((a / b - 1) * 100));
          if (b > 0) ratios.push(a / b);
        }
      }
    }
    for (const f of c.flags) {
      percent.push(Math.abs(f.change), f.value, f.previous, f.mean, f.low, f.high);
      points.push(Math.abs(f.change));
    }
  };
  for (const g of [...r.watchlist, r.portfolio, ...r.client_brands]) for (const pl of r.platforms) cell(g.cells[pl]);
  for (const pl of r.platforms) {
    const p = r.panel[pl];
    if (!p) continue;
    counts.push(p.now.posts, p.prev.posts);
    views.push(p.now.views, p.prev.views);
    if (p.posts_change_pct != null) percent.push(Math.abs(p.posts_change_pct));
    if (p.views_change_pct != null) percent.push(Math.abs(p.views_change_pct));
    if (p.prev.posts > 0) ratios.push(p.now.posts / p.prev.posts);
    counts.push(p.now.so_far ?? 0, p.prev.so_far ?? 0);
  }
  // views at day 7: the age, and the posts counted so far, as the data notes give them
  counts.push(7, r.platforms.reduce((a, pl) => a + (r.panel[pl]?.now.so_far ?? 0), 0), r.platforms.reduce((a, pl) => a + (r.panel[pl]?.now.posts ?? 0), 0));
  for (const m of r.movers) {
    counts.push(m.who.creators, m.who.creators_prev, m.who.new_creators);
    for (const v of [m.who.new_creator_share, m.who.new_creator_share_prev, m.what.top_post_view_share]) if (v != null) percent.push(v);
    for (const t of m.who.tier_mix) { counts.push(t.posts); percent.push(t.share, t.share_prev); points.push(Math.abs(t.share - t.share_prev)); }
    for (const c of m.who.top_creators) { counts.push(c.posts); views.push(c.views); if (c.followers != null) views.push(c.followers); }
    for (const f of m.what.formats) { counts.push(f.posts); percent.push(f.share, f.share_prev); points.push(Math.abs(f.share - f.share_prev)); }
    for (const t of m.campaign.tags) { counts.push(t.creators, t.posts); views.push(t.views); if (t.brand_share != null) percent.push(t.brand_share); }
    if (m.owned) for (const s of [m.owned.posts, m.owned.views]) { for (const v of [s.now, s.prev]) if (v != null) percent.push(v); if (s.now != null && s.prev != null) points.push(Math.abs(s.now - s.prev)); }
    if (m.action) {
      for (const v of [m.action.cart_share.now, m.action.cart_share.prev]) if (v != null) percent.push(v);
      if (m.action.cart_share.now != null && m.action.cart_share.prev != null) points.push(Math.abs(m.action.cart_share.now - m.action.cart_share.prev));
      for (const p of m.action.products) { counts.push(p.posts); views.push(p.views); }
    }
    if (m.distribution.er != null) percent.push(m.distribution.er);
    views.push(m.distribution.views);
  }
  for (const e of r.evidence) {
    if (e.views != null) views.push(e.views);
    if (e.er != null) percent.push(e.er);
    if (e.followers != null) views.push(e.followers);
  }
  const rules = r.rules;
  counts.push(rules.lookback_weeks, rules.z, rules.min_posts, rules.min_history_weeks, rules.max_movers, r.watchlist.length, r.client_brands.length);
  percent.push(rules.min_change_pct, rules.boosted_er_pct, rules.panel_swing_pct);
  points.push(rules.min_er_change_pts);
  views.push(rules.min_views, rules.boosted_min_views);
  for (const n of r.near_misses) {
    if (n.value != null) percent.push(n.value);
    if (n.previous != null) percent.push(n.previous);
  }
  if (r.landscape) landscapeNumbers(r.landscape, { percent, points, views, counts, ratios });
  // deck slides (2 Oct 2026): top creators, and the rows of findings pinned from Chats
  for (const c of r.creators ?? []) {
    counts.push(c.posts);
    views.push(c.views);
    if (c.followers != null) views.push(c.followers);
    if (c.er != null) percent.push(c.er);
    if (c.top_post?.views != null) views.push(c.top_post.views);
  }
  // the creators slide's own counts and its low-engagement line (1.0M views)
  if (r.creators) { counts.push(r.creators.filter((c) => c.first_time).length); views.push(1_000_000); }
  // campaigns, products and offers read from captions
  if (r.captions) {
    const K = r.captions;
    counts.push(K.coverage.posts, K.coverage.read);
    views.push(K.coverage.views, K.coverage.read_views, K.floor);
    percent.push(K.coverage.read_views_share);
    for (const e of K.events) { counts.push(e.posts, e.creators, e.owned_posts, e.posts_prev); views.push(e.views); if (e.top) views.push(e.top.views); }
    counts.push(K.events.filter((e) => e.new).length, K.events.length);
    for (const p of K.products) { counts.push(p.posts, p.creators, p.posts_prev); views.push(p.views); percent.push(p.hook_views_share, p.offer_share); if (p.top) views.push(p.top.views); }
    for (const o of K.offers) { counts.push(o.read, o.offer_posts, o.top_offer_posts); percent.push(o.offer_share); }
  }
  for (const f of r.findings ?? []) {
    counts.push(f.rows_total);
    for (const row of f.rows) for (const v of Object.values(row)) if (typeof v === "number" && Number.isFinite(v)) { counts.push(v); views.push(v); percent.push(v); }
  }
  return { percent, points, views, counts, ratios };
}

// ------------------------------------------------------------- landscape
/** "Nano under 10K", "Micro 10K–50K", … from the tier bands in src/config. */
export function tierLegend(): { tier: string; label: string }[] {
  return TIER_BANDS.map((b) => ({
    tier: b.tier,
    label: `${TIER_NAME[b.tier]} ${b.min <= 1 ? `under ${compact(b.max! + 1)}` : b.max == null ? `${compact(b.min - 1)}+` : `${compact(b.min - 1)}–${compact(b.max)}`}`,
  }));
}

export const PATTERN_NAME: Record<PatternKind, string> = {
  clipper: "Clippers",
  carry: "One creator carries the brand",
  affiliate: "Affiliate bursts",
  templated: "Templated captions",
  seeding: "Seeding tag",
};
/** What each pattern is and how the report spots it: shown next to the numbers. */
export const PATTERN_HOW: Record<PatternKind, string> = {
  clipper: "Accounts that cut short clips from longer creator content and repost them with the brand tagged, usually paid on views. Spotted by a handle built around \u201cclip\u201d or a clipping-community tag.",
  carry: "One creator brings a large share of the brand's views in the week. Spotted when one creator holds 40% or more of a brand's views on at least 1.0M views.",
  affiliate: "A creator posting for the same brand five times or more in one week, usually an affiliate or a paid retainer.",
  templated: "Three or more creators posting the same caption (mentions and hashtags aside): a brief handed out word for word.",
  seeding: "A hashtag used by five or more creators where 90% or more of the tag's posts are about this brand: a seeding wave run under one tag.",
};

/** How a pattern is spotted, in the report's period ("in one week", "in one month"). */
export const patternHow = (k: PatternKind, grain?: Grain) => (grain === "month" ? PATTERN_HOW[k].replace(/\bweek\b/g, "month") : PATTERN_HOW[k]);

/** The brands that get a close-up: watched brands that are not this week's movers, biggest first, two per slide; one slide on a busy week, two on a quiet one. A deck's close-ups take its biggest brands, up to two slides. */
export function closeupPicks(r: WeeklyReport): CloseUp[][] {
  const L = r.landscape;
  if (!L) return [];
  // a deck picked the close-ups itself: its biggest watched brands, movers included (a deep-dive's one brand is often the mover)
  const movers = new Set(r.slides ? [] : r.movers.map((m) => m.key));
  const pool = L.closeups.filter((c) => !c.client && !movers.has(c.key) && c.posts >= 30).sort((a, b) => b.views - a.views);
  const slides = r.slides ? 2 : r.movers.length >= 2 ? 1 : 2;
  const out: CloseUp[][] = [];
  for (let i = 0; i < slides && i * 2 < pool.length; i++) out.push(pool.slice(i * 2, i * 2 + 2));
  return out;
}

/** The deterministic rows of a close-up: what the brand pushed, its own channel, its creators, its offers. */
export function closeupLines(c: CloseUp, posting?: PostingBrand, thisPeriod = "this week"): { label: string; text: string; muted?: boolean }[] {
  const lines: { label: string; text: string; muted?: boolean }[] = [];
  const cats = c.categories.map((x) => `${x.label} ${int(x.posts)} posts, ${compact(x.views)} views`).join("; ");
  if (c.lexicon !== false) lines.push({ label: "Pushing", text: [cats || "No category named in most captions", c.cart ? `Cart: ${productName(c.cart.name)} (${int(c.cart.posts)} ${c.cart.posts === 1 ? "post" : "posts"}, ${compact(c.cart.views)} views)` : null].filter(Boolean).join(". ") + "." });
  if (c.owned) {
    // TikTok in the beauty panel; every platform in listening workspaces
    const on = (c.owned.platforms ?? ["tiktok"]).map((p) => PLATFORM_NAME[p] ?? p);
    const where = on.length === 1 ? `${on[0]} ` : "";
    lines.push(c.owned.posts
      ? { label: "Own channel", text: `${int(c.owned.posts)} ${where}posts from brand accounts brought ${compact(c.owned.views)} views, ${c.owned.views_share}% of the brand's ${where}views${c.owned.median_views != null ? `, at a ${compact(c.owned.median_views)} median` : ""}.` }
      : { label: "Own channel", text: `No brand-account posts${on.length === 1 ? ` on ${on[0]}` : ""} ${thisPeriod}.`, muted: true });
  } else lines.push({ label: "Own channel", text: "Brand-account posts are not collected on these platforms.", muted: true });
  const t = c.top_creator;
  lines.push({
    label: "Creators",
    text: [`${int(c.creators)} creators`, c.repeat_share != null ? `${c.repeat_share}% of creator posts from accounts posting 3+ times` : null, t ? `top: @${t.handle}, ${int(t.posts)} ${t.posts === 1 ? "post" : "posts"}, ${t.views_share}% of the brand's views` : null].filter(Boolean).join("; ") + ".",
  });
  const offers = [`Promo language in ${c.promo_share}% of posts`, posting?.double_date_posts ? `${int(posting.double_date_posts)} double-date ${posting.double_date_posts === 1 ? "caption" : "captions"} (${posting.double_dates.join(", ")})` : null, posting?.payday_posts ? `${int(posting.payday_posts)} payday ${posting.payday_posts === 1 ? "caption" : "captions"}` : null].filter(Boolean).join("; ");
  lines.push({ label: "Offers", text: offers + "." });
  return lines;
}

/** "Lip 288 · 1.4M" for the product table. */
export function categoryCell(p: ProductRow): string {
  return p.categories.map((c) => `${c.label} ${int(c.posts)} · ${compact(c.views)}`).join("  |  ");
}

/** What sits behind a brand's posting peak, in words with numbers. */
export function postingBehind(b: PostingBrand): string {
  const parts = [
    b.double_date_posts ? `${int(b.double_date_posts)} double-date ${b.double_date_posts === 1 ? "caption" : "captions"} (${b.double_dates.join(", ")})` : null,
    b.payday_posts ? `${int(b.payday_posts)} payday ${b.payday_posts === 1 ? "caption" : "captions"}` : null,
    `promo language in ${b.promo_share}% of posts`,
  ].filter(Boolean) as string[];
  const s = parts.join("; ");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function hourLabel(h: number): string {
  return `${String(h % 24).padStart(2, "0")}:00`;
}

export function patternSignal(p: Pattern): string {
  if (p.kind === "seeding") return `#${p.label}`;
  if (p.kind === "carry" || p.kind === "affiliate") return p.label ? `@${p.label}` : "";
  if (p.kind === "templated") return `\u201c${(p.label ?? "").slice(0, 60)}${(p.label ?? "").length > 60 ? "…" : ""}\u201d`;
  if (p.kind === "clipper" && p.median_views != null) return `median ${compact(p.median_views)} a clip vs ${compact(p.median_other ?? 0)} other posts`;
  return "";
}

function landscapeNumbers(L: Landscape, pool: { percent: number[]; points: number[]; views: number[]; counts: number[]; ratios: number[] }) {
  const { percent, views, counts } = pool;
  for (const t of L.tiers.rows) {
    counts.push(t.posts);
    views.push(t.views);
    for (const x of t.tiers) { counts.push(x.posts); views.push(x.views); percent.push(x.content_share, x.views_share); }
    if (t.top) { counts.push(t.top.posts); views.push(t.top.views); percent.push(t.top.views_share); }
  }
  for (const b of L.tiers.benchmark) { counts.push(b.posts); if (b.median_views != null) views.push(b.median_views); }
  for (const o of L.tiers.overall) percent.push(o.content_share, o.views_share);
  for (const p of L.products) {
    counts.push(p.posts);
    percent.push(p.unnamed_share, 100 - p.unnamed_share);
    for (const c of p.categories) { counts.push(c.posts); views.push(c.views); }
    for (const c of p.cart) { counts.push(c.posts); views.push(c.views); }
  }
  const P = L.posting;
  for (const d of P.days) { counts.push(d.posts, d.promo_posts); views.push(d.views); }
  for (const h of P.hours) { counts.push(h.posts); if (h.median_views != null) views.push(h.median_views); }
  counts.push(P.posts, P.promo_posts);
  if (P.window) percent.push(P.window.share);
  if (P.hour_median_range) views.push(P.hour_median_range.low, P.hour_median_range.high);
  const cur = P.days.filter((d) => d.current).reduce((s, d) => s + d.posts, 0);
  const prev = P.days.filter((d) => !d.current).reduce((s, d) => s + d.posts, 0);
  counts.push(cur, prev);
  if (prev > 0) percent.push(Math.abs((cur / prev - 1) * 100));
  for (const b of P.brands) { counts.push(b.posts, b.peak_posts, b.promo_posts, b.double_date_posts, b.payday_posts); percent.push(b.peak_posts_share, b.peak_views_share, b.promo_share); }
  for (const c of L.closeups) {
    counts.push(c.posts, c.creators, c.tiktok_posts, c.instagram_posts);
    views.push(c.views, c.likes, c.comments);
    if (c.er != null) percent.push(c.er);
    for (const x of c.categories) { counts.push(x.posts); views.push(x.views); }
    if (c.cart) { counts.push(c.cart.posts); views.push(c.cart.views); }
    if (c.owned) { counts.push(c.owned.posts); views.push(c.owned.views); percent.push(c.owned.views_share); if (c.owned.median_views != null) views.push(c.owned.median_views); }
    if (c.repeat_share != null) percent.push(c.repeat_share);
    if (c.top_creator) { counts.push(c.top_creator.posts); views.push(c.top_creator.views); percent.push(c.top_creator.views_share); }
    percent.push(c.promo_share);
    if (c.top_post) views.push(c.top_post.views);
  }
  for (const p of L.patterns) {
    counts.push(p.posts, p.accounts);
    views.push(p.views);
    percent.push(p.views_share);
    if (p.median_views != null) views.push(p.median_views);
    if (p.median_other != null) views.push(p.median_other);
    for (const e of p.examples) views.push(e.views);
  }
  // the repeat-poster and pattern thresholds the slides print
  counts.push(3, 5);
  percent.push(40, 90);
}

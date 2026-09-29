/**
 * How the weekly report's numbers are shown, in one place: the deck, the
 * dashboard and the narrative check all format through here, so a number in
 * the text can always be traced to the same number on the slide.
 */
import type { Cell, Mover, Platform, WeekPoint, WeeklyReport } from "./types";

export const PLATFORM_NAME: Record<Platform, string> = { tiktok: "TikTok", instagram: "Instagram" };
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

export function lensLines(m: Mover): { label: string; segs: Seg[]; warn?: boolean }[] {
  const lines: { label: string; segs: Seg[]; warn?: boolean }[] = [];
  const pl = PLATFORM_NAME[m.platform];

  // Who
  const movedTier = [...m.who.tier_mix].filter((t) => t.tier !== "unknown").sort((a, b) => Math.abs(b.share - b.share_prev) - Math.abs(a.share - a.share_prev))[0];
  const who: Seg[] = [{ t: `${int(m.who.creators)} creators`, strong: true }, { t: ` (${int(m.who.creators_prev)})`, muted: true }];
  if (m.who.new_creator_share != null) who.push({ t: ` · ${m.who.new_creator_share}% first-time in 8 weeks` }, { t: m.who.new_creator_share_prev != null ? ` (${m.who.new_creator_share_prev}%)` : "", muted: true });
  if (movedTier) who.push({ t: ` · ${TIER_NAME[movedTier.tier]} ${pct(movedTier.share, 0)} of creator posts` }, { t: ` (${pct(movedTier.share_prev, 0)})`, muted: true });
  lines.push({ label: "Who", segs: who });

  // What
  const top = m.what.top_posts[0];
  const what: Seg[] = top
    ? [{ t: `Top post ${top.creator_handle ? "@" + top.creator_handle : "(brand account)"}`, strong: true }, { t: `, ${compact(top.views)} views` }, { t: m.what.top_post_view_share != null ? ` (${m.what.top_post_view_share}% of views)` : "", muted: true }]
    : [{ t: "No posts this week" }];
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
  }
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
  return { percent, points, views, counts, ratios };
}

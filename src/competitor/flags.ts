/**
 * Which weekly moves get highlighted. Pure, so the rule is testable and the same
 * everywhere it runs (the deck, the dashboard, the agent). A move counts only
 * when it is unusual for this brand (outside its own lookback range and at least
 * `z` standard deviations from its average), large against last week, and big
 * enough to matter.
 */
import type { WeeklyRules } from "../config/weekly";
import type { Flag, Metric, WeekPoint } from "./types";

const Z_CAP = 99;

function judged(p: WeekPoint, metric: Metric, basis: WeeklyRules["basis"]): number | null {
  if (metric === "er") return p.er;
  if (basis === "share") return metric === "posts" ? p.posts_share : p.views_share;
  return metric === "posts" ? p.posts : p.views;
}

export function mean(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

/** sample standard deviation */
export function sd(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / (xs.length - 1));
}

/** Why a move did not make the report, for the "closest to the line" list on quiet weeks. */
export type Miss = "thin history" | "below size floor" | "within normal range" | "inside 8-week range" | "change too small";

export type Evaluation = { metric: Metric; z: number | null; value: number | null; previous: number | null; flag: Flag | null; miss: Miss | null };

export function evaluate(metric: Metric, history: WeekPoint[], now: WeekPoint, rules: WeeklyRules): Evaluation {
  const out = (z: number | null, value: number | null, previous: number | null, miss: Miss | null, flag: Flag | null = null): Evaluation => ({ metric, z, value, previous, flag, miss });
  const prevPoint = history[history.length - 1];
  const value = judged(now, metric, rules.basis);
  const previous = prevPoint ? judged(prevPoint, metric, rules.basis) : null;
  // Weeks without a single post say nothing about a rate; for shares and counts a
  // zero week is real but needs the brand to have a history at all.
  const active = history.filter((h) => h.posts > 0);
  const base = (metric === "er" ? history.filter((h) => h.posts_rated > 0) : history)
    .map((h) => judged(h, metric, rules.basis))
    .filter((v): v is number => v != null && Number.isFinite(v));
  if (!prevPoint || active.length < rules.min_history_weeks || base.length < rules.min_history_weeks || value == null || previous == null) return out(null, value, previous, "thin history");

  const m = mean(base);
  const s = sd(base);
  const low = Math.min(...base);
  const high = Math.max(...base);
  const z = s > 0 ? (value - m) / s : value === m ? 0 : Math.sign(value - m) * Z_CAP;
  const zc = Math.max(-Z_CAP, Math.min(Z_CAP, z));

  // big enough to matter
  if (metric === "posts" && Math.max(now.posts, prevPoint.posts) < rules.min_posts) return out(zc, value, previous, "below size floor");
  if (metric === "views" && Math.max(now.views, prevPoint.views) < rules.min_views) return out(zc, value, previous, "below size floor");
  if (metric === "er" && (now.posts_rated < rules.min_posts || now.views_rated < rules.min_views)) return out(zc, value, previous, "below size floor");

  if (Math.abs(z) < rules.z) return out(zc, value, previous, "within normal range");
  if (value <= high && value >= low) return out(zc, value, previous, "inside 8-week range");

  // Last week is part of the range, so a value outside it has already moved away
  // from last week in the anomaly's direction; what is left is whether the move is large.
  const delta = value - previous;
  const change = metric === "er" ? delta : previous > 0 ? (delta / previous) * 100 : Infinity;
  if (metric === "er" ? Math.abs(change) < rules.min_er_change_pts : Math.abs(change) < rules.min_change_pct) return out(zc, value, previous, "change too small");

  return out(zc, value, previous, null, {
    metric,
    direction: z > 0 ? "up" : "down",
    z: zc,
    value,
    previous,
    mean: m,
    low,
    high,
    change: Number.isFinite(change) ? change : 999,
    unit: metric === "er" ? "er" : rules.basis,
  });
}

export function assess(metric: Metric, history: WeekPoint[], now: WeekPoint, rules: WeeklyRules): Flag | null {
  return evaluate(metric, history, now, rules).flag;
}

export function assessAll(history: WeekPoint[], now: WeekPoint, rules: WeeklyRules): Flag[] {
  return (["posts", "views", "er"] as Metric[]).map((m) => assess(m, history, now, rules)).filter((f): f is Flag => f != null);
}

/** A group is covered on a platform when it has posts in at least half of the weeks the report looks at. */
export function covered(history: WeekPoint[], now: WeekPoint | null): boolean {
  const weeks = [...history, ...(now ? [now] : [])];
  const withPosts = weeks.filter((w) => w.posts > 0).length;
  return weeks.length > 0 && withPosts >= Math.ceil(weeks.length / 2);
}

/**
 * A team's own Dashboard panel (Refal, 16 Oct 2026): a Builder asks for it on the Dashboard ("TikTok affiliate
 * performance, week on week") and CeMO drafts it as one query over the whitelisted builder plus a chart from a
 * fixed set. The panel follows the Dashboard's filters (period, platform, brands) unless its own query fixes them,
 * and its numbers are counted in SQL every time the Dashboard opens. CeMO only names the query and the chart.
 * No data access, but it reads the query builder's lists: client components take the chart names from ./charts.ts.
 */
import { COMMENT_GROUP_BY, COMMENT_METRICS, ENTITIES, GROUP_BY, METRICS, type QueryMetricsInput } from "../query/builder";
import { isExtDim } from "../extensions/spec";

/** the charts a panel may be, all drawn in the product's own style (src/dashboard/charts.ts, safe for client components) */
import { CHARTS, type Chart } from "./charts";
export { CHARTS, CHART_LABEL, type Chart } from "./charts";

export type PanelSpan = { n: number; unit: "day" | "week" | "month" };

export type PanelSpec = {
  /** a-z, 0-9 and dashes; the panel's id on the Dashboard is "p:<key>" */
  key: string;
  title: string;
  /** one line: what it shows, as the person asked */
  description: string;
  chart: Chart;
  width: "full" | "half";
  /** the query without dates: the Dashboard's period (or the span below) sets them */
  query: QueryMetricsInput;
  /** a panel over time shows this many days, weeks or months up to the Dashboard's last day; without it, the Dashboard's own period */
  span?: PanelSpan;
};

export const panelId = (key: string) => `p:${key}`;
export const isPanelId = (id: string) => /^p:[a-z0-9][a-z0-9-]{2,60}$/.test(id);

const KEY = /^[a-z0-9][a-z0-9-]{2,60}$/;
const TIME = ["day", "week", "month"];

/** Everything wrong with a panel, in words CeMO (or a person) can fix; empty when it is fine. */
export function validatePanel(p: Partial<PanelSpec>): string[] {
  const errors: string[] = [];
  if (!p.key || !KEY.test(p.key)) errors.push("key: 3 to 61 characters, lowercase letters, digits and dashes.");
  if (!p.title?.trim() || p.title.length > 60) errors.push("title: up to 60 characters.");
  if (!p.description?.trim() || p.description.length > 240) errors.push("description: one line, up to 240 characters.");
  if (!CHARTS.includes(p.chart as Chart)) errors.push(`chart: one of ${CHARTS.join(", ")}.`);
  if (p.width !== "full" && p.width !== "half") errors.push("width: full or half.");
  if (p.span && (!["day", "week", "month"].includes(p.span.unit) || !Number.isInteger(p.span.n) || p.span.n < 2 || p.span.n > (p.span.unit === "day" ? 120 : p.span.unit === "week" ? 52 : 24))) errors.push("span: 2 to 120 days, 52 weeks or 24 months.");
  const q = p.query;
  if (!q || !ENTITIES.includes(q.entity)) {
    errors.push(`query.entity: one of ${ENTITIES.join(", ")}.`);
    return errors;
  }
  const comments = q.entity === "comments";
  const dims: readonly string[] = comments ? COMMENT_GROUP_BY : GROUP_BY;
  const mets: readonly string[] = comments ? COMMENT_METRICS : METRICS;
  if (!Array.isArray(q.metrics) || !q.metrics.length || q.metrics.length > 4 || !q.metrics.every((m) => mets.includes(m))) errors.push(`query.metrics: one to four of ${mets.join(", ")}.`);
  const groups = q.group_by ?? [];
  if (!groups.every((g) => dims.includes(g) || isExtDim(g))) errors.push(`query.group_by: any of ${dims.join(", ")}, or one of the team's extensions (ext_<key>).`);
  if (groups.length > 2) errors.push("query.group_by: at most two.");
  if (q.limit != null && (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > 200)) errors.push("query.limit: 1 to 200.");
  if (q.filters && ("date_from" in q.filters || "date_to" in q.filters)) errors.push("query.filters: leave dates out; the Dashboard's period sets them.");
  const overTime = groups.some((g) => TIME.includes(g));
  if (q.change && !overTime) errors.push("query.change: only for a panel over time (group by day, week or month).");
  if ((p.chart === "line" || p.chart === "stacked") && !overTime) errors.push(`chart ${p.chart}: needs a day, week or month in group_by.`);
  if (p.chart === "stacked" && groups.length !== 2) errors.push("chart stacked: group by the time and one more (sentiment, platform, brand…).");
  if (p.chart === "number" && groups.length) errors.push("chart number: no group_by (one figure).");
  if (p.chart === "share" && (groups.length !== 1 || overTime)) errors.push("chart share: group by one thing that divides a whole (sentiment, platform, tier…), not time.");
  return errors;
}

/** The window a panel reads: its span back from the Dashboard's last day, else the Dashboard's own period. Pure. */
export function panelWindow(p: Pick<PanelSpec, "span">, scope: { from: string; to: string }): { from: string; to: string } {
  if (!p.span) return { from: scope.from, to: scope.to };
  const to = new Date(`${scope.to}T00:00:00Z`);
  const from = new Date(to);
  if (p.span.unit === "day") from.setUTCDate(from.getUTCDate() - (p.span.n - 1));
  else if (p.span.unit === "week") {
    // whole weeks: back to the Monday n - 1 weeks before the last day's week
    const monday = (to.getUTCDay() + 6) % 7;
    from.setUTCDate(from.getUTCDate() - monday - 7 * (p.span.n - 1));
  } else from.setUTCMonth(from.getUTCMonth() - (p.span.n - 1), 1);
  return { from: from.toISOString().slice(0, 10), to: scope.to };
}

/** The Dashboard's filters a panel takes: a dimension its own query fixes stays fixed. Pure. */
export function panelFilters(p: Pick<PanelSpec, "query" | "span">, scope: { from: string; to: string; platform: string; brands: string[] }): Record<string, unknown> {
  const own = { ...(p.query.filters ?? {}) } as Record<string, unknown>;
  const w = panelWindow(p, scope);
  const out: Record<string, unknown> = { ...own, date_from: w.from, date_to: w.to };
  if (own.platform == null && scope.platform && scope.platform !== "all") out.platform = [scope.platform];
  if (own.brand_id == null && scope.brands.length) out.brand_id = scope.brands;
  return out;
}

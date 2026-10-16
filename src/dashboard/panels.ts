/**
 * The team's own Dashboard panels (Refal, 16 Oct 2026; the spec is src/dashboard/panelSpec.ts): stored as the
 * team's creations (kind "panel"), live once a Builder adds them, and run every time the Dashboard opens over the
 * Dashboard's own filters. Numbers are counted in SQL by the query builder; the rows come back with brand names
 * instead of ids and a label and a format for each column, nothing else is worked out here.
 */
import { sql } from "../db/client";
import { queryMetrics } from "../query/builder";
import type { ViewsDef } from "../definitions/catalog";
import type { RoleId } from "../roles/model";
import { panelFilters, panelId, panelWindow, validatePanel, type PanelSpec } from "./panelSpec";

export type PanelColumn = { key: string; label: string; format: "text" | "int" | "compact" | "pct" | "num" | "change_pct" | "change_pts" };

/** A panel as the Dashboard draws it: its spec, and its rows for the Dashboard's filters. */
export type PanelData = {
  id: string;
  spec: PanelSpec;
  status: "ok" | "empty" | "error";
  message?: string;
  columns: PanelColumn[];
  rows: Record<string, unknown>[];
  window: { from: string; to: string };
  /** over time by week or month, when the window ends before that week or month does: its last point is "so far" */
  partial?: boolean;
};

/** Does the window end inside a week (Monday to Sunday) or a month, so the panel's last week or month is not whole? Pure. */
export function endsPartway(grain: string | undefined, to: string): boolean {
  const d = new Date(`${to}T00:00:00Z`);
  if (grain === "week") return d.getUTCDay() !== 0;
  if (grain === "month") return new Date(d.getTime() + 86_400_000).getUTCDate() !== 1;
  return false;
}

/** The Dashboard's filters, the same for every panel on it: its period, its platform and its brands (none = all). */
export type PanelScope = { from: string; to: string; platform: string; brands: string[] };

const NAMES: Record<string, string> = {
  brand_id: "Brand", platform: "Platform", source: "Own or earned", tier: "Creator tier", day: "Day", week: "Week of", month: "Month",
  creator_id: "Creator", content_format: "Format", product_category: "Product", universe: "Universe", topic: "Topic", sentiment: "Sentiment",
  stance: "Stance", voice: "Voice", caption_product: "Product (captions)", caption_event: "Event", caption_event_name: "Event name",
  caption_offer: "Offer", caption_hook: "Hook", count_posts: "Posts", count_creators: "Creators", sum_views: "Views (day 7)",
  sum_views_latest: "Views (latest)", median_views: "Median views", avg_views: "Average views", sum_engagements: "Engagements",
  sum_comments: "Comments on posts", er_pct: "Engagement rate", comment_rate_pct: "Comment rate", cart_pct: "With a cart",
  share_of_voice: "Share of voice", share_of_views: "Share of views", count_comments: "Comments", count_commenters: "Commenters",
  negative_pct: "Negative", positive_pct: "Positive", net_sentiment: "Net sentiment", purchase_intent_pct: "Purchase intent", sum_likes: "Likes",
};

const nameOf = (k: string): string =>
  k.endsWith("_change_pct") ? `${nameOf(k.slice(0, -11))}: change`
    : k.endsWith("_change_pts") ? `${nameOf(k.slice(0, -11))}: change`
      : NAMES[k] ?? (k.startsWith("ext_") ? k.slice(4).replace(/_/g, " ") : k.replace(/_/g, " ")).replace(/^./, (c) => c.toUpperCase());

function formatOf(k: string, v: unknown): PanelColumn["format"] {
  if (k.endsWith("_change_pct")) return "change_pct";
  if (k.endsWith("_change_pts")) return "change_pts";
  if (typeof v !== "number") return "text";
  if (k.endsWith("_pct") || k.startsWith("share_of")) return "pct";
  if (/views|engagements|likes/.test(k)) return "compact";
  return k === "net_sentiment" ? "num" : "int";
}

/** The columns in the query's own order: the groups, then each measure and its change. */
export function panelColumns(spec: PanelSpec, rows: Record<string, unknown>[]): PanelColumn[] {
  const groups = spec.query.group_by ?? [];
  const keys = [...groups, ...spec.query.metrics.flatMap((m) => [m, `${m}_change_pct`, `${m}_change_pts`])].filter((k) => rows.some((r) => k in r));
  const sample = (k: string) => rows.map((r) => r[k]).find((v) => v != null);
  return keys.map((k) => ({ key: k, label: nameOf(k), format: formatOf(k, sample(k) ?? (groups.includes(k) ? "" : 0)) }));
}

/** The team's live panels, newest last. */
export async function teamPanels(ws: string, role: RoleId): Promise<PanelSpec[]> {
  const rows = (await sql.query("select spec from creations where workspace_id = $1 and role = $2 and kind = 'panel' and status = 'approved' order by created_at", [ws, role])) as { spec: PanelSpec }[];
  return rows.map((r) => r.spec).filter((s) => !validatePanel(s).length);
}

/** One panel over the Dashboard's filters. `views`: the reading the role counts views from (ROLE_VIEWS). */
export async function runPanel(spec: PanelSpec, ws: string, scope: PanelScope, opts: { views?: ViewsDef; brandNames?: Map<string, string> } = {}): Promise<PanelData> {
  const window = panelWindow(spec, scope);
  const grain = (spec.query.group_by ?? []).find((g) => g === "week" || g === "month");
  const base = { id: panelId(spec.key), spec, window, ...(endsPartway(grain, window.to) ? { partial: true } : {}) };
  const r = await queryMetrics({ ...spec.query, filters: panelFilters(spec, scope) }, ws, { views: opts.views });
  if (r.status === "error") return { ...base, status: "error", message: r.message ?? "The panel did not run.", columns: [], rows: [] };
  const names = opts.brandNames ?? (await brandNames(ws));
  const rows = r.rows.map(({ evidence_ids: _e, ...row }) => (typeof row.brand_id === "string" ? { ...row, brand_id: names.get(row.brand_id) ?? row.brand_id } : row));
  if (!rows.length) return { ...base, status: "empty", message: `Nothing matched between ${window.from} and ${window.to}.`, columns: [], rows: [] };
  return { ...base, status: "ok", columns: panelColumns(spec, rows), rows };
}

export async function brandNames(ws: string): Promise<Map<string, string>> {
  const r = (await sql.query("select id, name from brands where workspace_id = $1", [ws])) as { id: string; name: string }[];
  return new Map(r.map((b) => [b.id, b.name]));
}

/** Every live panel of the team, side by side (independent queries run together; DECISIONS, 8 Oct 2026). */
export async function runTeamPanels(ws: string, role: RoleId, scope: PanelScope, views?: ViewsDef, given?: PanelSpec[]): Promise<PanelData[]> {
  const specs = given ?? (await teamPanels(ws, role).catch(() => []));
  if (!specs.length) return [];
  const names = await brandNames(ws);
  return Promise.all(specs.map((s) => runPanel(s, ws, scope, { views, brandNames: names }).catch((e) => ({ id: panelId(s.key), spec: s, window: panelWindow(s, scope), status: "error" as const, message: (e as Error).message, columns: [], rows: [] }))));
}

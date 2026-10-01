/**
 * query_metrics: a whitelisted aggregate query builder (PRD §5.2, CLAUDE.md rule 3).
 * Every entity, filter, dimension and metric is enumerated here; anything else is rejected.
 * The model never supplies SQL.
 */
import { SkillDb } from "../skills/db";
import { loadContext, resolveBrands, type Context } from "../skills/params";
import { aggregateEvidence, EvidenceList } from "../skills/common";
import type { Evidence, Row } from "../skills/types";

export const ENTITIES = ["posts", "creators", "brand_weeks", "creator_brand_months"] as const;
export const GROUP_BY = ["brand_id", "platform", "source", "tier", "week", "month", "creator_id", "content_format", "product_category", "universe", "caption_product", "caption_event", "caption_event_name", "caption_offer", "caption_hook"] as const;
/** Read from captions by the model (src/captions/): posts not read yet group as "not read". */
const CAPTION_DIMS = new Set(["caption_product", "caption_event", "caption_event_name", "caption_offer", "caption_hook"]);
const capDim = (col: string, none: string) => `case when p.cap_source = 'model' then coalesce(nullif(${col}, 'none'), '${none}') else 'not read' end`;
const list = (v: unknown) => (Array.isArray(v) ? v : [v]).map((s) => String(s).toLowerCase());
export const METRICS = ["count_posts", "count_creators", "sum_views", "median_views", "avg_views", "sum_engagements", "sum_comments", "er_pct", "comment_rate_pct", "cart_pct", "share_of_voice"] as const;

/** filter name -> SQL fragment builder (over alias p = posts) */
export const FILTERS: Record<string, (v: unknown, add: (val: unknown) => string, ctx: Context) => string | null> = {
  brand_id: (v, add, ctx) => {
    const ids = resolveBrands(Array.isArray(v) ? v : [v], ctx);
    return ids ? `p.brand_id = any(${add(ids)}::text[])` : null;
  },
  platform: (v, add) => `p.platform = any(${add(Array.isArray(v) ? v : [v])}::text[])`,
  source: (v, add) => `p.source = ${add(String(v))}`,
  tier: (v, add) => `p.tier = any(${add(Array.isArray(v) ? v : [v])}::text[])`,
  has_cart: (v) => (v ? "p.has_cart" : "p.has_cart is not true"),
  content_format: (v, add) => `p.content_format = any(${add(Array.isArray(v) ? v : [v])}::text[])`,
  product_category: (v, add) => `p.product_category = any(${add((Array.isArray(v) ? v : [v]).map((s) => String(s).toLowerCase()))}::text[])`,
  universe: (v, add) => `p.universe = ${add(String(v))}`,
  creator_handle: (v, add) => `p.creator_handle = any(${add((Array.isArray(v) ? v : [v]).map((s) => String(s).replace(/^@/, "")))}::text[])`,
  date_from: (v, add, ctx) => `p.posted_at >= (${add(String(v))}::date::timestamp at time zone ${add(ctx.tz)})`,
  date_to: (v, add, ctx) => `p.posted_at < ((${add(String(v))}::date + 1)::timestamp at time zone ${add(ctx.tz)})`,
  min_views: (v, add) => `p.views >= ${add(Number(v))}`,
  min_followers: (v, add) => `p.followers_at_post >= ${add(Number(v))}`,
  earned_only: (v) => (v ? "p.creator_id is not null and p.source = 'earned'" : null),
  // read from captions (src/captions/prompt.ts names the classes)
  caption_event: (v, add) => `p.cap_event = any(${add(list(v))}::text[])`,
  caption_offer: (v, add) => `p.cap_offer = any(${add(list(v))}::text[])`,
  caption_hook: (v, add) => `p.cap_hook = any(${add(list(v))}::text[])`,
  caption_product: (v, add) => `lower(p.cap_product) like any(${add(list(v).map((s) => `%${s.replace(/[%_]/g, "")}%`))}::text[])`,
  captions_read: (v) => (v ? "p.cap_source = 'model'" : null),
};

const DIM_SQL: Record<(typeof GROUP_BY)[number], (ctx: Context) => string> = {
  brand_id: () => "p.brand_id",
  platform: () => "p.platform",
  source: () => "p.source",
  tier: () => "coalesce(p.tier, 'unknown')",
  week: (ctx) => `to_char((date_trunc('week', p.posted_at at time zone '${ctx.tz}'))::date, 'YYYY-MM-DD')`,
  month: () => "to_char(p.month, 'YYYY-MM')",
  creator_id: () => "p.creator_handle",
  content_format: () => "coalesce(p.content_format, 'unknown')",
  product_category: () => "coalesce(p.product_category, 'unknown')",
  universe: () => "coalesce(p.universe, 'unknown')",
  caption_product: () => capDim("p.cap_product", "none named"),
  caption_event: () => capDim("p.cap_event", "none"),
  caption_event_name: () => capDim("p.cap_event_name", "none"),
  caption_offer: () => capDim("p.cap_offer", "none"),
  caption_hook: () => capDim("p.cap_hook", "other"),
};

const METRIC_SQL: Record<(typeof METRICS)[number], string> = {
  count_posts: "count(*)::int",
  count_creators: "count(distinct p.creator_id)::int",
  sum_views: "sum(p.views)::float8",
  median_views: "percentile_cont(0.5) within group (order by p.views)::float8",
  avg_views: "round(avg(p.views)::numeric, 1)::float8",
  sum_engagements: "sum(p.engagements)::float8",
  sum_comments: "sum(p.comments_count)::float8",
  er_pct: "case when sum(p.views) > 0 then round((sum(p.engagements)::numeric / sum(p.views) * 100), 4)::float8 end",
  comment_rate_pct: "case when sum(p.views) > 0 then round((sum(p.comments_count)::numeric / sum(p.views) * 100), 4)::float8 end",
  cart_pct: "case when count(*) filter (where p.platform = 'tiktok') > 0 then round((count(*) filter (where p.has_cart))::numeric / count(*) filter (where p.platform = 'tiktok') * 100, 2)::float8 end",
  share_of_voice: "round(count(*)::numeric / sum(count(*)) over () * 100, 2)::float8",
};

export type QueryMetricsInput = {
  entity: (typeof ENTITIES)[number];
  filters?: Record<string, unknown>;
  group_by?: string[];
  metrics: string[];
  order_by?: string;
  limit?: number;
};

export type QueryMetricsResult = {
  status: "ok" | "error";
  message?: string;
  rows: Row[];
  evidence: Evidence[];
  meta: { entity: string; filters: Record<string, unknown>; group_by: string[]; metrics: string[]; matched: number; returned: number; sql_hash: string; duration_ms: number; caveats: string[] };
};

export async function queryMetrics(input: QueryMetricsInput, workspaceId: string): Promise<QueryMetricsResult> {
  const started = Date.now();
  const db = new SkillDb();
  const fail = (message: string): QueryMetricsResult => ({ status: "error", message, rows: [], evidence: [], meta: { entity: input.entity, filters: input.filters ?? {}, group_by: input.group_by ?? [], metrics: input.metrics ?? [], matched: 0, returned: 0, sql_hash: db.sqlHash(), duration_ms: Date.now() - started, caveats: [] } });
  try {
    if (!ENTITIES.includes(input.entity)) return fail(`Unknown entity '${input.entity}'. Use one of ${ENTITIES.join(", ")}.`);
    const groupBy = (input.group_by ?? []) as (typeof GROUP_BY)[number][];
    for (const g of groupBy) if (!GROUP_BY.includes(g)) return fail(`Unknown group_by '${g}'. Use one of ${GROUP_BY.join(", ")}.`);
    const metrics = (input.metrics ?? []) as (typeof METRICS)[number][];
    if (!metrics.length) return fail("At least one metric is required.");
    for (const m of metrics) if (!METRICS.includes(m)) return fail(`Unknown metric '${m}'. Use one of ${METRICS.join(", ")}.`);
    const ctx = await loadContext(db, workspaceId);
    const params: unknown[] = [];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    const where: string[] = [`p.workspace_id = ${add(ctx.workspaceId)}`];
    const filters = { ...(input.filters ?? {}) } as Record<string, unknown>;
    // entity presets
    if (input.entity === "creators" || input.entity === "creator_brand_months") filters.earned_only = true;
    if (input.entity === "brand_weeks" && !groupBy.includes("week")) groupBy.push("week");
    if (input.entity === "creator_brand_months") {
      if (!groupBy.includes("creator_id")) groupBy.push("creator_id");
      if (!groupBy.includes("month")) groupBy.push("month");
    }
    if (input.entity === "creators" && !groupBy.includes("creator_id")) groupBy.push("creator_id");
    if (!filters.date_from && !filters.date_to) {
      // default: last 90 days of data
      const to = ctx.asOf;
      const d = new Date(to + "T00:00:00Z");
      d.setUTCDate(d.getUTCDate() - 89);
      filters.date_from = d.toISOString().slice(0, 10);
      filters.date_to = to;
    }
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null) continue;
      const f = FILTERS[k];
      if (!f) return fail(`Unknown filter '${k}'. Use one of ${Object.keys(FILTERS).join(", ")}.`);
      const clause = f(v, add, ctx);
      if (clause) where.push(clause);
    }
    const dims = groupBy.map((g) => `${DIM_SQL[g](ctx)} as ${g}`);
    const mets = metrics.map((m) => `${METRIC_SQL[m]} as ${m}`);
    const orderRaw = (input.order_by ?? metrics[0]).trim();
    const [orderCol, orderDir] = orderRaw.split(/\s+/);
    if (![...metrics, ...groupBy].includes(orderCol as any)) return fail(`order_by must be one of the selected metrics or group_by dimensions, got '${orderCol}'.`);
    const dir = (orderDir ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
    const limit = Math.max(1, Math.min(200, Number(input.limit ?? 50) || 50));
    const sql = `select ${[...dims, ...mets].join(", ")}, count(*) over() as matched
      from posts p where ${where.join(" and ")}
      ${groupBy.length ? `group by ${groupBy.map((_, i) => i + 1).join(", ")}` : ""}
      order by ${orderCol} ${dir} nulls last limit ${add(limit)}`;
    const rows = await db.q<Row>(sql, params);
    const matched = rows.length ? Number(rows[0].matched) : 0;
    const ev = new EvidenceList(60);
    for (const r of rows) {
      delete r.matched;
      const label = groupBy.length ? groupBy.map((g) => `${g}=${r[g]}`).join(" · ") : `all ${input.entity}`;
      const id = ev.push((eid) => aggregateEvidence(eid, `${input.entity} where ${JSON.stringify(filters)} group ${label}`, label, Object.fromEntries(metrics.map((m) => [m, r[m] as number]))));
      r.evidence_ids = id ? [id] : [];
    }
    return {
      status: "ok",
      rows,
      evidence: ev.list,
      meta: { entity: input.entity, filters, group_by: groupBy, metrics, matched, returned: rows.length, sql_hash: db.sqlHash(), duration_ms: Date.now() - started, caveats: [
        "Aggregates over posts; owned-account posts are included unless earned_only or source=earned is set.",
        ...(groupBy.some((g) => CAPTION_DIMS.has(g)) || Object.keys(filters).some((f) => f.startsWith("caption")) ? ["Products, campaigns, offers and hooks are read from captions by the model, for posts with 10K+ views and brand-account posts; other posts show as \"not read\"."] : []),
      ] },
    };
  } catch (e) {
    return fail((e as Error).message);
  }
}

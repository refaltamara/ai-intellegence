/**
 * query_metrics: a whitelisted aggregate query builder (PRD §5.2, CLAUDE.md rule 3).
 * Every entity, filter, dimension and metric is enumerated here; anything else is rejected.
 * The model never supplies SQL.
 */
import { SkillDb } from "../skills/db";
import { loadContext, resolveBrands, type Context } from "../skills/params";
import { aggregateEvidence, EvidenceList } from "../skills/common";
import type { Evidence, Row } from "../skills/types";
import { liveDefs } from "../extensions/store";
import { NONE, NOT_TAGGED, isExtDim, keyOf, matchValue, type ExtDef } from "../extensions/spec";

/**
 * A client's extensions (src/extensions/) as dimensions and filters named ext_<key>: only
 * live definitions of this workspace, joined by id. A row not read yet groups as "not
 * tagged"; read with no value fitting, as "none".
 */
async function extJoins(ws: string, entity: "posts" | "comments", groupBy: string[], filters: Record<string, unknown>, add: (v: unknown) => string): Promise<{ error?: string; joins: string[]; dims: Map<string, string>; where: string[]; caveats: string[] }> {
  const used = [...new Set([...groupBy.filter(isExtDim), ...Object.keys(filters).filter(isExtDim)])];
  const out = { joins: [] as string[], dims: new Map<string, string>(), where: [] as string[], caveats: [] as string[] };
  if (!used.length) return out;
  const defs = await liveDefs(ws);
  for (const [i, name] of used.entries()) {
    const def = defs.find((d) => d.key === keyOf(name));
    if (!def) return { ...out, error: `'${name}' is not one of this workspace's extensions${defs.length ? ` (${defs.map((d) => `ext_${d.key}`).join(", ")})` : ""}.` };
    const ref = refOf(def, entity);
    if (!ref) return { ...out, error: `'${name}' describes ${def.target}s, which the ${entity} query cannot reach.` };
    const a = `e${i}`;
    out.joins.push(`left join ext_values ${a} on ${a}.def_id = ${add(def.id)}::uuid and ${a}.row_ref = ${ref}`);
    out.dims.set(name, `case when ${a}.row_ref is null then '${NOT_TAGGED}' else coalesce(${a}.value, '${NONE}') end`);
    const f = filters[name];
    if (f != null) {
      const want = (Array.isArray(f) ? f : [f]).map(String);
      const named = want.map((w) => matchValue(def.values, w)).filter((x): x is string => !!x);
      const none = want.some((w) => w.toLowerCase() === NONE);
      if (!named.length && !none) return { ...out, error: `'${name}' takes ${def.values.map((v) => v.name).join(", ")} or none.` };
      out.where.push(`(${[...(named.length ? [`${a}.value = any(${add(named)}::text[])`] : []), ...(none ? [`(${a}.row_ref is not null and ${a}.value is null)`] : [])].join(" or ")})`);
    }
    const p = def.progress;
    out.caveats.push(`${def.name} is the team's own data (${def.source === "cemo" ? "read by CeMO" : def.source === "rule" ? "keyword rules" : "uploaded"})${p?.total ? `: ${Number(p.done ?? 0).toLocaleString("en-US")} of ${Number(p.total).toLocaleString("en-US")} ${def.target}s read` : ""}${def.status === "filling" ? ", still filling" : ""}.`);
  }
  return out;
}

function refOf(def: ExtDef, entity: "posts" | "comments"): string | null {
  if (def.target === "post") return "p.id::text";
  if (def.target === "creator") return "p.creator_id::text";
  return entity === "comments" ? "c.id::text" : null;
}

export const ENTITIES = ["posts", "creators", "brand_weeks", "creator_brand_months", "comments"] as const;
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

// ------------------------------------------------------------------ comments
/**
 * The comments entity (CMS plan, recipes): what people say under the posts, counted by
 * brand, topic, sentiment and time. The brand's own replies never count, nor comments
 * under a post that does not name its brand (DECISIONS 3 Oct 2026). Shares are over
 * labelled comments; unlabelled ones are not neutral.
 */
export const COMMENT_GROUP_BY = ["brand_id", "platform", "source", "topic", "sentiment", "day", "week", "month"] as const;
export const COMMENT_METRICS = ["count_comments", "count_commenters", "count_posts", "negative_pct", "positive_pct", "net_sentiment", "purchase_intent_pct", "sum_likes"] as const;
const COMMENT_FILTERS: Record<string, (v: unknown, add: (val: unknown) => string, ctx: Context) => string | null> = {
  brand_id: FILTERS.brand_id,
  platform: (v, add) => `c.platform = any(${add(Array.isArray(v) ? v : [v])}::text[])`,
  source: (v, add) => `p.source = ${add(String(v))}`,
  date_from: (v, add, ctx) => `c.posted_at >= (${add(String(v))}::date::timestamp at time zone ${add(ctx.tz)})`,
  date_to: (v, add, ctx) => `c.posted_at < ((${add(String(v))}::date + 1)::timestamp at time zone ${add(ctx.tz)})`,
  sentiment: (v, add) => `c.sentiment = any(${add(list(v))}::text[])`,
  topic: (v, add) => `(t.label ilike any(${add(list(v).map((s) => s.replace(/[%_]/g, "")))}::text[]) or c.topic_id = any(${add(list(v))}::text[]))`,
  purchase_intent: (v) => (v ? "c.purchase_intent" : "c.purchase_intent is not true"),
  min_likes: (v, add) => `c.likes >= ${add(Number(v))}`,
};
const COMMENT_DIM_SQL: Record<(typeof COMMENT_GROUP_BY)[number], (ctx: Context) => string> = {
  brand_id: () => "p.brand_id",
  platform: () => "c.platform",
  source: () => "p.source",
  topic: () => "coalesce(t.label, 'no topic')",
  sentiment: () => "coalesce(c.sentiment, 'unlabelled')",
  day: (ctx) => `to_char((c.posted_at at time zone '${ctx.tz}')::date, 'YYYY-MM-DD')`,
  week: (ctx) => `to_char((date_trunc('week', c.posted_at at time zone '${ctx.tz}'))::date, 'YYYY-MM-DD')`,
  month: (ctx) => `to_char((c.posted_at at time zone '${ctx.tz}'), 'YYYY-MM')`,
};
const LABELLED = "c.sentiment is not null and c.off_topic is not true";
const COMMENT_METRIC_SQL: Record<(typeof COMMENT_METRICS)[number], string> = {
  count_comments: "count(*)::int",
  count_commenters: "count(distinct c.author_hash)::int",
  count_posts: "count(distinct c.post_id)::int",
  negative_pct: `case when count(*) filter (where ${LABELLED}) > 0 then round((count(*) filter (where c.sentiment = 'negative' and c.off_topic is not true))::numeric / count(*) filter (where ${LABELLED}) * 100, 1)::float8 end`,
  positive_pct: `case when count(*) filter (where ${LABELLED}) > 0 then round((count(*) filter (where c.sentiment = 'positive' and c.off_topic is not true))::numeric / count(*) filter (where ${LABELLED}) * 100, 1)::float8 end`,
  net_sentiment: `case when count(*) filter (where ${LABELLED}) > 0 then round(((count(*) filter (where c.sentiment = 'positive' and c.off_topic is not true)) - (count(*) filter (where c.sentiment = 'negative' and c.off_topic is not true)))::numeric / count(*) filter (where ${LABELLED}) * 100, 1)::float8 end`,
  purchase_intent_pct: "case when count(*) > 0 then round((count(*) filter (where c.purchase_intent))::numeric / count(*) * 100, 1)::float8 end",
  sum_likes: "coalesce(sum(c.likes), 0)::float8",
};

async function queryComments(input: QueryMetricsInput, workspaceId: string, db: SkillDb, started: number, fail: (m: string) => QueryMetricsResult): Promise<QueryMetricsResult> {
  const groupBy = (input.group_by ?? []) as (typeof COMMENT_GROUP_BY)[number][];
  for (const g of groupBy) if (!COMMENT_GROUP_BY.includes(g) && !isExtDim(g)) return fail(`Unknown group_by '${g}' for comments. Use one of ${COMMENT_GROUP_BY.join(", ")}.`);
  const metrics = (input.metrics ?? []) as (typeof COMMENT_METRICS)[number][];
  if (!metrics.length) return fail("At least one metric is required.");
  for (const m of metrics) if (!COMMENT_METRICS.includes(m)) return fail(`Unknown metric '${m}' for comments. Use one of ${COMMENT_METRICS.join(", ")}.`);
  const ctx = await loadContext(db, workspaceId);
  const params: unknown[] = [];
  const add = (v: unknown) => {
    params.push(v);
    return `$${params.length}`;
  };
  const where = [`c.workspace_id = ${add(ctx.workspaceId)}`, "p.relevant is not false", "c.sentiment_source is distinct from 'subject'", "c.posted_at is not null"];
  const filters = { ...(input.filters ?? {}) } as Record<string, unknown>;
  if (!filters.date_from && !filters.date_to) {
    const d = new Date(ctx.asOf + "T00:00:00Z");
    d.setUTCDate(d.getUTCDate() - 29);
    filters.date_from = d.toISOString().slice(0, 10);
    filters.date_to = ctx.asOf;
  }
  const ext = await extJoins(workspaceId, "comments", groupBy, filters, add);
  if (ext.error) return fail(ext.error);
  where.push(...ext.where);
  for (const [k, v] of Object.entries(filters)) {
    if (v === undefined || v === null || isExtDim(k)) continue;
    const f = COMMENT_FILTERS[k];
    if (!f) return fail(`Unknown filter '${k}' for comments. Use one of ${Object.keys(COMMENT_FILTERS).join(", ")}.`);
    const clause = f(v, add, ctx);
    if (clause) where.push(clause);
  }
  const orderRaw = (input.order_by ?? metrics[0]).trim();
  const [orderCol, orderDir] = orderRaw.split(/\s+/);
  if (![...metrics, ...groupBy].includes(orderCol as never)) return fail(`order_by must be one of the selected metrics or group_by dimensions, got '${orderCol}'.`);
  const dir = (orderDir ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
  const limit = Math.max(1, Math.min(200, Number(input.limit ?? 50) || 50));
  const dims = groupBy.map((g) => `${ext.dims.get(g) ?? COMMENT_DIM_SQL[g](ctx)} as ${g}`);
  const mets = metrics.map((m) => `${COMMENT_METRIC_SQL[m]} as ${m}`);
  const sql = `select ${[...dims, ...mets].join(", ")}, count(*) over() as matched
    from comments c join posts p on p.id = c.post_id left join topics t on t.id = c.topic_id ${ext.joins.join(" ")}
    where ${where.join(" and ")}
    ${groupBy.length ? `group by ${groupBy.map((_, i) => i + 1).join(", ")}` : ""}
    order by ${orderCol} ${dir} nulls last limit ${add(limit)}`;
  const rows = await db.q<Row>(sql, params);
  const matched = rows.length ? Number(rows[0].matched) : 0;
  const ev = new EvidenceList(60);
  for (const r of rows) {
    delete r.matched;
    const label = groupBy.length ? groupBy.map((g) => `${g}=${r[g]}`).join(" · ") : "all comments";
    const id = ev.push((eid) => aggregateEvidence(eid, `comments where ${JSON.stringify(filters)} group ${label}`, label, Object.fromEntries(metrics.map((m) => [m, r[m] as number]))));
    r.evidence_ids = id ? [id] : [];
  }
  return {
    status: "ok",
    rows,
    evidence: ev.list,
    meta: { entity: "comments", filters, group_by: groupBy, metrics, matched, returned: rows.length, sql_hash: db.sqlHash(), duration_ms: Date.now() - started, caveats: [
      "Comments under the posts, without the brand's own replies; shares are over labelled comments (unlabelled ones are not neutral).",
      ...ext.caveats,
    ] },
  };
}

export async function queryMetrics(input: QueryMetricsInput, workspaceId: string): Promise<QueryMetricsResult> {
  const started = Date.now();
  const db = new SkillDb();
  const fail = (message: string): QueryMetricsResult => ({ status: "error", message, rows: [], evidence: [], meta: { entity: input.entity, filters: input.filters ?? {}, group_by: input.group_by ?? [], metrics: input.metrics ?? [], matched: 0, returned: 0, sql_hash: db.sqlHash(), duration_ms: Date.now() - started, caveats: [] } });
  try {
    if (!ENTITIES.includes(input.entity)) return fail(`Unknown entity '${input.entity}'. Use one of ${ENTITIES.join(", ")}.`);
    if (input.entity === "comments") return await queryComments(input, workspaceId, db, started, fail);
    const groupBy = (input.group_by ?? []) as (typeof GROUP_BY)[number][];
    for (const g of groupBy) if (!GROUP_BY.includes(g) && !isExtDim(g)) return fail(`Unknown group_by '${g}'. Use one of ${GROUP_BY.join(", ")}.`);
    const metrics = (input.metrics ?? []) as (typeof METRICS)[number][];
    if (!metrics.length) return fail("At least one metric is required.");
    for (const m of metrics) if (!METRICS.includes(m)) return fail(`Unknown metric '${m}'. Use one of ${METRICS.join(", ")}.`);
    const ctx = await loadContext(db, workspaceId);
    const params: unknown[] = [];
    const add = (v: unknown) => {
      params.push(v);
      return `$${params.length}`;
    };
    // posts judged not about their brand (listening workspaces, DECISIONS 3 Oct 2026) never count
    const where: string[] = [`p.workspace_id = ${add(ctx.workspaceId)}`, "p.relevant is not false"];
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
    const ext = await extJoins(workspaceId, "posts", groupBy, filters, add);
    if (ext.error) return fail(ext.error);
    where.push(...ext.where);
    for (const [k, v] of Object.entries(filters)) {
      if (v === undefined || v === null || isExtDim(k)) continue;
      const f = FILTERS[k];
      if (!f) return fail(`Unknown filter '${k}'. Use one of ${Object.keys(FILTERS).join(", ")}.`);
      const clause = f(v, add, ctx);
      if (clause) where.push(clause);
    }
    const dims = groupBy.map((g) => `${ext.dims.get(g) ?? DIM_SQL[g](ctx)} as ${g}`);
    const mets = metrics.map((m) => `${METRIC_SQL[m]} as ${m}`);
    const orderRaw = (input.order_by ?? metrics[0]).trim();
    const [orderCol, orderDir] = orderRaw.split(/\s+/);
    if (![...metrics, ...groupBy].includes(orderCol as any)) return fail(`order_by must be one of the selected metrics or group_by dimensions, got '${orderCol}'.`);
    const dir = (orderDir ?? "desc").toLowerCase() === "asc" ? "asc" : "desc";
    const limit = Math.max(1, Math.min(200, Number(input.limit ?? 50) || 50));
    const sql = `select ${[...dims, ...mets].join(", ")}, count(*) over() as matched
      from posts p ${ext.joins.join(" ")} where ${where.join(" and ")}
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
        ...ext.caveats,
      ] },
    };
  } catch (e) {
    return fail((e as Error).message);
  }
}

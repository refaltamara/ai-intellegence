/**
 * Recipes (CMS plan, "Skills as recipes"): an analysis written as data over the
 * whitelisted query builder, so the Role Lab, and later a Builder or a Member, can make
 * one without code. A recipe fixes the query and names the few inputs a person may give
 * (brand, window, platform, topic); the builder counts in SQL and returns evidence, so
 * "the model never computes numbers" and "no raw SQL from model input" hold for every
 * recipe. Pure, except validation, which reads the builder's whitelists.
 */
import { COMMENT_GROUP_BY, COMMENT_METRICS, ENTITIES, GROUP_BY, METRICS, type QueryMetricsInput } from "../query/builder";
import { isRoleId, type RoleId } from "../roles/model";

export const RECIPE_PARAMS = ["brand", "window", "platform", "topic"] as const;
export type RecipeParam = (typeof RECIPE_PARAMS)[number];

export type RecipeSpec = {
  /** a-z, 0-9 and dashes; unique within its owner */
  key: string;
  /** the plain title people see ("Complaints by topic") */
  title: string;
  /** one line: what it answers; CeMO reads it to choose */
  description: string;
  /** shown while it runs; {{brand}} and {{days}} are filled */
  activity: string;
  /** one to three questions it answers, for the composer and the tests */
  examples: string[];
  /** the roles it suits */
  roles: RoleId[];
  /** the fixed query; the inputs below are added as filters */
  query: QueryMetricsInput;
  /** which inputs a person (or CeMO) may give; brand defaults to the client brand */
  params: RecipeParam[];
  /** how the result reads best */
  present: "table" | "ranked" | "chart";
  /** a sentence that every answer from it should keep in mind */
  caveat?: string;
};

export type RecipeInput = { brand?: string | string[]; window?: { last_n_days?: number; from?: string; to?: string }; platform?: string | string[]; topic?: string | string[] };

const KEY = /^[a-z0-9][a-z0-9-]{2,48}$/;

/** Everything wrong with a recipe, in words a role owner (or the Lab's AI) can fix; empty when it is fine. */
export function validateRecipe(r: Partial<RecipeSpec>): string[] {
  const errors: string[] = [];
  if (!r.key || !KEY.test(r.key)) errors.push("key: 3 to 49 characters, lowercase letters, digits and dashes.");
  if (!r.title?.trim() || r.title.length > 60) errors.push("title: up to 60 characters.");
  if (!r.description?.trim() || r.description.length > 240) errors.push("description: one line, up to 240 characters.");
  if (!r.activity?.trim() || r.activity.length > 80) errors.push("activity: up to 80 characters.");
  if (!Array.isArray(r.examples) || !r.examples.length || r.examples.length > 3 || r.examples.some((e) => typeof e !== "string" || !e.trim())) errors.push("examples: one to three questions.");
  if (!Array.isArray(r.roles) || !r.roles.length || !r.roles.every(isRoleId)) errors.push("roles: one or more of pr, brand_kol, social.");
  if (!Array.isArray(r.params) || !r.params.every((p) => (RECIPE_PARAMS as readonly string[]).includes(p))) errors.push(`params: any of ${RECIPE_PARAMS.join(", ")}.`);
  if (!["table", "ranked", "chart"].includes(r.present ?? "")) errors.push("present: table, ranked or chart.");
  const q = r.query;
  if (!q || !ENTITIES.includes(q.entity)) errors.push(`query.entity: one of ${ENTITIES.join(", ")}.`);
  else {
    const comments = q.entity === "comments";
    const dims: readonly string[] = comments ? COMMENT_GROUP_BY : GROUP_BY;
    const mets: readonly string[] = comments ? COMMENT_METRICS : METRICS;
    if (!Array.isArray(q.metrics) || !q.metrics.length || !q.metrics.every((m) => mets.includes(m))) errors.push(`query.metrics: one or more of ${mets.join(", ")}.`);
    if (q.group_by && !q.group_by.every((g) => dims.includes(g))) errors.push(`query.group_by: any of ${dims.join(", ")}.`);
    if (q.limit != null && (!Number.isInteger(q.limit) || q.limit < 1 || q.limit > 200)) errors.push("query.limit: 1 to 200.");
    if (r.params?.includes("topic") && !comments) errors.push("params: topic only works on comments.");
    if (q.filters && ("date_from" in q.filters || "date_to" in q.filters)) errors.push("query.filters: leave dates out; the window input sets them.");
  }
  return errors;
}

/** The recipe's query with a person's inputs added; dates from the window, counted back from the newest data. */
export function recipeQuery(r: RecipeSpec, input: RecipeInput, ctx: { asOf: string; clientBrandId: string | null }): QueryMetricsInput {
  const filters: Record<string, unknown> = { ...(r.query.filters ?? {}) };
  const list = (v: string | string[]) => (Array.isArray(v) ? v : [v]).map(String).filter(Boolean);
  if (r.params.includes("brand")) {
    const brand = input.brand ? list(input.brand) : ctx.clientBrandId ? [ctx.clientBrandId] : null;
    if (brand?.length) filters.brand_id = brand;
  }
  if (r.params.includes("platform") && input.platform) filters.platform = list(input.platform);
  if (r.params.includes("topic") && input.topic) filters.topic = list(input.topic);
  const w = input.window ?? {};
  if (w.from && w.to && /^\d{4}-\d{2}-\d{2}$/.test(w.from) && /^\d{4}-\d{2}-\d{2}$/.test(w.to)) {
    filters.date_from = w.from;
    filters.date_to = w.to;
  } else {
    const days = Math.max(1, Math.min(365, Math.round(w.last_n_days ?? (r.query.entity === "comments" ? 30 : 90))));
    const from = new Date(ctx.asOf + "T00:00:00Z");
    from.setUTCDate(from.getUTCDate() - (days - 1));
    filters.date_from = from.toISOString().slice(0, 10);
    filters.date_to = ctx.asOf;
  }
  return { ...r.query, filters };
}

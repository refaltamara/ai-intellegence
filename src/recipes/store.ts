/** Recipes in the database: Fair's library (scope "fair") and, later, a client's own. Latest active version wins. */
import { sql } from "../db/client";
import { toJson } from "../db/json";
import { FAIR_RECIPES } from "./library";
import { validateRecipe, type RecipeSpec } from "./spec";

const TTL_MS = 60 * 1000;
let cache: { at: number; byKey: Map<string, RecipeSpec> } | null = null;

export function invalidateRecipes(): void {
  cache = null;
}

/** Fair's active recipes by key (latest version of each). */
export async function fairRecipes(): Promise<Map<string, RecipeSpec>> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.byKey;
  const rows = (await sql.query(
    "select distinct on (key) key, spec from recipes where scope = 'fair' and status = 'active' order by key, version desc",
  )) as { key: string; spec: RecipeSpec }[];
  cache = { at: Date.now(), byKey: new Map(rows.map((r) => [r.key, r.spec])) };
  return cache.byKey;
}

/** the recipes a role version offers, in its order; keys with no active recipe are skipped */
export async function recipesFor(keys: string[] | undefined): Promise<RecipeSpec[]> {
  if (!keys?.length) return [];
  const all = await fairRecipes();
  return keys.map((k) => all.get(k)).filter((r): r is RecipeSpec => !!r);
}

/** Save a recipe as the next version of its key; refused when it does not validate. */
export async function saveFairRecipe(spec: RecipeSpec, by: string): Promise<{ ok: true; version: number } | { ok: false; errors: string[] }> {
  const errors = validateRecipe(spec);
  if (errors.length) return { ok: false, errors };
  const rows = (await sql.query(
    "insert into recipes (scope, key, version, spec, created_by) values ('fair', $1, coalesce((select max(version) from recipes where scope = 'fair' and key = $1), 0) + 1, $2::jsonb, $3) returning version",
    [spec.key, toJson(spec), by],
  )) as { version: number }[];
  invalidateRecipes();
  return { ok: true, version: rows[0].version };
}

/** Seed the library: a recipe whose key has no version yet is added; existing ones are left alone. */
export async function seedRecipes(by = "seed"): Promise<string[]> {
  const have = await fairRecipes();
  const added: string[] = [];
  for (const r of FAIR_RECIPES) {
    if (have.has(r.key)) continue;
    const res = await saveFairRecipe(r, by);
    if (res.ok) added.push(r.key);
    else throw new Error(`${r.key}: ${res.errors.join("; ")}`);
  }
  return added;
}

/**
 * Run a recipe (src/recipes/spec.ts): its query plus the person's inputs, through the
 * whitelisted builder. Same promise as a skill: numbers counted in SQL, rows with evidence,
 * plain words when there is nothing to show.
 */
import type { ViewsDef } from "../definitions/catalog";
import { queryMetrics, type QueryMetricsResult } from "../query/builder";
import { SkillDb } from "../skills/db";
import { loadContext } from "../skills/params";
import { recipeQuery, type RecipeInput, type RecipeSpec } from "./spec";

export type RecipeResult = QueryMetricsResult & { recipe: string; title: string; window: { from: string; to: string } };

/** `views`: the reading the team's role counts views from (ROLE_VIEWS), day 7 unless it reads the latest */
export async function runRecipe(recipe: RecipeSpec, input: RecipeInput, workspaceId: string, opts: { views?: ViewsDef } = {}): Promise<RecipeResult> {
  const ctx = await loadContext(new SkillDb(), workspaceId);
  const q = recipeQuery(recipe, input, { asOf: ctx.asOf, clientBrandId: ctx.clientBrandId });
  const r = await queryMetrics(q, workspaceId, opts);
  const window = { from: String(q.filters?.date_from ?? ""), to: String(q.filters?.date_to ?? "") };
  if (r.status === "ok" && !r.rows.length) r.message = `Nothing matched ${recipe.title.toLowerCase()} between ${window.from} and ${window.to}.`;
  if (recipe.caveat) r.meta.caveats.push(recipe.caveat);
  return { ...r, recipe: recipe.key, title: recipe.title, window };
}

/** the activity line, filled */
export function recipeActivity(recipe: RecipeSpec, input: RecipeInput, brandName: string | null): string {
  const days = input.window?.last_n_days ?? (recipe.query.entity === "comments" ? 30 : 90);
  return recipe.activity.replace(/\{\{brand\}\}/g, brandName ?? "the brand").replace(/\{\{days\}\}/g, String(days));
}

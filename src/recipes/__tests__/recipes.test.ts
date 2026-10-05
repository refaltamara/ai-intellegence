import { describe, expect, it } from "vitest";
import { FAIR_RECIPES } from "../library";
import { recipeQuery, validateRecipe } from "../spec";
import { diffRoles } from "../../roles/diff";
import { PR } from "../../roles/model";

describe("recipes", () => {
  it("every recipe in Fair's library validates", () => {
    for (const r of FAIR_RECIPES) expect(validateRecipe(r), r.key).toEqual([]);
  });

  it("refuses what the builder does not whitelist", () => {
    const bad = { ...FAIR_RECIPES[0], key: "x y", query: { entity: "comments" as const, metrics: ["sum_views"], group_by: ["creator_id"], filters: { date_from: "2026-01-01" } } };
    const errors = validateRecipe(bad);
    expect(errors.some((e) => e.startsWith("key"))).toBe(true);
    expect(errors.some((e) => e.startsWith("query.metrics"))).toBe(true);
    expect(errors.some((e) => e.startsWith("query.group_by"))).toBe(true);
    expect(errors.some((e) => e.startsWith("query.filters"))).toBe(true);
  });

  it("adds the person's inputs as filters and counts the window back from the newest data", () => {
    const r = FAIR_RECIPES.find((x) => x.key === "complaints-by-topic")!;
    const q = recipeQuery(r, { window: { last_n_days: 7 }, platform: "x" }, { asOf: "2026-09-25", clientBrandId: "gopay" });
    expect(q.filters).toEqual({ sentiment: ["negative"], brand_id: ["gopay"], platform: ["x"], date_from: "2026-09-19", date_to: "2026-09-25" });
    const q2 = recipeQuery(r, { brand: "ovo", window: { from: "2026-09-01", to: "2026-09-10" } }, { asOf: "2026-09-25", clientBrandId: "gopay" });
    expect(q2.filters).toMatchObject({ brand_id: ["ovo"], date_from: "2026-09-01", date_to: "2026-09-10" });
  });

  it("an input the recipe does not take is ignored", () => {
    const r = FAIR_RECIPES.find((x) => x.key === "sentiment-by-brand")!;
    const q = recipeQuery(r, { brand: "ovo" }, { asOf: "2026-09-25", clientBrandId: "gopay" });
    expect(q.filters?.brand_id).toBeUndefined();
  });
});

describe("diffRoles", () => {
  it("says what a draft changes in plain words", () => {
    const d = diffRoles(PR, { ...PR, recipes: ["complaints-by-topic"], alert: { ...PR.alert!, min_comments: 80 }, suggested: [...PR.suggested!.slice(0, 3), "New question"] });
    expect(d).toContain("Analyses (recipes): + complaints-by-topic");
    expect(d).toContain("alert.min_comments: 50 → 80");
    expect(d.some((x) => x.startsWith("Suggested questions: + New question"))).toBe(true);
    expect(diffRoles(PR, PR)).toEqual([]);
  });
});

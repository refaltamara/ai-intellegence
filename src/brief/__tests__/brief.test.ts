import { describe, expect, it } from "vitest";
import { fallbackBrief } from "../generate";
import type { SkillResult } from "../../skills/types";

const base = { window: { from: "2026-06-24", to: "2026-06-30" }, prior: { from: "2026-06-17", to: "2026-06-23" }, client: null, brands: ["wardahofficial", "skintific_official"], noticed: [] };
const compare = (rows: Record<string, unknown>[]): SkillResult => ({
  skill: "compare", status: "ok", params_resolved: {}, summary: {}, rows, evidence: rows.length ? [{ id: "ev_01", type: "aggregate", ref: "x", label: "Wardah" }] : [],
  meta: { matched: rows.length, returned: rows.length, data_window: base.window, freshness: "", caveats: [], sql_hash: "", duration_ms: 0 }, diff_key: "brand_id",
});

describe("fallbackBrief", () => {
  it("leads with the top brand and cites the first evidence id", () => {
    const b = fallbackBrief(compare([{ brand_id: "wardahofficial", views: 1234567 }]), base, { wardahofficial: "Wardah" });
    expect(b.quiet).toBe(false);
    expect(b.headline).toContain("Wardah led the week");
    expect(b.headline).toContain('<ev id="ev_01"></ev>');
    expect(b.offer?.skill).toBe("brand-strategy");
    expect(b.generated_by).toBe("fallback");
  });
  it("is quiet with no rows", () => {
    const b = fallbackBrief(compare([]), base);
    expect(b.quiet).toBe(true);
    expect(b.offer).toBeNull();
  });
});

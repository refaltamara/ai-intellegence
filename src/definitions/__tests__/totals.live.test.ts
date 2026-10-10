/**
 * The serving layer counts what the core holds (src/definitions/totals.ts, check.ts): rebuilt for one workspace, its daily
 * totals, creator days and day-7 readings reconcile with the posts they are counted from, and with the Brand & KOL
 * dashboard's own monthly numbers. The rows are derived, so rebuilding them changes nothing that is not counted again.
 */
import { describe, expect, it } from "vitest";
import { refreshServing } from "../totals";
import { checkTotals } from "../check";

describe("daily totals (live database)", () => {
  it("rebuilds a workspace and reconciles to the post", async () => {
    const r = await refreshServing("maudy-ayunda");
    expect(r.posts).toBeGreaterThan(3000);
    expect(r.totals).toBeGreaterThan(0);
    const [c] = await checkTotals(["maudy-ayunda"]);
    for (const [k, v] of Object.entries(c)) if (k !== "workspace" && k !== "rows") expect(v, k).toBe(0);
  }, 120_000);
});

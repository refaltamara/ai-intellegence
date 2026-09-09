import { describe, expect, it } from "vitest";
import { growthOf, resolvePeriod, weekStarts } from "../page";
import type { Context } from "../../skills/params";

const ctx = { workspaceId: "w", tz: "Asia/Jakarta", asOf: "2026-06-30", earliest: "2026-01-01", freshness: "", clientBrandId: null, brands: [] } as Context;

describe("brand page periods", () => {
  it("anchors on the newest post and computes the prior window of the same length", () => {
    expect(resolvePeriod("30d", ctx)).toEqual({ window: { from: "2026-06-01", to: "2026-06-30" }, prior: { from: "2026-05-02", to: "2026-05-31" } });
    expect(resolvePeriod("90d", ctx).window.from).toBe("2026-04-02");
    expect(resolvePeriod("all", ctx)).toEqual({ window: { from: "2026-01-01", to: "2026-06-30" }, prior: null });
  });
  it("lists the last 13 Mondays ending at the as-of week", () => {
    const w = weekStarts("2026-06-30");
    expect(w).toHaveLength(13);
    expect(w[12]).toBe("2026-06-29");
    expect(w[0]).toBe("2026-04-06");
    expect(new Date(w[5] + "T00:00:00Z").getUTCDay()).toBe(1);
  });
});

describe("growthOf", () => {
  it("says 'no comparison' when the prior period had no capture, 'new' when the item was absent", () => {
    expect(growthOf(10, 0, false)).toBe("no comparison");
    expect(growthOf(10, 0, true)).toBe("new");
    expect(growthOf(10, null, true)).toBe("new");
    expect(growthOf(0, 0, true)).toEqual({ delta: 0, pct: null });
  });
  it("gives a signed count and percent otherwise", () => {
    expect(growthOf(12, 8, true)).toEqual({ delta: 4, pct: 50 });
    expect(growthOf(6, 8, true)).toEqual({ delta: -2, pct: -25 });
  });
});

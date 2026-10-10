/**
 * The Brand & KOL dashboard counts by the definitions (DECISIONS, 10 Oct 2026, step 4): its shares are of the whole
 * panel, its viewership mix adds up to each brand's views, and its headline numbers are the same whether read from the
 * panel's rows or from every brand's posts, each once.
 */
import { describe, expect, it } from "vitest";
import { chosenTotals, dashboardData, loadContext, panelTotals } from "../data";
import { monthOf, shiftPeriod } from "../period";
import { SkillDb } from "../../skills/db";

const WS = "fintech-id";

describe("Brand & KOL dashboard by the definitions (live database)", () => {
  it("shares add up to the panel, the mix to each brand's views", async () => {
    const d = await dashboardData(WS, {});
    expect(d.rankings.length).toBeGreaterThan(0);
    for (const k of ["share_views", "share_voice", "share_eng"] as const) {
      expect(d.rankings.reduce((a, r) => a + (r[k] ?? 0), 0)).toBeCloseTo(100, 6);
    }
    for (const r of d.rankings) {
      expect(r.so_far).toBeGreaterThanOrEqual(0);
      expect(r.so_far).toBeLessThanOrEqual(r.posts);
    }
    for (const m of d.mix) expect(m.own + m.affiliators + m.creators).toBeCloseTo(m.total, 3);
  }, 120_000);

  it("reads the same headline numbers from the panel's rows and from every brand's posts", async () => {
    const db = new SkillDb();
    const ctx = await loadContext(db, WS);
    const f = { platform: "all" as const, brands: [] as string[], period: monthOf(ctx.asOf) };
    const prev = shiftPeriod(f.period, -1);
    const norm = (rows: Record<string, unknown>[]) =>
      rows.map((r) => Object.fromEntries(Object.keys(r).sort().map((k) => [k, typeof r[k] === "number" ? Math.round(r[k] as number) : r[k]]))).sort((a, b) => String(a.bucket).localeCompare(String(b.bucket)));
    const a = norm(await panelTotals(db, ctx, f, prev));
    const b = norm(await chosenTotals(db, ctx, { ...f, brands: ctx.brands.map((x) => x.id) }, prev));
    expect(a.length).toBeGreaterThan(0);
    expect(b).toEqual(a);
  }, 120_000);
});

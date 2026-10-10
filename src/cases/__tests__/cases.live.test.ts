/**
 * The statements that write a case, planned against the live database without running them (EXPLAIN never executes an
 * insert or update), and the list read for a workspace. Nothing is written.
 */
import { describe, expect, it } from "vitest";
import { sql } from "../../db/client";
import { CASE_SQL, casesOf } from "../store";

const live = !!process.env.DATABASE_URL;
const d = live ? describe : describe.skip;

d("cases (live database, nothing written)", () => {
  it("plans the insert, the update and the status change", async () => {
    const v: unknown[] = ["boycott-october-2026", "beauty-id", "Boycott, October 2026", null, "2026-10-06", null, ["boikot"], ["threads"], "hourly", null, ["refal@fair-indonesia.com"]];
    const plans: [string, unknown[]][] = [[CASE_SQL.insert, [...v, "refal@fair-indonesia.com"]], [CASE_SQL.update, [v[0], ...v.slice(2)]], [CASE_SQL.status, [v[0], "closed"]]];
    for (const [text, params] of plans) {
      const plan = (await sql.query(`explain ${text}`, params)) as { "QUERY PLAN": string }[];
      expect(plan.length).toBeGreaterThan(0);
    }
  }, 60_000);
  it("lists a workspace's cases with the posts each caught", async () => {
    const rows = await casesOf("beauty-id");
    expect(Array.isArray(rows)).toBe(true);
    for (const c of rows) expect(c.posts).toBeGreaterThanOrEqual(0);
  }, 60_000);
});

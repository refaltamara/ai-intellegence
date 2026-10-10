/**
 * Copying a case workspace into its panel (src/cases/copy.ts), planned against the live database without running it:
 * EXPLAIN never executes an insert. Nothing is written.
 */
import { describe, expect, it } from "vitest";
import { sql } from "../../db/client";
import { toJson } from "../../db/json";
import { bind, copyStatements } from "../copy";

const live = !!process.env.DATABASE_URL;
const d = live ? describe : describe.skip;

d("copying a case workspace into its panel (live database, nothing written)", () => {
  it("plans every statement of the copy", async () => {
    const args = { src: "kahf-threads", dst: "beauty-id", case: "a-case", brands: toJson({ kahf: "kahfeveryday" }) };
    const statements = await copyStatements();
    expect(statements.length).toBe(9);
    for (const text of statements) {
      const [bound, params] = bind(text, args);
      expect(bound).not.toMatch(/:(src|dst|case|brands)\b/);
      const plan = (await sql.query(`explain ${bound}`, params)) as { "QUERY PLAN": string }[];
      expect(plan.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it("moves a topic id under the case", async () => {
    const T = "case when $2::text like $1 || ':%' then $3 || ':' || substr($2::text, length($1) + 2) else $3 || ':' || $2::text end";
    const r = (await sql.query(`select ${T} as id`, ["kahf-threads", "kahf-threads:boycott", "kahf-threads-boycott"])) as { id: string }[];
    expect(r[0].id).toBe("kahf-threads-boycott:boycott");
  }, 60_000);
});

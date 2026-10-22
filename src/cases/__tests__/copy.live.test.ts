/**
 * Copying a case workspace into its panel (src/cases/copy.ts), planned against the live database without running it:
 * EXPLAIN never executes an insert. Nothing is written.
 */
import { describe, expect, it } from "vitest";
import { sql } from "../../db/client";
import { toJson } from "../../db/json";
import { bind, copyStatements, syncStatements } from "../copy";

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

  it("plans every statement of the sync, each writing only the case's rows", async () => {
    const args = { src: "kahf-threads", dst: "beauty-id", case: "a-case", brands: toJson({ kahf: "kahfeveryday" }) };
    const statements = await syncStatements();
    expect(statements.map((s) => s.key)).toEqual(["topics", "topics_updated", "accounts", "accounts_updated", "posts", "links", "links_updated", "readings", "comments", "comments_updated", "labels", "labels", "case_posts"]);
    for (const { key, text } of statements) {
      // an update touches only what the case brought in, never the panel's rows
      if (key.endsWith("_updated")) expect(text).toMatch(key === "topics_updated" ? /n\.case_id = :case/ : /brought_in_by = :case/);
      expect(text).not.toMatch(/\bdelete\b/i);
      const [bound, params] = bind(text, args);
      expect(bound).not.toMatch(/:(src|dst|case|brands)\b/);
      const plan = (await sql.query(`explain ${bound}`, params)) as { "QUERY PLAN": string }[];
      expect(plan.length).toBeGreaterThan(0);
    }
  }, 120_000);

  it("moves the topic ids in a topic's tags under the case, and nothing else", async () => {
    const statements = await syncStatements();
    const text = statements.find((s) => s.key === "topics_updated")!.text;
    const [bound, params] = bind(`select ${text.slice(text.indexOf("= (") + 3, text.indexOf(")\n       from topics o"))} from (select $9::text[] as tags) o`.replace(/o\.(label|sort_order|is_catch_all|kind|definition)/g, "null"), { src: "kahf-daily", dst: "beauty-id", case: "kahf-daily-tracking", brands: "{}" });
    const r = (await sql.query(bound.replace("$9", `$${params.length + 1}`), [...params, ["https://threads.com/@kahfeveryday/post/Dex9_cQGtqd", "kahf-daily:backing", "reputation"]])) as Record<string, unknown>[];
    expect(Object.values(r[0])).toContainEqual(["https://threads.com/@kahfeveryday/post/Dex9_cQGtqd", "kahf-daily-tracking:backing", "reputation"]);
  }, 60_000);

  it("moves a topic id under the case", async () => {
    const T = "case when $2::text like $1 || ':%' then $3 || ':' || substr($2::text, length($1) + 2) else $3 || ':' || $2::text end";
    const r = (await sql.query(`select ${T} as id`, ["kahf-threads", "kahf-threads:boycott", "kahf-threads-boycott"])) as { id: string }[];
    expect(r[0].id).toBe("kahf-threads-boycott:boycott");
  }, 60_000);
});

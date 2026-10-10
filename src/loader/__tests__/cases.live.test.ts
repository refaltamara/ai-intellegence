/**
 * Loading into a case, against the live database without writing anything: the statements a case's load runs are planned
 * (EXPLAIN never executes an insert), and the rule for what brought a link in is evaluated on values in a select.
 */
import { describe, expect, it } from "vitest";
import { sql } from "../../db/client";
import { toJson } from "../../db/json";
import { POST_WRITE } from "../columns";
import { BROUGHT_IN_BY, CASE_POSTS_SQL, STUB_SQL, postSql } from "../promote";

const live = !!process.env.DATABASE_URL;
const d = live ? describe : describe.skip;
const NO_LOAD = "00000000-0000-0000-0000-000000000000";

d("loading into a case (live database, nothing written)", () => {
  it("plans the links, the stubs and the case's posts for a case's load", async () => {
    const plans: [string, unknown[]][] = [
      [postSql("listening"), [NO_LOAD, "fintech-id", "", "", "", toJson({}), null, "a-case"]],
      [postSql("profile"), [NO_LOAD, "kahf-threads", "", "", "", toJson({}), null, "a-case"]],
      [STUB_SQL(POST_WRITE.profile.cols), [NO_LOAD, "kahf-threads", toJson({}), "a-case"]],
      [CASE_POSTS_SQL, [NO_LOAD, "fintech-id", "a-case", "", ""]],
    ];
    for (const [text, params] of plans) {
      const plan = (await sql.query(`explain ${text}`, params)) as { "QUERY PLAN": string }[];
      expect(plan.length).toBeGreaterThan(0);
    }
  }, 60_000);

  it("a case's load keeps what brought a link in; the panel's load takes every link it carries", async () => {
    const rule = BROUGHT_IN_BY.replace("posts.brought_in_by", "t.had").replace("$8::text", "$1::text");
    const after = async (by: string) =>
      ((await sql.query(`select t.had, ${rule} as now from (values ('panel'), ('case-a'), ('case-b')) t(had) order by 1`, [by])) as { had: string; now: string }[]).map((r) => `${r.had}→${r.now}`);
    expect(await after("case-a")).toEqual(["case-a→case-a", "case-b→case-b", "panel→panel"]);
    expect(await after("panel")).toEqual(["case-a→panel", "case-b→panel", "panel→panel"]);
  }, 60_000);
});

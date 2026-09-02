/** M4 acceptance: a report from a real run has the prototype's structure (header, lead, what changed, table, caveats). */
import { afterAll, describe, expect, it } from "vitest";
import { runSkill } from "../../skills/runner";
import { createReport, deleteReport, getReport, listReports } from "../store";

const live = !!process.env.DATABASE_URL;
const d = live ? describe : describe.skip;
const WS = "beauty-id";
const created: string[] = [];

d("reports (live)", () => {
  afterAll(async () => {
    for (const id of created) await deleteReport(id, WS);
  });
  it("creates an Ask report from a compare run with every section", async () => {
    const result = await runSkill({ skill: "compare", workspace_id: WS, params: { brands: ["skintific_official", "wardahofficial"], window: { last_n_days: 30 } }, actor: { user_id: "test", via: "api" } });
    expect(result.status).toBe("ok");
    const { report, sections, markdown } = await createReport({ workspaceId: WS, result, diff: null, source: "ask" });
    created.push(report.id);
    expect(report.title).toMatch(/^\/compare · /);
    expect(sections.headline.length).toBeGreaterThan(20);
    if (!process.env.ANTHROPIC_API_KEY) expect(sections.generated_by).toBe("fallback");
    expect(report.blocks.rows.length).toBeGreaterThan(0);
    expect(report.blocks.chart).toBeTruthy();
    expect(report.blocks.caveats.length).toBeGreaterThan(0);
    expect(markdown).toContain("## Table");
    const fetched = await getReport(report.id, WS);
    expect(fetched?.blocks.skill).toBe("compare");
    const list = await listReports(WS);
    expect(list.some((r) => r.id === report.id)).toBe(true);
    expect(list[0].blocks.diff).toBeNull();
  }, 120_000);
});

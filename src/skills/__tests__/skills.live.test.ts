/**
 * Contract test for every Phase 1 skill against the loaded database (DATABASE_URL).
 * Skipped when DATABASE_URL is not set. Runs are not persisted.
 */
import { describe, expect, it } from "vitest";
import { listSkills } from "../registry";
import { runSkill } from "../runner";
import type { SkillResult } from "../types";

const live = !!process.env.DATABASE_URL;
const d = live ? describe : describe.skip;

const CASES: Record<string, Record<string, unknown>> = {
  discovery: { used_by: ["skintific_official"], tiers: ["nano"], platform: "tiktok", limit: 10 },
  mercenaries: { limit: 5 },
  loyalists: { brand: "skintific_official", limit: 5 },
  affiliates: { brand: "msglowbeauty", month: "2026-06" },
  breakout: { limit: 5 },
  "funnel-mix": { brand: "glad2glow_id", compare_to: ["skintific_official"], month: "2026-06" },
  overlap: { brand: "timephoriaid", limit: 5 },
  waves: { limit: 5 },
  "top-content": { has_cart: true, window: { last_n_days: 30 }, limit: 10 },
  compare: { brands: ["skintific_official", "somethincofficial", "eminacosmeticsid"], window: { last_n_days: 30 } },
  launch: { brand: "skintific_official", start_date: "2026-06-01", weeks: 4 },
  "brand-strategy": { brand: "skintific", month: "2026-06" },
};

function run(skill: string, params: Record<string, unknown>): Promise<SkillResult> {
  return runSkill({ skill, workspace_id: "beauty-id", params, actor: { user_id: "test", via: "api" }, persist: false });
}

function assertContract(r: SkillResult) {
  expect(r.status).toBe("ok");
  expect(r.rows.length).toBeGreaterThan(0);
  expect(r.evidence.length).toBeGreaterThan(0);
  expect(r.meta.freshness).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  expect(r.meta.data_window.from <= r.meta.data_window.to).toBe(true);
  expect(r.meta.sql_hash).toHaveLength(16);
  const ids = new Set(r.evidence.map((e) => e.id));
  expect(ids.size).toBe(r.evidence.length);
  for (const e of r.evidence) {
    expect(e.label).toBeTruthy();
    expect(e.ref).toBeTruthy();
  }
  // every row that cites evidence cites ids that exist
  for (const row of r.rows) {
    const cited = (row.evidence_ids as string[] | undefined) ?? [];
    for (const id of cited) expect(ids.has(id), `${r.skill} cites ${id}`).toBe(true);
  }
  // numbers are numbers (bigint/numeric columns must be cast in SQL)
  for (const row of r.rows.slice(0, 3)) {
    for (const k of ["views", "posts", "creators", "engagements"]) {
      if (k in row && row[k] != null) expect(typeof row[k], `${r.skill}.${k}`).toBe("number");
    }
  }
}

d("phase 1 skills (live database)", () => {
  for (const [skill, params] of Object.entries(CASES)) {
    it(`${skill} returns ok with evidence`, async () => {
      assertContract(await run(skill, params));
    }, 60_000);
  }

  it("every skill runs with empty params or fails with a param error, never a crash", async () => {
    for (const s of listSkills()) {
      const r = await run(s.name, {});
      expect(["ok", "unavailable", "error"]).toContain(r.status);
      if (r.status === "error") expect(r.message).toMatch(/Invalid params|required|brand/);
    }
  }, 300_000);

  it("phase 1b / phase 2 skills are unavailable with a plain message", async () => {
    for (const name of ["velocity", "forecast", "objections", "audience", "narrative"]) {
      const r = await run(name, name === "switchers" ? { from_brand: "a", to_brand: "b" } : {});
      expect(r.status, name).toBe("unavailable");
      expect(r.message).toMatch(/not loaded/);
    }
  }, 120_000);

  it("rejects unknown brands and unknown params with status error", async () => {
    expect((await run("compare", { brands: ["skintific", "nope"] })).status).toBe("error");
    expect((await run("discovery", { tiers: ["sub"] })).message).toMatch(/allowed values/);
  }, 60_000);
});

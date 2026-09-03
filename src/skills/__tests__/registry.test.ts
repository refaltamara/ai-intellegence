import { describe, expect, it } from "vitest";
import { impls } from "../index";
import { describeSkillsForTool, getSkill, listSkills, registry } from "../registry";
import { validateParams } from "../params";
import { TIER_BANDS } from "../../config/thresholds";

const PHASE1 = ["discovery", "mercenaries", "loyalists", "affiliates", "breakout", "funnel-mix", "overlap", "waves", "top-content", "compare", "launch", "brand-strategy", "hashtags", "campaigns", "themes", "products", "hashtag-overlap"];

describe("skills.registry.json", () => {
  it("has 29 skills with unique names and the DECISIONS changes applied", () => {
    const names = listSkills().map((s) => s.name);
    expect(names.length).toBe(29);
    expect(new Set(names).size).toBe(29);
    expect(names).not.toContain("spend-estimate");
    expect(names).toContain("brand-strategy");
    expect(names).toContain("top-content");
  });

  it("every skill declares output.diff_key, requires and a valid input_schema", () => {
    for (const s of listSkills()) {
      expect(s.output.diff_key, s.name).toBeTruthy();
      expect(Array.isArray(s.requires), s.name).toBe(true);
      expect(() => validateParams(s, {}), s.name).not.toThrow;
    }
  });

  it("no tier enum contains 'sub' and the tier table matches thresholds.ts", () => {
    const json = JSON.stringify(registry.skills);
    expect(json).not.toContain('"sub"');
    for (const b of TIER_BANDS) expect(registry.tiers[b.tier]).toEqual([b.min, b.max]);
  });

  it("every Phase 1 skill has an implementation; the rest resolve to unavailable", () => {
    for (const n of PHASE1) expect(impls[n], n).toBeTypeOf("function");
    for (const s of listSkills()) if (!PHASE1.includes(s.name)) expect(impls[s.name], s.name).toBeUndefined();
  });

  it("applies defaults and rejects unknown params", () => {
    const d = getSkill("discovery")!;
    const p = validateParams(d, {});
    expect(p.platform).toBe("all");
    expect(p.limit).toBe(50);
    expect(p.rank_by).toBe("views");
    expect(() => validateParams(d, { nope: 1 })).toThrow(/Invalid params/);
    expect(() => validateParams(d, { tiers: ["sub"] })).toThrow(/allowed values/);
    expect(() => validateParams(getSkill("loyalists")!, {})).toThrow(/brand/);
  });

  it("builds a tool description line per skill", () => {
    const text = describeSkillsForTool();
    for (const s of listSkills()) expect(text).toContain(`${s.name} — `);
  });
});

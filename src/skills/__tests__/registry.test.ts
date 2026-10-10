import { describe, expect, it } from "vitest";
import { impls } from "../index";
import { describeSkillsForTool, getSkill, listSkills, registry } from "../registry";
import { validateParams } from "../params";
import { TIER_BANDS } from "../../config/thresholds";
import { DEFINITIONS } from "../../definitions/catalog";
import { viewsNote } from "../common";

const PHASE1 = ["discovery", "mercenaries", "loyalists", "affiliates", "breakout", "funnel-mix", "overlap", "waves", "top-content", "compare", "launch", "brand-strategy", "hashtags", "campaigns", "themes", "products", "hashtag-overlap", "sentiment", "comment-themes", "drivers", "seeding"];

describe("skills.registry.json", () => {
  it("has 32 skills with unique names and the DECISIONS changes applied", () => {
    const names = listSkills().map((s) => s.name);
    expect(names.length).toBe(32);
    expect(new Set(names).size).toBe(32);
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

  it("every implemented skill is listed here; the rest resolve to unavailable", () => {
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

  it("names the views a skill counts by its definition: day 7, or the latest where a role reads reach", () => {
    for (const s of listSkills()) if (s.views) expect(DEFINITIONS.has(s.views), s.name).toBe(true);
    expect(getSkill("top-content")!.views).toBe("views_d7");
    expect(getSkill("compare")!.views).toBe("views_d7");
    expect(getSkill("drivers")!.views).toBe("views_latest");
    expect(viewsNote(0, 10)).not.toMatch(/so far/);
    expect(viewsNote(201, 23315)).toMatch(/201 of the 23,315 posts .* so far/);
  });

  it("builds a tool description line per skill", () => {
    const text = describeSkillsForTool();
    for (const s of listSkills()) expect(text).toContain(`${s.name} — `);
  });
});
